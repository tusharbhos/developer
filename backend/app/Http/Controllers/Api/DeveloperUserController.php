<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DeveloperUserController extends Controller
{
    // Generate a unique 6-character alphanumeric key
    private function generateUniqueKey(): string
    {
        do {
            $key = strtoupper(Str::random(6));
        } while (User::where('unique_key', $key)->exists());

        return $key;
    }

    private function formatUser(User $u): array
    {
        return [
            'id'                => $u->id,
            'name'              => $u->name,
            'email'             => $u->email,
            'phone'             => $u->phone,
            'address'           => $u->address,
            'developer_name'    => $u->developer_name,
            'assigned_projects' => $u->assigned_projects ?? [],
            'rera_no'           => $u->rera_no,
            'gst_no'            => $u->gst_no,
            'unique_key'        => $u->unique_key,
            'role'              => $u->role,
            'is_active'         => $u->is_active,
            'created_at'        => $u->created_at,
            'deleted_at'        => $u->deleted_at,
            'deleted_by'        => $u->deleted_by,
            'deleted_by_name'   => $u->trashed() ? ($u->load('deletedBy')->deletedBy?->name ?? null) : null,
            'is_restore_hidden' => (bool) $u->is_restore_hidden,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        if (! $actor->isAdmin()) {
            abort(403, 'Only admin can manage developer users.');
        }

        $baseQuery = User::query()
            ->where('role', 'developer_super_admin')
            ->orderByDesc('id');

        $baseQuery->whereKeyNot($actor->id);

        if ($search = trim((string) $request->get('search'))) {
            $baseQuery->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('developer_name', 'like', "%{$search}%")
                    ->orWhere('unique_key', 'like', "%{$search}%");
            });
        }

        $list = (clone $baseQuery)->withoutTrashed()->get();
        $deleted = (clone $baseQuery)
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->get();

        return response()->json([
            'data'  => $list->map(fn(User $u) => $this->formatUser($u)),
            'total' => $list->count(),
            'deleted_data' => $deleted->map(fn(User $u) => $this->formatUser($u)),
            'deleted_total' => $deleted->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        if (! $actor->isAdmin()) {
            abort(403, 'Only admin can create developer users.');
        }

        $v = $request->validate([
            'name'          => ['required', 'string', 'max:255'],           // manager name
            'email'         => [
                'required',
                'email',
                Rule::unique('users', 'email')->where(function ($query) {
                    $query->whereNull('deleted_at')
                        ->orWhere(function ($deletedQuery) {
                            $deletedQuery->whereNotNull('deleted_at')
                                ->where('is_restore_hidden', false);
                        });
                }),
            ],
            'phone'         => ['nullable', 'string', 'regex:/^\d{10}$/'],
            'developer_name' => ['required', 'string', 'max:255'],
            'rera_no'       => ['nullable', 'string', 'max:100'],
            'gst_no'        => ['nullable', 'string', 'max:50'],
            'address'       => ['nullable', 'string'],
            'password'      => ['required', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        $assignedProjects = $this->fetchAssignedProjectsByDeveloperName((string) $v['developer_name']);

        $user = User::create([
            'name'           => $v['name'],
            'email'          => $v['email'],
            'password'       => Hash::make($v['password']),
            'phone'          => $v['phone'] ?? null,
            'developer_name' => $v['developer_name'],
            'assigned_projects' => $assignedProjects,
            'rera_no'        => $v['rera_no'] ?? null,
            'gst_no'         => $v['gst_no'] ?? null,
            'address'        => $v['address'] ?? null,
            'role'           => 'developer_super_admin',
            'unique_key'     => $this->generateUniqueKey(),
            'is_company_owner' => false,
            'is_active'      => true,
            'email_verified_at' => now(),
        ]);

        return response()->json([
            'message' => 'Developer user created successfully.',
            'data'    => $this->formatUser($user),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        if (! $actor->isAdmin()) {
            abort(403, 'Only admin can view developer users.');
        }

        $user = User::where('role', 'developer_super_admin')->findOrFail($id);

        return response()->json(['data' => $this->formatUser($user)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        if (! $actor->isAdmin()) {
            abort(403, 'Only admin can update developer users.');
        }

        $user = User::where('role', 'developer_super_admin')->findOrFail($id);

        $v = $request->validate([
            'name'          => ['sometimes', 'string', 'max:255'],
            'email'         => [
                'sometimes',
                'email',
                Rule::unique('users', 'email')
                    ->ignore($user->id)
                    ->where(function ($query) {
                        $query->whereNull('deleted_at')
                            ->orWhere(function ($deletedQuery) {
                                $deletedQuery->whereNotNull('deleted_at')
                                    ->where('is_restore_hidden', false);
                            });
                    }),
            ],
            'phone'         => ['nullable', 'string', 'regex:/^\d{10}$/'],
            'developer_name' => ['sometimes', 'string', 'max:255'],
            'rera_no'       => ['nullable', 'string', 'max:100'],
            'gst_no'        => ['nullable', 'string', 'max:50'],
            'address'       => ['nullable', 'string'],
            'is_active'     => ['sometimes', 'boolean'],
            'password'      => ['sometimes', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        if (isset($v['password'])) {
            $v['password'] = Hash::make($v['password']);
        }

        if (array_key_exists('developer_name', $v)) {
            $v['assigned_projects'] = $this->fetchAssignedProjectsByDeveloperName((string) $v['developer_name']);
        }

        $user->update($v);

        return response()->json([
            'message' => 'Developer user updated successfully.',
            'data'    => $this->formatUser($user->fresh()),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        if (! $actor->isAdmin()) {
            abort(403, 'Only admin can delete developer users.');
        }

        $user = User::where('role', 'developer_super_admin')->findOrFail($id);

        if ($actor->id === $user->id) {
            abort(422, 'You cannot delete your own account from this screen.');
        }

        $user->deleted_by = $actor->id;
        $user->is_restore_hidden = false;
        $user->save();
        $user->delete();

        return response()->json(['message' => 'Developer user deleted successfully.']);
    }

    public function forceDelete(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->isAdmin(), 403, 'Only admin can permanently delete developer users.');

        $user = User::where('role', 'developer_super_admin')
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->findOrFail($id);

        $user->is_restore_hidden = true;
        $user->save();

        return response()->json(['message' => 'Developer user removed from deleted list.']);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        if (! $actor->isAdmin()) {
            abort(403, 'Only admin can restore developer users.');
        }

        $user = User::onlyTrashed()
            ->where('role', 'developer_super_admin')
            ->where('is_restore_hidden', false)
            ->findOrFail($id);

        $user->restore();
        $user->is_restore_hidden = false;
        $user->save();

        return response()->json([
            'message' => 'Developer user restored successfully.',
            'data' => $this->formatUser($user->fresh()),
        ]);
    }

    private function fetchAssignedProjectsByDeveloperName(string $developerName): array
    {
        $developerKey = $this->normalizeText($developerName);
        if ($developerKey === '') {
            return [];
        }

        $apiBase = rtrim((string) config('services.conectr.base_url'), '/');
        $apiToken = trim((string) config('services.conectr.api_token'));
        $url = $apiBase . '/presentations/search';

        if ($apiToken === '') {
            return [];
        }

        $projectTitles = [];
        $seen = [];

        while ($url) {
            $response = Http::timeout(20)
                ->acceptJson()
                ->withToken($apiToken)
                ->get($url);
            if (! $response->successful()) {
                break;
            }

            $payload = $response->json();
            $rows = is_array($payload['data'] ?? null) ? $payload['data'] : [];

            foreach ($rows as $row) {
                if (! is_array($row)) {
                    continue;
                }

                $rowDeveloper = $this->normalizeText((string) ($row['developer'] ?? ''));
                if ($rowDeveloper !== $developerKey) {
                    continue;
                }

                $title = $this->cleanProjectTitle((string) ($row['title'] ?? ''));
                if ($title === '') {
                    continue;
                }

                $key = $this->normalizeText($title);
                if (isset($seen[$key])) {
                    continue;
                }

                $seen[$key] = true;
                $projectTitles[] = $title;
            }

            $next = $payload['next_page_url'] ?? null;
            $url = is_string($next) && trim($next) !== '' ? $next : null;
        }

        return $projectTitles;
    }

    private function cleanProjectTitle(string $value): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $value));
    }

    private function normalizeText(string $value): string
    {
        return mb_strtolower($this->cleanProjectTitle($value));
    }
}
