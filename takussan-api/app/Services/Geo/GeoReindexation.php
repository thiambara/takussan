<?php

namespace App\Services\Geo;

use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
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
    /**
     * TCK-1452 (P90.02) — après le commit de la transaction ouverte (`TagCatalog::synchroniser`
     * réindexe dans la sienne) : annulée, elle ne laisse rien dans l'index. Hors transaction,
     * `DB::afterCommit()` exécute sur-le-champ.
     *
     * @param  list<int>  $ids
     */
    public function biens(array $ids): void
    {
        if ($ids === [] || ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }

        DB::afterCommit(fn () => $this->ecrire($ids));
    }

    /**
     * TCK-1155 (P89.01) — sur-le-champ, DANS la transaction de l'appelant : un moteur en panne lève,
     * et l'annule. Réservé au chargement du référentiel (`GeoReferentialLoader`,
     * `GeoReferentialSync`), qui réindexe en dernier dans sa transaction pour que le passage
     * suivant rejoue ce que l'échec a annulé. Après le commit, l'échec arriverait sur des noms déjà
     * validés, que le passage suivant ne verrait plus à renommer ni à rattacher.
     *
     * @param  list<int>  $ids
     */
    public function biensDansLaTransaction(array $ids): void
    {
        if ($ids === [] || ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }

        $this->ecrire($ids);
    }

    /** @param  list<int>  $ids */
    private function ecrire(array $ids): void
    {
        // TCK-1100 (P90.05) — ce que `shouldBeSearchable()` et `toSearchableArray()` lisent, chargé
        // d'avance comme dans `Property::makeAllSearchableUsing()` : sinon trois requêtes par bien.
        Property::query()
            ->with('address', 'tagsVisibles', 'agency')
            ->whereKey(array_values(array_unique($ids)))
            ->chunkById(200, function (Collection $biens) {
                $biens->filter->shouldBeSearchable()->searchable();
            });
    }
}
