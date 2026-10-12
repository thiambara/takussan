<?php

namespace App\Services\Geo;

use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;
use Laravel\Scout\ModelObserver;

/**
 * TCK-633 — réindexe les biens dont une adresse ou un équipement vient de changer de NOM.
 *
 * La recherche indexe des textes (`Property::toSearchableArray()` : `city`, `neighborhood`, noms
 * des tags) : renommer, fusionner ou rattacher sans réindexer laisserait l'ancien nom trouvable
 * et le nouveau introuvable.
 *
 * Elle suit la synchronisation des modèles : coupée (suite de tests hors recherche, `db:seed` sous
 * `SCOUT_DRIVER=null`), elle ne fait rien — c'est l'importation qui suivra qui indexera.
 */
final class GeoReindexation
{
    /** @param  list<int>  $ids */
    public function biens(array $ids): void
    {
        if ($ids === [] || ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }

        Property::query()->whereKey(array_values(array_unique($ids)))->chunkById(200, function (Collection $biens) {
            $biens->filter->shouldBeSearchable()->searchable();
        });
    }
}
