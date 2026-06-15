<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerProjectLink;
use App\Models\CustomerSessionLink;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

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
            'meeting_date' => ['nullable', 'date', 'after_or_equal:today'],
            'meeting_time' => ['nullable', 'date_format:H:i'],
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

        $requestedProjectName = trim((string) ($v['project_name'] ?? ''));
        if (! empty($v['meeting_date']) && ! empty($v['meeting_time']) && $requestedProjectName !== '') {
            $this->assertValidSlot($v['meeting_time']);
            $this->assertNoConflictForProjects($customer, $v['meeting_date'], $v['meeting_time'], $requestedProjectName);
        }

        $apiKey = trim((string) config('services.conectr_session.api_key', ''));
        if ($apiKey === '') {
            return response()->json([
                'message' => 'ConectR API key is not configured.',
            ], 500);
        }

        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $frontendUrl = (string) ($v['frontend_url'] ?? config('services.conectr_session.frontend_url', $baseUrl));
        $viewerId = trim((string) ($v['viewer_id'] ?? ''));
        if ($viewerId === '') {
            $viewerId = 'CUST-' . $customer->id;
        }

        $payload = [
            'presentation_id' => $v['presentation_id'],
            'presenter_name' => $v['presenter_name'],
            'presenter_email' => $v['presenter_email'] ?? null,
            'presenter_id' => $v['presenter_id'] ?? null,
            'viewer_name' => $v['viewer_name'],
            'viewer_email' => $v['viewer_email'] ?? null,
            'viewer_phone' => $v['viewer_phone'] ?? null,
            'viewer_id' => $viewerId,
            'expires_in_hours' => (int) ($v['expires_in_hours'] ?? 72),
            'webhook_url' => $this->conectrWebhookUrl(),
            'webhook_payload_mode' => (string) config('services.conectr_session.webhook_payload_mode', 'full'),
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
            'viewer_platform_id' => $viewerId,
            'session_token' => (string) $body['session_token'],
            'session_code' => (string) ($body['session_code'] ?? ''),
            'join_code' => (string) ($body['join_code'] ?? ''),
            'presenter_link' => (string) $body['presenter_link'],
            'viewer_link' => (string) $body['viewer_link'],
            'expires_at' => $body['expires_at'] ?? null,
            'raw_response' => $body,
        ]);

        if ($projectName !== '') {
            $customerChanged = false;
            if (! empty($v['meeting_date']) && ! empty($v['meeting_time'])) {
                $this->syncMeetingForCreatedSession($customer, $actor, $projectName, $v['meeting_date'], $v['meeting_time']);
                $customerChanged = true;
            }

            $summary = $this->buildProjectSessionSummary($customer->id, $projectName, $saved);
            if ($customer->syncProjectSessionSummary($projectName, $summary)) {
                $customerChanged = true;
            }
            if ($customerChanged) {
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
        $snapshots = [];

        foreach ($rows as $row) {
            $token = trim((string) $row->session_token);
            if ($token === '') {
                continue;
            }

            $status = $this->dashboardSessionStatus(
                (string) ($row->status ?: 'scheduled'),
                $row->started_at,
                $row->ended_at,
            );

            $snapshots[$token] = [
                'session_token' => $token,
                'status' => $status,
                'provider_status' => $row->status ?: 'scheduled',
                'join_state' => $this->joinState(
                    $status,
                    (int) $row->joinees,
                    $row->started_at,
                    $row->ended_at,
                    (int) $row->event_count,
                ),
                'joinees' => (int) $row->joinees,
                'event_count' => (int) $row->event_count,
                'started_at' => $row->started_at,
                'ended_at' => $row->ended_at,
                'is_expired' => $row->expires_at?->isPast() ?? false,
                'presenter_link' => $row->presenter_link,
                'viewer_link' => $row->viewer_link,
                'self_view_url' => $row->self_view_url,
                'error' => null,
            ];
        }

        return response()->json(['data' => $snapshots]);
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
            'calendar_visible' => ['nullable', 'boolean'],
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
            ->where('raw_response->public_customer_link_id', $link->id)
            ->where('raw_response->project_key', $projectKey)
            ->whereNotNull('raw_response->self_view_url')
            ->orderByDesc('created_at')
            ->first();

        if ($existingSelfView && ! $this->isConectrSessionCompleted($existingSelfView)) {
            if ((bool) ($v['calendar_visible'] ?? false)) {
                $rawResponse = is_array($existingSelfView->raw_response)
                    ? $existingSelfView->raw_response
                    : [];
                $existingSelfView->raw_response = array_merge($rawResponse, [
                    'self_view_calendar_visible' => true,
                    'self_view_scheduled_for' => $v['meeting_date'] . ' ' . $v['meeting_time'],
                ]);
                $existingSelfView->save();
            }

            return response()->json([
                'message' => 'Self-view link already exists.',
                'data' => $existingSelfView->fresh(),
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
        $viewerId = trim((string) ($v['viewer_id'] ?? ''));
        if ($viewerId === '') {
            $viewerId = 'CUST-' . $customer->id;
        }

        $payload = [
            'presentation_id' => $v['presentation_id'],
            'presentation_code' => $v['presentation_id'],
            'presenter_name' => $owner?->name ?: 'Self View',
            'presenter_email' => $owner?->email,
            'presenter_id' => $owner?->id ? 'SP-' . str_pad((string) $owner->id, 3, '0', STR_PAD_LEFT) : null,
            'viewer_name' => $v['viewer_name'],
            'viewer_email' => $v['viewer_email'] ?? null,
            'viewer_phone' => $v['viewer_phone'] ?? null,
            'viewer_id' => $viewerId !== '' ? $viewerId : null,
            'customer_name' => $v['viewer_name'],
            'customer_email' => $v['viewer_email'] ?? null,
            'customer_phone' => $v['viewer_phone'] ?? null,
            'customer_id' => $viewerId !== '' ? $viewerId : null,
            'expires_in_hours' => (int) ($v['expires_in_hours'] ?? 72),
            'mode' => 'self_view',
            'source' => 'standalone',
            'self_view' => true,
            'self_view_only' => true,
            'webhook_url' => $this->conectrWebhookUrl(),
            'webhook_payload_mode' => (string) config('services.conectr_session.webhook_payload_mode', 'full'),
        ];

        try {
            [$extRes, $providerPath, $triedProviderPaths] = $this->createProviderSelfViewLink(
                $baseUrl,
                $apiKey,
                $frontendUrl,
                $payload
            );
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
                    ?? $extRes->json('detail')
                    ?? ($providerBody !== '' ? $providerBody : 'Failed to generate self-view link.'),
                'provider_status' => $status,
                'provider_response' => $extRes->json(),
                'provider_body' => $providerBody,
                'provider_endpoint' => $providerPath,
                'tried_provider_endpoints' => $triedProviderPaths,
            ], $status);
        }

        $body = $extRes->json();
        if (! is_array($body) || empty($body['self_view_url'])) {
            return response()->json([
                'message' => 'Invalid self-view response. Expected self_view_url.',
                'provider_response' => $body,
            ], 502);
        }

        $selfViewUrl = (string) $body['self_view_url'];
        $sessionToken = trim((string) ($body['session_token'] ?? ''));
        if ($sessionToken === '') {
            $providerId = trim((string) ($body['id'] ?? ''));
            $sessionToken = Str::isUuid($providerId) ? $providerId : (string) Str::uuid();
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
            'session_token' => $sessionToken,
            'session_code' => (string) ($body['session_code'] ?? ''),
            'join_code' => (string) ($body['join_code'] ?? ''),
            'presenter_link' => $selfViewUrl,
            'viewer_link' => $selfViewUrl,
            'expires_at' => $body['self_view_expires_at'] ?? ($body['expires_at'] ?? null),
            'raw_response' => array_merge($body, [
                'public_customer_link_id' => $link->id,
                'project_key' => $projectKey,
                'mode' => 'self_view',
                'self_view_url' => $selfViewUrl,
                'self_view_expires_at' => $body['self_view_expires_at'] ?? ($body['expires_at'] ?? null),
                'provider_endpoint' => $providerPath,
                'self_view_calendar_visible' => (bool) ($v['calendar_visible'] ?? false),
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
        $developerId = trim((string) $request->query('developer_id', ''));
        $rows = CustomerSessionLink::query()
            ->where('customer_id', $customer->id)
            ->when($developerId !== '', fn($query) => $query->where('presenter_platform_id', $developerId))
            ->orderByDesc('created_at')
            ->get();

        $sessions = $rows->map(fn(CustomerSessionLink $row) => $this->localAnalyticsPayload($row))->values();
        $presentations = $rows->pluck('presentation_title')
            ->filter()
            ->unique()
            ->values();
        $developers = $rows->pluck('presenter_platform_id')
            ->filter()
            ->unique()
            ->values();

        return response()->json([
            'data' => [
                'customer' => [
                    'viewer_id' => $this->resolveViewerId($customer),
                    'viewer_name' => $customer->name ?: $customer->nickname,
                    'total_sessions' => $rows->count(),
                    'total_events' => $rows->sum('event_count'),
                    'presentations_viewed' => $presentations,
                    'developers_interacted' => $developers,
                ],
                'sessions' => $sessions,
            ],
        ]);
    }

    public function sessionAnalytics(Request $request, int $id): JsonResponse
    {
        $row = $this->findVisibleSessionLink($request, $id);

        return response()->json([
            'data' => $this->localAnalyticsPayload($row),
        ]);
    }

    public function generateSessionSummary(Request $request, int $id): JsonResponse
    {
        $row = $this->findVisibleSessionLink($request, $id);
        $response = $this->providerSessionRequest($row, 'POST', 'generate-summary');
        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        return response()->json([
            'message' => 'Summary generation requested. The summary_ready webhook will update the database.',
            'data' => $this->localAnalyticsPayload($row->fresh()),
        ]);
    }

    public function endSession(Request $request, int $id): JsonResponse
    {
        $row = $this->findVisibleSessionLink($request, $id);
        $response = $this->providerSessionRequest($row, 'POST', 'end');
        if ($response->getStatusCode() >= 400 && $response->getStatusCode() !== 410) {
            return $response;
        }

        return response()->json([
            'message' => 'Session end requested. Webhooks will update the final status and summary.',
        ]);
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

    private function syncMeetingForCreatedSession(Customer $customer, $actor, string $projectName, string $meetingDate, string $meetingTime): void
    {
        $this->assertValidSlot($meetingTime);
        $this->assertNoConflictForProjects($customer, $meetingDate, $meetingTime, $projectName);

        $customer->addProjectMeeting([
            'project_name' => $projectName,
            'meeting_date' => $meetingDate,
            'meeting_time' => $meetingTime,
            'scheduled_at' => now()->toDateTimeString(),
            'created_by_id' => $actor->id,
            'created_by_name' => $actor->name,
        ]);

        $customer->meeting_date = $meetingDate;
        $customer->meeting_time = $meetingTime;
        $customer->project_name = $projectName;
    }

    private function buildProjectSessionSummary(int $customerId, string $projectName, ?CustomerSessionLink $latestHint = null): array
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

        if (
            $latestHint
            && (int) $latestHint->customer_id === $customerId
            && $this->normalizeProjectName((string) ($latestHint->project_name ?? '')) === $normalizedProjectName
        ) {
            $count = CustomerSessionLink::query()
                ->where('customer_id', $customerId)
                ->where('project_name', $latestHint->project_name)
                ->count();

            return [
                'has_session_link' => true,
                'session_link_count' => $count,
                'latest_session_link_id' => $latestHint->id,
                'latest_session_created_at' => $latestHint->created_at?->toDateTimeString(),
                'latest_session_status' => $latestHint->status,
                'latest_session_started_at' => $latestHint->started_at,
                'latest_session_ended_at' => $latestHint->ended_at,
                'latest_session_joinees' => $latestHint->joinees,
                'latest_session_event_count' => $latestHint->event_count,
            ];
        }

        $rows = CustomerSessionLink::query()
            ->where('customer_id', $customerId)
            ->where('project_name', $projectName)
            ->orderByDesc('created_at')
            ->get();

        /** @var CustomerSessionLink|null $latest */
        $latest = $rows->first();

        return [
            'has_session_link' => $rows->isNotEmpty(),
            'session_link_count' => $rows->count(),
            'latest_session_link_id' => $latest?->id,
            'latest_session_created_at' => $latest?->created_at?->toDateTimeString(),
            'latest_session_status' => $latest?->status,
            'latest_session_started_at' => $latest?->started_at,
            'latest_session_ended_at' => $latest?->ended_at,
            'latest_session_joinees' => $latest?->joinees ?? 0,
            'latest_session_event_count' => $latest?->event_count ?? 0,
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

        return trim((string) ($customer->secret_code ?? '')) ?: 'CUST-' . $customer->id;
    }

    private function conectrWebhookUrl(): ?string
    {
        $url = trim((string) config('services.conectr_session.webhook_url'));
        $secret = trim((string) config('services.conectr_session.webhook_secret'));
        if ($url === '' || $secret === '') {
            return null;
        }

        $separator = str_contains($url, '?') ? '&' : '?';

        return $url . $separator . http_build_query(['key' => $secret]);
    }

    private function findVisibleSessionLink(Request $request, int $id): CustomerSessionLink
    {
        /** @var CustomerSessionLink|null $row */
        $row = $this->visibleSessionLinks($request)->firstWhere('id', $id);
        if (! $row) {
            abort(404, 'Session link not found.');
        }

        return $row;
    }

    private function localAnalyticsPayload(CustomerSessionLink $row): array
    {
        $stored = is_array($row->analytics_payload) ? $row->analytics_payload : [];
        $events = is_array(data_get($stored, 'events')) ? data_get($stored, 'events') : [];
        $feedback = is_array($row->feedback_payload)
            ? $row->feedback_payload
            : (is_array(data_get($stored, 'feedback_submissions')) ? data_get($stored, 'feedback_submissions') : []);
        $summary = is_array($row->summary_payload)
            ? $row->summary_payload
            : (is_array(data_get($stored, 'summary')) ? data_get($stored, 'summary') : []);

        return array_replace_recursive($stored, [
            'session_token' => $row->session_token,
            'session_code' => $row->session_code,
            'presentation_id' => $row->presentation_id,
            'presentation_title' => $row->presentation_title ?: $row->project_name,
            'presenter_name' => $row->presenter_name,
            'viewer_name' => $row->viewer_name,
            'viewer_id' => $row->viewer_platform_id,
            'status' => $row->status ?: 'scheduled',
            'created_at' => $row->created_at?->toIso8601String(),
            'started_at' => $row->started_at,
            'ended_at' => $row->ended_at,
            'joinees' => $row->joinees,
            'event_count' => max($row->event_count, count($events), count($feedback)),
            'events' => $events,
            'summary' => $summary,
            'feedback_submissions' => $feedback,
            'session' => array_replace_recursive(
                is_array(data_get($stored, 'session')) ? data_get($stored, 'session') : [],
                [
                    'session_token' => $row->session_token,
                    'session_code' => $row->session_code,
                    'presentation_title' => $row->presentation_title ?: $row->project_name,
                    'presenter_name' => $row->presenter_name,
                    'viewer_name' => $row->viewer_name,
                    'viewer_id' => $row->viewer_platform_id,
                    'status' => $row->status ?: 'scheduled',
                    'created_at' => $row->created_at?->toIso8601String(),
                    'started_at' => $row->started_at,
                    'ended_at' => $row->ended_at,
                    'joinees' => $row->joinees,
                    'event_count' => max($row->event_count, count($events), count($feedback)),
                    'feedback_submissions' => $feedback,
                ],
            ),
        ]);
    }

    private function providerSessionRequest(CustomerSessionLink $row, string $method, string $action): JsonResponse
    {
        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $apiKey = trim((string) config('services.conectr_session.api_key'));
        $frontendUrl = (string) config('services.conectr_session.frontend_url', $baseUrl);
        $token = trim((string) $row->session_token);

        if ($apiKey === '') {
            return response()->json([
                'message' => 'ConectR API key is not configured.',
            ], 500);
        }

        try {
            $http = Http::acceptJson()
                ->timeout(30)
                ->withHeaders([
                    'X-API-Key' => $apiKey,
                    'X-Frontend-URL' => $frontendUrl,
                ]);
            $response = strtoupper($method) === 'GET'
                ? $http->get("{$baseUrl}/api/session/" . rawurlencode($token) . "/{$action}")
                : $http->post("{$baseUrl}/api/session/" . rawurlencode($token) . "/{$action}");
        } catch (ConnectionException $e) {
            return response()->json([
                'message' => 'ConectR service is unreachable right now.',
            ], 502);
        }

        if ($response->failed()) {
            return response()->json([
                'message' => $response->json('message')
                    ?? $response->json('detail')
                    ?? 'ConectR request failed.',
                'provider_status' => $response->status(),
            ], $response->status() ?: 502);
        }

        return response()->json([
            'message' => $response->json('message') ?: 'ConectR request completed.',
            'provider_response' => $response->json(),
        ]);
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

    private function createProviderSelfViewLink(string $baseUrl, string $apiKey, string $frontendUrl, array $payload): array
    {
        $configuredPath = trim((string) config('services.conectr_session.self_view_path', ''));
        $fallbackPaths = array_map(
            'trim',
            explode(',', (string) config('services.conectr_session.self_view_fallback_paths', ''))
        );
        $paths = array_values(array_unique(array_filter([
            $configuredPath ?: '/api/self-view/create-link',
            ...$fallbackPaths,
        ])));
        $timeout = max(3, min(25, (int) config('services.conectr_session.self_view_timeout', 10)));

        $lastResponse = null;
        $lastPath = $paths[0] ?? '/api/self-view/create-link';

        foreach ($paths as $path) {
            $lastPath = str_starts_with($path, '/') ? $path : '/' . $path;
            $response = Http::acceptJson()
                ->timeout($timeout)
                ->withHeaders([
                    'X-API-Key' => $apiKey,
                    'X-Frontend-URL' => $frontendUrl,
                ])
                ->post("{$baseUrl}{$lastPath}", $payload);

            $lastResponse = $response;

            if (! in_array($response->status(), [404, 405], true)) {
                return [$response, $lastPath, $paths];
            }
        }

        return [$lastResponse, $lastPath, $paths];
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

    private function assertValidSlot(string $time): void
    {
        $parts = explode(':', $time);
        if (count($parts) !== 2) {
            abort(422, 'Meeting time format is invalid.');
        }

        $mins = (int) $parts[1];
        if (! in_array($mins, [0, 30], true)) {
            abort(422, 'Meeting time must be on a 30-minute slot (e.g. 10:00 or 10:30).');
        }
    }

    private function assertNoConflictForProjects(Customer $customer, string $date, string $time, ?string $excludeProject = null): void
    {
        $newMins = $this->toMins($time);
        $excludeProjectName = $excludeProject ? $this->normalizeProjectName($excludeProject) : null;

        foreach (($customer->projects ?? []) as $project) {
            $projectName = trim((string) ($project['project_name'] ?? ''));
            if ($projectName === '') {
                continue;
            }

            if ($excludeProjectName && $this->normalizeProjectName($projectName) === $excludeProjectName) {
                continue;
            }

            if (($project['meeting_date'] ?? null) !== $date || empty($project['meeting_time'])) {
                continue;
            }

            if (abs($this->toMins((string) $project['meeting_time']) - $newMins) < 30) {
                abort(422, "This customer already has a meeting for '{$projectName}' near this time. Please choose another time.");
            }
        }
    }

    private function toMins(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));
        return $h * 60 + $m;
    }

    private function conectrSessionState(CustomerSessionLink $link): array
    {
        return [
            'status' => $link->status ?: 'scheduled',
            'ended_at' => $link->ended_at,
        ];
    }

    private function isCalendarProjectScopedRole($user): bool
    {
        return false;
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
