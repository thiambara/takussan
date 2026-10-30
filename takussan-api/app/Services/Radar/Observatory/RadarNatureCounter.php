<?php

namespace App\Services\Radar\Observatory;

use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarNatureCount;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2431 (ADR-0077 §9, ADR-0083) — les compteurs anonymes par nature. La purge remet la nature d'un annonceur sans annonce
 * restante à `unknown` (TCK-2391) : la part d'intermédiaires lue sur l'annonceur ne porte que sur les 90 derniers jours. Ce
 * compteur la fige chaque jour, AVANT la purge (`radar:count-natures` à 04:13, `radar:purge` à 04:15, et la purge le pose
 * elle-même en premier si le passage planifié a manqué).
 *
 * **Le périmètre est celui de la lecture vivante** ({@see self::live()}, que `RadarObservatory::natures()` lit aussi) :
 * annonceurs porteurs d'au moins une annonce non purgée et non doublon, et ces annonces.
 *
 * **Éteint par défaut** (`radar.nature_counts.enabled`, `RADAR_NATURE_COUNTS`) : la différence entre deux jours, avec la date
 * du STOP gardée, rend la nature présumée d'un annonceur qui a dit STOP (vérification adverse de TCK-2431). Éteint, rien ne
 * s'écrit ; le porteur l'allume après l'avis juridique de TCK-2434.
 *
 * **Idempotent** : `insertOrIgnore` sur (jour, nature). Une écriture rejouée le même jour ne double rien et garde le PREMIER
 * compte — celui d'avant la purge, même si `radar:count-natures` est relancé après elle.
 */
final class RadarNatureCounter
{
    /** Le fuseau du jour compté : celui du planificateur. */
    public const TIMEZONE = 'Africa/Dakar';

    public static function enabled(): bool
    {
        return config('radar.nature_counts.enabled') === true;
    }

    /** @return int les lignes écrites (4 la première fois du jour, 0 ensuite, 0 toujours si le comptage est éteint) */
    public function record(?CarbonInterface $now = null): int
    {
        if (! self::enabled()) {
            return 0;
        }

        $day = ($now ?? now())->copy()->setTimezone(self::TIMEZONE)->toDateString();
        $live = self::live();

        $rows = [];
        foreach (RadarAdvertiserNature::cases() as $nature) {
            $rows[] = [
                'day' => $day,
                'nature' => $nature->value,
                'advertisers' => $live[$nature->value]['advertisers'],
                'listings' => $live[$nature->value]['listings'],
            ];
        }

        return RadarNatureCount::query()->insertOrIgnore($rows);
    }

    /**
     * Les annonceurs et leurs annonces par nature présumée, à l'instant : toutes les natures, zéro compris. Une annonce sans
     * annonceur n'a pas de nature, elle ne compte pas.
     *
     * @return array<string, array{advertisers: int, listings: int}>
     */
    public static function live(): array
    {
        $rows = DB::table('radar_listings as l')
            ->join('radar_advertisers as a', 'a.id', '=', 'l.radar_advertiser_id')
            ->whereNull('l.duplicate_of_listing_id')
            ->where('l.stage', '!=', RadarListingStage::Purged->value)
            ->groupBy('a.nature')
            ->selectRaw('a.nature, count(distinct a.id) as advertisers, count(*) as listings')
            ->get()
            ->keyBy('nature');

        $out = [];
        foreach (RadarAdvertiserNature::cases() as $nature) {
            $row = $rows[$nature->value] ?? null;
            $out[$nature->value] = ['advertisers' => (int) ($row->advertisers ?? 0), 'listings' => (int) ($row->listings ?? 0)];
        }

        return $out;
    }
}
