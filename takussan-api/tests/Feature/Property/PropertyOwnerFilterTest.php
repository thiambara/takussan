<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2905 (AC1) — `GET /api/properties?filter[owner_profile_id]=…` : les biens d'un profil bailleur, qu'il
 * ait un compte (`user_id`, dans l'agence du profil) ou qu'il soit invité sans compte
 * (`pending_owner_profile_id`). Borné à l'agence du personnel : un profil d'une autre agence rend une liste
 * vide, 200, jamais une erreur.
 */
class PropertyOwnerFilterTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);
    }

    private function bien(array $attributes): Property
    {
        return Property::factory()->create($attributes + ['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
    }

    /** @return list<int> */
    private function ids(int|string $profileId, ?User $as = null): array
    {
        return collect($this->actingAsApi($as ?? $this->agent)
            ->getJson("/api/properties?filter[owner_profile_id]={$profileId}&fields[properties]=id&per_page=50")
            ->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    public function test_ac1_les_biens_du_bailleur_avec_compte_et_ceux_saisis_pour_lui_invite(): void
    {
        $bailleur = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $sien = $this->bien(['user_id' => $bailleur->id]);
        $autre = $this->bien([]);

        $invite = OwnerProfile::factory()->draft()->create(['agency_id' => $this->agency->id]);
        $saisiPourLui = $this->bien(['pending_owner_profile_id' => $invite->id]);

        $this->assertSame([$sien->id], $this->ids($profil->id));
        // Le profil invité n'a pas de compte : son filtre ne ramasse pas les biens sans `user_id` ni l'auteur.
        $this->assertSame([$saisiPourLui->id], $this->ids($invite->id));
        $this->assertNotContains($autre->id, $this->ids($profil->id));
    }

    public function test_le_compte_du_bailleur_ne_fuit_pas_vers_ses_biens_d_une_autre_agence(): void
    {
        $bailleur = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $ailleurs = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $ailleurs->id]);
        $ici = $this->bien(['user_id' => $bailleur->id]);
        Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $ailleurs->id]);
        Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => null]);

        // Vu par le bailleur lui-même (il lit ses trois biens) : le filtre ne garde que ceux de l'agence du profil.
        $this->assertSame([$ici->id], $this->ids($profil->id, $bailleur));
    }

    public function test_ac1_un_bailleur_d_une_autre_agence_rend_une_liste_vide(): void
    {
        $ailleurs = Agency::factory()->create();
        $etranger = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $etranger->id, 'agency_id' => $ailleurs->id]);
        // Un bien de l'agence de l'appelant au nom de ce compte : le profil d'ailleurs ne doit pas l'atteindre.
        $this->bien(['user_id' => $etranger->id]);

        $this->assertSame([], $this->ids($profil->id));
        // Inconnu : la même réponse, rien ne dit qu'un profil existe.
        $this->assertSame([], $this->ids(999_999));
    }

    public function test_un_identifiant_non_entier_rend_400_et_une_liste_vaut_un_filtre_absent(): void
    {
        $this->actingAsApi($this->agent)->getJson('/api/properties?filter[owner_profile_id]=abc')->assertStatus(400);

        $this->bien([]);
        $this->actingAsApi($this->agent)->getJson('/api/properties?filter[owner_profile_id][]=1&fields[properties]=id')
            ->assertOk()->assertJsonCount(1, 'data');
    }
}
