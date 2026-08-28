<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\CohortsReportingRequest;
use App\Http\Requests\Api\Admin\FunnelReportingRequest;
use App\Http\Requests\Api\Admin\GrowthReportingRequest;
use App\Http\Requests\Api\Admin\ReportExportRequest;
use App\Http\Requests\Api\Admin\RevenueReportingRequest;
use App\Jobs\Reporting\GenerateReportExport;
use App\Models\ReportExport;
use App\Services\Export\ExportWriter;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-227 — Cross-tenant reporting. All endpoints respond with the same
 * envelope { rows, totals, period, generated_at }. Reads are not audited
 * (volume); only exports produce an activity entry (`super_admin_report_exported`).
 */
class ReportingController extends Controller
{
    private const ASYNC_THRESHOLD_ROWS = 10_000;

    public function __construct(
        private readonly PlatformReportingService $reporting,
        private readonly ExportWriter $exportWriter,
    ) {}

    public function growth(GrowthReportingRequest $request): JsonResponse
    {

        return $this->json([
            'data' => $this->reporting->growth(
                (string) $request->input('metric'),
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
                $request->input('starts_at'),
                $request->input('ends_at'),
            ),
        ]);
    }

    public function revenue(RevenueReportingRequest $request): JsonResponse
    {

        return $this->json([
            'data' => $this->reporting->revenue(
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
                $request->input('starts_at'),
                $request->input('ends_at'),
            ),
        ]);
    }

    public function cohorts(CohortsReportingRequest $request): JsonResponse
    {

        return $this->json([
            'data' => $this->reporting->cohorts(
                (string) ($request->input('cohort_basis') ?? 'signup_month'),
                (int) ($request->input('depth') ?? 12),
            ),
        ]);
    }

    public function funnel(FunnelReportingRequest $request): JsonResponse
    {

        return $this->json([
            'data' => $this->reporting->funnel(
                (string) ($request->input('period') ?? '30d'),
            ),
        ]);
    }

    public function export(ReportExportRequest $request, string $report): mixed
    {
        if (! in_array($report, ['growth', 'revenue', 'cohorts', 'funnel'], true)) {
            throw new HttpException(404, "Unknown report '{$report}'.");
        }

        $payload = match ($report) {
            'growth' => $this->reporting->growth(
                (string) ($request->input('metric') ?? 'agencies'),
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
                $request->input('starts_at'),
                $request->input('ends_at'),
            ),
            'revenue' => $this->reporting->revenue(
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
                $request->input('starts_at'),
                $request->input('ends_at'),
            ),
            'cohorts' => $this->reporting->cohorts(
                (string) ($request->input('cohort_basis') ?? 'signup_month'),
                (int) ($request->input('depth') ?? 12),
            ),
            'funnel' => $this->reporting->funnel(
                (string) ($request->input('period') ?? '30d'),
            ),
        };

        $rowCount = is_array($payload['rows'] ?? null) ? count($payload['rows']) : 0;
        $async = $rowCount > self::ASYNC_THRESHOLD_ROWS;

        $export = ReportExport::query()->create([
            'requested_by' => $request->user()->id,
            'report' => $report,
            'format' => $request->string('format')->toString(),
            'parameters' => $request->only(['metric', 'period', 'granularity', 'cohort_basis', 'depth', 'starts_at', 'ends_at']),
            'status' => $async ? 'queued' : 'ready',
            'row_count' => $rowCount,
            'ready_at' => $async ? null : now(),
            'expires_at' => $async ? null : now()->addDays(7),
        ]);

        activity('Reporting')
            ->causedBy($request->user())
            ->performedOn($export)
            ->event('super_admin_report_exported')
            ->withProperties([
                'report' => $report,
                'row_count' => $rowCount,
                'async' => $async,
            ])
            ->log('Report exported');

        if ($async) {
            GenerateReportExport::dispatch($export->id);

            return $this->json([
                'data' => [
                    'export_id' => $export->id,
                    'status' => 'queued',
                    'message' => 'Export en cours, vous recevrez un email lorsqu\'il sera prêt.',
                ],
            ], 202);
        }

        return $this->exportWriter->respond(
            $request->string('format')->toString(),
            $this->downloadPayload($report, $payload),
        );
    }

    private function downloadPayload(string $report, array $payload): array
    {
        $rows = collect($payload['rows'] ?? [])
            ->filter(fn ($row) => is_array($row))
            ->map(fn (array $row) => collect($row)
                ->map(fn ($value) => match (true) {
                    is_array($value) => json_encode($value, JSON_UNESCAPED_UNICODE),
                    // TCK-388 — un booléen brut s'écrit `1` et `` dans un CSV : la case VIDE d'un
                    // `false` se relit comme une donnée manquante, pas comme « non ». Sur la colonne
                    // `partial`, c'est exactement l'information que le ticket ajoute qui se perdrait.
                    is_bool($value) => $value ? 'true' : 'false',
                    default => $value,
                })
                ->all())
            ->values()
            ->all();

        $columns = $rows === [] ? [] : array_keys($rows[0]);

        return [
            'filename' => sprintf('takussan-%s-%s', $report, now()->format('Ymd-His')),
            'columns' => $columns,
            'rows' => $rows,
        ];
    }
}
