<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\BoostStatsRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §10) — impressions, clics et taux de clic des emplacements, par jour.
 * TCK-2525 (amendement du 2026-11-16) — et la place « Mise en avant » des agences sur la période :
 * places achetées et offertes (par date de création), crédits dépensés et remboursés pour elles.
 */
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

        $du = $request->input('from');
        $au = $request->input('to');
        $places = DB::table('agency_spotlights')
            ->whereRaw('created_at::date BETWEEN ?::date AND ?::date', [$du, $au])
            ->selectRaw("COUNT(*) FILTER (WHERE origin = 'purchased') AS purchased, COUNT(*) FILTER (WHERE origin = 'offered') AS offered")
            ->first();
        $credits = DB::table('credit_movements')
            ->whereNotNull('agency_spotlight_id')
            ->whereRaw('created_at::date BETWEEN ?::date AND ?::date', [$du, $au])
            ->selectRaw("COALESCE(-SUM(amount) FILTER (WHERE type = 'spend'), 0) AS spent, COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0) AS refunded")
            ->first();

        return $this->json([
            'data' => $rows->all(),
            'spotlights' => [
                'purchased' => (int) ($places->purchased ?? 0),
                'offered' => (int) ($places->offered ?? 0),
                'credits_spent' => (int) ($credits->spent ?? 0),
                'credits_refunded' => (int) ($credits->refunded ?? 0),
            ],
            'totals' => [
                'impressions' => $impressions,
                'clicks' => $clicks,
                'ctr' => $impressions > 0 ? round($clicks / $impressions, 4) : 0.0,
            ],
        ]);
    }
}
