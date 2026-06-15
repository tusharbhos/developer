<?php
// app/Http/Controllers/Api/AuthController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Filesystem\FilesystemAdapter;
use Throwable;

class AuthController extends Controller
{
    // ── REGISTER ─────────────────────────────────────────
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:255'],
            'company_name' => ['required', 'string', 'max:255'],
            'company_size' => ['required', 'in:individual,1-2,5-10,10-20,20-50,50-100,100+'],
            'rera_no'      => ['required', 'string', 'max:100'],
            'phone'        => ['required', 'string', 'regex:/^\d{10}$/'],
            'city'         => ['required', 'string', 'max:100'],
            'email'        => ['required', 'email', 'unique:users,email'],
            'address'      => ['required', 'string'],
            'password'     => ['required', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        $company = Company::firstOrCreate(
            [
                'name' => $validated['company_name'],
                'rera_no' => $validated['rera_no'],
            ],
            [
                'is_active' => true,
            ]
        );

        $companyHasUsers = User::where('company_id', $company->id)->exists();

        $user = User::create([
            'company_id'   => $company->id,
            'name'         => $validated['name'],
            'email'        => $validated['email'],
            'password'     => Hash::make($validated['password']),
            'company_name' => $validated['company_name'],
            'company_size' => $validated['company_size'],
            'rera_no'      => $validated['rera_no'],
            'phone'        => $validated['phone'],
            'city'         => $validated['city'],
            'address'      => $validated['address'],
            'role'         => 'user',
            'is_company_owner' => ! $companyHasUsers,
        ]);

        // Fire registered event -> sends email verification for main/company-owner account.
        try {
            event(new Registered($user));
        } catch (Throwable $e) {
            Log::error('User registered but verification email failed to send.', [
                'user_id' => $user->id,
                'email' => $user->email,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'message' => 'Registration successful! Please verify your email.',
            'user'    => $this->formatUser($user),
        ], 201);
    }

    // ── LOGIN ─────────────────────────────────────────────
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($request->only('email', 'password'))) {
            return response()->json([
                'message' => 'Invalid email or password.',
            ], 401);
        }

        /** @var User|null $user */
        $user = Auth::user();

