<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\ReportExportRequest;
use App\Jobs\Reporting\GenerateReportExport;
use App\Models\ReportExport;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-227 — Cross-tenant reporting. All endpoints respond with the same
 * envelope { rows, totals, period, generated_at }. Reads are not audited
 * (volume); only exports produce an activity entry (`super_admin_report_exported`).
 */
class ReportingController extends Controller
{
    private const ASYNC_THRESHOLD_ROWS = 10_000;

    public function __construct(private readonly PlatformReportingService $reporting) {}

    public function growth(Request $request): JsonResponse
    {
        $request->validate([
            'metric' => ['required', Rule::in(['agencies', 'users', 'listings'])],
            'period' => ['nullable', Rule::in(['3m', '6m', '12m'])],
            'granularity' => ['nullable', Rule::in(['day', 'week', 'month'])],
        ]);

        return $this->json([
            'data' => $this->reporting->growth(
                (string) $request->input('metric'),
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
            ),
        ]);
    }

    public function revenue(Request $request): JsonResponse
    {
        $request->validate([
            'period' => ['nullable', Rule::in(['3m', '6m', '12m'])],
            'granularity' => ['nullable', Rule::in(['day', 'week', 'month'])],
        ]);

        return $this->json([
            'data' => $this->reporting->revenue(
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
            ),
        ]);
    }

    public function cohorts(Request $request): JsonResponse
    {
        $request->validate([
            'cohort_basis' => ['nullable', Rule::in(['signup_month'])],
            'depth' => ['nullable', 'integer', 'min:1', 'max:24'],
        ]);

        return $this->json([
            'data' => $this->reporting->cohorts(
                (string) ($request->input('cohort_basis') ?? 'signup_month'),
                (int) ($request->input('depth') ?? 12),
            ),
        ]);
    }

    public function funnel(Request $request): JsonResponse
    {
        $request->validate([
            'period' => ['nullable', Rule::in(['30d', '90d', '3m'])],
        ]);

        return $this->json([
            'data' => $this->reporting->funnel(
                (string) ($request->input('period') ?? '30d'),
            ),
        ]);
    }

    public function export(ReportExportRequest $request, string $report): JsonResponse
    {
        if (! in_array($report, ['growth', 'revenue', 'cohorts', 'funnel'], true)) {
            throw new HttpException(404, "Unknown report '{$report}'.");
        }

        $payload = match ($report) {
            'growth' => $this->reporting->growth(
                (string) ($request->input('metric') ?? 'agencies'),
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
            ),
            'revenue' => $this->reporting->revenue(
                (string) ($request->input('period') ?? '12m'),
                (string) ($request->input('granularity') ?? 'month'),
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
            'parameters' => $request->only(['metric', 'period', 'granularity', 'cohort_basis', 'depth']),
            'status' => $async ? 'queued' : 'ready',
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

        return $this->json(['data' => $payload]);
    }
}
