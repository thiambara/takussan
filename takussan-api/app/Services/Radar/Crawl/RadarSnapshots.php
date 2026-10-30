<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Services\Radar\RadarReviewFields;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2392 (AC2) — les instantanés datés d'une annonce collectée (`radar_listing_snapshots`).
 *
 * Chaque passage qui revoit une annonce sur une page de liste l'**observe** :
 *  - l'état observé = ce que la carte affiche (prix, titre, lieu, et ce qu'elle montre de plus), complété des valeurs
 *    relues de l'extraction quand la carte ne les dit pas (`RadarReviewFields::values()`) — le prix de la carte prime, c'est
 *    l'observation du jour ;
 *  - **un prix ou un titre qui a changé ouvre un instantané** (`first_seen_at` = `last_seen_at` = maintenant) ;
 *  - sinon le dernier est **prolongé** (`last_seen_at`, `observations` + 1), et ses colonnes encore vides sont comblées :
 *    une surface lue par l'extraction après le premier passage n'est pas un changement, c'est une précision.
 *
 * Une valeur inconnue (null) des deux côtés n'est jamais un changement. Le titre n'est gardé que par son empreinte
 * (ADR-0077 §9 : le texte d'une annonce jamais publiée s'efface à 90 jours, l'empreinte ne se relit pas).
 *
 * La même annonce vue deux fois dans un passage (carrousel des annonces mises en avant) n'est observée qu'une fois : c'est
 * l'appelant ({@see RadarCrawler}) qui dédoublonne.
 */
final class RadarSnapshots
{
    /** Les colonnes dont un changement ouvre un instantané. */
    private const CHANGES = ['price', 'title_fingerprint'];

    /** Vrai si l'observation a ouvert un instantané. */
    public function observe(RadarListing $listing, ListCard $card, RadarCrawlRun $run, CarbonInterface $now): bool
    {
        $observed = $this->observedState($listing, $card);

        return DB::transaction(function () use ($listing, $observed, $run, $now): bool {
            // Le verrou de l'annonce sérialise deux observations simultanées (deux passages ne coexistent pas sur un même
            // site, mais une annonce peut être rendue par une autre URL d'un même site) : jamais deux instantanés ouverts.
            // Relue sous ce verrou : une purge (ou un STOP) validée entre la lecture de la carte et l'observation ne reçoit
            // aucun instantané (ADR-0080 § 3).
            $locked = RadarListing::query()->whereKey($listing->id)->lockForUpdate()->first(['id', 'stage', 'radar_advertiser_id']);
            if ($locked === null || self::silenced($locked)) {
                return false;
            }
            $latest = RadarListingSnapshot::query()
                ->where('radar_listing_id', $listing->id)
                ->orderByDesc('first_seen_at')->orderByDesc('id')
                ->first();

            if ($latest !== null && ! $this->changed($latest, $observed)) {
                foreach ($observed as $column => $value) {
                    if ($latest->{$column} === null && $value !== null) {
                        $latest->{$column} = $value;
                    }
                }
                $latest->last_seen_at = $now;
                $latest->observations = $latest->observations + 1;
                $latest->save();

                return false;
            }

            RadarListingSnapshot::query()->create($observed + [
                'radar_listing_id' => $listing->id,
                'crawl_run_id' => $run->id,
                'first_seen_at' => $now,
                'last_seen_at' => $now,
                'observations' => 1,
            ]);

            return true;
        });
    }

    /** Purgée, `do_not_contact`, ou d'un annonceur qui a dit STOP : la collecte ne la suit plus (ADR-0080 § 3). */
    public static function silenced(RadarListing $listing): bool
    {
        if (in_array($listing->stage, [RadarListingStage::Purged, RadarListingStage::DoNotContact], true)) {
            return true;
        }

        return $listing->radar_advertiser_id !== null && RadarAdvertiser::query()
            ->whereKey($listing->radar_advertiser_id)
            ->whereNotNull('do_not_contact_at')
            ->exists();
    }

    /**
     * L'état observé : la carte, complétée par la lecture.
     *
     * @return array<string, mixed>
     */
    private function observedState(RadarListing $listing, ListCard $card): array
    {
        $read = RadarReviewFields::values($listing->extracted ?? []);
        $number = fn (mixed $v) => is_int($v) || is_float($v) || (is_string($v) && is_numeric($v)) ? $v : null;
        $title = $card->title !== null ? trim((string) preg_replace('/\s+/u', ' ', mb_strtolower($card->title))) : '';

        return [
            'price' => $card->price ?? ($number($read['price']) !== null && $read['price'] > 0 ? (int) $read['price'] : null),
            'rent_period' => $card->rentPeriod ?? self::string($read['rent_period']),
            'contract' => $card->contract ?? self::string($read['contract']),
            'property_type' => $card->propertyType ?? self::string($read['property_type']),
            'surface_m2' => $card->surfaceM2 ?? $number($read['surface_m2']),
            'bedrooms' => $card->bedrooms ?? (is_numeric($read['bedrooms']) ? (int) $read['bedrooms'] : null),
            'neighborhood_label' => $card->location !== null ? mb_substr($card->location, 0, 160) : self::string($read['neighborhood'], 160),
            'geo_neighborhood_id' => is_int($read['neighborhood_id']) ? $read['neighborhood_id'] : null,
            'city' => self::string($read['city'], 120),
            'title_fingerprint' => $title !== '' ? hash('sha256', $title) : null,
        ];
    }

    /** @param  array<string, mixed>  $observed */
    private function changed(RadarListingSnapshot $latest, array $observed): bool
    {
        foreach (self::CHANGES as $column) {
            $before = $latest->{$column};
            $now = $observed[$column];
            if ($before === null || $now === null) {
                continue;
            }
            $differs = $column === 'price' ? (float) $before !== (float) $now : $before !== $now;
            if ($differs) {
                return true;
            }
        }

        return false;
    }

    private static function string(mixed $value, int $max = 40): ?string
    {
        return is_string($value) && trim($value) !== '' ? mb_substr(trim($value), 0, $max) : null;
    }
}
