<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ConectrController extends Controller
{
    public function presentations(Request $request): JsonResponse
    {
        return $this->forward('/presentations/search', $request->query());
    }

    public function meta(): JsonResponse
    {
        return $this->forward('/meta');
    }

    private function forward(string $path, array $query = []): JsonResponse
    {
        $baseUrl = rtrim((string) config('services.conectr.base_url'), '/');
        $token = trim((string) config('services.conectr.api_token'));

        if ($token === '') {
            return response()->json([
                'message' => 'ConectR API token is not configured.',
            ], 500);
        }

        try {
            $response = Http::acceptJson()
                ->withToken($token)
                ->timeout(20)
                ->get($baseUrl . $path, $query);
        } catch (ConnectionException $e) {
            return response()->json([
                'message' => 'ConectR API is unreachable right now.',
            ], 502);
        }

        $payload = $response->json();

        if (! is_array($payload)) {
            return response()->json([
                'message' => 'ConectR API returned an invalid response.',
            ], 502);
        }

        return response()->json($payload, $response->status());
    }
}
