<?php

namespace App\Services\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2392 (AC3, AC7) — la fusion automatique des doublons entre sites : la même maison vue sur deux sites ne fait
 * qu'une fiche, avec deux provenances.
 *
 * **Qui est jugée** : une annonce TROUVÉE PAR LA COLLECTE (`discovered_by_run_id`), extraite (`extracted`, donc pas encore
 * relue par un humain), jamais jugée (`merge_checked_at` nul), dont les empreintes de photo sont calculées — ou dont le
 * calcul traîne depuis plus d'une heure. Une saisie d'opérateur n'est jamais fusionnée d'office : il voit ses rapprochements.
 *
 * **Avec qui** : le premier rapprochement de `RadarMatcher` qui est une annonce
 *  - `high` (deux signaux distincts, ou une photo à distance ≤ 1),
 *  - dont l'un des signaux désigne le BIEN — la photo, ou le lieu (quartier, prix, chambres) au moins `medium` et
 *    corroboré par un autre signal que le téléphone ({@see self::designatesTheProperty()}) : un même numéro et un même
 *    texte type désignent l'annonceur, et un annonceur porte plusieurs biens ;
 *  - plus ancienne (la fiche est la première vue), d'un AUTRE site (les doublons d'un même site restent à l'opérateur),
 *  - à une étape où elle fait foi : ni capturée, ni en échec, ni écartée, ni purgée, ni elle-même doublon.
 *
 * **Ce qui est écrit** : l'annonce passe `duplicate` de la fiche (`duplicate_of_listing_id`), `stage_reason`
 * `radar.merge.auto`, `merged_at`, les rapprochements figés comme pour un « doublon de » manuel. Dans tous les cas
 * `merge_checked_at` : une fusion n'est jugée qu'une fois — séparée par l'opérateur ({@see self::unmerge()}), elle n'est
 * pas retentée. **Éteinte par défaut** (`radar.merge.auto`, `RADAR_MERGE_AUTO`, ADR-0080) : faux, rien n'est fusionné,
 * rien n'est défait.
 */
final class RadarAutoMerge
{
    public const REASON = 'radar.merge.auto';

    /** Annonces jugées au plus par balayage : le matcher fait une douzaine de requêtes par annonce. */
    public const BATCH = 50;

    /** Les étapes où une annonce peut être la fiche d'une fusion. */
    private const TARGET_STAGES = [
        RadarListingStage::Extracted, RadarListingStage::Reviewed, RadarListingStage::Contacted,
        RadarListingStage::Consented, RadarListingStage::Published, RadarListingStage::Refused,
        RadarListingStage::DoNotContact,
    ];

    public function __construct(private readonly RadarMatcher $matcher) {}

    /** @return int le nombre d'annonces fusionnées */
    public function sweep(CarbonInterface $now): int
    {
        if (! config('radar.merge.auto', false)) {
            return 0;
        }

        $merged = 0;
        $candidates = RadarListing::query()
            ->whereNotNull('discovered_by_run_id')
            ->where('stage', RadarListingStage::Extracted->value)
            ->whereNull('merge_checked_at')
            ->orderBy('id')
            ->limit(self::BATCH)
            ->get();

        foreach ($candidates as $candidate) {
            $photosPending = $candidate->photoFingerprintStatus()['status'] === 'pending';
            if ($photosPending && $candidate->extracted_at !== null && $candidate->extracted_at->greaterThan($now->copy()->subHour())) {
                continue;
            }
            if ($this->judge($candidate, $now)) {
                $merged++;
            }
        }

        return $merged;
    }

    /** Vrai si l'annonce a été fusionnée. Les rapprochements se calculent hors verrou, comme pour un geste d'opérateur. */
    public function judge(RadarListing $candidate, CarbonInterface $now): bool
    {
        $matches = $this->matcher->matchesFor($candidate);
        $target = $this->targetAmong($candidate, $matches);

        return DB::transaction(function () use ($candidate, $matches, $target, $now): bool {
            $locked = RadarListing::query()->whereKey($candidate->id)->lockForUpdate()->first();
            if ($locked === null || $locked->stage !== RadarListingStage::Extracted || $locked->merge_checked_at !== null) {
                return false;
            }
            $locked->merge_checked_at = $now;

            // La fiche relue sous verrou : passée doublon ou écartée entre-temps, elle ne fait plus foi.
            $root = $target === null ? null : RadarListing::query()->whereKey($target)->lockForUpdate()->first();
            if ($root === null || ! in_array($root->stage, self::TARGET_STAGES, true)) {
                $locked->save();

                return false;
            }

            $locked->fill([
                'stage' => RadarListingStage::Duplicate,
                'stage_reason' => self::REASON,
                'duplicate_of_listing_id' => $root->id,
                'duplicate_of_property_id' => null,
                'merged_at' => $now,
                'matches' => $matches,
            ])->save();
            // Comme « doublon de » : celles qui pointaient vers cette annonce suivent la fiche, aucune chaîne ne se forme.
            RadarListing::query()->where('duplicate_of_listing_id', $locked->id)->update(['duplicate_of_listing_id' => $root->id]);

            activity('Admin')
                ->performedOn($locked)
                ->withProperties(['of_listing_id' => $root->id, 'signals' => $this->signalsOf($matches, $root->id)])
                ->event('radar_listing_auto_merged')
                ->log('Annonce du Radar fusionnée automatiquement');

            return true;
        });
    }

