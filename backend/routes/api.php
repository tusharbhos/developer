<?php
// routes/api.php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ActivationRequestController;
use App\Http\Controllers\Api\CompanyUserController;
use App\Http\Controllers\Api\DeveloperUserController;
use App\Http\Controllers\Api\SalesUserController;
use App\Http\Controllers\Api\SourcingManagerController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerProjectLinkController;
use App\Http\Controllers\Api\CustomerSessionLinkController;
use App\Http\Controllers\Api\ProjectRequestController;
use App\Http\Controllers\Api\ProjectPresentationLinkController;
use Illuminate\Support\Facades\Route;

// ── Health check ──────────────────────────────────────────
Route::get('test', fn() => response()->json([
    'message'   => 'API is working!',
    'timestamp' => now(),
]));

// ── Public auth routes ────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login',    [AuthController::class, 'login']);
    Route::post('forgot-password/send-code', [AuthController::class, 'sendForgotPasswordCode']);
    Route::post('forgot-password/reset', [AuthController::class, 'resetPasswordWithCode']);
});

// Email verification link (signed URL, opened in browser)
Route::get('email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])
    ->name('verification.verify')
    ->middleware(['signed', 'throttle:6,1']);

// Public: activation request can be submitted without login
Route::post('activation-requests', [ActivationRequestController::class, 'store']);
Route::get('public/customer-project-links/{token}', [CustomerProjectLinkController::class, 'publicShow']);
Route::post('public/customer-project-links/{token}/like', [CustomerProjectLinkController::class, 'publicLike']);
Route::post('public/customer-project-links/{token}/self-view-session', [CustomerSessionLinkController::class, 'publicSelfViewStore']);

// ── Authenticated routes ──────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::prefix('auth')->group(function () {
        Route::post('logout',       [AuthController::class, 'logout']);
        Route::get('me',            [AuthController::class, 'me']);
        Route::post('profile',      [AuthController::class, 'updateProfile']);
        Route::put('profile',       [AuthController::class, 'updateProfile']);
        Route::post('email/resend', [AuthController::class, 'resendVerification'])
            ->middleware('throttle:3,1');
    });

    // ── Customers (all authenticated users) ──────────────
    Route::prefix('customers')->group(function () {
        Route::get('/',               [CustomerController::class, 'index']);
        Route::get('/calendar',       [CustomerController::class, 'calendarIndex']);
        Route::get('/upcoming',       [CustomerController::class, 'upcoming']);
        Route::post('/generate-code', [CustomerController::class, 'generateCode']);
        Route::post('/',              [CustomerController::class, 'store']);
        Route::get('/{id}',           [CustomerController::class, 'show']);
        Route::put('/{id}',           [CustomerController::class, 'update']);
        Route::delete('/{id}',        [CustomerController::class, 'destroy']);

        // Multiple project meetings endpoints
        Route::post('/{id}/schedule-meeting', [CustomerController::class, 'scheduleMeeting']);
        Route::get('/{id}/project-meetings',  [CustomerController::class, 'getProjectMeetings']);
        Route::put('/{id}/project-meetings/{projectName}', [CustomerController::class, 'updateProjectMeeting']);
        Route::delete('/{id}/project-meetings/{projectName}', [CustomerController::class, 'deleteProjectMeeting']);
    });

    Route::prefix('customer-project-links')->group(function () {
        Route::post('/', [CustomerProjectLinkController::class, 'store']);
        Route::get('/customer/{customerId}', [CustomerProjectLinkController::class, 'byCustomer']);
        Route::delete('/{id}/projects/{projectTitle}', [CustomerProjectLinkController::class, 'removeSelectedProject']);
    });

    Route::prefix('customer-session-links')->group(function () {
        Route::get('/', [CustomerSessionLinkController::class, 'index']);
        Route::post('/', [CustomerSessionLinkController::class, 'store']);
        Route::get('/status-snapshots', [CustomerSessionLinkController::class, 'statusSnapshots']);
        Route::get('/customer/{customerId}', [CustomerSessionLinkController::class, 'byCustomer']);
        Route::get('/customer/{customerId}/analytics', [CustomerSessionLinkController::class, 'customerAnalytics']);
        Route::post('/customer/{customerId}/master-summary', [CustomerSessionLinkController::class, 'customerMasterSummary']);
    });

    // ── Activation Requests (authenticated user approvals) ──────────────
    Route::prefix('activation-requests')->group(function () {
        Route::get('/my-projects', [ActivationRequestController::class, 'myProjects']);
        Route::post('/{id}/approve', [ActivationRequestController::class, 'approve']);
    });

    // ── Company Users (owner/admin) ─────────────────────
    Route::prefix('company-users')->group(function () {
        Route::get('/', [CompanyUserController::class, 'index']);
        Route::post('/', [CompanyUserController::class, 'store']);
        Route::get('/{id}', [CompanyUserController::class, 'show']);
        Route::put('/{id}', [CompanyUserController::class, 'update']);
        Route::delete('/{id}', [CompanyUserController::class, 'destroy']);
        Route::delete('/{id}/force-delete', [CompanyUserController::class, 'forceDelete']);
        Route::post('/{id}/restore', [CompanyUserController::class, 'restore']);
    });

    // ── Developer Users (admin only) ─────────────────────
    Route::middleware('admin')->prefix('developer-users')->group(function () {
        Route::get('/', [DeveloperUserController::class, 'index']);
        Route::post('/', [DeveloperUserController::class, 'store']);
        Route::get('/{id}', [DeveloperUserController::class, 'show']);
        Route::put('/{id}', [DeveloperUserController::class, 'update']);
        Route::delete('/{id}', [DeveloperUserController::class, 'destroy']);
        Route::delete('/{id}/force-delete', [DeveloperUserController::class, 'forceDelete']);
        Route::post('/{id}/restore', [DeveloperUserController::class, 'restore']);
    });

    // ── Sourcing Managers (developer_super_admin only) ────
    Route::prefix('sourcing-managers')->group(function () {
        Route::get('/', [SourcingManagerController::class, 'index'])->name('api/sourcing-managers.index');
        Route::post('/', [SourcingManagerController::class, 'store'])->name('api/sourcing-managers');
        Route::get('/{id}', [SourcingManagerController::class, 'show'])->name('api/sourcing-managers.show');
        Route::put('/{id}', [SourcingManagerController::class, 'update'])->name('api/sourcing-managers.update');
        Route::delete('/{id}', [SourcingManagerController::class, 'destroy'])->name('api/sourcing-managers.destroy');
        Route::delete('/{id}/force-delete', [SourcingManagerController::class, 'forceDelete'])->name('api/sourcing-managers.force-delete');
        Route::post('/{id}/restore', [SourcingManagerController::class, 'restore'])->name('api/sourcing-managers.restore');
    });

    // ── Sales Users (sourcing_admin only) ─────────────────
    Route::prefix('sales-users')->group(function () {
        Route::get('/', [SalesUserController::class, 'index']);
        Route::post('/', [SalesUserController::class, 'store']);
        Route::get('/{id}', [SalesUserController::class, 'show']);
        Route::put('/{id}', [SalesUserController::class, 'update']);
        Route::delete('/{id}', [SalesUserController::class, 'destroy']);
        Route::delete('/{id}/force-delete', [SalesUserController::class, 'forceDelete']);
        Route::post('/{id}/restore', [SalesUserController::class, 'restore']);
    });

    // ── Admin only ────────────────────────────────────────
    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('stats',          [AdminController::class, 'stats']);
        Route::get('users',          [AdminController::class, 'listUsers']);
        Route::put('users/{id}',     [AdminController::class, 'updateUser']);
        Route::delete('users/{id}',  [AdminController::class, 'deleteUser']);
        Route::get('activation-requests',      [ActivationRequestController::class, 'adminList']);
        Route::get('activation-requests/{id}', [ActivationRequestController::class, 'adminShow']);
        Route::put('activation-requests/{id}', [ActivationRequestController::class, 'adminUpdate']);
        Route::delete('activation-requests/{id}', [ActivationRequestController::class, 'adminDelete']);
    });
    // ── Project Requests ──────────────────────────────────────

    Route::prefix('project-requests')->group(function () {
        Route::post('/', [ProjectRequestController::class, 'store']);
        Route::get('/my-requests', [ProjectRequestController::class, 'myRequests']);
        Route::get('/{id}', [ProjectRequestController::class, 'show']);
    });

    // Admin endpoints for project requests
    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('project-requests', [ProjectRequestController::class, 'adminList']);
        Route::put('project-requests/{id}', [ProjectRequestController::class, 'adminUpdate']);
    });

    // ── Project Presentation Links (admin only) ───────────────
    Route::middleware('admin')->prefix('admin/project-presentation-links')->group(function () {
        Route::get('/',      [ProjectPresentationLinkController::class, 'index']);
        Route::post('/',     [ProjectPresentationLinkController::class, 'store']);
        Route::put('/{id}',  [ProjectPresentationLinkController::class, 'update']);
        Route::delete('/{id}', [ProjectPresentationLinkController::class, 'destroy']);
    });
});
