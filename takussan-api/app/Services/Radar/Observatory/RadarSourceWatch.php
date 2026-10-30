<?php

namespace App\Services\Radar\Observatory;

use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Services\Radar\Crawl\RadarStartUrls;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2393 (ADR-0083 §3, §4) — la disparition d'une annonce collectée, et l'alerte sur le bien qu'elle a fait publier.
 *
 * **Disparue** : les `radar.observe.confirm_runs` (2) derniers passages `finished` de son site dont `reached_end` est vrai
 * — ils ont lu toute la liste — ne l'ont pas revue : au moins ce nombre de passages complets a commencé après
 * `max(last_seen_at)` de ses instantanés. Un seul ne suffit pas : une liste triée par date glisse pendant qu'on la lit (une
 * annonce retirée ou remontée en page 1 fait passer la première de la page 2 dans une page déjà lue), et le passage atteint
 * la fin sans l'avoir vue. Une présence remet le compte à zéro d'elle-même : seuls comptent les passages postérieurs à la
 * dernière. Un passage arrêté au plafond de pages, refusé ou échoué ne compte pas. Une annonce sans instantané (saisie à la
 * main) n'est jamais jugée, ni une annonce que la collecte ne suit plus (TCK-2392, `RadarSnapshots::silenced()`) : purgée,
 * `do_not_contact`, ou d'un annonceur qui a dit STOP — ne plus la voir ne dit rien d'elle. La purge supprime en plus ses
 * instantanés : elle n'en a plus. Un passage ne compte que si ses listes contiennent celles du passage qui l'a vue en
 * dernier (TCK-2438, {@see self::completeRunsSinceSql()}).
 *
 * **Revenue** : un passage postérieur à la disparition l'a revue (`max(last_seen_at)` après `source_gone_at`) ; elle
 * redevient présente, et pourra de nouveau alerter.
 *
 * **L'alerte** : une disparition rattachée à un bien — le sien (`property_id`), celui de l'annonce dont elle est le doublon,
 * ou le bien du catalogue dont elle est le doublon — écrit {@see self::EVENT}. Son sujet est l'annonce collectée, et le bien
 * est dans `properties.property_id` : un journal de plateforme, sans agence (`AuditAgencyResolver` lirait celle du bien, et
 * l'agence d'un bien dont une annonce collectée n'est que le doublon lirait que la plateforme surveille ses annonces
 * ailleurs). L'événement est alertable (`AlertableEvents`) : les règles de la console le livrent. Une fois par disparition :
 * la transition se réclame par un `UPDATE … WHERE source_gone_at IS NULL`, et l'activité s'écrit dans la même transaction.
 *
 * **La question au titulaire** (TCK-2432) : quand la disparition emporte la dernière source en ligne d'un bien que le Radar a
 * publié, {@see RadarAvailabilityCheck::ask()} demande à son titulaire s'il est toujours disponible, dans la même transaction.
 */
final class RadarSourceWatch
{
    public const EVENT = 'radar_source_listing_gone';

    public function __construct(private readonly RadarAvailabilityCheck $checks) {}

    /**
     * @return array{gone: int, back: int, alerts: int}
     */
    public function observe(): array
    {
        $counts = ['gone' => 0, 'back' => 0, 'alerts' => 0];

        $counts['back'] = RadarListing::query()
            ->whereNotNull('source_gone_at')
            ->whereRaw('('.$this->lastSeenSql().') > radar_listings.source_gone_at')
            // TCK-2432 — la question au titulaire s'efface avec : une nouvelle disparition la reposera.
            ->update(['source_gone_at' => null, 'source_gone_run_id' => null, ...RadarAvailabilityCheck::resetColumns()]);

        $confirm = self::confirmRuns();
        foreach ($this->decisiveRuns() as $run) {
            $legacy = RadarStartUrls::legacyPerimeterJson($run->site->value);
            $ids = RadarListing::query()
                ->where('source_site', $run->site->value)
                ->whereNull('source_gone_at')
                ->where(fn ($q) => $this->followed($q))
                ->whereRaw('('.$this->lastSeenSql().') < ?', [$run->started_at])
                ->whereRaw('('.$this->completeRunsSinceSql().') >= ?', [$run->site->value, $legacy, $legacy, $confirm])
                ->orderBy('id')
                ->pluck('id');

            foreach ($ids as $id) {
                DB::transaction(function () use ($id, $run, &$counts): void {
                    $claimed = RadarListing::query()->whereKey($id)->whereNull('source_gone_at')
                        ->update(['source_gone_at' => $run->finished_at ?? $run->started_at, 'source_gone_run_id' => $run->id]);
                    if ($claimed !== 1) {
                        return;
                    }
                    $counts['gone']++;
                    $counts['alerts'] += $this->alert(RadarListing::query()->findOrFail($id), $run);
                });
            }
        }

        return $counts;
    }

