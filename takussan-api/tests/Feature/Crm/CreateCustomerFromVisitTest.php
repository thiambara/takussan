<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2716 (décision du porteur du 2026-11-11, option a) — « Créer sa fiche » depuis une visite
 * rattache la visite à la fiche créée : `POST /api/customers` accepte `property_visit_id` et le
 * rattache dans la transaction de création, sous verrou de la visite. La règle est celle de l'agence
 * DU BIEN (`PropertyVisitPolicy::refusDeLaFicheDepuisLaVisite`), que `abilities.create_customer` de la
 * lecture de détail rend telle quelle.
 */
class CreateCustomerFromVisitTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $a;

    private Agency $b;

    private Property $bien;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = Agency::factory()->create();
        $this->b = Agency::factory()->create();
        $this->bien = Property::factory()->create(['agency_id' => $this->a->id]);
        // La visite « anonyme » : un visiteur sans compte ni fiche.
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => null,
            'customer_id' => null,
            'visitor_name' => 'Awa Diop',
            'visitor_phone' => '+221771234567',
            'visitor_email' => 'awa@exemple.sn',
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subDay(),
        ]);
    }

    /** @param  array<string, mixed>  $plus */
    private function creer(User $as, array $plus = [], array $entetes = []): TestResponse
    {
        return $this->actingAsApi($as)->withHeaders($entetes)->postJson('/api/customers', $plus + [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221771234567',
            'property_visit_id' => $this->visite->id,
        ]);
    }

    /**
     * `abilities.create_customer` de la lecture de détail ; `false` pour un lecteur à qui la visite
     * est refusée (403) — il n'a pas de « Créer sa fiche » à se voir offrir.
     */
    private function peutCreer(User $as, array $entetes = []): bool
    {
        $reponse = $this->actingAsApi($as)->withHeaders($entetes)->getJson("/api/property-visits/{$this->visite->id}");
        if ($reponse->status() === 403) {
            return false;
        }

        return $reponse->assertOk()->json('data.abilities.create_customer');
    }

    /** AC1 — l'agent de A crée la fiche : 201, la visite la désigne, et la fiche liste la visite. */
    public function test_ac1_l_agent_de_l_agence_du_bien_cree_et_rattache(): void
    {
        $agent = $this->agencyAgent($this->a);
        $this->assertTrue($this->peutCreer($agent));

        // Une fiche sous un autre nom, un autre numéro et une autre adresse que ceux saisis sur la visite :
        // sinon, « rien d'autre n'est réécrit » ne pourrait rien distinguer (vérification adverse).
        $fiche = $this->creer($agent, [
            'first_name' => 'Aïssatou',
            'last_name' => 'Diop Ndiaye',
            'phone' => '+221776543210',
            'email' => 'aissatou.ndiaye@exemple.sn',
        ])->assertCreated()->json('data.id');

        $this->assertSame($fiche, $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()->json('data.customer_id'));
        $this->assertSame($this->a->id, (int) Customer::query()->findOrFail($fiche)->agency_id);
        $visitesDeLaFiche = array_column($this->getJson("/api/property-visits?filter[customer_id]={$fiche}")->assertOk()->json('data'), 'id');
        $this->assertSame([$this->visite->id], $visitesDeLaFiche);
        // Le rattachement ne réécrit rien d'autre de la visite.
        $v = $this->visite->fresh();
        $this->assertSame(['Awa Diop', '+221771234567', 'awa@exemple.sn'], [$v->visitor_name, $v->visitor_phone, $v->visitor_email]);
        // Rattachée, elle ne s'offre plus.
        $this->assertFalse($this->peutCreer($agent));
    }

    /**
     * AC2 — le compte à double casquette (personnel de B, bailleur du bien de V dans A), sous son
     * profil de B : `create_customer = false`, le POST refusé, aucune fiche dans B, V sans fiche.
     */
    public function test_ac2_la_double_casquette_ne_fait_pas_de_fiche_dans_son_autre_agence(): void
    {
        $double = $this->agencyAgent($this->b);
        $this->bien->forceFill(['user_id' => $double->id])->save();
        $this->materializeRoleProfile($double, 'owner', $this->a);
        $profilB = ['X-Profile-Id' => 'agent:'.AgentProfile::query()->where('user_id', $double->id)->where('agency_id', $this->b->id)->value('id')];
        $fichesDeB = Customer::query()->where('agency_id', $this->b->id)->count();

        $this->assertFalse($this->peutCreer($double, $profilB));
        $this->creer($double, [], $profilB)->assertStatus(403)->assertJsonPath('code', 'visit.staff_only');

        $this->assertSame($fichesDeB, Customer::query()->where('agency_id', $this->b->id)->count());
        $this->assertNull($this->visite->fresh()->customer_id);
    }

    /** AC3 — V déjà rattachée à F : `create_customer = false`, 422, aucune fiche neuve, V garde F. */
    public function test_ac3_une_visite_rattachee_ne_l_est_jamais_a_une_autre_fiche(): void
    {
        $agent = $this->agencyAgent($this->a);
        $f = Customer::factory()->create(['agency_id' => $this->a->id]);
        $this->visite->forceFill(['customer_id' => $f->id])->save();
        $avant = Customer::query()->count();

        $this->assertFalse($this->peutCreer($agent));
        $this->creer($agent)->assertStatus(422)->assertJsonPath('code', 'visit.customer_already_linked');

        $this->assertSame($avant, Customer::query()->count());
        $this->assertSame($f->id, (int) $this->visite->fresh()->customer_id);
    }

    /** AC4 — doublon de téléphone : 409 sans rattachement ; `allow_duplicate=true` crée et rattache. */
    public function test_ac4_le_doublon_reste_rendu_avant_le_rattachement(): void
    {
        $agent = $this->agencyAgent($this->a);
        Customer::factory()->create(['agency_id' => $this->a->id, 'phone' => '+221771234567']);

        $this->creer($agent)->assertStatus(409)->assertJsonPath('code', 'customer.duplicate');
        $this->assertNull($this->visite->fresh()->customer_id);

        $fiche = $this->creer($agent, ['allow_duplicate' => true])->assertCreated()->json('data.id');
        $this->assertSame($fiche, (int) $this->visite->fresh()->customer_id);
    }

    /** Le personnel de A sous son profil de B : la fiche naîtrait dans B — 422, rien n'est créé. */
    public function test_la_fiche_ne_nait_pas_dans_une_autre_agence_que_celle_du_bien(): void
    {
        $agent = $this->agencyAgent($this->a);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->b->id]);
        $profilB = ['X-Profile-Id' => 'agent:'.AgentProfile::query()->where('user_id', $agent->id)->where('agency_id', $this->b->id)->value('id')];
        $avant = Customer::query()->count();

        $this->assertFalse($this->peutCreer($agent, $profilB));
        $this->creer($agent, [], $profilB)->assertStatus(422)->assertJsonPath('code', 'visit.agency_mismatch');

        $this->assertSame($avant, Customer::query()->count());
        $this->assertNull($this->visite->fresh()->customer_id);
    }

    /** Le bailleur d'un bien d'agence, le visiteur et le super-admin hors agence : jamais. */
    public function test_ni_le_bailleur_ni_le_visiteur_ni_le_super_admin(): void
    {
        $bailleur = User::factory()->create();
        $this->bien->forceFill(['user_id' => $bailleur->id])->save();
        $visiteur = User::factory()->create();
        $this->visite->forceFill(['visitor_id' => $visiteur->id])->save();
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');

        foreach (['bailleur' => $bailleur, 'visiteur' => $visiteur, 'super-admin' => $operateur] as $qui => $lecteur) {
            $this->assertFalse($this->peutCreer($lecteur), $qui);
        }
        $this->creer($operateur)->assertStatus(403)->assertJsonPath('code', 'visit.staff_only');
        $this->assertNull($this->visite->fresh()->customer_id);
    }

    /**
     * AC6 — la visite est verrouillée (`FOR UPDATE`) et rejugée dans la transaction de création, avant
     * le détecteur de doublons : une seconde création depuis la même visite y lit la fiche de la
     * première et rend `visit.customer_already_linked`, jamais une seconde fiche rattachée.
     */
    public function test_ac6_la_visite_est_verrouillee_et_rejugee_dans_la_transaction(): void
    {
        $agent = $this->agencyAgent($this->a);
        DB::enableQueryLog();
        $fiche = $this->creer($agent)->assertCreated()->json('data.id');
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        $verrou = collect($requetes)->search(fn (string $q) => str_contains($q, 'from "property_visits"') && str_contains($q, 'for update'));
        $creation = collect($requetes)->search(fn (string $q) => str_starts_with($q, 'insert into "customers"'));
        $this->assertNotFalse($verrou, 'la visite est lue sous verrou');
        $this->assertNotFalse($creation);
        $this->assertLessThan($creation, $verrou, 'le verrou précède la création de la fiche');

        // La seconde création, sans doublon de téléphone, est refusée par la visite et non par le détecteur.
        $this->creer($agent, ['phone' => '+221770000000', 'allow_duplicate' => true])
            ->assertStatus(422)->assertJsonPath('code', 'visit.customer_already_linked');
        $this->assertSame($fiche, (int) $this->visite->fresh()->customer_id);
    }
}
