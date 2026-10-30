<?php

namespace App\Services\Radar\Observatory;

use App\Models\Enums\RadarCrawlStatus;
use App\Models\Property;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
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
 * main) n'est jamais jugée.
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
 */
final class RadarSourceWatch
{
    public const EVENT = 'radar_source_listing_gone';

    /**
     * @return array{gone: int, back: int, alerts: int}
     */
    public function observe(): array
    {
        $counts = ['gone' => 0, 'back' => 0, 'alerts' => 0];

        $counts['back'] = RadarListing::query()
            ->whereNotNull('source_gone_at')
            ->whereRaw('('.$this->lastSeenSql().') > radar_listings.source_gone_at')
            ->update(['source_gone_at' => null, 'source_gone_run_id' => null]);

        $confirm = max(1, (int) config('radar.observe.confirm_runs', 2));
        foreach ($this->decisiveRuns() as $run) {
            $ids = RadarListing::query()
                ->where('source_site', $run->site->value)
                ->whereNull('source_gone_at')
                ->whereRaw('('.$this->lastSeenSql().') < ?', [$run->started_at])
                ->whereRaw('('.$this->completeRunsSinceSql().') >= ?', [$run->site->value, $confirm])
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

    /** Les passages complets du site commencés après la dernière présence de l'annonce (lié : le site). */
    private function completeRunsSinceSql(): string
    {
        $table = (new RadarCrawlRun)->getTable();
        $finished = RadarCrawlStatus::Finished->value;

        return "select count(*) from {$table} r where r.site = ? and r.status = '{$finished}' and r.reached_end = true"
            .' and r.started_at > ('.$this->lastSeenSql().')';
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
                'other_sources_online' => $this->otherSourcesOnline($property->id, $listing->id),
            ])
            ->log('Annonce source disparue');

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

    /** Les autres annonces collectées du même bien encore en ligne (avec instantanés, non disparues). */
    private function otherSourcesOnline(int $propertyId, int $exceptId): int
    {
        return RadarListing::query()
            ->whereKeyNot($exceptId)
            ->whereNull('source_gone_at')
            ->whereExists(fn (Builder $q) => $q->select(DB::raw(1))->from((new RadarListingSnapshot)->getTable().' as s')->whereColumn('s.radar_listing_id', 'radar_listings.id'))
            ->where(fn ($q) => $q
                ->where('property_id', $propertyId)
                ->orWhere('duplicate_of_property_id', $propertyId)
                ->orWhereIn('duplicate_of_listing_id', RadarListing::query()->select('id')->where('property_id', $propertyId)))
            ->count();
    }
}
