<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Credits\CreditBoostReportRequest;
use App\Http\Resources\Bases\BaseResource;
use App\Http\Resources\Credits\CreditBoostResource;
use App\Models\PropertyBoost;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2924 — le rapport des mises en avant de l'espace ACTIF sur `days` jours (7, 30 ou 90), aujourd'hui
 * compris, en jours UTC (ceux de `property_boost_daily_stats` et de `property_daily_views`) :
 *
 *  - `days[]` : chaque jour de la période, consécutifs, un jour sans mesure à 0 — `impressions` et
 *    `clicks` (la somme des `property_boost_daily_stats` des boosts de l'espace), `views` (TCK-2923 : les
 *    vues de la fiche, `property_daily_views`, d'un bien un jour où l'une de ses mises en avant courait —
 *    une fois par bien et par jour, même sous deux mises en avant) ;
 *  - `boosts[]` : chaque mise en avant qui a couru dans la période, ses totaux sur la période. La somme de
 *    leurs `impressions` et `clicks` est celle des jours ; `views` peut la dépasser quand deux mises en
 *    avant du même bien se chevauchent (chacune compte ses vues), jamais l'inverse.
 *
 * Même espace et même autorisation que `GET /api/credits` (`ReadsWallet`, ADR-0061).
 */
class CreditBoostReportController extends Controller
{
    use ReadsWallet;

    public function __invoke(CreditBoostReportRequest $request): JsonResponse
    {
        $agency = $this->walletAgency($request);
        $days = $request->integer('days', CreditBoostReportRequest::DEFAULT_DAYS);
        $to = CarbonImmutable::now('UTC')->startOfDay();
        $from = $to->subDays($days - 1);
        [$fromDay, $toDay] = [$from->toDateString(), $to->toDateString()];
        $agencyId = (int) $agency->getKey();

        $statsByDay = DB::table('property_boost_daily_stats as s')
            ->join('property_boosts as b', 'b.id', '=', 's.property_boost_id')
            ->where('b.agency_id', $agencyId)
            ->whereBetween('s.date', [$fromDay, $toDay])
            ->groupBy('s.date')
            ->selectRaw('s.date::text AS day, SUM(s.impressions) AS impressions, SUM(s.clicks) AS clicks')
            ->get()->keyBy('day');
        $viewsByDay = DB::table('property_daily_views as v')
            ->whereBetween('v.day', [$fromDay, $toDay])
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('property_boosts as b')
                ->where('b.agency_id', $agencyId)
                ->whereColumn('b.property_id', 'v.property_id')
                ->whereRaw('v.day >= b.starts_at::date')
                ->whereRaw('v.day <= COALESCE(b.ended_at, ?)::date', [$to->toDateTimeString()]))
            ->groupBy('v.day')
            ->selectRaw('v.day::text AS day, SUM(v.views) AS views')
            ->pluck('views', 'day');

        $series = [];
        for ($day = $from; $day->lessThanOrEqualTo($to); $day = $day->addDay()) {
            $key = $day->toDateString();
            $series[] = [
                'date' => BaseResource::calendarDateOnWire($day),
                'impressions' => (int) ($statsByDay[$key]->impressions ?? 0),
                'clicks' => (int) ($statsByDay[$key]->clicks ?? 0),
                'views' => (int) ($viewsByDay[$key] ?? 0),
            ];
        }

        // Ce qui a couru dans la période, et — filet — tout boost qui y a une mesure.
        $boosts = PropertyBoost::query()
            ->where('agency_id', $agencyId)
            ->where(fn ($q) => $q
                ->where(fn ($w) => $w->where('starts_at', '<', $to->addDay())
                    ->where(fn ($e) => $e->whereNull('ended_at')->orWhere('ended_at', '>=', $from)))
                ->orWhereIn('id', DB::table('property_boost_daily_stats')
                    ->whereBetween('date', [$fromDay, $toDay])->select('property_boost_id')))
            ->with(['property.media', 'property.address', 'property.agency'])
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->get();
        $ids = $boosts->modelKeys();

        $statsByBoost = $ids === [] ? collect() : DB::table('property_boost_daily_stats')
            ->whereIn('property_boost_id', $ids)
            ->whereBetween('date', [$fromDay, $toDay])
            ->groupBy('property_boost_id')
            ->selectRaw('property_boost_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks')
            ->get()->keyBy('property_boost_id');
        $viewsByBoost = $ids === [] ? collect() : DB::table('property_boosts as b')
            ->join('property_daily_views as v', 'v.property_id', '=', 'b.property_id')
            ->whereIn('b.id', $ids)
            ->whereBetween('v.day', [$fromDay, $toDay])
            ->whereRaw('v.day >= b.starts_at::date')
            ->whereRaw('v.day <= COALESCE(b.ended_at, ?)::date', [$to->toDateTimeString()])
            ->groupBy('b.id')
            ->selectRaw('b.id, SUM(v.views) AS views')
            ->pluck('views', 'id');

        $rows = $boosts->map(fn (PropertyBoost $boost): array => [
            'id' => $boost->id,
            'kind' => $boost->kind?->value,
            'variant' => $boost->variant?->value,
            'status' => $boost->status?->value,
            'starts_at' => BaseResource::instantOnWire($boost->starts_at),
            'ended_at' => BaseResource::instantOnWire($boost->ended_at),
            'property' => CreditBoostResource::propertyCard($boost->property),
            'impressions' => (int) ($statsByBoost[$boost->id]->impressions ?? 0),
            'clicks' => (int) ($statsByBoost[$boost->id]->clicks ?? 0),
            'views' => (int) ($viewsByBoost[$boost->id] ?? 0),
        ])->values()->all();

        return $this->json([
            'data' => ['days' => $series, 'boosts' => $rows],
            'meta' => ['days' => $days, 'from' => $fromDay, 'to' => $toDay],
        ]);
    }
}
