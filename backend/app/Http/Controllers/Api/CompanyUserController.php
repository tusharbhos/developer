<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class CompanyUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeViewer($actor);

        $baseQuery = User::query()
            ->where('role', 'user')
            ->orderByDesc('id');

        if (! $actor->isAdmin()) {
            $baseQuery->where('company_id', $actor->company_id);
        }

        $baseQuery->whereKeyNot($actor->id);

        if ($search = trim((string) $request->get('search'))) {
            $baseQuery->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%");
            });
        }

        $activeQuery = (clone $baseQuery)->withoutTrashed();

        if ($request->filled('is_active')) {
            $activeQuery->where('is_active', (bool) $request->boolean('is_active'));
        }

        $list = $activeQuery->get();
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
        $actor = $request->user();
        $this->authorizeManager($actor);

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
            'password' => ['required', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $user = User::create([
            'company_id' => $actor->company_id,
            'name' => $v['name'],
            'email' => $v['email'],
            'password' => Hash::make($v['password']),
            'company_name' => $actor->company_name,
            'rera_no' => $actor->rera_no,
            'phone' => $v['phone'] ?? null,
            'address' => $v['address'] ?? null,
            'role' => 'user',
            'is_company_owner' => false,
            'is_active' => $v['is_active'] ?? true,
            'email_verified_at' => now(),
        ]);

        return response()->json([
            'message' => 'Company user created successfully.',
            'data' => $this->formatUser($user),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeManager($actor);

        $user = $this->findCompanyUser($actor, $id);

        return response()->json(['data' => $this->formatUser($user)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeManager($actor);

        $user = $this->findCompanyUser($actor, $id);

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
            'is_active' => ['sometimes', 'boolean'],
            'password' => ['sometimes', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        if (isset($v['password'])) {
            $v['password'] = Hash::make($v['password']);
        }

        $user->update($v);

        return response()->json([
            'message' => 'Company user updated successfully.',
            'data' => $this->formatUser($user->fresh()),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeManager($actor);

        $user = $this->findCompanyUser($actor, $id);

        if ($actor->id === $user->id) {
            abort(422, 'You cannot delete your own account from this screen.');
        }

        $user->deleted_by = $actor->id;
        $user->is_restore_hidden = false;
        $user->save();
        $user->delete();

        return response()->json(['message' => 'Company user deleted successfully.']);
    }

    public function forceDelete(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeManager($actor);

        $user = User::query()
            ->where('company_id', $actor->company_id)
            ->where('role', 'user')
            ->where('is_company_owner', false)
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->findOrFail($id);

        if ($actor->id === $user->id) {
            abort(422, 'You cannot permanently delete your own account.');
        }

        $user->is_restore_hidden = true;
        $user->save();

        return response()->json(['message' => 'Company user removed from deleted list.']);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeManager($actor);

        $user = User::query()
            ->where('company_id', $actor->company_id)
            ->where('role', 'user')
            ->where('is_company_owner', false)
            ->onlyTrashed()
            ->where('is_restore_hidden', false)
            ->findOrFail($id);
        /** @var User $user */
        $user->restore();
        $user->is_restore_hidden = false;
        $user->save();
        $user->refresh();

        return response()->json([
            'message' => 'Company user restored successfully.',
            'data' => $this->formatUser($user),
        ]);
    }

    private function authorizeManager(User $actor): void
    {
        if (! $actor->isAdmin() && ! $actor->is_company_owner) {
            abort(403, 'Only company owner/admin can manage company users.');
        }

        if (! $actor->isAdmin() && ! $actor->company_id) {
            abort(422, 'Your account is not linked with a company.');
        }
    }

    private function authorizeViewer(User $actor): void
    {
        if (! $actor->isAdmin() && ! $actor->is_company_owner) {
            abort(403, 'Only company owner/admin can view company users.');
        }

        if (! $actor->isAdmin() && ! $actor->company_id) {
            abort(422, 'Your account is not linked with a company.');
        }
    }

    private function findCompanyUser(User $actor, int $id, bool $onlyTrashed = false): User
    {
        $query = User::query()
            ->where('company_id', $actor->company_id)
            ->where('role', 'user')
            ->where('is_company_owner', false);

        if ($onlyTrashed) {
            $query->onlyTrashed();
        }

        return $query->findOrFail($id);
    }

    private function formatUser(User $user): array
    {
        return [
            'id' => $user->id,
            'company_id' => $user->company_id,
            'company_name' => $user->company_name,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'address' => $user->address,
            'is_company_owner' => (bool) $user->is_company_owner,
            'role' => $user->role,
            'is_active' => (bool) $user->is_active,
            'created_at' => $user->created_at?->toDateTimeString(),
            'deleted_at' => $user->deleted_at?->toDateTimeString(),
            'deleted_by' => $user->deleted_by,
            'deleted_by_name' => $user->trashed() ? ($user->load('deletedBy')->deletedBy?->name ?? null) : null,
            'is_restore_hidden' => (bool) $user->is_restore_hidden,
        ];
    }
}