    /** Le nombre de passages complets d'affilée qui constate une disparition (`radar.observe.confirm_runs`, 1 au moins). */
    public static function confirmRuns(): int
    {
        return max(1, (int) config('radar.observe.confirm_runs', 2));
    }

    /**
     * Par site, le dernier passage terminé qui a lu toute la liste.
     *
     * @return list<RadarCrawlRun>
     */
    private function decisiveRuns(): array
    {
        return RadarCrawlRun::query()
            ->where('status', RadarCrawlStatus::Finished->value)
            ->where('reached_end', true)
            ->whereNotNull('started_at')
            ->orderBy('site')->orderByDesc('started_at')->orderByDesc('id')
            ->get()
            ->unique(fn (RadarCrawlRun $run) => $run->site->value)
            ->values()
            ->all();
    }

    /**
     * Les passages complets du site commencés après la dernière présence de l'annonce (lié : le site).
     *
     * TCK-2438 — et dont le périmètre (`start_urls`, l'ensemble trié des listes lues) CONTIENT celui du passage qui l'a vue
     * en dernier : le dernier passage du site commencé avant cette présence (un seul passage actif par site). Élargir les
     * URL de départ ne coupe donc pas la détection ; les restreindre, si : un passage qui n'a pas relu la liste où elle était
     * ne dit rien d'elle, et elle n'est jugée de nouveau qu'une fois revue. Un passage antérieur à TCK-2438 (`start_urls`
     * nulle) se lit comme l'URL ACTUELLE de la configuration du site (liée deux fois, après le site :
     * {@see RadarStartUrls::legacyPerimeterJson()}). L'inclusion est l'opérateur `@>` de jsonb sur deux tableaux de
     * chaînes.
     */
    private function completeRunsSinceSql(): string
    {
        $table = (new RadarCrawlRun)->getTable();
        $finished = RadarCrawlStatus::Finished->value;

        return "select count(*) from {$table} r where r.site = ? and r.status = '{$finished}' and r.reached_end = true"
            .' and r.started_at > ('.$this->lastSeenSql().')'
            .' and coalesce(r.start_urls, ?::jsonb) @> coalesce((select r2.start_urls from '.$table.' r2 where r2.site = r.site'
            .' and r2.started_at <= ('.$this->lastSeenSql().') order by r2.started_at desc, r2.id desc limit 1), ?::jsonb)';
    }

    /** La dernière présence d'une annonce : `null` sans instantané (la comparaison est alors fausse, l'annonce n'est pas jugée). */
    private function lastSeenSql(): string
    {
        $table = (new RadarListingSnapshot)->getTable();

        return "select max(s.last_seen_at) from {$table} s where s.radar_listing_id = radar_listings.id";
    }

    /** @return int 1 si une alerte a été écrite */
    private function alert(RadarListing $listing, RadarCrawlRun $run): int
    {
        [$propertyId, $link] = $this->linkedProperty($listing);
        $property = $propertyId === null ? null : Property::query()->find($propertyId);
        if ($property === null) {
            return 0;
        }

        $lastSeen = DB::table((new RadarListingSnapshot)->getTable())->where('radar_listing_id', $listing->id)->max('last_seen_at');
        $othersOnline = $this->otherSourcesOnline($property->id, $listing->id);

        // Des identifiants, un site et des dates : ni numéro, ni nom, ni texte de l'annonce. Sujet : l'annonce (sans agence).
        activity('Radar')
            ->performedOn($listing)
            ->event(self::EVENT)
            ->withProperties([
                'property_id' => $property->id,
                'radar_listing_id' => $listing->id,
                'source_site' => $listing->source_site->value,
                'link' => $link,
                'crawl_run_id' => $run->id,
                'last_seen_at' => $lastSeen === null ? null : (string) $lastSeen,
                'property_public' => Property::query()->public()->whereKey($property->id)->exists(),
                'other_sources_online' => $othersOnline,
            ])
            ->log('Annonce source disparue');

        // TCK-2432 — la dernière source en ligne du bien s'en va : son titulaire est prié de dire s'il est toujours disponible.
        if ($othersOnline === 0) {
            $this->checks->ask($listing, $property);
        }

        return 1;
    }

