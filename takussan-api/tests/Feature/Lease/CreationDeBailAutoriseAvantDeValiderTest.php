<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2767 — `POST /api/leases` juge le droit d'ouvrir un bail SUR CE BIEN avant les règles du
 * bail (`StoreLeaseRequest::authorize()` → `LeasePolicy::createOn`). `authorize()` rendait `true` :
 * l'appelant sans droit sur le bien recevait, pour un corps invalide, un 422 détaillant les règles,
 * et le 403 seulement pour un corps valide. Sa réponse dépendait de son corps, pas de son droit.
 *
 * Le corps invalide l'est sur deux champs que seule la validation nomme (`late_fee_percent` hors
 * borne, `type` inconnu). Le témoin (agent de A sur un bien de A) garde son 422 : un `authorize()`
 * qui refuserait tout le monde ne peut pas rendre ce fichier vert.
 */
class CreationDeBailAutoriseAvantDeValiderTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private User $agentA;

    private Property $bienA;

    private Property $bienB;

    private Customer $locataireA;

    protected function setUp(): void
    {
        parent::setUp();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $this->agentA = $this->agencyAgent($a);
        $this->bienA = $this->bienDe($a);
        $this->bienB = $this->bienDe($b);
        $this->locataireA = Customer::factory()->create(['agency_id' => $a->id, 'added_by_id' => $this->agentA->id]);
    }

    private function bienDe(Agency $agence): Property
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);

        return Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
    }

    /** @param  array<string, mixed>  $bien  la ou les clés `property_id` du corps ; vide = absente */
    private function corpsInvalide(User $qui, array $bien): TestResponse
    {
        $this->actingAsApi($qui);

        return $this->postJson('/api/leases', $bien + [
            'tenant_id' => $this->locataireA->id,
            'type' => 'x',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 400000,
            'late_fee_percent' => 99,
        ]);
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $reponse): array
    {
        return [$reponse->status(), $reponse->json()];
    }

    public function test_ac1_l_agent_de_a_sur_un_bien_de_b_recoit_403_sans_le_detail_des_regles(): void
    {
        $reponse = $this->corpsInvalide($this->agentA, ['property_id' => $this->bienB->id]);

        $reponse->assertForbidden();
        $this->assertArrayNotHasKey('errors', $reponse->json() ?? []);
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_ac2_un_bien_absent_mal_forme_ou_manquant_rend_le_corps_exact_du_bien_tiers(): void
    {
        $tiers = $this->verdict($this->corpsInvalide($this->agentA, ['property_id' => $this->bienB->id]));
        $this->assertSame(403, $tiers[0]);

        foreach ([
            'absent' => ['property_id' => self::ABSENT],
            'non entier' => ['property_id' => 'abc'],
            'zéro' => ['property_id' => 0],
            'tableau' => ['property_id' => [$this->bienA->id]],
            'manquant' => [],
        ] as $cas => $bien) {
            $this->assertSame($tiers, $this->verdict($this->corpsInvalide($this->agentA, $bien)), "property_id {$cas}");
        }
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_ac3_un_client_et_un_prestataire_recoivent_403_sur_n_importe_quel_bien(): void
    {
        $client = User::factory()->create();
        $prestataire = ServiceProviderProfile::factory()->create()->user;

        foreach (['client' => $client, 'prestataire' => $prestataire] as $qui => $appelant) {
            foreach ([$this->bienA, $this->bienB] as $bien) {
                $reponse = $this->corpsInvalide($appelant, ['property_id' => $bien->id]);
                $this->assertSame(403, $reponse->status(), "{$qui} sur le bien {$bien->id}");
                $this->assertArrayNotHasKey('errors', $reponse->json() ?? [], $qui);
            }
        }
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_ac4_l_agent_de_a_sur_un_bien_de_a_recoit_toujours_le_422_du_champ_en_faute(): void
    {
        $this->corpsInvalide($this->agentA, ['property_id' => $this->bienA->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['late_fee_percent', 'type']);
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_le_bailleur_du_bien_garde_aussi_son_422(): void
    {
        $this->corpsInvalide(User::query()->findOrFail($this->bienA->user_id), ['property_id' => $this->bienA->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['late_fee_percent']);
    }
}
