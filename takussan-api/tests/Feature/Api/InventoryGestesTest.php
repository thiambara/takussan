<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Inventory\GestesDeLEtatDesLieux;
use App\Services\Model\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-3011 (ADR-0139) — `abilities` d'un état des lieux : chaque geste que l'API accepterait MAINTENANT
 * pour CE lecteur, policy et état compris ({@see GestesDeLEtatDesLieux}). La fiche (`InventoryDetail`)
 * faisait `abilities.update && status` ; elle lit désormais `edit`, `submit`, `dispute`, et `can_sign_as`
 * ne nomme plus que les rôles qui peuvent encore signer.
 */
class InventoryGestesTest extends TestCase
{
    use RefreshDatabase;

    private User $bailleur;

    private User $locataire;

    private Lease $bail;

    protected function setUp(): void
    {
        parent::setUp();

        $agence = Agency::factory()->create();
        $this->bailleur = User::factory()->withOwnerProfile($agence)->create();
        $bien = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $agence->id]);
        $this->locataire = User::factory()->create();
        $client = Customer::factory()->create(['user_id' => $this->locataire->id]);
        $this->bail = Lease::factory()->create([
            'property_id' => $bien->id,
            'landlord_id' => $this->bailleur->id,
            'tenant_id' => $client->id,
            'agency_id' => $agence->id,
        ]);
    }

    /** @param  array<string, mixed>  $attributs */
    private function etat(array $attributs = []): Inventory
    {
        return Inventory::factory()->create([
            'lease_id' => $this->bail->id,
            'property_id' => $this->bail->property_id,
            'tenant_id' => $this->bail->tenant_id,
            'conducted_by' => $this->bailleur->id,
        ] + $attributs);
    }

    /** @return array<string, mixed> */
    private function fiche(User $lecteur, Inventory $etat): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/inventories/{$etat->id}")->assertOk()->json('data');
    }

    public function test_abilities_porte_une_cle_par_geste(): void
    {
        $this->assertSame(GestesDeLEtatDesLieux::GESTES, array_keys($this->fiche($this->bailleur, $this->etat())['abilities']));
    }

    public function test_un_brouillon_se_modifie_et_s_envoie_par_qui_le_conduit_seul(): void
    {
        $etat = $this->etat();

        $gestes = $this->fiche($this->bailleur, $etat)['abilities'];
        $this->assertTrue($gestes['edit']);
        $this->assertTrue($gestes['submit']);
        $this->assertFalse($gestes['dispute']);

        $gestes = $this->fiche($this->locataire, $etat)['abilities'];
        $this->assertFalse($gestes['edit']);
        $this->assertFalse($gestes['submit']);
    }

    public function test_a_signer_il_ne_se_modifie_plus_et_l_api_le_refuse(): void
    {
        $etat = $this->etat(['status' => InventoryStatus::PendingSignature]);

        $gestes = $this->fiche($this->bailleur, $etat)['abilities'];
        $this->assertTrue($gestes['update']);
        $this->assertFalse($gestes['edit']);
        $this->assertFalse($gestes['submit']);
        $this->assertTrue($gestes['dispute']);

        $this->postJson("/api/inventories/{$etat->id}/submit")->assertStatus(422);
        $this->patchJson("/api/inventories/{$etat->id}", ['notes' => 'x'])->assertStatus(422)->assertJsonPath('code', 'inventory.not_draft');
    }

    public function test_un_etat_conteste_ne_se_conteste_plus(): void
    {
        $this->assertFalse($this->fiche($this->locataire, $this->etat(['status' => InventoryStatus::Disputed]))['abilities']['dispute']);
    }

    public function test_can_sign_as_ne_nomme_que_les_roles_qui_peuvent_encore_signer(): void
    {
        $this->assertSame(['tenant'], $this->fiche($this->locataire, $this->etat(['status' => InventoryStatus::PendingSignature]))['can_sign_as']);
        $this->assertSame([], $this->fiche($this->locataire, $this->etat(['status' => InventoryStatus::PendingSignature, 'tenant_signed' => true]))['can_sign_as']);
        $this->assertSame([], $this->fiche($this->locataire, $this->etat(['status' => InventoryStatus::Signed]))['can_sign_as']);
    }

    /** Le prédicat de la clé est celui que l'écriture relit sous verrou : un brouillon chargé, puis contesté derrière lui. */
    public function test_l_envoi_en_signature_d_un_brouillon_perime_est_refuse_sous_verrou(): void
    {
        $etat = $this->etat();
        $perime = Inventory::query()->findOrFail($etat->id);
        Inventory::query()->whereKey($etat->id)->update(['status' => InventoryStatus::Disputed->value]);

        try {
            app(InventoryService::class)->submit($perime);
            $this->fail('Un état des lieux contesté ne s\'envoie pas en signature.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertSame(InventoryStatus::Disputed, Inventory::query()->findOrFail($etat->id)->status);
    }

    /**
     * TCK-1869 (P189.02) — `abilities.update` suit `InventoryPolicy::update` : le locataire et le bailleur
     * suspendu le lisent faux, et l'API les refuse en 403 (TCK-3017 : ex-InventoryAbilitiesTest).
     */
    public function test_abilities_update_suit_la_policy_pour_le_lecteur(): void
    {
        $etat = $this->etat(['status' => 'draft']);

        $this->assertTrue($this->fiche($this->bailleur, $etat)['abilities']['update']);

        $this->assertFalse($this->fiche($this->locataire, $etat)['abilities']['update']);
        $this->postJson("/api/inventories/{$etat->id}/submit")->assertForbidden();

        OwnerProfile::query()->where('user_id', $this->bailleur->id)->where('agency_id', $this->bail->agency_id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);

        $this->assertFalse($this->fiche($this->bailleur, $etat)['abilities']['update']);
        $this->postJson("/api/inventories/{$etat->id}/submit")->assertForbidden();
    }
}
