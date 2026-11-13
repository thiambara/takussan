<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2648 — la fiche d'un état des lieux (`GET /api/inventories/{id}`, `forViewer`) sert :
 *
 * - `abilities.dispute` : `InventoryPolicy::dispute` appelée en direct (sans `Gate::before`), sur un
 *   état des lieux à signer ou signé ; vrai pour le locataire et le bailleur, faux pour le personnel,
 *   l'admin et le super-admin, et faux en brouillon ;
 * - `tenant` {id, full_name, first_name}, `landlord` {id, full_name}, et les signataires
 *   `tenant_signed_via`, `owner_signed_by`, `owner_signed_on_behalf_of` {id, full_name} ;
 * - jamais un téléphone ni un e-mail.
 */
class InventoryFicheNommeeTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    private Agency $agency;

    private User $owner;

    private User $tenantUser;

    private Customer $tenant;

    private User $agent;

    private Inventory $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create([
            'first_name' => 'Awa', 'last_name' => 'Ndiaye', 'email' => 'awa.bailleur@example.com', 'phone' => '+221770000001',
        ]);
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);
        $this->tenantUser = User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => now(), 'email' => 'moussa.compte@example.com']);
        $this->tenant = Customer::factory()->create([
            'user_id' => $this->tenantUser->id, 'first_name' => 'Moussa', 'last_name' => 'Diop',
            'phone' => '+221779876543', 'email' => 'moussa.fiche@example.com',
        ]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $this->tenant->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->agent->forceFill(['first_name' => 'Fatou', 'last_name' => 'Sarr', 'email' => 'fatou.agent@example.com'])->save();
        $this->inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $this->tenant->id,
            'conducted_by' => $this->agent->id,
            'status' => InventoryStatus::Draft,
        ]);
    }

    private function fiche(User $as): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->getJson("/api/inventories/{$this->inventory->id}");
    }

    private function statut(InventoryStatus $status): void
    {
        $this->inventory->forceFill(['status' => $status])->save();
    }

    /** `abilities.dispute` : les parties, sur un état des lieux à signer ou signé ; jamais en brouillon. */
    public function test_contester_s_offre_aux_parties_hors_brouillon(): void
    {
        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');
        $personnel = [$this->agent, $this->agencyAdmin($this->agency), $superAdmin];

        foreach ([InventoryStatus::PendingSignature, InventoryStatus::Signed] as $status) {
            $this->statut($status);
            foreach ([$this->tenantUser, $this->owner] as $partie) {
                $this->fiche($partie)->assertOk()->assertJsonPath('data.abilities.dispute', true);
            }
            foreach ($personnel as $membre) {
                $this->fiche($membre)->assertOk()->assertJsonPath('data.abilities.dispute', false);
            }
        }

        foreach ([InventoryStatus::Draft, InventoryStatus::Disputed] as $status) {
            $this->statut($status);
            foreach ([$this->tenantUser, $this->owner] as $partie) {
                $this->fiche($partie)->assertOk()->assertJsonPath('data.abilities.dispute', false);
            }
        }

        // Ce que l'offre dit est ce que la route fait : le super-admin, à qui elle ne s'offre pas, est refusé.
        $this->statut(InventoryStatus::PendingSignature);
        Sanctum::actingAs($superAdmin);
        $this->postJson("/api/inventories/{$this->inventory->id}/dispute", ['reason' => 'Le sol était rayé.'])->assertForbidden();
    }

    /** Après une signature SUR PLACE (le locataire sur l'appareil de l'agent) et pour le compte du bailleur, les noms. */
    public function test_les_parties_et_les_signataires_sont_nommes_sans_coordonnees(): void
    {
        $this->statut(InventoryStatus::PendingSignature);
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/inventories/{$this->inventory->id}/sign/onsite-code")->assertStatus(202);
        $code = null;
        Notification::assertSentTo($this->tenantUser, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code) {
            $code = $n->code;

            return true;
        });
        $this->postJson("/api/inventories/{$this->inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE, 'code' => (string) $code])->assertOk();
        $this->postJson("/api/inventories/{$this->inventory->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE])->assertOk();

        foreach ([$this->agent, $this->tenantUser, $this->owner] as $lecteur) {
            $data = $this->fiche($lecteur)->assertOk()
                ->assertJsonPath('data.tenant', ['id' => $this->tenant->id, 'full_name' => 'Moussa Diop', 'first_name' => 'Moussa'])
                ->assertJsonPath('data.landlord', ['id' => $this->owner->id, 'full_name' => 'Awa Ndiaye'])
                ->assertJsonPath('data.tenant_signed_via', ['id' => $this->agent->id, 'full_name' => 'Fatou Sarr'])
                ->assertJsonPath('data.owner_signed_by', ['id' => $this->agent->id, 'full_name' => 'Fatou Sarr'])
                ->assertJsonPath('data.owner_signed_on_behalf_of', ['id' => $this->owner->id, 'full_name' => 'Awa Ndiaye'])
                ->json('data');

            $json = json_encode([$data['tenant'], $data['landlord'], $data['tenant_signed_via'], $data['owner_signed_by'], $data['owner_signed_on_behalf_of']]);
            foreach (['@example.com', '+22177', '77123', '77987'] as $coordonnee) {
                $this->assertStringNotContainsString($coordonnee, (string) $json);
            }
        }

        // Le bailleur qui signe lui-même : `owner_signed_on_behalf_of` nul, `owner_signed_by` lui-même.
        $this->inventory->forceFill(['owner_signed_by_user_id' => $this->owner->id, 'owner_signed_on_behalf_of_user_id' => null])->save();
        $this->fiche($this->owner)->assertOk()
            ->assertJsonPath('data.owner_signed_by', ['id' => $this->owner->id, 'full_name' => 'Awa Ndiaye'])
            ->assertJsonPath('data.owner_signed_on_behalf_of', null)
            // Chaque signataire se lit à SA colonne : celui du locataire reste l'agent.
            ->assertJsonPath('data.tenant_signed_via', ['id' => $this->agent->id, 'full_name' => 'Fatou Sarr']);
    }

    /** Un brouillon sans signature : les parties nommées, les signataires nuls. La liste ne sert aucun de ces champs. */
    public function test_sans_signature_les_signataires_sont_nuls_et_la_liste_ne_les_sert_pas(): void
    {
        $this->fiche($this->agent)->assertOk()
            ->assertJsonPath('data.tenant.first_name', 'Moussa')
            ->assertJsonPath('data.tenant_signed_via', null)
            ->assertJsonPath('data.owner_signed_by', null)
            ->assertJsonPath('data.owner_signed_on_behalf_of', null);

        $ligne = collect($this->getJson('/api/inventories?per_page=50')->assertOk()->json('data'))->firstWhere('id', $this->inventory->id);
        $this->assertNotNull($ligne);
        foreach (['tenant', 'landlord', 'tenant_signed_via', 'owner_signed_by', 'owner_signed_on_behalf_of'] as $cle) {
            $this->assertArrayNotHasKey($cle, $ligne, $cle);
        }
    }

    /** Le prestataire, et l'agent d'une autre agence, ne lisent pas la fiche (403). */
    public function test_le_prestataire_et_l_agent_d_une_autre_agence_recoivent_403(): void
    {
        $prestataire = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $prestataire->id]);
        $autre = $this->agencyAgent(Agency::factory()->create());

        foreach ([$prestataire, $autre] as $tiers) {
            $this->fiche($tiers)->assertForbidden();
        }
    }
}
