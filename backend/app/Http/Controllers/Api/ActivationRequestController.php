<?php
// app/Http/Controllers/Api/ActivationRequestController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivationRequest;
use App\Models\ActivationRequestApproval;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ActivationRequestController extends Controller
{
    /**
     * Store new activation request.
     * This endpoint is PUBLIC — developers can submit without logging in.
     * If an auth token is present, it links to the user.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            // Step 1 — Basic Info
            'project_name'     => ['required', 'string', 'max:255'],
            'city'             => ['required', 'string', 'max:100'],
            'google_location'  => ['nullable', 'string', 'max:500'],
            'units_left_label' => ['nullable', 'string', 'max:50'],
            'units_left'       => ['nullable', 'integer', 'min:0'],
            'possession_date'  => ['nullable', 'date'],

            // Step 2 — Project Positioning
            'price_range'      => ['nullable', 'string', 'max:50'],
            'location_type'    => ['nullable', 'string', 'max:50'],
            'unit_structure'   => ['nullable', 'string', 'max:50'],

            // Step 3 — Market Dynamics
            'buyer_type'            => ['nullable', 'string', 'max:50'],
            'sales_velocity'        => ['nullable', 'string', 'max:50'],
            'target_timeline'       => ['nullable', 'string', 'max:50'],
            'developer_positioning' => ['nullable', 'string', 'max:50'],

            // Step 7 — Contact Details
            'contact_name'   => ['required', 'string', 'max:255'],
            'designation'    => ['nullable', 'string', 'max:255'],
            'phone'          => ['required', 'string', 'regex:/^\d{10}$/'],
            'email'          => ['required', 'email', 'max:255'],
            'developer_name' => ['required', 'string', 'max:255'],

            // Assessment JSON (stringified)
            'assessment'   => ['nullable', 'string'],
            'submitted_at' => ['nullable', 'string'],
        ]);

        // Parse assessment JSON if provided
        $assessmentData = null;
        if (!empty($validated['assessment'])) {
            $assessmentData = json_decode($validated['assessment'], true);
        }

        // Get user if authenticated
        $userId = null;
        if ($request->user()) {
            $userId = $request->user()->id;
        }

        $activationRequest = ActivationRequest::create([
            'user_id'              => $userId,
            'project_name'         => $validated['project_name'],
            'city'                 => $validated['city'],
            'google_location'      => $validated['google_location'] ?? null,
            'units_left_label'     => $validated['units_left_label'] ?? null,
            'units_left'           => $validated['units_left'] ?? 0,
            'possession_date'      => $validated['possession_date'] ?? null,
            'price_range'          => $validated['price_range'] ?? null,
            'location_type'        => $validated['location_type'] ?? null,
            'unit_structure'       => $validated['unit_structure'] ?? null,
            'buyer_type'           => $validated['buyer_type'] ?? null,
            'sales_velocity'       => $validated['sales_velocity'] ?? null,
            'target_timeline'      => $validated['target_timeline'] ?? null,
            'developer_positioning' => $validated['developer_positioning'] ?? null,
            'contact_name'         => $validated['contact_name'],
            'designation'          => $validated['designation'] ?? null,
            'phone'                => $validated['phone'],
            'email'                => $validated['email'],
            'developer_name'       => $validated['developer_name'],
            'assessment'           => $assessmentData,
            'status'               => 'pending',
            'submitted_at'         => $validated['submitted_at'] ?? now(),
        ]);

        Log::info("New activation request: {$activationRequest->project_name} by {$activationRequest->contact_name} ({$activationRequest->email})");

        return response()->json([
            'message' => 'Activation request submitted successfully! Our team will review and connect within 48 hours.',
            'data'    => $activationRequest,
        ], 201);
    }

    /**
     * Authenticated user: list all activation projects with approval stats.
     */
    public function myProjects(Request $request): JsonResponse
    {
        $user = $request->user();

        $projects = ActivationRequest::query()
            ->withCount('approvals as approval_count')
            ->withCount([
                'approvals as my_approval_attempts' => fn($q) => $q->where('user_id', $user->id),
            ])
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $projects,
            'total' => $projects->count(),
        ]);
    }

    /**
     * Authenticated user: give channel partner approval only once per project.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $project = ActivationRequest::query()
            ->where('id', $id)
            ->firstOrFail();

        $approval = ActivationRequestApproval::firstOrCreate([
            'activation_request_id' => $project->id,
            'user_id' => $user->id,
        ]);

        $project = ActivationRequest::query()
            ->where('id', $project->id)
            ->withCount('approvals as approval_count')
            ->withCount([
                'approvals as my_approval_attempts' => fn($q) => $q->where('user_id', $user->id),
            ])
            ->firstOrFail();

        return response()->json([
            'message' => $approval->wasRecentlyCreated
                ? 'Approval recorded successfully.'
                : 'You have already approved this project.',
            'data' => $project,
        ]);
    }

    /**
     * Admin: List all activation requests.
     */
    public function adminList(Request $request): JsonResponse
    {
        $query = ActivationRequest::with('user:id,name,email,company_name')
            ->orderBy('created_at', 'desc');

        // Filter by status
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Filter by city
        if ($city = $request->get('city')) {
            $query->where('city', $city);
        }

        // Search
        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('project_name', 'like', "%{$search}%")
                    ->orWhere('developer_name', 'like', "%{$search}%")
                    ->orWhere('contact_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%");
            });
        }

        $requests = $query->get();

        return response()->json([
            'data'  => $requests,
            'total' => $requests->count(),
        ]);
    }

    /**
     * Admin: View single activation request.
     */
    public function adminShow(int $id): JsonResponse
    {
        $request = ActivationRequest::with('user:id,name,email,company_name')
            ->findOrFail($id);

        return response()->json(['data' => $request]);
    }

    /**
     * Admin: Update activation request status.
     */
    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $activationRequest = ActivationRequest::findOrFail($id);

        $validated = $request->validate([
            'status'      => ['required', 'in:pending,reviewing,contacted,activated,rejected'],
            'admin_notes' => ['nullable', 'string'],
        ]);

        $activationRequest->status = $validated['status'];

        if ($validated['status'] === 'contacted' && !$activationRequest->contacted_at) {
            $activationRequest->contacted_at = now();
        }

        if ($validated['status'] === 'activated' && !$activationRequest->activated_at) {
            $activationRequest->activated_at = now();
        }

        if (isset($validated['admin_notes'])) {
            $activationRequest->admin_notes = $validated['admin_notes'];
        }

        $activationRequest->save();

        return response()->json([
            'message' => 'Activation request updated.',
            'data'    => $activationRequest->load('user:id,name,email,company_name'),
        ]);
    }

    /**
     * Admin: Delete activation request.
     */
    public function adminDelete(int $id): JsonResponse
    {
        ActivationRequest::findOrFail($id)->delete();

        return response()->json(['message' => 'Activation request deleted.']);
    }
}
