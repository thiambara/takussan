<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\BoostStatsRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** TCK-633 lot F (ADR-0061 §10) — impressions, clics et taux de clic des emplacements, par jour. */
class AdminBoostStatsController extends Controller
{
    public function index(BoostStatsRequest $request): JsonResponse
    {
        $rows = DB::table('property_boost_daily_stats')
            ->whereBetween('date', [$request->input('from'), $request->input('to')])
            ->groupBy('date')
            ->orderBy('date')
            ->select('date', DB::raw('SUM(impressions) AS impressions'), DB::raw('SUM(clicks) AS clicks'))
            ->get()
            ->map(fn ($r) => [
                'date' => substr((string) $r->date, 0, 10),
                'impressions' => (int) $r->impressions,
                'clicks' => (int) $r->clicks,
                'ctr' => (int) $r->impressions > 0 ? round((int) $r->clicks / (int) $r->impressions, 4) : 0.0,
            ])
            ->values();

        $impressions = (int) $rows->sum('impressions');
        $clicks = (int) $rows->sum('clicks');

        return $this->json([
            'data' => $rows->all(),
            'totals' => [
                'impressions' => $impressions,
                'clicks' => $clicks,
                'ctr' => $impressions > 0 ? round($clicks / $impressions, 4) : 0.0,
            ],
        ]);
    }
}
