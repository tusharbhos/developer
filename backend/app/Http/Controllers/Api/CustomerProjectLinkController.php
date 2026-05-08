<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerProjectLink;
use App\Models\CustomerSessionLink;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class CustomerProjectLinkController extends Controller
{
    private const MAX_ATTEMPTS_PER_CARD = 5;

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $v = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'selected_projects' => ['required', 'array'],
            'selected_projects.*.id' => ['nullable', 'integer'],
            'selected_projects.*.title' => ['required', 'string', 'max:255'],
            'selected_projects.*.developer' => ['nullable', 'string', 'max:255'],
            'selected_projects.*.location' => ['nullable', 'string', 'max:255'],
            'selected_projects.*.price' => ['nullable', 'string', 'max:120'],
            'selected_projects.*.image_url' => ['nullable', 'string', 'max:2048'],
            'selected_projects.*.unit_types' => ['nullable', 'string', 'max:255'],
            'selected_projects.*.area' => ['nullable', 'string', 'max:120'],
            'selected_projects.*.possession' => ['nullable', 'string', 'max:120'],
            'selected_projects.*.status' => ['nullable', 'string', 'max:120'],
            'selected_projects.*.units_left' => ['nullable', 'integer'],
            'selected_projects.*.meeting_date' => ['nullable', 'date_format:Y-m-d'],
            'selected_projects.*.meeting_time' => ['nullable', 'date_format:H:i'],
        ]);

        $customer = $this->findAccessibleCustomer($user, (int) $v['customer_id']);

        $link = CustomerProjectLink::query()
            ->where('customer_id', $customer->id)
            ->where('user_id', $user->id)
            ->latest('id')
            ->first();

        if ($link) {
            $merged = $this->mergeProjects($link->selected_projects ?? [], $v['selected_projects']);
            $lockedKeys = collect($this->lockedProjectKeys($link))->values();

            $filteredLiked = collect($link->liked_projects ?? [])
                ->filter(function ($project) use ($lockedKeys) {
                    $key = $this->projectKey((array) $project);
                    return $key !== '' && ! $lockedKeys->contains($key);
                })
                ->values()
                ->all();

            $link->update([
                'public_token' => $this->generateUniqueToken(),
                'selected_projects' => $merged,
                'liked_projects' => $filteredLiked,
                'mask_identity' => false,
                'card_attempts' => [],
                'locked_project_keys' => [],
                'status' => 'sent',
                'sent_at' => now(),
                'expires_at' => now()->addHours($this->linkExpiryHours()),
                'is_disabled' => false,
                'disabled_at' => null,
                'last_interaction_at' => now(),
            ]);
        } else {
            $link = CustomerProjectLink::create([
                'user_id' => $user->id,
                'customer_id' => $customer->id,
                'public_token' => $this->generateUniqueToken(),
                'selected_projects' => $this->unmaskProjects($v['selected_projects']),
                'liked_projects' => [],
                'mask_identity' => false,
                'card_attempts' => [],
                'locked_project_keys' => [],
                'status' => 'sent',
                'sent_at' => now(),
                'expires_at' => now()->addHours($this->linkExpiryHours()),
            ]);
        }

        $link->load('customer:id,nickname,name,phone,secret_code', 'user:id,name,company_name');

        return response()->json([
            'message' => 'Projects added to cart.',
            'data' => $link,
        ]);
    }

    public function removeSelectedProject(Request $request, int $id, string $projectTitle): JsonResponse
    {
        $user = $request->user();
        $link = $this->findAccessibleLink($user, $id);

        $target = strtolower(trim($projectTitle));
        $selected = collect($link->selected_projects ?? [])
            ->reject(fn($project) => strtolower(trim((string) ($project['title'] ?? ''))) === $target)
            ->values()
            ->all();

        $liked = collect($link->liked_projects ?? [])
            ->reject(fn($project) => strtolower(trim((string) ($project['title'] ?? ''))) === $target)
            ->values()
            ->all();

        $link->update([
            'selected_projects' => $selected,
            'liked_projects' => $liked,
            'last_interaction_at' => now(),
            'status' => empty($selected) ? 'sent' : $link->status,
        ]);

        return response()->json([
            'message' => 'Project removed from cart.',
            'data' => $link->fresh(),
        ]);
    }

    public function byCustomer(Request $request, int $customerId): JsonResponse
    {
        $user = $request->user();
        $customer = $this->findAccessibleCustomer($user, $customerId);

        $query = CustomerProjectLink::with('customer:id,nickname,name,phone,secret_code', 'user:id,name,company_name')
            ->where('customer_id', $customer->id)
            ->where('user_id', $user->id)
            ->orderByDesc('created_at');

        $rows = $query->get();

        return response()->json([
            'data' => $rows,
            'total' => $rows->count(),
        ]);
    }

    public function publicShow(string $token): JsonResponse
    {
        $link = CustomerProjectLink::with('customer:id,nickname,name,phone,secret_code')
            ->where('public_token', $token)
            ->firstOrFail();

        $this->assertLinkUsable($link);

        $attempts = $this->cardAttempts($link);
        $lockedKeys = $this->lockedProjectKeys($link);

        if (! $link->opened_at) {
            $link->opened_at = now();
        }
        $link->status = 'opened';
        $link->last_interaction_at = now();
        $link->save();

        $selected = $link->selected_projects ?? [];
        $liked = $link->liked_projects ?? [];
        $selfViewLinks = $this->publicSelfViewLinks($link);

        // Apply per-project masking
        $selected = collect($selected)
            ->map(function ($project) use ($attempts, $lockedKeys) {
                $row = (array) $project;
                $key = $this->projectKey($row);
                unset($row['mask_identity']);
                $remaining = max(0, self::MAX_ATTEMPTS_PER_CARD - (int) ($attempts[$key] ?? 0));
                $isLocked = in_array($key, $lockedKeys, true);
                if ($isLocked) {
                    $row = $this->toViewOnlyCard($row);
                }
                $row['project_key'] = $key;
                $row['attempt_count'] = (int) ($attempts[$key] ?? 0);
                $row['attempts_left'] = $remaining;
                $row['is_locked'] = $isLocked;
                return $row;
            })
            ->values()
            ->all();

        $liked = collect($liked)
            ->map(function ($project) use ($attempts, $lockedKeys) {
                $row = (array) $project;
                $key = $this->projectKey($row);
                unset($row['mask_identity']);
                $remaining = max(0, self::MAX_ATTEMPTS_PER_CARD - (int) ($attempts[$key] ?? 0));
                $isLocked = in_array($key, $lockedKeys, true);
                if ($isLocked) {
                    $row = $this->toViewOnlyCard($row);
                }
                $row['project_key'] = $key;
                $row['attempt_count'] = (int) ($attempts[$key] ?? 0);
                $row['attempts_left'] = $remaining;
                $row['is_locked'] = $isLocked;
                return $row;
            })
            ->values()
            ->all();

        return response()->json([
            'data' => [
                'id' => $link->id,
                'public_token' => $link->public_token,
                'status' => $link->status,
                'selected_projects' => $selected,
                'liked_projects' => $liked,
                'self_view_links' => $selfViewLinks,
                'expires_at' => optional($link->expires_at)->toIso8601String(),
                'is_disabled' => (bool) $link->is_disabled,
                'max_attempts_per_card' => self::MAX_ATTEMPTS_PER_CARD,
                'locked_project_keys' => $lockedKeys,
                'customer' => $link->customer,
            ],
        ]);
    }

    public function publicLike(Request $request, string $token): JsonResponse
    {
        $v = $request->validate([
            'liked_projects' => ['present', 'array'],
            'attempt_project_key' => ['nullable', 'string', 'max:255'],
            'liked_projects.*.id' => ['nullable', 'integer'],
            'liked_projects.*.title' => ['required', 'string', 'max:255'],
            'liked_projects.*.developer' => ['nullable', 'string', 'max:255'],
            'liked_projects.*.location' => ['nullable', 'string', 'max:255'],
            'liked_projects.*.price' => ['nullable', 'string', 'max:120'],
            'liked_projects.*.image_url' => ['nullable', 'string', 'max:2048'],
            'liked_projects.*.unit_types' => ['nullable', 'string', 'max:255'],
            'liked_projects.*.area' => ['nullable', 'string', 'max:120'],
            'liked_projects.*.possession' => ['nullable', 'string', 'max:120'],
            'liked_projects.*.status' => ['nullable', 'string', 'max:120'],
            'liked_projects.*.units_left' => ['nullable', 'integer'],
            'liked_projects.*.meeting_date' => ['nullable', 'date', 'after_or_equal:today'],
            'liked_projects.*.meeting_time' => ['nullable', 'date_format:H:i'],
        ]);

        $link = CustomerProjectLink::where('public_token', $token)->firstOrFail();
        $this->assertLinkUsable($link);

        $selectedRows = collect($link->selected_projects ?? [])
            ->map(fn($project) => (array) $project)
            ->values();

        $selectedMap = [];
        foreach ($selectedRows as $row) {
            $key = $this->projectKey($row);
            if ($key === '') {
                continue;
            }
            $selectedMap[$key] = $row;
        }

        $likedInputMap = [];
        foreach (($v['liked_projects'] ?? []) as $project) {
            $row = (array) $project;
            $key = $this->projectKey($row);
            if ($key === '' || ! array_key_exists($key, $selectedMap)) {
                continue;
            }

            $base = $selectedMap[$key];
            $base['meeting_date'] = $row['meeting_date'] ?? null;
            $base['meeting_time'] = $row['meeting_time'] ?? null;
            $likedInputMap[$key] = $base;
        }

        $attempts = $this->cardAttempts($link);
        $lockedKeys = $this->lockedProjectKeys($link);

        $attemptKey = trim((string) ($v['attempt_project_key'] ?? ''));
        if ($attemptKey !== '') {
            if (! array_key_exists($attemptKey, $selectedMap)) {
                abort(422, 'Invalid card selection for attempt tracking.');
            }

            $nextCount = (int) ($attempts[$attemptKey] ?? 0) + 1;
            $attempts[$attemptKey] = $nextCount;

            if ($nextCount >= self::MAX_ATTEMPTS_PER_CARD) {
                if (! in_array($attemptKey, $lockedKeys, true)) {
                    $lockedKeys[] = $attemptKey;
                }
            }
        }

        $likedInputMap = collect($likedInputMap)
            ->reject(fn($value, $key) => in_array((string) $key, $lockedKeys, true))
            ->all();

        $liked = array_values($likedInputMap);

        // Auto-sync customer meetings from liked projects with date/time,
        // so meetings appear directly in Calendar without manual customer action.
        $customer = Customer::query()->findOrFail($link->customer_id);
        $senderUser = User::query()->select('id', 'name')->find($link->user_id);
        $this->syncCustomerMeetingsFromLiked($customer, $selectedRows->all(), $liked, $senderUser);

        $link->update([
            'liked_projects' => $liked,
            'card_attempts' => $attempts,
            'locked_project_keys' => array_values(array_unique($lockedKeys)),
            'is_disabled' => false,
            'disabled_at' => null,
            'status' => ! empty($liked) ? 'completed' : 'opened',
            'last_interaction_at' => now(),
        ]);

        return response()->json([
            'message' => 'Liked projects saved.',
            'data' => [
                'id' => $link->id,
                'status' => $link->status,
                'liked_projects' => $link->liked_projects ?? [],
                'expires_at' => optional($link->expires_at)->toIso8601String(),
                'is_disabled' => (bool) $link->is_disabled,
                'max_attempts_per_card' => self::MAX_ATTEMPTS_PER_CARD,
                'locked_project_keys' => $link->locked_project_keys ?? [],
            ],
        ]);
    }

    private function findAccessibleCustomer($user, int $customerId): Customer
    {
        $query = Customer::query()->where('id', $customerId)->where('is_active', 1);

        if ($user->isAdmin()) {
            return $query->firstOrFail();
        }

        if ($this->isProjectScopedRole($user)) {
            if ($user->company_id) {
                $query->whereHas('user', fn($q) => $q->where('company_id', $user->company_id));
            }

            return $query->firstOrFail();
        }

        // Role matrix:
        // - User (company owner): own + company users' customers
        // - Company User: only own customers
        if ($user->company_id && $user->is_company_owner) {
            $query->whereHas('user', fn($q) => $q->where('company_id', $user->company_id));
        } else {
            $query->where('user_id', $user->id);
        }

        return $query->firstOrFail();
    }

    private function isProjectScopedRole($user): bool
    {
        return false;
    }

    private function findAccessibleLink($user, int $id): CustomerProjectLink
    {
        return CustomerProjectLink::query()
            ->where('id', $id)
            ->where('user_id', $user->id)
            ->firstOrFail();
    }

    private function mergeProjects(array $oldProjects, array $newProjects): array
    {
        $map = [];

        foreach ($oldProjects as $project) {
            $row = (array) $project;
            $legacyMaskedOnly =
                (trim((string) ($row['title'] ?? '')) === '*****')
                && ! is_numeric($row['id'] ?? null);
            if ($legacyMaskedOnly) {
                continue;
            }

            $key = $this->projectKey((array) $project);
            if ($key === '') {
                continue;
            }
            $map[$key] = $this->unmaskProject((array) $project);
        }

        foreach ($newProjects as $project) {
            $key = $this->projectKey((array) $project);
            if ($key === '') {
                continue;
            }
            // Always prefer latest incoming payload to replace stale/masked rows.
            $map[$key] = $this->unmaskProject((array) $project);
        }

        return array_values($map);
    }

    private function unmaskProjects(array $projects): array
    {
        return array_values(array_map(
            fn($project) => $this->unmaskProject((array) $project),
            $projects,
        ));
    }

    private function unmaskProject(array $project): array
    {
        unset($project['mask_identity']);

        return $project;
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

    private function publicSelfViewLinks(CustomerProjectLink $link): array
    {
        $selectedRows = collect($link->selected_projects ?? [])
            ->map(fn($project) => (array) $project)
            ->values();

        $projectKeyByName = [];
        foreach ($selectedRows as $row) {
            $projectName = strtolower(trim((string) ($row['title'] ?? '')));
            $projectKey = $this->projectKey($row);
            if ($projectName !== '' && $projectKey !== '') {
                $projectKeyByName[$projectName] = $projectKey;
            }
        }

        return CustomerSessionLink::query()
            ->where('customer_id', $link->customer_id)
            ->where('raw_response->public_customer_link_id', $link->id)
            ->whereNotNull('raw_response->self_view_url')
            ->orderByDesc('created_at')
            ->get()
            ->filter(fn(CustomerSessionLink $row) => is_string($row->self_view_url) && trim($row->self_view_url) !== '')
            ->map(function (CustomerSessionLink $row) use ($projectKeyByName) {
                $projectName = trim((string) ($row->project_name ?? ''));
                $projectKey = $projectKeyByName[strtolower($projectName)] ?? ('title-' . strtolower($projectName));
                $scheduledFor = trim((string) data_get($row->raw_response, 'self_view_scheduled_for', ''));
                $meetingDate = null;
                $meetingTime = null;

                if (preg_match('/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/', $scheduledFor, $matches)) {
                    $meetingDate = $matches[1];
                    $meetingTime = $matches[2];
                }

                $statusText = (string) data_get($row->raw_response, 'status', 'scheduled');
                $endedAt = data_get($row->raw_response, 'ended_at');
                $status = mb_strtolower(trim($statusText));
                $isCompleted = in_array($status, ['completed', 'ended'], true)
                    || trim((string) $endedAt) !== '';

                return [
                    'id' => $row->id,
                    'project_key' => $projectKey,
                    'project_name' => $projectName,
                    'presentation_id' => $row->presentation_id,
                    'session_token' => $row->session_token,
                    'status' => $statusText ?: 'scheduled',
                    'ended_at' => $endedAt,
                    'is_completed' => $isCompleted,
                    'self_view_url' => $row->self_view_url,
                    'self_view_url_with_phone' => $row->self_view_url_with_phone,
                    'self_view_expires_at' => $row->self_view_expires_at,
                    'viewer_link' => $row->self_view_url_with_phone ?: $row->viewer_link,
                    'meeting_date' => $meetingDate,
                    'meeting_time' => $meetingTime,
                    'created_at' => optional($row->created_at)->toIso8601String(),
                ];
            })
            ->values()
            ->all();
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

    private function maskIdentityForPublic(array $projects): array
    {
        return collect($projects)
            ->map(function ($project) {
                $row = (array) $project;
                $row['title'] = '*****';
                $row['developer'] = '*****';
                return $row;
            })
            ->values()
            ->all();
    }

    private function generateUniqueToken(): string
    {
        do {
            $token = Str::random(40);
        } while (CustomerProjectLink::where('public_token', $token)->exists());

        return $token;
    }

    private function linkExpiryHours(): int
    {
        $hours = (int) env('CUSTOMER_LINK_EXPIRY_HOURS', 72);
        return $hours > 0 ? $hours : 72;
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
            if ($k === '') {
                continue;
            }
            $out[$k] = max(0, (int) $count);
        }

        return $out;
    }

    private function lockedProjectKeys(CustomerProjectLink $link): array
    {
        $raw = $link->locked_project_keys ?? [];
        if (! is_array($raw)) {
            return [];
        }

        return array_values(
            array_filter(
                array_map(fn($key) => trim((string) $key), $raw),
                fn($key) => $key !== ''
            )
        );
    }

    private function assertLinkUsable(CustomerProjectLink $link): void
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

    private function toViewOnlyCard(array $row): array
    {
        unset($row['meeting_date'], $row['meeting_time']);
        return $row;
    }

    private function syncCustomerMeetingsFromLiked(
        Customer $customer,
        array $selectedProjects,
        array $likedProjects,
        ?User $senderUser = null
    ): void {
        $projects = $customer->projects ?? [];

        $selectedProjectNames = collect($selectedProjects)
            ->map(fn($project) => trim((string) (($project['title'] ?? null) ?: ($project['project_name'] ?? ''))))
            ->filter(fn($name) => $name !== '')
            ->values();

        $likedProjectNames = collect($likedProjects)
            ->map(fn($project) => trim((string) (($project['title'] ?? null) ?: ($project['project_name'] ?? ''))))
            ->filter(fn($name) => $name !== '')
            ->values();

        $projects = array_values(array_filter($projects, function ($project) use ($selectedProjectNames, $likedProjectNames) {
            $existingName = trim((string) ($project['project_name'] ?? ''));
            if ($existingName === '') {
                return false;
            }

            if (! $selectedProjectNames->contains(fn($name) => strcasecmp($name, $existingName) === 0)) {
                return true;
            }

            return $likedProjectNames->contains(fn($name) => strcasecmp($name, $existingName) === 0);
        }));

        foreach ($likedProjects as $liked) {
            $row = (array) $liked;
            $projectName = trim((string) ($row['title'] ?? ''));
            $meetingDate = $row['meeting_date'] ?? null;
            $meetingTime = $row['meeting_time'] ?? null;

            if ($projectName === '' || ! $meetingDate || ! $meetingTime) {
                continue;
            }

            $this->assertValidSlot($meetingTime);

            $existingIndex = null;
            foreach ($projects as $index => $project) {
                $existingName = trim((string) ($project['project_name'] ?? ''));
                if (strcasecmp($existingName, $projectName) === 0) {
                    $existingIndex = $index;
                    break;
                }
            }

            $meetingData = [
                'project_name' => $projectName,
                'meeting_date' => $meetingDate,
                'meeting_time' => $meetingTime,
                'scheduled_at' => now()->toDateTimeString(),
            ];

            if ($existingIndex !== null) {
                $existingCreatedById = $projects[$existingIndex]['created_by_id'] ?? null;
                $existingCreatedByName = $projects[$existingIndex]['created_by_name'] ?? null;
                if ($existingCreatedById) {
                    $meetingData['created_by_id'] = $existingCreatedById;
                } elseif ($senderUser?->id) {
                    $meetingData['created_by_id'] = $senderUser->id;
                }

                if (! empty($existingCreatedByName)) {
                    $meetingData['created_by_name'] = $existingCreatedByName;
                } elseif (! empty($senderUser?->name)) {
                    $meetingData['created_by_name'] = $senderUser->name;
                }

                if ($senderUser?->id) {
                    $meetingData['updated_by_id'] = $senderUser->id;
                    $meetingData['updated_by_name'] = $senderUser->name;
                }

                $projects[$existingIndex] = array_merge($projects[$existingIndex], $meetingData);
            } else {
                if ($senderUser?->id) {
                    $meetingData['created_by_id'] = $senderUser->id;
                    $meetingData['created_by_name'] = $senderUser->name;
                }
                $projects[] = $meetingData;
            }

            $lastScheduled = $meetingData;
        }

        $customer->projects = array_values($projects);

        $latestMeeting = $this->latestMeetingProject($customer->projects);

        if ($latestMeeting) {
            $customer->meeting_date = $latestMeeting['meeting_date'] ?? null;
            $customer->meeting_time = $latestMeeting['meeting_time'] ?? null;
            $customer->project_name = $latestMeeting['project_name'] ?? null;
        } else {
            $customer->meeting_date = null;
            $customer->meeting_time = null;
            $customer->project_name = null;
        }

        $customer->save();
    }

    private function latestMeetingProject(array $projects): ?array
    {
        $scored = collect($projects)
            ->map(function ($project) {
                $row = (array) $project;
                $date = trim((string) ($row['meeting_date'] ?? ''));
                $time = trim((string) ($row['meeting_time'] ?? ''));
                if ($date === '' || $time === '') {
                    return null;
                }

                $row['_sort_key'] = sprintf(
                    '%s|%s|%s',
                    $date,
                    $time,
                    trim((string) ($row['scheduled_at'] ?? '')),
                );

                return $row;
            })
            ->filter()
            ->sortByDesc('_sort_key')
            ->values();

        $latest = $scored->first();
        if (! $latest) {
            return null;
        }

        unset($latest['_sort_key']);

        return $latest;
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

    private function assertNoConflictForProjects(
        Customer $customer,
        array $projects,
        string $date,
        string $time,
        string $excludeProjectName
    ): void {
        $newMins = $this->toMins($time);

        foreach ($projects as $project) {
            $projectName = trim((string) ($project['project_name'] ?? ''));
            if ($projectName === '') {
                continue;
            }
            if (strcasecmp($projectName, $excludeProjectName) === 0) {
                continue;
            }

            $existingDate = $project['meeting_date'] ?? null;
            $existingTime = $project['meeting_time'] ?? null;
            if (! $existingDate || ! $existingTime) {
                continue;
            }
            if ($existingDate !== $date) {
                continue;
            }

            if (abs($this->toMins((string) $existingTime) - $newMins) < 30) {
                $time12 = $this->fmt12((string) $existingTime);
                abort(
                    422,
                    "This customer '{$customer->nickname} ({$customer->secret_code})' already has a meeting for '{$projectName}' at {$time12}. Please choose another time."
                );
            }
        }
    }

    private function toMins(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));
        return $h * 60 + $m;
    }

    private function fmt12(string $time): string
    {
        [$h, $m] = array_map('intval', explode(':', $time));
        return sprintf('%d:%02d %s', $h % 12 ?: 12, $m, $h >= 12 ? 'PM' : 'AM');
    }
}
