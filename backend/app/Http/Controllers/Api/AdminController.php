<?php
// app/Http/Controllers/Api/AdminController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AdminController extends Controller
{
    // ══════════════════════════════════════════════════════
    //  USER MANAGEMENT
    // ══════════════════════════════════════════════════════

    // GET /api/admin/users
    public function listUsers(Request $request): JsonResponse
    {
        $query = User::where('role', 'user');

        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name',  'like', "%$search%")
                  ->orWhere('email', 'like', "%$search%")
                  ->orWhere('company_name', 'like', "%$search%");
            });
        }

        if ($request->get('verified') !== null) {
            $verified = filter_var($request->get('verified'), FILTER_VALIDATE_BOOLEAN);
            $query->when($verified, fn($q) => $q->whereNotNull('email_verified_at'))
                  ->when(! $verified, fn($q) => $q->whereNull('email_verified_at'));
        }

        $users = $query->orderBy('created_at', 'desc')->get()->map(fn($u) => [
            'id'             => $u->id,
            'name'           => $u->name,
            'email'          => $u->email,
            'company_name'   => $u->company_name,
            'rera_no'        => $u->rera_no,
            'phone'          => $u->phone,
            'address'        => $u->address,
            'is_active'      => $u->is_active,
            'email_verified' => $u->hasVerifiedEmail(),
            'created_at'     => $u->created_at?->toDateTimeString(),
        ]);

        return response()->json(['data' => $users, 'total' => $users->count()]);
    }

    // PUT /api/admin/users/{id}  – toggle active / update details
    public function updateUser(Request $request, int $id): JsonResponse
    {
        $user = User::where('role', 'user')->findOrFail($id);

        $validated = $request->validate([
            'name'         => ['sometimes', 'string', 'max:255'],
            'company_name' => ['sometimes', 'string', 'max:255'],
            'rera_no'      => ['sometimes', 'string', 'max:100'],
            'phone'        => ['sometimes', 'string', 'regex:/^\d{10}$/'],
            'address'      => ['sometimes', 'string'],
            'is_active'    => ['sometimes', 'boolean'],
        ]);

        $user->update($validated);

        return response()->json(['message' => 'User updated.', 'user' => $user]);
    }

    // DELETE /api/admin/users/{id}
    public function deleteUser(int $id): JsonResponse
    {
        $user = User::where('role', 'user')->findOrFail($id);
        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'User deleted.']);
    }

    // ── Customer Stats ───────────────────────────────────
    // GET /api/admin/stats
    public function stats(): JsonResponse
    {
        return response()->json([
            'total_users'          => User::where('role', 'user')->count(),
            'verified_users'       => User::where('role', 'user')->whereNotNull('email_verified_at')->count(),
            'unverified_users'     => User::where('role', 'user')->whereNull('email_verified_at')->count(),
            'active_users'         => User::where('role', 'user')->where('is_active', true)->count(),
        ]);
    }
}