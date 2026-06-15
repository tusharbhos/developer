<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConectrWebhookEvent;
use App\Models\CustomerSessionLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class ConectrWebhookController extends Controller
{
    private const SUPPORTED_EVENTS = [
        'session_started',
        'session_ended',
        'summary_ready',
        'self_view_started',
        'self_view_ended',
        'self_view_summary_ready',
        'phone_joinee_joined',
        'phone_self_view_started',
    ];

    public function handle(Request $request): JsonResponse
    {
        $this->assertSecret($request);

        $payload = $request->json()->all();
        $event = trim((string) ($payload['event'] ?? $request->header('X-Webhook-Event', '')));

        if ($event === '' || ! in_array($event, self::SUPPORTED_EVENTS, true)) {
            return response()->json([
                'received' => true,
                'ignored' => true,
                'message' => 'Unsupported or missing webhook event.',
            ]);
        }

        $sessionToken = trim((string) ($payload['session_token'] ?? ''));
        $viewerId = trim((string) ($payload['viewer_id'] ?? data_get($payload, 'joinee.viewer_id', '')));
        $payload = $this->enrichSummaryPayload($event, $sessionToken, $payload);
        $deliveryHash = hash('sha256', $event . '|' . json_encode($payload, JSON_UNESCAPED_SLASHES));

        if (ConectrWebhookEvent::where('delivery_hash', $deliveryHash)->exists()) {
            return response()->json([
                'received' => true,
                'duplicate' => true,
            ]);
        }

        DB::transaction(function () use ($payload, $event, $sessionToken, $viewerId, $deliveryHash) {
            $link = $this->findSessionLink($payload, $sessionToken, $viewerId);

            ConectrWebhookEvent::create([
                'customer_session_link_id' => $link?->id,
                'event' => $event,
                'session_token' => $sessionToken !== '' ? $sessionToken : null,
                'viewer_id' => $viewerId !== '' ? $viewerId : null,
                'delivery_hash' => $deliveryHash,
                'payload' => $payload,
                'received_at' => now(),
            ]);

            if ($link) {
                $this->applyPayload($link, $event, $payload);
            }
        });

        return response()->json(['received' => true]);
    }

    private function assertSecret(Request $request): void
    {
        $expected = trim((string) config('services.conectr_session.webhook_secret'));
        if ($expected === '') {
            abort(503, 'ConectR webhook secret is not configured.');
        }

        $provided = trim((string) (
            $request->query('key')
            ?: $request->header('X-ConectR-Webhook-Secret', '')
        ));

        if ($provided === '' || ! hash_equals($expected, $provided)) {
            abort(401, 'Invalid webhook secret.');
        }
    }

    private function enrichSummaryPayload(string $event, string $sessionToken, array $payload): array
    {
        if (
            ! in_array($event, ['summary_ready', 'self_view_summary_ready'], true)
            || $sessionToken === ''
            || is_array($payload['events'] ?? null)
            || is_array(data_get($payload, 'analytics.events'))
        ) {
            return $payload;
        }

        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $apiKey = trim((string) config('services.conectr_session.api_key'));
        $frontendUrl = (string) config('services.conectr_session.frontend_url', $baseUrl);

        try {
            $response = Http::acceptJson()
                ->timeout(6)
                ->withHeaders(array_filter([
                    'X-API-Key' => $apiKey ?: null,
                    'X-Frontend-URL' => $frontendUrl ?: null,
                ]))
                ->get("{$baseUrl}/api/session/" . rawurlencode($sessionToken) . '/analytics');

            if ($response->ok() && is_array($response->json())) {
                $payload['analytics'] = $response->json();
            }
        } catch (\Throwable) {
            // The webhook payload is still stored; ConectR may retry delivery.
        }

        return $payload;
    }

    private function findSessionLink(array $payload, string $sessionToken, string $viewerId): ?CustomerSessionLink
    {
        if ($sessionToken !== '') {
            $byToken = CustomerSessionLink::where('session_token', $sessionToken)
                ->latest('id')
                ->first();
            if ($byToken) {
                return $byToken;
            }
        }

        $presentationId = trim((string) (
            $payload['presentation_id']
            ?? $payload['presentation_code']
            ?? ''
        ));
        $projectName = trim((string) (
            $payload['project_name']
            ?? $payload['presentation_title']
            ?? ''
        ));

        if ($viewerId === '' && $presentationId === '' && $projectName === '') {
            return null;
        }

        return CustomerSessionLink::query()
            ->when($viewerId !== '', fn($query) => $query->where('viewer_platform_id', $viewerId))
            ->when(
                $presentationId !== '' || $projectName !== '',
                function ($query) use ($presentationId, $projectName) {
                    $query->where(function ($scope) use ($presentationId, $projectName) {
                        if ($presentationId !== '') {
                            $scope->where('presentation_id', $presentationId);
                        }
                        if ($projectName !== '') {
                            $method = $presentationId !== '' ? 'orWhere' : 'where';
                            $scope->{$method}('project_name', $projectName)
                                ->orWhere('presentation_title', $projectName);
                        }
                    });
                }
            )
            ->latest('id')
            ->first();
    }

    private function applyPayload(CustomerSessionLink $link, string $event, array $payload): void
    {
        $currentRaw = is_array($link->raw_response) ? $link->raw_response : [];
        $currentAnalytics = is_array($link->analytics_payload) ? $link->analytics_payload : [];
        $summary = $payload['summary'] ?? data_get($payload, 'analytics.summary');
        $feedback = $payload['feedback_submissions']
            ?? data_get($payload, 'session.feedback_submissions')
            ?? data_get($payload, 'analytics.feedback_submissions');
        $events = $payload['events'] ?? data_get($payload, 'analytics.events');
        $mergedEvents = $this->mergeRecords(
            is_array(data_get($currentAnalytics, 'events')) ? data_get($currentAnalytics, 'events') : [],
            is_array($events) ? $events : [],
        );
        $mergedFeedback = $this->mergeRecords(
            is_array($link->feedback_payload)
                ? $link->feedback_payload
                : (is_array(data_get($currentAnalytics, 'feedback_submissions'))
                    ? data_get($currentAnalytics, 'feedback_submissions')
                    : []),
            is_array($feedback) ? $feedback : [],
        );
        $eventCount = max(
            (int) ($link->event_count ?? 0),
            (int) ($payload['event_count'] ?? 0),
            count($mergedEvents),
            count($mergedFeedback),
        );
        $joinees = max(
            (int) ($link->joinees ?? 0),
            $this->normalizeCount($payload['joinees'] ?? data_get($payload, 'session.joinees', 0)),
            in_array($event, ['phone_joinee_joined', 'phone_self_view_started'], true) ? 1 : 0,
            $eventCount > 0 ? 1 : 0,
        );

        $status = trim((string) ($payload['status'] ?? ''));
        if ($status === '') {
            $status = match ($event) {
                'session_started', 'self_view_started', 'phone_joinee_joined', 'phone_self_view_started' => 'live',
                'session_ended', 'self_view_ended', 'summary_ready', 'self_view_summary_ready' => 'completed',
                default => (string) ($link->provider_status ?: 'scheduled'),
            };
        }

        $startedAt = $payload['started_at'] ?? null;
        $endedAt = $payload['ended_at'] ?? null;
        if (! $startedAt && in_array($event, ['session_started', 'self_view_started', 'phone_self_view_started'], true)) {
            $startedAt = $payload['timestamp'] ?? now();
        }
        if (! $endedAt && in_array($event, ['session_ended', 'self_view_ended'], true)) {
            $endedAt = $payload['timestamp'] ?? now();
        }

        $analyticsPayload = array_replace_recursive($currentAnalytics, [
            'session' => array_filter([
                'session_token' => $link->session_token,
                'session_code' => $payload['session_code'] ?? $link->session_code,
                'presentation_id' => $payload['presentation_id'] ?? $link->presentation_id,
                'presentation_title' => $payload['presentation_title'] ?? $link->presentation_title,
                'presenter_name' => $payload['presenter_name'] ?? $link->presenter_name,
                'viewer_name' => $payload['viewer_name'] ?? $link->viewer_name,
                'viewer_id' => $payload['viewer_id'] ?? $link->viewer_platform_id,
                'status' => $status,
                'started_at' => $startedAt ?: $link->started_at,
                'ended_at' => $endedAt ?: $link->ended_at,
                'joinees' => $joinees,
                'event_count' => $eventCount,
            ], fn($value) => $value !== null && $value !== ''),
        ]);

        $analyticsPayload['events'] = $mergedEvents;
        $analyticsPayload['feedback_submissions'] = $mergedFeedback;
        if (is_array($summary)) {
            $analyticsPayload['summary'] = $summary;
            $analyticsPayload['summary_history'] = $this->mergeRecords(
                is_array(data_get($currentAnalytics, 'summary_history'))
                    ? data_get($currentAnalytics, 'summary_history')
                    : [],
                [[
                    'received_at' => now()->toIso8601String(),
                    'summary' => $summary,
                ]],
            );
        }

        $link->forceFill([
            'provider_status' => $status,
            'started_at' => $startedAt ?: $link->getRawOriginal('started_at'),
            'ended_at' => $endedAt ?: $link->getRawOriginal('ended_at'),
            'joinees' => $joinees,
            'event_count' => $eventCount,
            'analytics_payload' => $analyticsPayload,
            'summary_payload' => is_array($summary) ? $summary : $link->summary_payload,
            'feedback_payload' => $mergedFeedback,
            'summary_generated_at' => in_array($event, ['summary_ready', 'self_view_summary_ready'], true)
                ? ($payload['summary_generated_at'] ?? $payload['timestamp'] ?? now())
                : $link->getRawOriginal('summary_generated_at'),
            'last_webhook_at' => now(),
            'raw_response' => array_replace_recursive($currentRaw, [
                'status' => $status,
                'started_at' => $startedAt ?: data_get($currentRaw, 'started_at'),
                'ended_at' => $endedAt ?: data_get($currentRaw, 'ended_at'),
                'joinees' => $joinees,
                'event_count' => $eventCount,
                'last_webhook_event' => $event,
            ]),
        ])->save();

        $this->syncCustomerMeeting($link);
    }

    private function syncCustomerMeeting(CustomerSessionLink $link): void
    {
        $customer = $link->customer;
        $projectName = trim((string) $link->project_name);
        if (! $customer || $projectName === '') {
            return;
        }

        $changed = $customer->syncProjectSessionSummary($projectName, [
            'has_session_link' => true,
            'session_link_count' => CustomerSessionLink::where('customer_id', $customer->id)
                ->where('project_name', $projectName)
                ->count(),
            'latest_session_link_id' => $link->id,
            'latest_session_created_at' => $link->created_at?->toDateTimeString(),
            'latest_session_status' => $link->status,
            'latest_session_started_at' => $link->started_at,
            'latest_session_ended_at' => $link->ended_at,
            'latest_session_joinees' => $link->joinees,
            'latest_session_event_count' => $link->event_count,
        ]);

        if ($changed) {
            $customer->save();
        }
    }

    private function normalizeCount(mixed $value): int
    {
        return is_countable($value) ? count($value) : max(0, (int) $value);
    }

    private function mergeRecords(array $existing, array $incoming): array
    {
        $merged = [];
        $seen = [];

        foreach ([...$existing, ...$incoming] as $record) {
            $hash = hash('sha256', json_encode(
                $this->sortForHash($record),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            ));
            if (isset($seen[$hash])) {
                continue;
            }

            $seen[$hash] = true;
            $merged[] = $record;
        }

        return $merged;
    }

    private function sortForHash(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            return array_map(fn($item) => $this->sortForHash($item), $value);
        }

        ksort($value);

        return array_map(fn($item) => $this->sortForHash($item), $value);
    }
}
