<?php

namespace App\Console\Commands;

use App\Models\CustomerSessionLink;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class BackfillConectrSessionAnalytics extends Command
{
    protected $signature = 'conectr:backfill-session-analytics
                            {--all : Refresh rows that already have analytics}';

    protected $description = 'Fetch each existing ConectR session once and store its analytics locally';

    public function handle(): int
    {
        $baseUrl = rtrim((string) config('services.conectr_session.base_url'), '/');
        $apiKey = trim((string) config('services.conectr_session.api_key'));
        $frontendUrl = (string) config('services.conectr_session.frontend_url', $baseUrl);
        $query = CustomerSessionLink::query()->orderBy('id');

        if (! $this->option('all')) {
            $query->whereNull('analytics_payload');
        }

        $total = (clone $query)->count();
        if ($total === 0) {
            $this->info('No session analytics need backfilling.');
            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($total);
        $updated = 0;
        $failed = 0;

        $query->chunkById(50, function ($rows) use ($baseUrl, $apiKey, $frontendUrl, $bar, &$updated, &$failed) {
            foreach ($rows as $row) {
                try {
                    $response = Http::acceptJson()
                        ->timeout(15)
                        ->withHeaders(array_filter([
                            'X-API-Key' => $apiKey ?: null,
                            'X-Frontend-URL' => $frontendUrl ?: null,
                        ]))
                        ->get("{$baseUrl}/api/session/" . rawurlencode($row->session_token) . '/analytics');

                    if (! $response->ok() || ! is_array($response->json())) {
                        $failed++;
                        $bar->advance();
                        continue;
                    }

                    $analytics = $response->json();
                    $session = is_array(data_get($analytics, 'session'))
                        ? data_get($analytics, 'session')
                        : [];
                    $events = is_array(data_get($analytics, 'events'))
                        ? data_get($analytics, 'events')
                        : [];
                    $feedback = is_array(data_get($analytics, 'feedback_submissions'))
                        ? data_get($analytics, 'feedback_submissions')
                        : [];
                    $summary = is_array(data_get($analytics, 'summary'))
                        ? data_get($analytics, 'summary')
                        : [];
                    $currentAnalytics = is_array($row->analytics_payload) ? $row->analytics_payload : [];
                    $mergedEvents = $this->mergeRecords(
                        is_array(data_get($currentAnalytics, 'events')) ? data_get($currentAnalytics, 'events') : [],
                        $events,
                    );
                    $mergedFeedback = $this->mergeRecords(
                        is_array($row->feedback_payload)
                            ? $row->feedback_payload
                            : (is_array(data_get($currentAnalytics, 'feedback_submissions'))
                                ? data_get($currentAnalytics, 'feedback_submissions')
                                : []),
                        $feedback,
                    );
                    $analytics['events'] = $mergedEvents;
                    $analytics['feedback_submissions'] = $mergedFeedback;
                    $eventCount = max(
                        (int) data_get($session, 'event_count', 0),
                        count($mergedEvents),
                        count($mergedFeedback),
                        (int) $row->event_count,
                    );

                    $row->forceFill([
                        'provider_status' => data_get($session, 'status', $row->status ?: 'scheduled'),
                        'started_at' => data_get($session, 'started_at'),
                        'ended_at' => data_get($session, 'ended_at'),
                        'joinees' => max(
                            $this->normalizeCount(data_get($session, 'joinees', 0)),
                            $eventCount > 0 ? 1 : 0,
                        ),
                        'event_count' => $eventCount,
                        'analytics_payload' => array_replace_recursive($currentAnalytics, $analytics),
                        'summary_payload' => $summary !== [] ? $summary : $row->summary_payload,
                        'feedback_payload' => $mergedFeedback,
                        'summary_generated_at' => data_get($analytics, 'summary_generated_at'),
                    ])->save();
                    $updated++;
                } catch (ConnectionException) {
                    $failed++;
                }

                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);
        $this->info("Backfill complete: {$updated} updated, {$failed} failed.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
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
