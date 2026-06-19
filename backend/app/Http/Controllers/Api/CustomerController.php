<?php
// app/Http/Controllers/Api/CustomerController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerSessionLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class CustomerController extends Controller
{
    public function calendarIndex(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = Customer::with('user:id,name,email,company_name,company_id')->where('is_active', 1);
        $this->applyCustomerCalendarScope($query, $user);

        $list = $query->orderBy('created_at', 'desc')->get();
        $isScopedRole = $this->isCalendarProjectScopedRole($user);
        $allowedProjects = $this->allowedProjectMap($user);

        $list->transform(function ($customer) {
            $customer->projects = $customer->projects ?? [];
            return $customer;
        });

        if ($isScopedRole) {
            $list = $list
                ->map(function ($customer) use ($allowedProjects) {
                    $customer->projects = $this->filterProjectsByAllowedMap($customer->projects ?? [], $allowedProjects);
                    return $customer;
                })
                ->filter(fn($customer) => !empty($customer->projects))
                ->values();
        }

        $projectSessionSummaryMap = [];
        $sessionLinkCounts = collect();
        if ($list->isNotEmpty() && Schema::hasTable('customer_session_links')) {
            $customerIds = $list->pluck('id')->all();
            $projectSessionSummaryMap = $this->buildProjectSessionSummaryMap($customerIds);
            $sessionLinkCounts = CustomerSessionLink::query()
                ->selectRaw('customer_id, COUNT(*) as aggregate')
                ->whereIn('customer_id', $customerIds)
                ->groupBy('customer_id')
                ->pluck('aggregate', 'customer_id');
        }

        $list->transform(function ($customer) use ($projectSessionSummaryMap, $sessionLinkCounts) {
            $projectSummaries = $projectSessionSummaryMap[$customer->id] ?? [];
            $customer->projects = $this->mergeProjectSessionSummaryData(
                $customer->projects ?? [],
                $projectSummaries,
            );

            $countFromProjects = array_reduce(
                $projectSummaries,
                fn(int $carry, array $summary) => $carry + (int) ($summary['session_link_count'] ?? 0),
                0,
            );
            $count = $countFromProjects > 0
                ? $countFromProjects
                : (int) ($sessionLinkCounts[$customer->id] ?? 0);

            $customer->session_link_count = $count;
            $customer->has_session_link = $count > 0;
            return $customer;
        });

        return response()->json(['data' => $list, 'total' => $list->count()]);
    }

    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = Customer::with('user:id,name,email,company_name')->where('is_active', 1);
        $this->applyCustomerCalendarScope($query, $user);

        $isScopedRole = $this->isCalendarProjectScopedRole($user);
        $allowedProjects = $this->allowedProjectMap($user);

        if ($search = $request->get('search')) {
            $query->where(
                fn($q) => $q
                    ->where('nickname',    'like', "%{$search}%")
                    ->orWhere('secret_code', 'like', "%{$search}%")
                    ->orWhere('name',       'like', "%{$search}%")
                    ->orWhere('phone',      'like', "%{$search}%")
            );
        }

        $list = $query->orderBy('created_at', 'desc')->get();

        // Transform data to include projects
        $list->transform(function ($customer) {
            $customer->projects = $customer->projects ?? [];
            return $customer;
        });

        if ($isScopedRole) {
            $list = $list
                ->map(function ($customer) use ($allowedProjects) {
                    $customer->projects = $this->filterProjectsByAllowedMap($customer->projects ?? [], $allowedProjects);
                    return $customer;
                })
                ->filter(fn($customer) => !empty($customer->projects))
                ->values();
        }

        return response()->json(['data' => $list, 'total' => $list->count()]);
    }

    public function upcoming(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Customer::where('is_active', 1)
            ->whereNotNull('meeting_date')
            ->where('meeting_date', '>=', now()->toDateString());
        $this->applyCustomerScope($query, $user);
        return response()->json(['data' => $query->orderBy('meeting_date')->get()]);
    }

    public function generateCode(): JsonResponse
    {
        $code = $this->generateUniqueCustomerCode();
        return response()->json(['secret_code' => $code]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'nickname'     => ['nullable', 'string', 'max:100'],
            'secret_code'  => ['nullable', 'string', 'max:50', 'unique:customers,secret_code'],
            'name'         => ['nullable', 'string', 'max:255'],
            'phone'        => ['nullable', 'string', 'max:30'],
            'address'      => ['nullable', 'string'],
            'notes'        => ['nullable', 'string'],
            'status'       => ['nullable', 'in:active,inactive,Booked'],
        ]);

        $secretCode = trim((string) ($v['secret_code'] ?? ''));
        if ($secretCode === '') {
            $secretCode = $this->generateUniqueCustomerCode();
        }

        $v['phone'] = $this->normalizePhoneInput($v['phone'] ?? null);
        $nickname = trim((string) ($v['nickname'] ?? ''));
        if ($nickname === '') {
            $nickname = trim((string) ($v['name'] ?? '')) ?: $secretCode;
        }

        $customer = Customer::create([
            ...$v,
            'nickname' => $nickname,
            'secret_code' => $secretCode,
            'user_id' => $request->user()->id,
            'status' => $v['status'] ?? 'active',
            'projects' => [], // Initialize empty projects array
            'is_active' => 1,
        ]);

        return response()->json(['message' => 'Customer added.', 'data' => $customer->load('user:id,name,email,company_name')], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $customer = $this->findMeetingScopedCustomer($request, $id)->load('user:id,name,email,company_name');
        $customer->projects = $customer->projects ?? [];

        if ($this->isCalendarProjectScopedRole($actor)) {
            $allowedProjects = $this->allowedProjectMap($actor);
            $customer->projects = $this->filterProjectsByAllowedMap($customer->projects ?? [], $allowedProjects);

            if (empty($customer->projects)) {
                abort(404);
            }
        }

        return response()->json(['data' => $customer]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $customer = $this->findOwned($request, $id);

        $v = $request->validate([
            'nickname'     => ['sometimes', 'string', 'max:100'],
            'name'         => ['nullable', 'string', 'max:255'],
            'phone'        => ['nullable', 'string', 'max:30'],
            'address'      => ['nullable', 'string'],
            'notes'        => ['nullable', 'string'],
            'status'       => ['nullable', 'in:active,inactive,Booked'],
        ]);

        if (array_key_exists('phone', $v)) {
            $v['phone'] = $this->normalizePhoneInput($v['phone'] ?? null);
        }

        if (array_key_exists('nickname', $v) && trim((string) $v['nickname']) === '') {
            $v['nickname'] = trim((string) ($v['name'] ?? $customer->name ?? '')) ?: $customer->nickname;
        }

        $customer->update($v);
        return response()->json(['message' => 'Customer updated.', 'data' => $customer->fresh('user:id,name,email,company_name')]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $customer = $this->findOwned($request, $id);
        $customer->update(['is_active' => 0]);
        return response()->json(['message' => 'Customer soft deleted.']);
    }

    // New endpoint to schedule meeting for a project
    public function scheduleMeeting(Request $request, int $id): JsonResponse
    {
        $customer = $this->findMeetingScopedCustomer($request, $id);

        $v = $request->validate([
            'meeting_date' => ['required', 'date', 'after_or_equal:today'],
            'meeting_time' => ['required', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'project_name' => ['required', 'string', 'max:255'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'session_link_id' => ['nullable', 'integer', 'exists:customer_session_links,id'],
        ]);

        $actor = $request->user();
        $sessionLink = null;
        if ($this->isCalendarProjectScopedRole($actor)) {
            $projectName = trim((string) ($v['project_name'] ?? ''));
            $allowedProjects = $this->allowedProjectMap($actor);

            if ($projectName === '' || !isset($allowedProjects[$this->normalizeProjectName($projectName)])) {
                abort(422, 'You can schedule meetings only for your assigned projects.');
            }
        }

        if (!empty($v['session_link_id'])) {
            $sessionLink = CustomerSessionLink::query()->findOrFail($v['session_link_id']);

            if ((int) $sessionLink->customer_id !== (int) $customer->id) {
                abort(422, 'The selected session link does not belong to this customer.');
            }

            $sessionProjectName = $this->normalizeProjectName((string) ($sessionLink->project_name ?? ''));
            $meetingProjectName = $this->normalizeProjectName((string) ($v['project_name'] ?? ''));

            if ($sessionProjectName !== '' && $sessionProjectName !== $meetingProjectName) {
                abort(422, 'The selected session link belongs to a different project.');
            }
        }

        $assignee = null;
        if (! empty($v['assigned_to_user_id'])) {
            $assignee = \App\Models\User::query()
                ->where('id', $v['assigned_to_user_id'])
                ->where('is_active', true)
                ->when(! $actor->isAdmin(), fn($q) => $q->where('company_id', $actor->company_id))
                ->firstOrFail();
        }

        // Validate 30-min slot
        $this->assertValidSlot($v['meeting_time']);

        // Check for conflicts with other projects of same customer
        $this->assertNoConflictForProjects($customer, $v['meeting_date'], $v['meeting_time']);

        // Add/Update project meeting
        $customer->addProjectMeeting([
            'project_name' => $v['project_name'],
            'meeting_date' => $v['meeting_date'],
            'meeting_time' => $v['meeting_time'],
            'scheduled_at' => now()->toDateTimeString(),
            'created_by_id' => $actor->id,
            'created_by_name' => $actor->name,
            'assigned_to_user_id' => $assignee?->id,
            'assigned_to_user_name' => $assignee?->name,
        ]);

        // For backward compatibility, also update single meeting fields
        $customer->update([
            'meeting_date' => $v['meeting_date'],
            'meeting_time' => $v['meeting_time'],
            'project_name' => $v['project_name'],
        ]);

        $projectSummary = $this->projectSessionSummaryForCustomer(
            $customer->id,
            (string) $v['project_name'],
        );
        if ($customer->syncProjectSessionSummary((string) $v['project_name'], $projectSummary)) {
            $customer->save();
        }

        return response()->json([
            'message' => 'Meeting scheduled successfully!',
            'data' => $customer->fresh('user:id,name,email,company_name')
        ]);
    }

    // New endpoint to get all project meetings for a customer
    public function getProjectMeetings(Request $request, int $id): JsonResponse
    {
        $customer = $this->findMeetingScopedCustomer($request, $id);
        return response()->json([
            'data' => [
                'customer' => $customer->nickname,
                'projects' => $customer->projects ?? [],
                'upcoming' => $customer->getUpcomingMeetings(),
                'completed' => $customer->getCompletedMeetings(),
            ]
        ]);
    }

    // New endpoint to update a specific project meeting
    public function updateProjectMeeting(Request $request, int $id, string $projectName): JsonResponse
    {
        $customer = $this->findMeetingScopedCustomer($request, $id);

        $v = $request->validate([
            'meeting_date' => ['required', 'date', 'after_or_equal:today'],
            'meeting_time' => ['required', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $actor = $request->user();
        $assignee = null;
        if (! empty($v['assigned_to_user_id'])) {
            $assignee = \App\Models\User::query()
                ->where('id', $v['assigned_to_user_id'])
                ->where('is_active', true)
                ->when(! $actor->isAdmin(), fn($q) => $q->where('company_id', $actor->company_id))
                ->firstOrFail();
        }

        $this->assertValidSlot($v['meeting_time']);
        $this->assertNoConflictForProjects($customer, $v['meeting_date'], $v['meeting_time'], $projectName);

        $customer->updateProjectMeeting($projectName, [
            'meeting_date' => $v['meeting_date'],
            'meeting_time' => $v['meeting_time'],
            'updated_at' => now()->toDateTimeString(),
            'updated_by_id' => $actor->id,
            'updated_by_name' => $actor->name,
            'assigned_to_user_id' => $assignee?->id,
            'assigned_to_user_name' => $assignee?->name,
        ]);

        $projectSummary = $this->projectSessionSummaryForCustomer($customer->id, $projectName);
        if ($customer->syncProjectSessionSummary($projectName, $projectSummary)) {
            $customer->save();
        }

        return response()->json([
            'message' => 'Project meeting updated successfully!',
            'data' => $customer->fresh()
        ]);
    }

    // New endpoint to delete a project meeting
    public function deleteProjectMeeting(Request $request, int $id, string $projectName): JsonResponse
    {
        $customer = $this->findMeetingScopedCustomer($request, $id);
        $customer->removeProjectMeeting($projectName);

        return response()->json([
            'message' => 'Project meeting removed successfully!',
            'data' => $customer->fresh()
        ]);
    }

    // ── Helpers ───────────────────────────────────────────

    private function findOwned(Request $request, int $id): Customer
    {
        $user = $request->user();
        $q = Customer::query()->where('is_active', 1);
        $this->applyCustomerScope($q, $user);
        return $q->findOrFail($id);
    }

    private function findMeetingScopedCustomer(Request $request, int $id): Customer
    {
        $user = $request->user();
        $q = Customer::query()->where('is_active', 1);
        $this->applyCustomerCalendarScope($q, $user);
        return $q->findOrFail($id);
    }

    private function applyCustomerScope($query, $user): void
    {
        if ($user->isAdmin()) {
            return;
        }

        // Role matrix:
        // - Admin: all customers
        // - User (company owner): own + company users' customers
        // - Company User: only own customers
        if ($user->company_id && $user->is_company_owner) {
            $query->whereHas('user', fn($u) => $u->where('company_id', $user->company_id));
            return;
        }

        // Non-owner users (including company users) see only their own customers.
        $query->where('user_id', $user->id);
    }

    private function applyCustomerCalendarScope($query, $user): void
    {
        if ($user->isAdmin()) {
            return;
        }

        if ($this->isCalendarProjectScopedRole($user)) {
            // For scoped roles, calendar visibility is driven by assigned_projects
            // filtering in calendarIndex(), not by customer creator ownership.
            return;
        }

        $this->applyCustomerScope($query, $user);
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

    private function filterProjectsByAllowedMap(array $projects, array $allowedMap): array
    {
        if (empty($allowedMap)) {
            return [];
        }

        return array_values(array_filter($projects, function ($project) use ($allowedMap) {
            $name = $this->normalizeProjectName((string) ($project['project_name'] ?? ''));
            return $name !== '' && isset($allowedMap[$name]);
        }));
    }

    private function normalizeProjectName(string $value): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/', ' ', $value)));
    }

    private function buildProjectSessionSummaryMap(array $customerIds): array
    {
        if (empty($customerIds) || !Schema::hasTable('customer_session_links')) {
            return [];
        }

        $rows = CustomerSessionLink::query()
            ->select(
                'id',
                'customer_id',
                'project_name',
                'created_at',
                'provider_status',
                'started_at',
                'ended_at',
                'joinees',
                'event_count',
                'raw_response',
            )
            ->whereIn('customer_id', $customerIds)
            ->orderByDesc('created_at')
            ->get();

        $summaryMap = [];

        foreach ($rows as $row) {
            $customerId = (int) $row->customer_id;
            $projectName = $this->normalizeProjectName((string) ($row->project_name ?? ''));

            if ($projectName === '') {
                continue;
            }

            if (!isset($summaryMap[$customerId][$projectName])) {
                $summaryMap[$customerId][$projectName] = [
                    'has_session_link' => true,
                    'session_link_count' => 0,
                    'latest_session_link_id' => $row->id,
                    'latest_session_created_at' => $row->created_at?->toDateTimeString(),
                    'latest_session_status' => $row->status,
                    'latest_session_started_at' => $row->started_at,
                    'latest_session_ended_at' => $row->ended_at,
                    'latest_session_joinees' => $row->joinees,
                    'latest_session_event_count' => $row->event_count,
                ];
            }

            $summaryMap[$customerId][$projectName]['session_link_count']++;
        }

        return $summaryMap;
    }

    private function mergeProjectSessionSummaryData(array $projects, array $projectSummaries): array
    {
        return array_values(array_map(function ($project) use ($projectSummaries) {
            $row = (array) $project;
            $projectName = $this->normalizeProjectName((string) ($row['project_name'] ?? ''));
            $summary = $projectName !== '' ? ($projectSummaries[$projectName] ?? null) : null;

            $row['has_session_link'] = (bool) ($summary['has_session_link'] ?? false);
            $row['session_link_count'] = (int) ($summary['session_link_count'] ?? 0);
            $row['latest_session_link_id'] = $summary['latest_session_link_id'] ?? null;
            $row['latest_session_created_at'] = $summary['latest_session_created_at'] ?? null;
            $row['latest_session_status'] = $summary['latest_session_status'] ?? null;
            $row['latest_session_started_at'] = $summary['latest_session_started_at'] ?? null;
            $row['latest_session_ended_at'] = $summary['latest_session_ended_at'] ?? null;
            $row['latest_session_joinees'] = (int) ($summary['latest_session_joinees'] ?? 0);
            $row['latest_session_event_count'] = (int) ($summary['latest_session_event_count'] ?? 0);

            return $row;
        }, $projects));
    }

    private function projectSessionSummaryForCustomer(int $customerId, string $projectName): array
    {
        $normalizedProjectName = $this->normalizeProjectName($projectName);
        if ($normalizedProjectName === '') {
            return $this->emptyProjectSessionSummary();
        }

        $summaryMap = $this->buildProjectSessionSummaryMap([$customerId]);

        return $summaryMap[$customerId][$normalizedProjectName] ?? $this->emptyProjectSessionSummary();
    }

    private function emptyProjectSessionSummary(): array
    {
        return [
            'has_session_link' => false,
            'session_link_count' => 0,
            'latest_session_link_id' => null,
            'latest_session_created_at' => null,
            'latest_session_status' => null,
            'latest_session_started_at' => null,
            'latest_session_ended_at' => null,
            'latest_session_joinees' => 0,
            'latest_session_event_count' => 0,
        ];
    }

    private function assertValidSlot(string $time): void
    {
        $mins = (int) explode(':', $time)[1];
        if (! in_array($mins, [0, 30], true)) {
            abort(422, 'Meeting time must be on a 30-minute slot (e.g. 10:00 or 10:30).');
        }
    }

    private function assertNoConflictForProjects(Customer $customer, string $date, string $time, ?string $excludeProject = null): void
    {
        $newMins = $this->toMins($time);
        $projects = $customer->projects ?? [];

        foreach ($projects as $project) {
            if ($excludeProject && ($project['project_name'] ?? null) === $excludeProject) continue;
            if (!isset($project['meeting_date']) || !isset($project['meeting_time'])) continue;
            if ($project['meeting_date'] !== $date) continue;

            if (abs($this->toMins($project['meeting_time']) - $newMins) < 30) {

                $projectName = $project['project_name'] ?? 'Unknown project';
                $meetingTime = $this->fmt12($project['meeting_time']);

                abort(
                    422,
                    " This Customer \"{$customer->nickname} ({$customer->secret_code})\" already has another matchmaking session booked for the project \"{$projectName}\" at {$meetingTime}. Please choose another time."
                );
            }
        }
    }

    private function toMins(string $t): int
    {
        [$h, $m] = array_map('intval', explode(':', $t));
        return $h * 60 + $m;
    }

    private function fmt12(string $t): string
    {
        [$h, $m] = array_map('intval', explode(':', $t));
        return sprintf('%d:%02d %s', $h % 12 ?: 12, $m, $h >= 12 ? 'PM' : 'AM');
    }

    private function normalizePhoneInput(?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);
        if ($digits === '') {
            return null;
        }

        if (strlen($digits) > 10) {
            $digits = substr($digits, -10);
        }

        if (! preg_match('/^\d{10}$/', $digits)) {
            abort(422, 'Phone must be a valid 10-digit number.');
        }

        return $digits;
    }

    private function generateUniqueCustomerCode(): string
    {
        do {
            $code = 'CP-' . strtoupper(Str::random(6));
        } while (Customer::where('secret_code', $code)->exists());

        return $code;
    }
}