    /**
     * Le bien que cette annonce source représente, et par quel lien.
     *
     * @return array{0: int|null, 1: string}
     */
    private function linkedProperty(RadarListing $listing): array
    {
        if ($listing->property_id !== null) {
            return [(int) $listing->property_id, 'published'];
        }
        if ($listing->duplicate_of_listing_id !== null) {
            $primary = RadarListing::query()->whereKey($listing->duplicate_of_listing_id)->value('property_id');
            if ($primary !== null) {
                return [(int) $primary, 'duplicate_of_listing'];
            }
        }
        if ($listing->duplicate_of_property_id !== null) {
            return [(int) $listing->duplicate_of_property_id, 'duplicate_of_property'];
        }

        return [null, 'none'];
    }

    /**
     * Les annonces que la collecte suit encore, donc que la veille peut juger : ni purgées, ni `do_not_contact`, ni d'un
     * annonceur qui a dit STOP (TCK-2392, `RadarSnapshots::silenced()`).
     */
    private function followed(EloquentBuilder $q): EloquentBuilder
    {
        return $q->whereNotIn('stage', [RadarListingStage::Purged->value, RadarListingStage::DoNotContact->value])
            ->where(fn ($q) => $q->whereNull('radar_advertiser_id')
                ->orWhereNotIn('radar_advertiser_id', RadarAdvertiser::query()->whereNotNull('do_not_contact_at')->select('id')));
    }

    /**
     * Les sites que la veille juge encore : allumés (`radar_crawl_sources.enabled`), et dont un passage complet a commencé dans
     * l'horizon — `radar.observe.online_horizon_days`, ou la fréquence du site multipliée par `confirm_runs` si elle est plus
     * longue (un site réglé à la semaine juge ses annonces deux semaines plus tard). Un site éteint, ou qui n'a plus lu sa
     * liste jusqu'au bout depuis l'horizon, ne juge plus rien : ses annonces ne comptent plus « en ligne ».
     */
    private function liveSites(): Builder
    {
        $runs = (new RadarCrawlRun)->getTable();
        $horizonMinutes = self::onlineHorizonDays() * 24 * 60;

        return DB::table((new RadarCrawlSource)->getTable().' as cs')
            ->select('cs.site')
            ->where('cs.enabled', true)
            ->whereExists(fn (Builder $q) => $q->select(DB::raw(1))->from($runs.' as r')
                ->whereColumn('r.site', 'cs.site')
                ->where('r.status', RadarCrawlStatus::Finished->value)
                ->where('r.reached_end', true)
                ->whereRaw('r.started_at >= ?::timestamp - make_interval(mins => greatest(?, cs.frequency_minutes * ?))', [
                    now()->utc()->format('Y-m-d H:i:s'), $horizonMinutes, self::confirmRuns(),
                ]));
    }

    /** L'horizon au-delà duquel un site sans passage complet ne juge plus ses annonces (`radar.observe.online_horizon_days`). */
    public static function onlineHorizonDays(): int
    {
        return max(1, (int) config('radar.observe.online_horizon_days', 3));
    }

    /**
     * Les autres annonces collectées du même bien encore en ligne : avec instantanés, non disparues, et que la veille juge
     * réellement — suivies par la collecte ({@see self::followed()}), d'un site vivant ({@see self::liveSites()}). TCK-2432
     * (vérification adverse I1) : un doublon jamais jugé (annonceur STOP, purgé, site éteint ou sans passage complet récent)
     * gardait son `source_gone_at` nul pour toujours et comptait « en ligne » indéfiniment ; la question au titulaire ne
     * partait jamais.
     */
    private function otherSourcesOnline(int $propertyId, int $exceptId): int
    {
        return RadarListing::query()
            ->whereKeyNot($exceptId)
            ->whereNull('source_gone_at')
            ->where(fn ($q) => $this->followed($q))
            ->whereIn('source_site', $this->liveSites())
            ->whereExists(fn (Builder $q) => $q->select(DB::raw(1))->from((new RadarListingSnapshot)->getTable().' as s')->whereColumn('s.radar_listing_id', 'radar_listings.id'))
            ->where(fn ($q) => $q
                ->where('property_id', $propertyId)
                ->orWhere('duplicate_of_property_id', $propertyId)
                ->orWhereIn('duplicate_of_listing_id', RadarListing::query()->select('id')->where('property_id', $propertyId)))
            ->count();
    }
}
