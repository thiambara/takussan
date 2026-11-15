<?php

namespace Tests\Feature\Crm;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Vérification adverse de TCK-2583/TCK-2588 — le dernier contact (`last_contacted_at`) et la relance
 * (`follow_up`) d'une fiche sont nourris par les visites et les comptes rendus de TOUS les biens de
 * l'agence. Le bailleur auteur d'une fiche y lisait l'heure exacte d'un compte rendu déposé sur le
 * bien d'un AUTRE bailleur — par le champ, par `filter[follow_up]`, et par les tris
 * `last_contacted_at` / `follow_up_days`. Ils sont au seul personnel de l'agence de la fiche.
 */
class CustomerContactFactsStaffOnlyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private User $bailleurAuteur;

    private User $agent;

    /** Contactée hier (le compte rendu d'une visite sur le bien d'un autre bailleur), créée la dernière. */
    private Customer $contactee;

    /** Jamais contactée, créée la première : relance `no_contact` due. */
    private Customer $jamaisContactee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));

        $agence = $this->agence();
        $this->bailleurAuteur = $this->bailleur($agence);
        $this->agent = $this->personnel($agence, 'agency_admin');

        $this->jamaisContactee = $this->fiche($agence, '2026-10-01 09:00:00', null);
        $this->contactee = $this->fiche($agence, '2026-10-02 09:00:00', '2026-11-08 17:42:13');
    }

    private function fiche($agence, string $creee, ?string $dernierContact): Customer
    {
        $fiche = $this->ficheClient($agence, null, [
            'added_by_id' => $this->bailleurAuteur->id,
            'pipeline_stage' => CustomerPipelineStage::Lead,
        ]);
        $fiche->forceFill([
            'created_at' => Carbon::parse($creee),
            'last_contacted_at' => $dernierContact !== null ? Carbon::parse($dernierContact) : null,
        ])->saveQuietly();

        return $fiche;
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return collect($this->getJson('/api/customers?fields[customers]=id&per_page=100'.$query)->assertOk()->json('data'))
            ->pluck('id')->all();
    }

    public function test_le_bailleur_auteur_ne_lit_ni_le_dernier_contact_ni_la_relance(): void
    {
        Sanctum::actingAs($this->bailleurAuteur);

        $fiche = $this->getJson("/api/customers/{$this->contactee->id}?fields[customers]=id,last_contacted_at,follow_up")
            ->assertOk()->json('data');
        $this->assertNull($fiche['last_contacted_at']);
        $this->assertNull($fiche['follow_up'] ?? null);

        $lignes = collect($this->getJson('/api/customers?fields[customers]=id,last_contacted_at,follow_up&per_page=100')
            ->assertOk()->json('data'));
        $this->assertSame([null, null], $lignes->pluck('last_contacted_at')->all());
        $this->assertSame([null, null], $lignes->map(fn (array $l) => $l['follow_up'] ?? null)->all());
    }

    public function test_le_filtre_de_relance_suit_ce_que_le_bailleur_lit(): void
    {
        Sanctum::actingAs($this->bailleurAuteur);

        $this->assertSame([], $this->ids('&filter[follow_up]=1'));
        $this->assertEqualsCanonicalizing(
            [$this->contactee->id, $this->jamaisContactee->id],
            $this->ids('&filter[follow_up]=0'),
        );
    }

    public function test_les_tris_du_bailleur_retombent_sur_la_date_de_creation(): void
    {
        Sanctum::actingAs($this->bailleurAuteur);

        $parCreation = $this->ids('&sort=created_at');
        $this->assertSame([$this->jamaisContactee->id, $this->contactee->id], $parCreation);

        foreach (['last_contacted_at', 'follow_up_days'] as $tri) {
            $this->assertSame($parCreation, $this->ids("&sort={$tri}"), $tri);
            $this->assertSame(array_reverse($parCreation), $this->ids("&sort=-{$tri}"), "-{$tri}");
        }
    }

    public function test_le_personnel_de_l_agence_lit_dernier_contact_relance_filtre_et_tris(): void
    {
        Sanctum::actingAs($this->agent);

        $fiche = $this->getJson("/api/customers/{$this->contactee->id}?fields[customers]=id,last_contacted_at,follow_up")
            ->assertOk()->json('data');
        $this->assertSame('2026-11-08T17:42:13+00:00', $fiche['last_contacted_at']);

        $relance = collect($this->getJson('/api/customers?fields[customers]=id,follow_up&per_page=100')->assertOk()->json('data'))
            ->firstWhere('id', $this->jamaisContactee->id)['follow_up'];
        $this->assertSame('no_contact', $relance['reason']);

        $this->assertSame([$this->jamaisContactee->id], $this->ids('&filter[follow_up]=1'));
        // Trié par dernier contact : la fiche contactée d'abord, la jamais contactée en dernier.
        $this->assertSame([$this->contactee->id, $this->jamaisContactee->id], $this->ids('&sort=last_contacted_at'));
    }

    /**
     * Contre-vérification n° 2 — un compte PERSONNEL d'une agence A et bailleur auteur dans une agence
     * B : la ressource tenait fiche par fiche, mais la liste le jugeait en bloc. Ni le tri du dernier
     * contact, ni le filtre, ni le tri de la relance ne bougent quand l'agence B dépose un compte
     * rendu sur le bien d'un AUTRE bailleur de B.
     */
    public function test_le_compte_personnel_ailleurs_et_bailleur_auteur_ici_ne_lit_rien_de_plus(): void
    {
        Notification::fake();
        $agenceA = $this->agence();
        $agenceB = $this->agence();
        $double = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $agenceA->id]);
        OwnerProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $agenceB->id]);
        $double = $double->fresh();
        $agentB = $this->personnel($agenceB);

        $f2 = $this->ficheClient($agenceB, null, ['added_by_id' => $double->id, 'pipeline_stage' => CustomerPipelineStage::Prospect]);
        $f2->forceFill(['created_at' => Carbon::parse('2026-10-30 09:00:00')])->saveQuietly();
        $f1 = $this->ficheClient($agenceB, null, ['added_by_id' => $double->id, 'pipeline_stage' => CustomerPipelineStage::Prospect]);
        $f1->forceFill(['created_at' => Carbon::parse('2026-10-31 09:00:00')])->saveQuietly();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($agenceB, $this->bailleur($agenceB))->id, 'customer_id' => $f1->id,
            'agent_id' => $agentB->id, 'status' => VisitStatus::Confirmed, 'scheduled_at' => now()->subHours(3),
        ]);

        $lire = function () use ($double, $f1): array {
            Sanctum::actingAs($double);

            return [
                'tri' => $this->ids('&sort=last_contacted_at'),
                '-tri' => $this->ids('&sort=-last_contacted_at'),
                'relance' => $this->ids('&filter[follow_up]=1'),
                'tri_relance' => $this->ids('&sort=-follow_up_days'),
                'champ' => $this->getJson("/api/customers/{$f1->id}?fields[customers]=id,last_contacted_at,follow_up")->assertOk()->json('data'),
            ];
        };

        Sanctum::actingAs($double);
        $this->getJson("/api/property-visits/{$visite->id}")->assertForbidden();
        $avant = $lire();

        Sanctum::actingAs($agentB);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested', 'note' => 'secret'])->assertCreated();
        $this->assertNotNull($f1->fresh()->last_contacted_at, 'le compte rendu a bien avancé le dernier contact');

        $this->assertSame($avant, $lire());
        $this->assertSame([], $avant['relance']);
        $this->assertNull($avant['champ']['last_contacted_at']);
    }
}
