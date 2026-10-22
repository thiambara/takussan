<?php

namespace Tests\Feature\Search;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\NullEngine;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * P129.04 (TCK-1277) — supprimer une agence retire ses biens de l'index, la restaurer les y
 * remet, comme une suspension et sa levée (ADR-0048 § 2). `AgencyObserver` ne réagissait qu'au
 * statut, et `SyncAgencyPropertiesSearchIndex` relisait l'agence sans `withTrashed()`.
 *
 * Le moteur est espionné, comme dans `AgencySuspensionSearchIndexTest` : le moteur `collection`
 * réévalue `shouldBeSearchable()` à chaque recherche, et serait vert sans le correctif. Son cas
 * est gardé à part, pour ce qu'il dit du compte (`totalHits`).
 */
class AgencyDeletionSearchIndexTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_supprimer_retire_les_biens_et_restaurer_les_remet(): void
    {
        $moteur = new class extends NullEngine
        {
            /** @var list<int> */
            public array $retires = [];

            /** @var list<int> */
            public array $indexes = [];

            public function update($models)
            {
                array_push($this->indexes, ...$models->whereInstanceOf(Property::class)->map->getKey()->all());
            }

            public function delete($models)
            {
                array_push($this->retires, ...$models->whereInstanceOf(Property::class)->map->getKey()->all());
            }
        };
        app(EngineManager::class)->extend('espion', fn () => $moteur);
        config(['scout.driver' => 'espion']);
        app(EngineManager::class)->forgetDrivers();

        $agence = $this->agence();
        $biens = collect([$this->bienDe($agence), $this->bienDe($agence)]);
        $voisin = $this->bienDe($this->agence());
        $moteur->retires = $moteur->indexes = [];

        $agence->delete();

        $this->assertEqualsCanonicalizing($biens->pluck('id')->all(), $moteur->retires);
        $this->assertNotContains($voisin->id, $moteur->retires);
        $this->assertSame([], $moteur->indexes);
        $moteur->retires = $moteur->indexes = [];

        $agence->restore();

        $this->assertEqualsCanonicalizing($biens->pluck('id')->all(), $moteur->indexes);
        $this->assertSame([], $moteur->retires);
    }

    public function test_sous_le_moteur_collection_l_agence_supprimee_ne_compte_aucun_bien(): void
    {
        config(['scout.driver' => 'collection']);
        app(EngineManager::class)->forgetDrivers();

        $agence = $this->agence();
        $this->bienDe($agence);
        $this->bienDe($agence);
        $voisin = $this->bienDe($this->agence());

        $agence->delete();

        $resultats = Property::search('')->paginate(50);
        $this->assertSame(1, $resultats->total());
        $this->assertSame([$voisin->id], collect($resultats->items())->pluck('id')->all());
    }
}
