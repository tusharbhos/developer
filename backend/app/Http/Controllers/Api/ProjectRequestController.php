<?php
// app/Http/Controllers/Api/ProjectRequestController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProjectRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ProjectRequestController extends Controller
{
    // Store new project request
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'developer_name' => ['required', 'string', 'max:255'],
            'manager_name'   => ['required', 'string', 'max:255'],
            'manager_phone'  => ['required', 'string', 'regex:/^\d{10}$/'],
            'manager_email'  => ['required', 'email', 'max:255'],
        ]);

        // Get the authenticated user
        $user = $request->user();

        // Create the project request
        $projectRequest = ProjectRequest::create([
            'user_id'        => $user->id,
            'developer_name' => $validated['developer_name'],
            'manager_name'   => $validated['manager_name'],
            'manager_phone'  => $validated['manager_phone'],
            'manager_email'  => $validated['manager_email'],
            'status'         => 'pending',
        ]);

        // Log the request for admin tracking
        Log::info("New project request from user {$user->id}: {$projectRequest->developer_name}");

        // Here you could also:
        // 1. Send notification to admin
        // 2. Send confirmation email to the user
        // 3. Send notification to the manager

        return response()->json([
            'message' => 'Project request submitted successfully! Our team will review and contact the developer.',
            'data'    => $projectRequest,
        ], 201);
    }

    // Get all project requests for the authenticated user
    public function myRequests(Request $request): JsonResponse
    {
        $requests = ProjectRequest::forUser($request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data' => $requests,
            'total' => $requests->count(),
        ]);
    }

    // Get single project request
    public function show(Request $request, int $id): JsonResponse
    {
        $projectRequest = ProjectRequest::forUser($request->user()->id)
            ->findOrFail($id);

        return response()->json(['data' => $projectRequest]);
    }

    // Admin endpoints
    public function adminList(Request $request): JsonResponse
    {
        $query = ProjectRequest::with('user:id,name,email,company_name');

        // Filter by status
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Search by project name or developer
        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('developer_name', 'like', "%{$search}%")
                    ->orWhere('manager_name', 'like', "%{$search}%");
            });
        }

        $requests = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'data' => $requests,
            'total' => $requests->count(),
        ]);
    }

    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $projectRequest = ProjectRequest::findOrFail($id);

        $validated = $request->validate([
            'status'       => ['required', 'in:pending,contacted,activated,rejected'],
            'notes'        => ['nullable', 'string'],
        ]);

        // Update status with timestamps
        $projectRequest->status = $validated['status'];

        if ($validated['status'] === 'contacted' && !$projectRequest->contacted_at) {
            $projectRequest->contacted_at = now();
        }

        if ($validated['status'] === 'activated' && !$projectRequest->activated_at) {
            $projectRequest->activated_at = now();
        }

        if (isset($validated['notes'])) {
            $projectRequest->notes = $validated['notes'];
        }

        $projectRequest->save();

        return response()->json([
            'message' => 'Project request updated successfully!',
            'data' => $projectRequest->load('user:id,name,email,company_name'),
        ]);
    }
}