    /**
     * Séparer une fusion AUTOMATIQUE : l'annonce revient à `extracted`, sans lien ; `merge_checked_at` reste, la fusion
     * n'est pas retentée. Une fusion posée à la main (sans `merged_at`) ne se sépare pas ici : 409.
     */
    public function unmerge(RadarListing $listing, User $by): RadarListing
    {
        return DB::transaction(function () use ($listing, $by): RadarListing {
            $locked = RadarListing::query()->whereKey($listing->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->stage === RadarListingStage::Duplicate && $locked->merged_at !== null, 409, 'radar.merge.not_automatic');

            $of = $locked->duplicate_of_listing_id;
            $locked->fill([
                'stage' => RadarListingStage::Extracted,
                'stage_reason' => null,
                'duplicate_of_listing_id' => null,
                'merged_at' => null,
                'matches' => [],
            ])->save();

            activity('Admin')
                ->causedBy($by)
                ->performedOn($locked)
                ->withProperties(['of_listing_id' => $of])
                ->event('radar_listing_unmerged')
                ->log('Fusion automatique du Radar séparée');

            return $locked->refresh();
        });
    }

    /** @param  list<array<string, mixed>>  $matches */
    private function targetAmong(RadarListing $candidate, array $matches): ?int
    {
        $eligible = [];
        foreach ($matches as $match) {
            if ($match['kind'] === 'listing' && $match['strength'] === 'high' && $match['id'] < $candidate->id
                && self::designatesTheProperty($match['signals'])) {
                $eligible[] = $match['id'];
            }
        }
        if ($eligible === []) {
            return null;
        }

        // L'ordre du matcher (force, nombre de signaux) est gardé ; seuls comptent un autre site et une étape qui fait foi.
        $targets = RadarListing::query()->whereIn('id', $eligible)
            ->where('source_site', '!=', $candidate->source_site->value)
            ->whereIn('stage', array_map(fn (RadarListingStage $s) => $s->value, self::TARGET_STAGES))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();

        foreach ($eligible as $id) {
            if (in_array($id, $targets, true)) {
                return $id;
            }
        }

        return null;
    }

    /**
     * Un signal désigne le bien : la photo ; ou le lieu, s'il est au moins `medium` (prix à `RadarMatcher::PRICE_CLOSE`
     * près) ET corroboré par un signal qui n'est pas le téléphone. Un même annonceur publie souvent plusieurs lots du même
     * immeuble : son numéro plus un lieu lâche (±10 %, quartier et famille) ne disent pas que c'est le même bien.
     *
     * @param  list<array{signal: string, strength: string}>  $signals
     */
    private static function designatesTheProperty(array $signals): bool
    {
        $names = array_column($signals, 'signal');
        if (in_array(RadarMatcher::SIGNAL_PHOTO, $names, true)) {
            return true;
        }

        $place = null;
        foreach ($signals as $signal) {
            if ($signal['signal'] === RadarMatcher::SIGNAL_PLACE) {
                $place = $signal;
            }
        }
        if ($place === null || $place['strength'] === 'low') {
            return false;
        }

        return array_diff($names, [RadarMatcher::SIGNAL_PLACE, RadarMatcher::SIGNAL_PHONE]) !== [];
    }

    /**
     * @param  list<array<string, mixed>>  $matches
     * @return list<string>
     */
    private function signalsOf(array $matches, int $id): array
    {
        foreach ($matches as $match) {
            if ($match['kind'] === 'listing' && $match['id'] === $id) {
                return array_column($match['signals'], 'signal');
            }
        }

        return [];
    }
}
