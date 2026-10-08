<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\NullEngine;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0048 §2) — AC3 : l'index suit la suspension.
 *
 * `shouldBeSearchable()` lit le statut de l'agence, mais Scout ne réévalue un bien qu'à son propre
 * enregistrement : sans le job, les biens d'une agence suspendue RESTENT dans Meilisearch. Le
 * moteur est espionné, pas simulé par la collection — le moteur `collection` réévalue
 * `shouldBeSearchable()` à chaque recherche, et serait vert sans le job.
 */
class AgencySuspensionSearchIndexTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use OperateursPlateforme;
    use RefreshDatabase;

    private object $moteur;

    protected function setUp(): void
    {
        parent::setUp();

        $this->moteur = new class extends NullEngine
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
        $moteur = $this->moteur;
        app(EngineManager::class)->extend('espion', fn () => $moteur);
        config(['scout.driver' => 'espion']);
        app(EngineManager::class)->forgetDrivers();
    }

    public function test_suspendre_retire_les_biens_de_l_agence_et_lever_les_y_remet(): void
    {
        $agence = $this->agence();
        $publics = collect([$this->bienDe($agence), $this->bienDe($agence), $this->bienDe($agence)]);
        $brouillon = $this->bienDe($agence, public: false);
        $brouillon->forceFill(['status' => PropertyStatus::Draft])->save();
        $voisin = $this->bienDe($this->agence());
        $this->oublier();

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/agencies/{$agence->id}/suspend", ['reason' => 'Enquête en cours.'])->assertOk();

        $this->assertEqualsCanonicalizing([...$publics->pluck('id'), $brouillon->id], $this->moteur->retires);
        $this->assertNotContains($voisin->id, $this->moteur->retires);
        $this->assertSame([], $this->moteur->indexes);
        $this->oublier();

        $this->postJson("/api/admin/agencies/{$agence->id}/reinstate", ['reason' => 'Enquête close.'])->assertOk();

        $this->assertEqualsCanonicalizing($publics->pluck('id')->all(), $this->moteur->indexes, 'Le brouillon ne rentre pas.');
        $this->assertSame([], $this->moteur->retires);
    }

    /** Toute sortie d'`active` compte, pas seulement la suspension — `unverify` aussi. */
    public function test_desactiver_retire_aussi_et_un_changement_sans_effet_ne_touche_pas_l_index(): void
    {
        $agence = $this->agence();
        $bien = $this->bienDe($agence);
        $this->oublier();

        $agence->update(['name' => 'Nouveau nom']);
        $this->assertSame([], [...$this->moteur->retires, ...$this->moteur->indexes]);

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/agencies/{$agence->id}/unverify")->assertOk();

        $this->assertSame([$bien->id], $this->moteur->retires);
    }

    private function oublier(): void
    {
        $this->moteur->retires = [];
        $this->moteur->indexes = [];
    }
}
