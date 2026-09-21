<?php

namespace App\Services\Media;

use App\Models\Property;
use Illuminate\Pagination\AbstractPaginator;
use Illuminate\Support\Facades\DB;

/**
 * `Property::requiresWatermark()` pour un LOT de biens, en une requête au plus, sans charger
 * la relation `agency` (TCK-539, R2 de la seconde passe adverse).
 *
 * Deux défauts qu'avait la lecture par `$property->agency`, bien par bien :
 *
 * - **une requête par bien** dans toute liste où la trace ne suffit pas — agence sans filigrane,
 *   photo qui attend le worker : 35 requêtes au lieu de 5 sur une page de 10 biens ;
 * - **la forme de la réponse changeait** : la relation, une fois chargée, allume
 *   `relationLoaded('agency')` dans `PropertyResource`, et chaque élément de la liste publique
 *   recevait un bloc `agency` (plus une requête `avg(rating)`). Le contrat de la liste dépendait
 *   d'un réglage de l'agence.
 *
 * Ici, la lecture passe par `properties.id` — pas par l'attribut `agency_id`, qu'un
 * `fields[properties]=…` peut avoir retiré du SELECT : sans lui, `$property->agency` rendait
 * `null`, donc « pas de filigrane », donc la conversion nue servie. Elle est PARESSEUSE : un lot
 * dont toutes les photos sont dans la trace ne lit rien (`PublicPhotoUrl` passe une `Closure`).
 */
final class WatermarkRequirement
{
    /** @var array<int, bool>|null */
    private ?array $byProperty = null;

    /** @param  list<int>  $propertyIds */
    private function __construct(private readonly array $propertyIds) {}

    /**
     * Rattache un lot commun à chaque bien de `$properties` (collection, tableau ou paginateur).
     * Un bien dont `agency` est chargée ET digne de foi (`Property::agencyRelationIsReliable()`)
     * n'en a pas besoin : il la lit sans requête. Chargée sans `agency_id` sélectionné, elle vaut
     * `null` à tort — ce bien-là passe par le lot (troisième passe adverse, F1).
     */
    public static function attach(mixed $properties): void
    {
        $items = $properties instanceof AbstractPaginator ? $properties->getCollection() : collect($properties);

        $models = $items
            ->filter(fn (mixed $p) => $p instanceof Property && $p->getKey() !== null && ! $p->agencyRelationIsReliable())
            ->values();

        if ($models->isEmpty()) {
            return;
        }

        $batch = new self($models->map(fn (Property $p) => (int) $p->getKey())->unique()->values()->all());

        $models->each(fn (Property $p) => $p->useWatermarkRequirement($batch));
    }

    public static function single(Property $property): self
    {
        return new self([(int) $property->getKey()]);
    }

    public function for(Property $property): bool
    {
        $this->byProperty ??= $this->load();

        return $this->byProperty[(int) $property->getKey()] ?? false;
    }

    /** @return array<int, bool> */
    private function load(): array
    {
        if ($this->propertyIds === []) {
            return [];
        }

        // Une agence supprimée (soft delete) compte comme absente, comme le fait la relation.
        return DB::table('properties')
            ->leftJoin('agencies', fn ($join) => $join->on('agencies.id', '=', 'properties.agency_id')->whereNull('agencies.deleted_at'))
            ->whereIn('properties.id', $this->propertyIds)
            ->get(['properties.id as property_id', 'agencies.id as agency_id', 'agencies.settings'])
            ->mapWithKeys(fn (object $row) => [
                (int) $row->property_id => $row->agency_id !== null
                    && AgencyWatermarkContext::isEnabledInSettings(is_string($row->settings) ? json_decode($row->settings, true) : null),
            ])
            ->all();
    }
}
