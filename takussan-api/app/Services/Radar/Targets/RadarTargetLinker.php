<?php

namespace App\Services\Radar\Targets;

use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarListing;
use App\Models\RadarTarget;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2468 (ADR-0087 §5) — rattache une annonce extraite (ou validée) aux cibles actives dont elle remplit strictement les
 * critères ({@see RadarTargetMatcher::matchingTargets()}).
 *
 * Une synchronisation, pas un ajout : un lien vers une cible active que l'annonce ne remplit plus (la relecture a corrigé
 * le prix) est retiré ; les liens vers une cible en pause ou retirée restent (ils disent ce qu'elle a trouvé). Pour chaque
 * cible touchée, `matches_count` est RECOMPTÉ depuis le pivot (jamais incrémenté : deux extractions simultanées ne se
 * marchent pas dessus) et `last_matched_at` avance pour un lien neuf. `insertOrIgnore` : un lien déjà posé par un passage
 * concurrent n'est pas une erreur (piège PostgreSQL n° 1).
 *
 * Appelé après le commit de l'extraction par `App\Observers\RadarListingTargetObserver` — jamais dans la transaction de
 * `ExtractRadarListing`.
 */
final class RadarTargetLinker
{
    public const STAGES = [RadarListingStage::Extracted, RadarListingStage::Reviewed];

    public function __construct(private readonly RadarTargetMatcher $matcher) {}

    /** @return list<int> les cibles nouvellement rattachées */
    public function link(RadarListing $listing): array
    {
        if (! in_array($listing->stage, self::STAGES, true)) {
            return [];
        }

        $matching = $this->matcher->matchingTargets($listing)->pluck('id')->map(fn (mixed $id): int => (int) $id)->all();

        return DB::transaction(function () use ($listing, $matching): array {
            $now = now();
            $current = DB::table('radar_listing_target')
                ->join('radar_targets', 'radar_targets.id', '=', 'radar_listing_target.radar_target_id')
                ->where('radar_listing_target.radar_listing_id', $listing->id)
                ->where('radar_targets.status', RadarTargetStatus::Active->value)
                ->pluck('radar_listing_target.radar_target_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->all();

            $attach = array_values(array_diff($matching, $current));
            $detach = array_values(array_diff($current, $matching));

            if ($attach !== []) {
                DB::table('radar_listing_target')->insertOrIgnore(array_map(fn (int $id): array => [
                    'radar_listing_id' => $listing->id, 'radar_target_id' => $id, 'matched_at' => $now,
                ], $attach));
            }
            if ($detach !== []) {
                DB::table('radar_listing_target')->where('radar_listing_id', $listing->id)->whereIn('radar_target_id', $detach)->delete();
            }

            $touched = [...$attach, ...$detach];
            if ($touched !== []) {
                RadarTarget::query()->whereIn('id', $touched)->update([
                    'matches_count' => DB::raw('(select count(*) from radar_listing_target where radar_listing_target.radar_target_id = radar_targets.id)'),
                    'updated_at' => $now,
                ]);
            }
            if ($attach !== []) {
                RadarTarget::query()->whereIn('id', $attach)->update(['last_matched_at' => $now]);
            }

            return $attach;
        });
    }
}