        if (! $user instanceof User) {
            Auth::logout();
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        if (! $user->is_active) {
            Auth::logout();
            return response()->json([
                'message' => 'Your account has been disabled. Contact admin.',
            ], 403);
        }

        if ($this->requiresEmailVerification($user) && ! $user->hasVerifiedEmail()) {
            Auth::logout();
            return response()->json([
                'message' => 'Please verify your email before logging in.',
            ], 403);
        }

        // Revoke old tokens (single device login)
        $user->tokens()->delete();

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message'        => 'Login successful.',
            'user'           => $this->formatUser($user),
            'token'          => $token,
            'email_verified' => $user->hasVerifiedEmail(),
        ]);
    }

    // ── FORGOT PASSWORD: SEND CODE ───────────────────────
    public function sendForgotPasswordCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'exists:users,email'],
        ]);

        $email = strtolower(trim($validated['email']));
        $targetUser = User::where('email', $email)->firstOrFail();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $cpCode = 'CP-' . $code;

        DB::table('password_reset_codes')->updateOrInsert(
            ['email' => $email],
            [
                'company_id' => $targetUser->company_id,
                'company_name' => $targetUser->company_name,
                'code_hash' => Hash::make($code),
                'expires_at' => now()->addMinutes(15),
                'attempts' => 0,
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        try {
            Mail::raw(
                "Your conectr.co password reset code is {$cpCode}. This code will expire in 15 minutes.",
                function ($message) use ($email) {
                    $message->to($email)
                        ->subject('conectr.co Password Reset Code');
                }
            );
        } catch (Throwable $e) {
            Log::error('Failed to send password reset code email.', [
                'email' => $email,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Could not send password reset code email. Please try again in a few minutes.',
            ], 500);
        }

        return response()->json([
            'message' => 'Password reset code sent to your email.',
        ]);
    }

    // ── FORGOT PASSWORD: RESET WITH CODE ─────────────────
    public function resetPasswordWithCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'exists:users,email'],
            'code' => ['required', 'string', 'max:20'],
            'password' => ['required', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        $email = strtolower(trim($validated['email']));
        $cleanedCode = preg_replace('/\D/', '', $validated['code'] ?? '');

        if (! $cleanedCode || strlen($cleanedCode) !== 6) {
            return response()->json([
                'message' => 'Invalid code format.',
            ], 422);
        }

        $reset = DB::table('password_reset_codes')->where('email', $email)->first();

        if (! $reset) {
            return response()->json([
                'message' => 'Invalid or expired code.',
            ], 422);
        }

        if (now()->gt($reset->expires_at)) {
            DB::table('password_reset_codes')->where('email', $email)->delete();
            return response()->json([
                'message' => 'Code expired. Please request a new code.',
            ], 422);
        }

        if (! Hash::check($cleanedCode, $reset->code_hash)) {
            DB::table('password_reset_codes')
                ->where('email', $email)
                ->update([
                    'attempts' => (int) $reset->attempts + 1,
                    'updated_at' => now(),
                ]);

            return response()->json([
                'message' => 'Invalid code.',
            ], 422);
        }

        $user = User::where('email', $email)->firstOrFail();
        $user->password = Hash::make($validated['password']);
        $user->save();

        $user->tokens()->delete();
        DB::table('password_reset_codes')->where('email', $email)->delete();

        return response()->json([
            'message' => 'Password reset successful. Please login with your new password.',
        ]);
    }

    // ── LOGOUT ────────────────────────────────────────────
    public function logout(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        /** @var PersonalAccessToken|null $token */
        $token = $user->currentAccessToken();
        $token?->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    // ── GET PROFILE ───────────────────────────────────────
    public function me(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return response()->json([
            'user'           => $this->formatUser($user),
            'email_verified' => $user->hasVerifiedEmail(),
        ]);
    }

    // ── UPDATE PROFILE / ONBOARDING ──────────────────────
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'company_name' => ['sometimes', 'string', 'max:255'],
            'developer_name' => ['sometimes', 'string', 'max:255'],
            'company_size' => ['sometimes', 'nullable', 'in:individual,1-2,5-10,10-20,20-50,50-100,100+'],
            'profile_image' => ['sometimes', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'rera_no' => ['sometimes', 'string', 'max:100'],
            'gst_no' => ['sometimes', 'string', 'max:50'],
            'phone' => ['sometimes', 'string', 'regex:/^\d{10}$/'],
            'city' => ['sometimes', 'string', 'max:100'],
            'state' => ['sometimes', 'nullable', 'string', 'max:100'],
            'pincode' => ['sometimes', 'nullable', 'string', 'regex:/^\d{6}$/'],
            'address' => ['sometimes', 'string'],
            'experience_level' => ['sometimes', 'nullable', 'string', 'max:30'],
            'primary_market' => ['sometimes', 'nullable', 'array'],
            'primary_market.*' => ['string', 'max:100'],
            'micro_markets' => ['sometimes', 'nullable', 'string'],
            'sell_cities' => ['sometimes', 'nullable', 'string'],
            'avg_leads_per_month' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'avg_site_visits_per_month' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'avg_closures_per_month' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'password' => ['sometimes', 'confirmed', 'min:8', 'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/'],
        ]);

        if ($request->hasFile('profile_image')) {
            /** @var FilesystemAdapter $publicDisk */
            $publicDisk = Storage::disk('public');

            if ($user->profile_image) {
                $publicDisk->delete($user->profile_image);
            }

            $validated['profile_image'] = $request->file('profile_image')->store('profile-images', 'public');
        }

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user' => $this->formatUser($user->fresh()),
        ]);
    }

    // ── VERIFY EMAIL ──────────────────────────────────────
    public function verifyEmail(Request $request, $id, $hash): JsonResponse|RedirectResponse
    {
        $user = User::findOrFail($id);

        if (! $request->expectsJson()) {
            $frontendUrl = $this->frontendVerificationUrl($request, $user, (string) $hash);
            if ($frontendUrl !== null) {
                return redirect()->away($frontendUrl);
            }
        }

        if (! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return response()->json(['message' => 'Invalid verification link.'], 400);
        }

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified.']);
        }

        $user->markEmailAsVerified();

        return response()->json(['message' => 'Email verified successfully! You can now access all features.']);
    }

    private function frontendVerificationUrl(Request $request, User $user, string $hash): ?string
    {
        $frontendBase = rtrim((string) env('FRONTEND_URL', ''), '/');
        if ($frontendBase === '') {
            return null;
        }

        $appUrl = rtrim((string) config('app.url'), '/');
        $apiBase = str_ends_with($appUrl, '/api') ? $appUrl : $appUrl . '/api';

        $query = http_build_query([
            'id' => $user->getKey(),
            'hash' => $hash,
            'expires' => $request->query('expires'),
            'signature' => $request->query('signature'),
            'api_base' => $apiBase,
        ]);

        return $frontendBase . '/verify-email?' . $query;
    }

    // ── RESEND VERIFICATION EMAIL ─────────────────────────
    public function resendVerification(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified.'], 400);
        }

        try {
            $user->sendEmailVerificationNotification();
        } catch (Throwable $e) {
            Log::error('Failed to resend verification email.', [
                'user_id' => $user->id,
                'email' => $user->email,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Could not resend verification email. Please try again in a few minutes.',
            ], 500);
        }

        return response()->json(['message' => 'Verification email sent.']);
    }

    // ── Helper ────────────────────────────────────────────
    private function formatUser(User $user): array
    {
        $requiresVerification = $this->requiresEmailVerification($user);
        /** @var FilesystemAdapter $publicDisk */
        $publicDisk = Storage::disk('public');

        return [
            'id'             => $user->id,
            'name'           => $user->name,
            'email'          => $user->email,
            'company_name'   => $user->company_name,
            'developer_name' => $user->developer_name,
            'gst_no'         => $user->gst_no,
            'company_size'   => $user->company_size,
            'profile_image'  => $user->profile_image,
            'profile_image_url' => $user->profile_image ? $publicDisk->url($user->profile_image) : null,
            'rera_no'        => $user->rera_no,
            'company_id'     => $user->company_id,
            'is_company_owner' => (bool) $user->is_company_owner,
            'phone'          => $user->phone,
            'city'           => $user->city,
            'state'          => $user->state,
            'pincode'        => $user->pincode,
            'address'        => $user->address,
            'experience_level' => $user->experience_level,
            'primary_market' => $user->primary_market ?? [],
            'micro_markets' => $user->micro_markets,
            'sell_cities' => $user->sell_cities,
            'avg_leads_per_month' => $user->avg_leads_per_month,
            'avg_site_visits_per_month' => $user->avg_site_visits_per_month,
            'avg_closures_per_month' => $user->avg_closures_per_month,
            'role'           => $user->role,
            'assigned_projects' => $user->assigned_projects ?? [],
            'is_active'      => $user->is_active,
            'email_verified' => $requiresVerification ? $user->hasVerifiedEmail() : true,
            'created_at'     => $user->created_at?->toDateTimeString(),
        ];
    }

    private function requiresEmailVerification(User $user): bool
    {
        // Main registration account (company owner / non-company users) must verify email.
        // Company users created under an owner are allowed to login without verification.
        if ($user->is_company_owner) {
            return true;
        }

        if (! $user->company_id) {
            return true;
        }

        return false;
    }

    private function authenticatedUser(Request $request): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            abort(401, 'Unauthenticated.');
        }

        return $user;
    }
}
