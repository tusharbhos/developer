<?php
// app/Http/Controllers/Api/ProjectPresentationLinkController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProjectPresentationLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectPresentationLinkController extends Controller
{
    // Admin: list all saved project presentation links
    public function index(): JsonResponse
    {
        $links = ProjectPresentationLink::with('creator:id,name,email')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data'  => $links,
            'total' => $links->count(),
        ]);
    }

    // Admin: save a new project presentation link
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'developer_name'         => ['required', 'string', 'max:255'],
            'project_name'           => ['required', 'string', 'max:255'],
            'presentation_id'        => ['required', 'integer'],
            'with_developer_link'    => ['nullable', 'string', 'max:2048'],
            'without_developer_link' => ['nullable', 'string', 'max:2048'],
            'seven_slide_link'       => ['nullable', 'string', 'max:2048'],
        ]);

        $link = ProjectPresentationLink::create([
            'created_by'              => $request->user()->id,
            'developer_name'          => $validated['developer_name'],
            'project_name'            => $validated['project_name'],
            'presentation_id'         => $validated['presentation_id'],
            'with_developer_link'     => $validated['with_developer_link'],
            'without_developer_link'  => $validated['without_developer_link'],
            'seven_slide_link'        => $validated['seven_slide_link'],
        ]);

        return response()->json([
            'message' => 'Project presentation link saved successfully.',
            'data'    => $link,
        ], 201);
    }

    // Admin: update an existing link
    public function update(Request $request, int $id): JsonResponse
    {
        $link = ProjectPresentationLink::findOrFail($id);

        $validated = $request->validate([
            'developer_name'          => ['sometimes', 'string', 'max:255'],
            'project_name'            => ['sometimes', 'string', 'max:255'],
            'presentation_id'         => ['sometimes', 'integer'],
            'with_developer_link'     => ['sometimes', 'string', 'max:2048'],
            'without_developer_link'  => ['sometimes', 'string', 'max:2048'],
            'seven_slide_link'        => ['sometimes', 'string', 'max:2048'],
        ]);

        $link->update($validated);

        return response()->json([
            'message' => 'Project presentation link updated.',
            'data'    => $link,
        ]);
    }

    // Admin: delete a link
    public function destroy(int $id): JsonResponse
    {
        $link = ProjectPresentationLink::findOrFail($id);
        $link->delete();

        return response()->json(['message' => 'Project presentation link deleted.']);
    }
}
