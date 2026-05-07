<?php

namespace App\Jobs\Reporting;

use App\Models\ReportExport;
use App\Notifications\ReportExportReadyNotification;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * TCK-227 — Async report export. Triggered for matrices > 10k rows; serializes
 * the same envelope the API would have returned to a CSV file on the local
 * disk and notifies the requester.
 */
class GenerateReportExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly int $reportExportId) {}

    public function handle(PlatformReportingService $reporting): void
    {
        $export = ReportExport::query()->findOrFail($this->reportExportId);
        $export->update(['status' => 'processing']);

        $params = $export->parameters ?? [];
        $payload = match ($export->report) {
            'growth' => $reporting->growth(
                $params['metric'] ?? 'agencies',
                $params['period'] ?? '12m',
                $params['granularity'] ?? 'month',
            ),
            'revenue' => $reporting->revenue(
                $params['period'] ?? '12m',
                $params['granularity'] ?? 'month',
            ),
            'cohorts' => $reporting->cohorts(
                $params['cohort_basis'] ?? 'signup_month',
                (int) ($params['depth'] ?? 12),
            ),
            'funnel' => $reporting->funnel($params['period'] ?? '30d'),
            default => ['rows' => [], 'totals' => [], 'period' => null, 'generated_at' => now()->toIso8601String()],
        };

        $csv = $this->toCsv($payload['rows']);
        $path = "reports/{$export->report}-{$export->id}.csv";
        Storage::disk('local')->put($path, $csv);

        $export->update([
            'status' => 'ready',
            'archive_path' => $path,
            'row_count' => count($payload['rows']),
            'size_bytes' => strlen($csv),
            'ready_at' => now(),
            'expires_at' => now()->addDays(7),
        ]);

        $export->requester?->notify(new ReportExportReadyNotification($export));
    }

    private function toCsv(array $rows): string
    {
        if ($rows === []) {
            return '';
        }

        $first = $rows[0];
        if (! is_array($first)) {
            return '';
        }

        $columns = array_keys($first);
        $out = implode(',', array_map(fn ($c) => '"'.str_replace('"', '""', $c).'"', $columns))."\n";

        foreach ($rows as $row) {
            $values = [];
            foreach ($columns as $column) {
                $value = $row[$column] ?? '';
                if (is_array($value)) {
                    $value = json_encode($value, JSON_UNESCAPED_UNICODE);
                }
                $values[] = '"'.str_replace('"', '""', (string) $value).'"';
            }
            $out .= implode(',', $values)."\n";
        }

        return $out;
    }
}
