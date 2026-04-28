<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class SalesUserController extends Controller
{
    private function formatUser(User $u): array
    {
        return [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'phone' => $u->phone,
            'address' => $u->address,
            'developer_name' => $u->developer_name,
            'assigned_projects' => $u->assigned_projects ?? [],
            'role' => $u->role,
            'is_active' => $u->is_active,
            'parent_user_id' => $u->parent_user_id,
            'created_at' => $u->created_at,
            'deleted_at' => $u->deleted_at,
            'deleted_by' => $u->deleted_by,
            'deleted_by_name' => $u->trashed() ? ($u->load('deletedBy')->deletedBy?->name ?? null) : null,
            'is_restore_hidden' => (bool) $u->is_restore_hidden,
        ];
    }

    // sourcing_admin and admin can call these
    private function authorise(Request $request): User
    {
        $actor = $request->user();
        if (!in_array($actor->role, ['sourcing_admin', 'admin', 'developer_super_admin'], true)) {
            abort(403, 'Only sourcing admin, admin, or developer super admin can manage sales users.');
        }

        return $actor;
    }

    private function salesScope(User $actor, bool $withTrashed = false)
    {
        $query = User::query()->where('role', 'sales_user');

        if ($withTrashed) {
            $query->withTrashed();
        }

        if ($actor->role === 'sourcing_admin') {
            $query->where('parent_user_id', $actor->id);
        } elseif ($actor->role === 'developer_super_admin') {
            // see all sales users under sourcing_admins that belong to this developer
            $sourcingAdminIds = User::where('role', 'sourcing_admin')
                ->where('parent_user_id', $actor->id)
                ->pluck('id');
            $query->whereIn('parent_user_id', $sourcingAdminIds);
        }

        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        $actor = $this->authorise($request);

        $baseQuery = $this->salesScope($actor, true)->orderByDesc('id');

        $baseQuery->whereKeyNot($actor->id);

        if ($search = trim((string) $request->get('search'))) {
            $baseQuery->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $list = (clone $baseQuery)->withoutTrashed()->get();
        $deleted = (clone $baseQuery)
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->get();

        return response()->json([
            'data' => $list->map(fn(User $u) => $this->formatUser($u)),
            'total' => $list->count(),
            'deleted_data' => $deleted->map(fn(User $u) => $this->formatUser($u)),
            'deleted_total' => $deleted->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $this->authorise($request);

        $v = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
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
            'phone' => ['nullable', 'string', 'regex:/^\d{10}$/'],
            'address' => ['nullable', 'string'],
            'assigned_projects' => ['nullable', 'array'],
            'assigned_projects.*' => ['string'],
            'password' => ['required', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        $developerName = $actor->role === 'sourcing_admin' ? $actor->developer_name : null;
        $parentUserId = $actor->role === 'sourcing_admin' ? $actor->id : null;

        $user = User::create([
            'name' => $v['name'],
            'email' => $v['email'],
            'password' => Hash::make($v['password']),
            'phone' => $v['phone'] ?? null,
            'address' => $v['address'] ?? null,
            'assigned_projects' => $v['assigned_projects'] ?? [],
            'developer_name' => $developerName,
            'parent_user_id' => $parentUserId,
            'role' => 'sales_user',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);

        return response()->json([
            'message' => 'Sales user created successfully.',
            'data' => $this->formatUser($user),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $actor = $this->authorise($request);
        $user = $this->salesScope($actor)->findOrFail($id);

        return response()->json(['data' => $this->formatUser($user)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $actor = $this->authorise($request);
        $user = $this->salesScope($actor)->findOrFail($id);

        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => [
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
            'phone' => ['nullable', 'string', 'regex:/^\d{10}$/'],
            'address' => ['nullable', 'string'],
            'assigned_projects' => ['nullable', 'array'],
            'assigned_projects.*' => ['string'],
            'is_active' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        $updateData = array_filter([
            'name' => $v['name'] ?? null,
            'email' => $v['email'] ?? null,
            'phone' => $v['phone'] ?? null,
            'address' => $v['address'] ?? null,
            'is_active' => $v['is_active'] ?? null,
        ], fn($val) => $val !== null);

        if (array_key_exists('assigned_projects', $v)) {
            $updateData['assigned_projects'] = $v['assigned_projects'] ?? [];
        }

        if (!empty($v['password'])) {
            $updateData['password'] = Hash::make($v['password']);
        }

        $user->update($updateData);

        return response()->json([
            'message' => 'Sales user updated successfully.',
            'data' => $this->formatUser($user->fresh()),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $actor = $this->authorise($request);
        $user = $this->salesScope($actor)->findOrFail($id);

        if ($actor->id === $user->id) {
            abort(422, 'You cannot delete your own account from this screen.');
        }

        $user->deleted_by = $actor->id;
        $user->is_restore_hidden = false;
        $user->save();
        $user->delete();

        return response()->json(['message' => 'Sales user deleted successfully.']);
    }

    public function forceDelete(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        abort_unless(
            $actor->role === 'sourcing_admin' || $actor->role === 'developer_super_admin' || $actor->role === 'admin',
            403,
            'Only sourcing admin, developer super admin or admin can permanently delete sales users.',
        );

        $user = $this->salesScope($actor, true)
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->findOrFail($id);
        $user->is_restore_hidden = true;
        $user->save();

        return response()->json(['message' => 'Sales user removed from deleted list.']);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $actor = $this->authorise($request);
        $user = $this->salesScope($actor, true)
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->findOrFail($id);

        if (! $user instanceof User) {
            abort(404, 'Sales user not found.');
        }

        $user->restore();
        $user->is_restore_hidden = false;
        $user->save();
        $user->refresh();

        return response()->json([
            'message' => 'Sales user restored successfully.',
            'data' => $this->formatUser($user),
        ]);
    }
}
