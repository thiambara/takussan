<?php

namespace App\Services\Public;

use App\Models\Agency;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Media\PublicPhotoUrl;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2518 — la vitrine d'une agence dans l'annuaire public : sa couverture, sa sélection, et ses
 * baux signés du mois. Par LOTS d'agences, parce que l'index en sert jusqu'à 48 par page.
 *
 * La règle commune, qui est celle du ticket et de toute lecture publique : **un bien non public
 * n'est jamais émis** — ni dans la sélection, ni par une photo de couverture. « Public » est
 * {@see Property::scopePublicPortfolio()}, le prédicat de l'annuaire et des fiches ; une sélection
 * qui désigne un bien devenu loué, archivé ou privé le saute, sans écriture.
 */
final class AgencyShowcase
{
    /** Le nombre de photos d'une couverture. */
    public const COVER_SIZE = 3;

    /**
     * Les biens récents examinés par agence pour compléter la couverture : un bien sans photo
     * servable est sauté, d'où une marge au-delà des trois.
     */
    private const RECENT_CANDIDATES = 9;

    /**
     * La couverture de chaque agence : trois photos de biens PUBLICS, la sélection d'abord (dans
     * son ordre), puis les biens les plus récents ; un bien sans photo servable est sauté.
     *
     * @param  iterable<Agency>  $agences
     * @return array<int, list<array{property_id: int, slug: string|null, photo_url: string}>>
     */
    public function covers(iterable $agences): array
    {
        $selections = [];
        foreach ($agences as $agence) {
            $selections[(int) $agence->id] = self::selection($agence);
        }
        if ($selections === []) {
            return [];
        }

        $recents = DB::query()
            ->fromSub(
                Property::query()->publicPortfolio()
                    ->whereIn('properties.agency_id', array_keys($selections))
                    ->select('properties.id', 'properties.agency_id')
                    ->selectRaw('ROW_NUMBER() OVER (PARTITION BY properties.agency_id ORDER BY properties.published_at DESC NULLS LAST, properties.created_at DESC, properties.id DESC) AS rang'),
                'r',
            )
            ->where('rang', '<=', self::RECENT_CANDIDATES)
            ->orderBy('agency_id')->orderBy('rang')
            ->get();

        $candidats = [];
        foreach ($selections as $agenceId => $ids) {
            $candidats[$agenceId] = $ids;
        }
        foreach ($recents as $ligne) {
            $candidats[(int) $ligne->agency_id][] = (int) $ligne->id;
        }

        $tous = array_values(array_unique(array_merge(...array_values($candidats))));
        $biens = $this->biensPublics($tous, array_keys($selections))->load('media', 'agency')->keyBy('id');

        $couvertures = [];
        foreach ($candidats as $agenceId => $ids) {
            $couverture = [];
            foreach (array_values(array_unique($ids)) as $id) {
                /** @var Property|null $bien */
                $bien = $biens->get($id);
                if ($bien === null || (int) $bien->agency_id !== $agenceId) {
                    continue;
                }
                $photo = $bien->getFirstMedia('photos');
                $url = $photo !== null ? PublicPhotoUrl::upTo($photo, 'preview', fn () => $bien->requiresWatermark()) : null;
                if ($url === null) {
                    continue;
                }
                $couverture[] = ['property_id' => (int) $bien->id, 'slug' => $bien->slug, 'photo_url' => $url];
                if (count($couverture) === self::COVER_SIZE) {
                    break;
                }
            }
            $couvertures[$agenceId] = $couverture;
        }

        return $couvertures;
    }

    /**
     * La sélection de l'agence encore publique, dans l'ordre choisi.
     *
     * @return Collection<int, Property>
     */
    public function showcase(Agency $agence): Collection
    {
        $ids = self::selection($agence);
        if ($ids === []) {
            return new Collection;
        }

        $biens = $this->biensPublics($ids, [(int) $agence->id])->load('address', 'media')->keyBy('id');

        return new Collection(array_values(array_filter(array_map(fn (int $id) => $biens->get($id), $ids))));
    }

    /**
     * Les baux signés depuis le 1er du mois, par agence — comptés à la lecture.
     *
     * @param  list<int>  $agenceIds
     * @return array<int, int>
     */
    public function leasesSignedThisMonth(array $agenceIds): array
    {
        if ($agenceIds === []) {
            return [];
        }

        $comptes = Lease::query()
            ->whereIn('agency_id', $agenceIds)
            ->where('signed_at', '>=', now()->startOfMonth())
            ->where('signed_at', '<=', now())
            ->groupBy('agency_id')
            ->selectRaw('agency_id, COUNT(*) AS n')
            ->pluck('n', 'agency_id');

        return array_replace(
            array_fill_keys($agenceIds, 0),
            $comptes->map(fn ($n) => (int) $n)->all(),
        );
    }

    /** @return list<int> les identifiants de la sélection, tels que l'agence les a rangés */
    private static function selection(Agency $agence): array
    {
        $ids = $agence->showcase_property_ids;

        return is_array($ids)
            ? array_values(array_unique(array_map('intval', array_filter($ids, 'is_numeric'))))
            : [];
    }

    /**
     * @param  list<int>  $ids
     * @param  list<int>  $agenceIds
     * @return Collection<int, Property>
     */
    private function biensPublics(array $ids, array $agenceIds): Collection
    {
        if ($ids === []) {
            return new Collection;
        }

        return Property::query()->publicPortfolio()
            ->whereIn('properties.id', $ids)
            ->whereIn('properties.agency_id', $agenceIds)
            ->get();
    }
}
