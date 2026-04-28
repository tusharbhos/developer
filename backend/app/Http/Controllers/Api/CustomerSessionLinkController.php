<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerProjectLink;
use App\Models\CustomerSessionLink;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class CustomerSessionLinkController extends Controller
{
    private const MAX_ATTEMPTS_PER_CARD = 5;

    public function index(Request $request): JsonResponse
    {
        $rows = $this->visibleSessionLinks($request);

        return response()->json([
            'data' => $rows,
            'total' => $rows->count(),
        ]);
    }

    public function byCustomer(Request $request, int $customerId): JsonResponse
    {
        $actor = $request->user();
        $customer = $this->findScopedCustomer($actor, $customerId);
        $projectName = trim((string) $request->query('project_name', ''));

        $rows = CustomerSessionLink::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->get();

        if ($projectName !== '') {
            $normalizedProjectName = $this->normalizeProjectName($projectName);

            if ($this->isCalendarProjectScopedRole($actor)) {
                $allowedProjects = $this->allowedProjectMap($actor);
                if (!isset($allowedProjects[$normalizedProjectName])) {
                    return response()->json([
                        'message' => 'You can access session links only for your assigned projects.',
                    ], 422);
                }
            }

            $rows = $rows
                ->filter(function (CustomerSessionLink $row) use ($normalizedProjectName) {
                    return $this->normalizeProjectName((string) ($row->project_name ?? '')) === $normalizedProjectName;
                })
                ->values();
        }

        if ($this->isCalendarProjectScopedRole($actor) && $projectName === '') {
            $allowedProjects = $this->allowedProjectMap($actor);
            $rows = $rows
                ->filter(function (CustomerSessionLink $row) use ($allowedProjects) {
                    $project = $this->normalizeProjectName((string) ($row->project_name ?? ''));
                    return $project !== '' && isset($allowedProjects[$project]);
                })
                ->values();
        }

        return response()->json([
            'data' => $rows,
            'total' => $rows->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();

        $v = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'project_name' => ['nullable', 'string', 'max:255'],
            'presentation_id' => ['required', 'string', 'max:255'],
            'presenter_name' => ['required', 'string', 'max:255'],
            'presenter_email' => ['nullable', 'email', 'max:255'],
            'presenter_id' => ['nullable', 'string', 'max:120'],
            'viewer_name' => ['required', 'string', 'max:255'],
            'viewer_email' => ['nullable', 'email', 'max:255'],
            'viewer_phone' => ['nullable', 'string', 'max:40'],
            'viewer_id' => ['nullable', 'string', 'max:120'],
            'frontend_url' => ['nullable', 'url', 'max:2048'],
            'expires_in_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
        ]);

        $customer = $this->findScopedCustomer($actor, (int) $v['customer_id']);

        if ($this->isCalendarProjectScopedRole($actor)) {
            $projectName = trim((string) ($v['project_name'] ?? ''));
            $normalizedProjectName = $this->normalizeProjectName($projectName);
            $allowedProjects = $this->allowedProjectMap($actor);

            if ($normalizedProjectName === '' || !isset($allowedProjects[$normalizedProjectName])) {
                return response()->json([
                    'message' => 'You can create session links only for your assigned projects.',
                ], 422);
            }
        }

        $apiKey = trim((string) config('services.conectr_session.api_key', ''));
        if ($apiKey === '') {
            return response()->json([
                'message' => 'ConectR API key is not configured.',
            ], 500);
        }

        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $frontendUrl = (string) ($v['frontend_url'] ?? config('services.conectr_session.frontend_url', $baseUrl));

        $payload = [
            'presentation_id' => $v['presentation_id'],
            'presenter_name' => $v['presenter_name'],
            'presenter_email' => $v['presenter_email'] ?? null,
            'presenter_id' => $v['presenter_id'] ?? null,
            'viewer_name' => $v['viewer_name'],
            'viewer_email' => $v['viewer_email'] ?? null,
            'viewer_phone' => $v['viewer_phone'] ?? null,
            'viewer_id' => $v['viewer_id'] ?? null,
            'expires_in_hours' => (int) ($v['expires_in_hours'] ?? 72),
        ];

        try {
            $extRes = Http::acceptJson()
                ->timeout(25)
                ->withHeaders([
                    'X-API-Key' => $apiKey,
                    'X-Frontend-URL' => $frontendUrl,
                ])
                ->post("{$baseUrl}/api/sessions/create-link", $payload);
        } catch (ConnectionException $e) {
            return response()->json([
                'message' => 'ConectR service is unreachable right now.',
                'provider_error' => $e->getMessage(),
            ], 502);
        }

        if ($extRes->failed()) {
            $status = $extRes->status() > 0 ? $extRes->status() : 502;
            $providerJson = $extRes->json();
            $providerBody = trim((string) $extRes->body());
            $msg = $extRes->json('message')
                ?? $extRes->json('error')
                ?? ($providerBody !== '' ? $providerBody : 'Failed to generate ConectR session link.');

            if ($status === 404) {
                $msg = 'Presentation not found. Please enter a valid Presentation ID like PRS-XXXXXXX.';
            }

            return response()->json([
                'message' => $msg,
                'provider_status' => $status,
                'provider_response' => $providerJson,
                'provider_body' => $providerBody,
            ], $status);
        }

        $body = $extRes->json();
        if (!is_array($body)) {
            return response()->json([
                'message' => 'Invalid ConectR response.',
            ], 502);
        }

        if (empty($body['session_token']) || empty($body['presenter_link']) || empty($body['viewer_link'])) {
            return response()->json([
                'message' => 'ConectR response is missing required fields.',
                'provider_response' => $body,
            ], 502);
        }

        $projectName = trim((string) ($v['project_name'] ?? ($body['presentation_title'] ?? $v['presentation_id'] ?? '')));

        $saved = CustomerSessionLink::create([
            'user_id' => $actor->id,
            'customer_id' => $customer->id,
            'project_name' => $projectName !== '' ? $projectName : null,
            'presentation_id' => (string) ($v['presentation_id'] ?? ''),
            'presentation_title' => $body['presentation_title'] ?? null,
            'presenter_name' => (string) ($body['presenter_name'] ?? $v['presenter_name']),
            'presenter_email' => (string) ($v['presenter_email'] ?? ''),
            'presenter_platform_id' => (string) ($v['presenter_id'] ?? ''),
            'viewer_name' => (string) ($body['viewer_name'] ?? $v['viewer_name']),
            'viewer_email' => (string) ($v['viewer_email'] ?? ''),
            'viewer_phone' => (string) ($v['viewer_phone'] ?? ''),
            'viewer_platform_id' => (string) ($v['viewer_id'] ?? ''),
            'session_token' => (string) $body['session_token'],
            'session_code' => (string) ($body['session_code'] ?? ''),
            'join_code' => (string) ($body['join_code'] ?? ''),
            'presenter_link' => (string) $body['presenter_link'],
            'viewer_link' => (string) $body['viewer_link'],
            'expires_at' => $body['expires_at'] ?? null,
            'raw_response' => $body,
        ]);

        if ($projectName !== '') {
            $summary = $this->buildProjectSessionSummary($customer->id, $projectName);
            if ($customer->syncProjectSessionSummary($projectName, $summary)) {
                $customer->save();
            }
        }

        return response()->json([
            'message' => 'Session link created successfully.',
            'data' => $saved,
        ], 201);
    }

    public function statusSnapshots(Request $request): JsonResponse
    {
        $rows = $this->visibleSessionLinks($request);
        $apiKey = trim((string) config('services.conectr_session.api_key', ''));
        if ($apiKey === '') {
            return response()->json([
                'message' => 'ConectR API key is not configured.',
            ], 500);
        }

        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $frontendUrl = (string) config('services.conectr_session.frontend_url', $baseUrl);
        $snapshots = [];
        $rowsByToken = [];

        foreach ($rows as $row) {
            $token = trim((string) $row->session_token);
            if ($token !== '') {
                $rowsByToken[$token] = $row;
            }
        }

        if ($rowsByToken === []) {
            return response()->json([
                'data' => [],
            ]);
        }

        try {
            $responses = Http::pool(function (Pool $pool) use ($rowsByToken, $baseUrl, $apiKey, $frontendUrl) {
                $requests = [];

                foreach (array_keys($rowsByToken) as $token) {
                    $requests['links:' . $token] = $pool
                        ->as('links:' . $token)
                        ->acceptJson()
                        ->timeout(5)
                        ->withHeaders([
                            'X-API-Key' => $apiKey,
                            'X-Frontend-URL' => $frontendUrl,
                        ])
                        ->get("{$baseUrl}/api/sessions/" . rawurlencode($token) . "/links");

                    $requests['analytics:' . $token] = $pool
                        ->as('analytics:' . $token)
                        ->acceptJson()
                        ->timeout(8)
                        ->withHeaders([
                            'X-API-Key' => $apiKey,
                            'X-Frontend-URL' => $frontendUrl,
                        ])
                        ->get("{$baseUrl}/api/session/" . rawurlencode($token) . "/analytics");
                }

                return $requests;
            });
        } catch (ConnectionException $e) {
            $responses = [];
        }

        foreach ($rowsByToken as $token => $row) {
            $links = [];
            $analytics = [];
            $error = null;
            $linksResponse = $responses['links:' . $token] ?? null;
            $analyticsResponse = $responses['analytics:' . $token] ?? null;

            if ($linksResponse && method_exists($linksResponse, 'ok') && $linksResponse->ok()) {
                $links = $linksResponse->json() ?: [];
            } elseif ($linksResponse && method_exists($linksResponse, 'status')) {
                $error = 'ConectR status request failed with HTTP ' . $linksResponse->status();
            } else {
                $error = 'ConectR status request failed.';
            }

            if ($analyticsResponse && method_exists($analyticsResponse, 'ok') && $analyticsResponse->ok()) {
                $analytics = $analyticsResponse->json() ?: [];
            }

            $analyticsSession = is_array(data_get($analytics, 'session'))
                ? data_get($analytics, 'session')
                : [];
            $analyticsEvents = data_get($analytics, 'events');
            $analyticsFeedback = data_get($analytics, 'feedback_submissions');
            $eventCount = max(
                (int) data_get($links, 'event_count', 0),
                (int) data_get($analyticsSession, 'event_count', 0),
                is_array($analyticsEvents) ? count($analyticsEvents) : 0,
                (int) data_get($row->raw_response, 'event_count', 0),
            );
            $feedbackCount = is_array($analyticsFeedback) ? count($analyticsFeedback) : 0;
            $rawJoinees = max(
                (int) data_get($links, 'joinees', 0),
                (int) data_get($analyticsSession, 'joinees', 0),
                (int) data_get($row->raw_response, 'joinees', 0),
            );
            $joinees = $rawJoinees > 0 || ($eventCount === 0 && $feedbackCount === 0)
                ? $rawJoinees
                : 1;
            $rawStatus = (string) (
                data_get($links, 'status')
                ?: data_get($analyticsSession, 'status')
                ?: data_get($row->raw_response, 'status', 'scheduled')
            );
            $startedAt = data_get($links, 'started_at')
                ?: data_get($analyticsSession, 'started_at')
                ?: data_get($row->raw_response, 'started_at');
            $endedAt = data_get($links, 'ended_at')
                ?: data_get($analyticsSession, 'ended_at')
                ?: data_get($row->raw_response, 'ended_at');
            $status = $this->dashboardSessionStatus($rawStatus, $startedAt, $endedAt);

            $snapshots[$token] = [
                'session_token' => $token,
                'status' => $status,
                'provider_status' => $rawStatus,
                'join_state' => $this->joinState($status, $joinees, $startedAt, $endedAt, $eventCount),
                'joinees' => $joinees,
                'event_count' => $eventCount,
                'started_at' => $startedAt,
                'ended_at' => $endedAt,
                'is_expired' => (bool) data_get($links, 'is_expired', false),
                'presenter_link' => data_get($links, 'presenter_link') ?: $row->presenter_link,
                'viewer_link' => data_get($links, 'viewer_link') ?: $row->viewer_link,
                'self_view_url' => data_get($links, 'self_view_url') ?: $row->self_view_url,
                'error' => $error,
            ];
        }

        return response()->json([
            'data' => $snapshots,
        ]);
    }

    public function publicSelfViewStore(Request $request, string $token): JsonResponse
    {
        $v = $request->validate([
            'project_key' => ['required', 'string', 'max:255'],
            'project_name' => ['required', 'string', 'max:255'],
            'presentation_id' => ['required', 'string', 'max:255'],
            'viewer_name' => ['required', 'string', 'max:255'],
            'viewer_email' => ['nullable', 'email', 'max:255'],
            'viewer_phone' => ['nullable', 'string', 'max:40'],
            'viewer_id' => ['nullable', 'string', 'max:120'],
            'meeting_date' => ['required', 'date', 'after_or_equal:today'],
            'meeting_time' => ['required', 'date_format:H:i'],
            'expires_in_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'frontend_url' => ['nullable', 'url', 'max:2048'],
        ]);

        $link = CustomerProjectLink::with([
            'customer:id,user_id,nickname,name,phone,secret_code',
            'user:id,name,email,company_name',
        ])->where('public_token', $token)->firstOrFail();

        $this->assertPublicProjectLinkUsable($link);

        $selected = collect($link->selected_projects ?? [])
            ->map(fn($project) => (array) $project)
            ->first(fn($project) => $this->projectKey($project) === trim((string) $v['project_key']));

        if (! $selected) {
            return response()->json([
                'message' => 'Invalid project selected for self-view link.',
            ], 422);
        }

        $projectKey = trim((string) $v['project_key']);
        $attempts = $this->cardAttempts($link);
        $lockedKeys = $this->lockedProjectKeys($link);

        if (in_array($projectKey, $lockedKeys, true) || (int) ($attempts[$projectKey] ?? 0) >= self::MAX_ATTEMPTS_PER_CARD) {
            return response()->json([
                'message' => 'Maximum attempts reached for this project. Editing is disabled.',
            ], 422);
        }

        $projectName = trim((string) ($selected['title'] ?? $v['project_name']));
        $existingSelfView = CustomerSessionLink::query()
            ->where('customer_id', $link->customer_id)
            ->where('project_name', $projectName)
            ->orderByDesc('created_at')
            ->get()
            ->first(function (CustomerSessionLink $row) use ($link, $projectKey) {
                $matchesPublicLink = (int) data_get($row->raw_response, 'public_customer_link_id') === (int) $link->id;
                $matchesProjectKey = (string) data_get($row->raw_response, 'project_key', $projectKey) === $projectKey;

                return $matchesPublicLink
                    && $matchesProjectKey
                    && is_string($row->self_view_url)
                    && trim($row->self_view_url) !== '';
            });

        if ($existingSelfView && ! $this->isConectrSessionCompleted($existingSelfView)) {
            return response()->json([
                'message' => 'Self-view link already exists.',
                'data' => $existingSelfView,
                'already_exists' => true,
            ]);
        }

        $customer = $link->customer;
        $owner = $link->user;

        $apiKey = trim((string) config('services.conectr_session.api_key', ''));
        if ($apiKey === '') {
            return response()->json([
                'message' => 'ConectR API key is not configured.',
            ], 500);
        }

        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $frontendUrl = (string) ($v['frontend_url'] ?? config('services.conectr_session.frontend_url', $baseUrl));
        $viewerId = trim((string) ($v['viewer_id'] ?? $customer?->secret_code ?? ''));

        $payload = [
            'presentation_id' => $v['presentation_id'],
            'presenter_name' => $owner?->name ?: 'Self View',
            'presenter_email' => $owner?->email,
            'presenter_id' => $owner?->id ? 'SP-' . str_pad((string) $owner->id, 3, '0', STR_PAD_LEFT) : null,
            'viewer_name' => $v['viewer_name'],
            'viewer_email' => $v['viewer_email'] ?? null,
            'viewer_phone' => $v['viewer_phone'] ?? null,
            'viewer_id' => $viewerId !== '' ? $viewerId : null,
            'expires_in_hours' => (int) ($v['expires_in_hours'] ?? 72),
        ];

        try {
            $extRes = Http::acceptJson()
                ->timeout(25)
                ->withHeaders([
                    'X-API-Key' => $apiKey,
                    'X-Frontend-URL' => $frontendUrl,
                ])
                ->post("{$baseUrl}/api/sessions/create-link", $payload);
        } catch (ConnectionException $e) {
            return response()->json([
                'message' => 'ConectR service is unreachable right now.',
                'provider_error' => $e->getMessage(),
            ], 502);
        }

        if ($extRes->failed()) {
            $status = $extRes->status() > 0 ? $extRes->status() : 502;
            $providerBody = trim((string) $extRes->body());

            return response()->json([
                'message' => $extRes->json('message')
                    ?? $extRes->json('error')
                    ?? ($providerBody !== '' ? $providerBody : 'Failed to generate self-view link.'),
                'provider_status' => $status,
                'provider_response' => $extRes->json(),
                'provider_body' => $providerBody,
            ], $status);
        }

        $body = $extRes->json();
        if (! is_array($body) || empty($body['session_token']) || empty($body['presenter_link']) || empty($body['viewer_link'])) {
            return response()->json([
                'message' => 'Invalid ConectR response.',
                'provider_response' => $body,
            ], 502);
        }

        $saved = CustomerSessionLink::create([
            'user_id' => $owner->id,
            'customer_id' => $customer->id,
            'project_name' => $projectName,
            'presentation_id' => (string) $v['presentation_id'],
            'presentation_title' => $body['presentation_title'] ?? null,
            'presenter_name' => (string) ($body['presenter_name'] ?? $payload['presenter_name']),
            'presenter_email' => (string) ($payload['presenter_email'] ?? ''),
            'presenter_platform_id' => (string) ($payload['presenter_id'] ?? ''),
            'viewer_name' => (string) ($body['viewer_name'] ?? $v['viewer_name']),
            'viewer_email' => (string) ($v['viewer_email'] ?? ''),
            'viewer_phone' => (string) ($v['viewer_phone'] ?? ''),
            'viewer_platform_id' => (string) ($payload['viewer_id'] ?? ''),
            'session_token' => (string) $body['session_token'],
            'session_code' => (string) ($body['session_code'] ?? ''),
            'join_code' => (string) ($body['join_code'] ?? ''),
            'presenter_link' => (string) $body['presenter_link'],
            'viewer_link' => (string) $body['viewer_link'],
            'expires_at' => $body['expires_at'] ?? null,
            'raw_response' => array_merge($body, [
                'public_customer_link_id' => $link->id,
                'project_key' => $projectKey,
                'self_view_requested_at' => now()->toIso8601String(),
                'self_view_scheduled_for' => $v['meeting_date'] . ' ' . $v['meeting_time'],
            ]),
        ]);

        $nextAttemptCount = (int) ($attempts[$projectKey] ?? 0) + 1;
        $attempts[$projectKey] = $nextAttemptCount;

        if ($nextAttemptCount >= self::MAX_ATTEMPTS_PER_CARD && ! in_array($projectKey, $lockedKeys, true)) {
            $lockedKeys[] = $projectKey;
        }

        $link->update([
            'card_attempts' => $attempts,
            'locked_project_keys' => array_values(array_unique($lockedKeys)),
            'last_interaction_at' => now(),
            'status' => 'opened',
        ]);

        return response()->json([
            'message' => 'Self-view link created successfully.',
            'data' => $saved,
        ], 201);
    }

    public function customerAnalytics(Request $request, int $customerId): JsonResponse
    {
        $customer = $this->findScopedCustomer($request->user(), $customerId);
        $viewerId = $this->resolveViewerId($customer);

        if ($viewerId === '') {
            return response()->json([
                'message' => 'No ConectR viewer ID found for this customer yet.',
            ], 422);
        }

        $query = [];
        $developerId = trim((string) $request->query('developer_id', ''));
        if ($developerId !== '') {
            $query['developer_id'] = $developerId;
        }

        return $this->proxyConectrRequest(
            'GET',
            '/api/analytics/customer/' . rawurlencode($viewerId),
            $query,
        );
    }

    public function customerMasterSummary(Request $request, int $customerId): JsonResponse
    {
        $customer = $this->findScopedCustomer($request->user(), $customerId);
        $viewerId = $this->resolveViewerId($customer);

        if ($viewerId === '') {
            return response()->json([
                'message' => 'No ConectR viewer ID found for this customer yet.',
            ], 422);
        }

        return $this->proxyConectrRequest(
            'POST',
            '/api/analytics/customer/' . rawurlencode($viewerId) . '/master-summary',
        );
    }

    private function findScopedCustomer($actor, int $customerId): Customer
    {
        $query = Customer::query()->where('is_active', 1);
        $this->applyCustomerScope($query, $actor);

        return $query->findOrFail($customerId);
    }

    private function visibleSessionLinks(Request $request)
    {
        $actor = $request->user();

        $query = CustomerSessionLink::query()
            ->with([
                'customer:id,user_id,nickname,name,secret_code',
                'user:id,name,email,company_name',
            ])
            ->orderByDesc('created_at');

        $this->applyScopedCustomerFilter($query, $actor);

        $rows = $query->get();

        if ($this->isCalendarProjectScopedRole($actor)) {
            $allowedProjects = $this->allowedProjectMap($actor);
            $rows = $rows
                ->filter(function (CustomerSessionLink $row) use ($allowedProjects) {
                    $projectName = $this->normalizeProjectName((string) ($row->project_name ?? ''));

                    return $projectName !== '' && isset($allowedProjects[$projectName]);
                })
                ->values();
        }

        return $rows;
    }

    private function joinState(string $status, int $joinees, mixed $startedAt, mixed $endedAt, int $eventCount = 0): string
    {
        $normalized = mb_strtolower(trim($status));
        $hasViewerActivity = $joinees > 0 || $eventCount > 0;

        if ($endedAt || str_contains($normalized, 'completed') || str_contains($normalized, 'ended')) {
            return $hasViewerActivity
                ? 'Session completed'
                : 'Customer not attended';
        }

        if ($startedAt || str_contains($normalized, 'live')) {
            return $hasViewerActivity
                ? 'Presenter and viewer joined'
                : 'Presenter joined, viewer waiting';
        }

        return 'Waiting for presenter';
    }

    private function dashboardSessionStatus(string $status, mixed $startedAt, mixed $endedAt): string
    {
        $normalized = mb_strtolower(trim($status));

        if ($endedAt || str_contains($normalized, 'completed') || str_contains($normalized, 'ended')) {
            return 'completed';
        }

        if ($startedAt || str_contains($normalized, 'live') || str_contains($normalized, 'started')) {
            return 'live';
        }

        return 'scheduled';
    }

    private function applyScopedCustomerFilter($query, $actor): void
    {
        if ($actor->isAdmin()) {
            return;
        }

        if ($this->isCalendarProjectScopedRole($actor)) {
            if ($actor->company_id) {
                $query->whereHas('customer.user', function ($q) use ($actor) {
                    $q->where('company_id', $actor->company_id);
                });
            }

            return;
        }

        if ($actor->company_id && $actor->is_company_owner) {
            $query->whereHas('customer.user', function ($q) use ($actor) {
                $q->where('company_id', $actor->company_id);
            });

            return;
        }

        $query->whereHas('customer', function ($q) use ($actor) {
            $q->where('user_id', $actor->id);
        });
    }

    private function applyCustomerScope($query, $actor): void
    {
        if ($actor->isAdmin()) {
            return;
        }

        if ($this->isCalendarProjectScopedRole($actor)) {
            if ($actor->company_id) {
                $query->whereHas('user', function ($q) use ($actor) {
                    $q->where('company_id', $actor->company_id);
                });
            }

            return;
        }

        if ($actor->company_id && $actor->is_company_owner) {
            $query->whereHas('user', function ($q) use ($actor) {
                $q->where('company_id', $actor->company_id);
            });

            return;
        }

        $query->where('user_id', $actor->id);
    }

    private function buildProjectSessionSummary(int $customerId, string $projectName): array
    {
        $normalizedProjectName = $this->normalizeProjectName($projectName);
        if ($normalizedProjectName === '') {
            return [
                'has_session_link' => false,
                'session_link_count' => 0,
                'latest_session_link_id' => null,
                'latest_session_created_at' => null,
            ];
        }

        $rows = CustomerSessionLink::query()
            ->where('customer_id', $customerId)
            ->orderByDesc('created_at')
            ->get()
            ->filter(function (CustomerSessionLink $row) use ($normalizedProjectName) {
                return $this->normalizeProjectName((string) ($row->project_name ?? '')) === $normalizedProjectName;
            })
            ->values();

        /** @var CustomerSessionLink|null $latest */
        $latest = $rows->first();

        return [
            'has_session_link' => $rows->isNotEmpty(),
            'session_link_count' => $rows->count(),
            'latest_session_link_id' => $latest?->id,
            'latest_session_created_at' => $latest?->created_at?->toDateTimeString(),
        ];
    }

    private function resolveViewerId(Customer $customer): string
    {
        $latestViewerId = trim((string) CustomerSessionLink::query()
            ->where('customer_id', $customer->id)
            ->whereNotNull('viewer_platform_id')
            ->where('viewer_platform_id', '!=', '')
            ->orderByDesc('created_at')
            ->value('viewer_platform_id'));

        if ($latestViewerId !== '') {
            return $latestViewerId;
        }

        return trim((string) ($customer->secret_code ?? ''));
    }

    private function proxyConectrRequest(string $method, string $path, array $query = []): JsonResponse
    {
        $apiKey = trim((string) config('services.conectr_session.api_key', ''));
        if ($apiKey === '') {
            return response()->json([
                'message' => 'ConectR API key is not configured.',
            ], 500);
        }

        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $frontendUrl = (string) config('services.conectr_session.frontend_url', $baseUrl);

        try {
            $http = Http::acceptJson()
                ->timeout(30)
                ->withHeaders([
                    'X-API-Key' => $apiKey,
                    'X-Frontend-URL' => $frontendUrl,
                ]);

            $response = strtoupper($method) === 'POST'
                ? $http->post("{$baseUrl}{$path}", $query)
                : $http->get("{$baseUrl}{$path}", $query);
        } catch (ConnectionException $e) {
            return response()->json([
                'message' => 'ConectR service is unreachable right now.',
                'provider_error' => $e->getMessage(),
            ], 502);
        }

        if ($response->failed()) {
            $status = $response->status() > 0 ? $response->status() : 502;
            $providerBody = trim((string) $response->body());

            return response()->json([
                'message' => $response->json('message')
                    ?? $response->json('error')
                    ?? ($providerBody !== '' ? $providerBody : 'ConectR request failed.'),
                'provider_status' => $status,
                'provider_response' => $response->json(),
                'provider_body' => $providerBody,
            ], $status);
        }

        return response()->json([
            'data' => $response->json(),
        ]);
    }

    private function normalizeProjectName(string $value): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/', ' ', $value)));
    }

    private function assertPublicProjectLinkUsable(CustomerProjectLink $link): void
    {
        if ($link->is_disabled) {
            abort(410, 'This link is disabled.');
        }

        if ($link->expires_at && now()->greaterThan($link->expires_at)) {
            $link->update([
                'status' => 'expired',
                'is_disabled' => true,
                'disabled_at' => now(),
                'last_interaction_at' => now(),
            ]);
            abort(410, 'This link has expired. Please request a new link.');
        }
    }

    private function projectKey(array $project): string
    {
        $id = $project['id'] ?? null;
        if (is_numeric($id)) {
            return 'id-' . (string) (int) $id;
        }

        $title = strtolower(trim((string) ($project['title'] ?? '')));
        if ($title === '') {
            return '';
        }

        return 'title-' . $title;
    }

    private function cardAttempts(CustomerProjectLink $link): array
    {
        $raw = $link->card_attempts ?? [];
        if (! is_array($raw)) {
            return [];
        }

        $out = [];
        foreach ($raw as $key => $count) {
            $k = trim((string) $key);
            if ($k !== '') {
                $out[$k] = max(0, (int) $count);
            }
        }

        return $out;
    }

    private function lockedProjectKeys(CustomerProjectLink $link): array
    {
        $raw = $link->locked_project_keys ?? [];
        if (! is_array($raw)) {
            return [];
        }

        return array_values(array_filter(
            array_map(fn($key) => trim((string) $key), $raw),
            fn($key) => $key !== ''
        ));
    }

    private function isConectrSessionCompleted(CustomerSessionLink $link): bool
    {
        $snapshot = $this->conectrSessionState($link);
        $status = mb_strtolower(trim((string) ($snapshot['status'] ?? '')));

        return in_array($status, ['completed', 'ended'], true)
            || trim((string) ($snapshot['ended_at'] ?? '')) !== '';
    }

    private function conectrSessionState(CustomerSessionLink $link): array
    {
        $apiKey = trim((string) config('services.conectr_session.api_key', ''));
        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $token = trim((string) $link->session_token);

        if ($apiKey === '' || $baseUrl === '' || $token === '') {
            return [
                'status' => data_get($link->raw_response, 'status', 'scheduled'),
                'ended_at' => data_get($link->raw_response, 'ended_at'),
            ];
        }

        $frontendUrl = (string) config('services.conectr_session.frontend_url', $baseUrl);
        $status = null;
        $endedAt = null;

        try {
            $http = Http::acceptJson()
                ->timeout(8)
                ->withHeaders([
                    'X-API-Key' => $apiKey,
                    'X-Frontend-URL' => $frontendUrl,
                ]);

            $linksResponse = $http->get("{$baseUrl}/api/sessions/" . rawurlencode($token) . "/links");
            if ($linksResponse->ok()) {
                $links = $linksResponse->json() ?: [];
                $status = data_get($links, 'status');
                $endedAt = data_get($links, 'ended_at');
            }

            $analyticsResponse = $http->get("{$baseUrl}/api/session/" . rawurlencode($token) . "/analytics");
            if ($analyticsResponse->ok()) {
                $analytics = $analyticsResponse->json() ?: [];
                $session = is_array(data_get($analytics, 'session')) ? data_get($analytics, 'session') : [];
                $status = data_get($session, 'status') ?: $status;
                $endedAt = data_get($session, 'ended_at') ?: $endedAt;
            }
        } catch (ConnectionException $e) {
            return [
                'status' => data_get($link->raw_response, 'status', 'scheduled'),
                'ended_at' => data_get($link->raw_response, 'ended_at'),
            ];
        }

        return [
            'status' => $status ?: data_get($link->raw_response, 'status', 'scheduled'),
            'ended_at' => $endedAt ?: data_get($link->raw_response, 'ended_at'),
        ];
    }

    private function isCalendarProjectScopedRole($user): bool
    {
        return in_array($user->role, ['developer_super_admin', 'sourcing_admin', 'sales_user'], true);
    }

    private function allowedProjectMap($user): array
    {
        $projects = is_array($user->assigned_projects ?? null) ? $user->assigned_projects : [];
        $map = [];

        foreach ($projects as $project) {
            $normalized = $this->normalizeProjectName((string) $project);
            if ($normalized !== '') {
                $map[$normalized] = true;
            }
        }

        return $map;
    }
}
