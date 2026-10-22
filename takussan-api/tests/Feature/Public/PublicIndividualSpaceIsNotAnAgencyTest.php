<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1313 (P85.04) — un espace `individual` n'est pas une agence de l'annuaire public.
 *
 * L'espace d'un hôte particulier, créé par « Publier », entrait dans `GET /api/public/agencies`
 * et avait sa fiche sous `/api/public/agencies/{slug}` : le visiteur lisait une « agence » au nom
 * générique (« Espace de {prénom} ») à côté de la fiche de la même personne sous `/agents/{slug}`.
 * Les trois lectures publiques d'agence ne servent plus que les agences `standard`.
 *
 * Chaque test pose les DEUX sortes d'agence, actives, avec un bien publié : un filtre qui
 * refuserait tout rougit sur l'agence `standard`.
 */
class PublicIndividualSpaceIsNotAnAgencyTest extends TestCase
{
    use RefreshDatabase;

    private function agenceAvecUnBien(Agency $agence): void
    {
        $bien = Property::factory()->published()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agence->id,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
        ]);
    }

    /** @return array{0: Agency, 1: Agency} */
    private function lesDeux(): array
    {
        $espace = Agency::factory()->individual()->create(['slug' => 'espace-de-awa', 'status' => AgencyStatus::Active]);
        $agence = Agency::factory()->create(['slug' => 'agence-standard', 'status' => AgencyStatus::Active]);
        $this->agenceAvecUnBien($espace);
        $this->agenceAvecUnBien($agence);

        return [$espace, $agence];
    }

    public function test_l_annuaire_ne_liste_que_les_agences_standard(): void
    {
        $this->lesDeux();

        $slugs = collect($this->getJson('/api/public/agencies?per_page=48')->assertOk()->json('data'))
            ->pluck('slug')
            ->all();

        $this->assertContains('agence-standard', $slugs);
        $this->assertNotContains('espace-de-awa', $slugs);
    }

    public function test_un_espace_n_a_ni_fiche_ni_portefeuille_d_agence(): void
    {
        $this->lesDeux();

        $this->getJson('/api/public/agencies/espace-de-awa')->assertNotFound();
        $this->getJson('/api/public/agencies/espace-de-awa/properties')->assertNotFound();

        $this->getJson('/api/public/agencies/agence-standard')->assertOk();
        $this->getJson('/api/public/agencies/agence-standard/properties')->assertOk()->assertJsonCount(1, 'data');
    }
}
