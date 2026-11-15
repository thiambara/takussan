<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\SettingScope;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2588 (ADR-0103 § 4) — la relance due : tâche échue, compte rendu manquant, ou fiche d'une
 * étape vivante sans contact depuis `crm.follow_up_days` jours ; la plus ancienne l'emporte ;
 * jamais pour `converted` ni `lost`. Calculée à la lecture, jamais stockée.
 */
class CustomerFollowUpTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    private function fiche(CustomerPipelineStage $etape, ?string $dernierContact = null, array $attributs = []): Customer
    {
        $fiche = $this->ficheClient($this->agence, null, $attributs + [
            'added_by_id' => $this->agent->id,
            'pipeline_stage' => $etape,
        ]);
        $fiche->forceFill([
            'created_at' => Carbon::parse('2026-10-01 09:00:00'),
            'last_contacted_at' => $dernierContact !== null ? Carbon::parse($dernierContact) : null,
        ])->saveQuietly();

        return $fiche;
    }

    private function tacheEchue(Customer $fiche, string $echeance): Task
    {
        return Task::factory()->forCustomer($fiche)->create([
            'created_by_id' => $this->agent->id,
            'assigned_to_id' => $this->agent->id,
            'due_at' => Carbon::parse($echeance),
        ]);
    }

    private function visiteSansCompteRendu(Customer $fiche, string $terminee): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => Carbon::parse($terminee)->subHour(),
            'completed_at' => Carbon::parse($terminee),
        ]);
    }

    private function referent(Customer $fiche, User $agent): void
    {
        UserCustomerRelationship::query()->create([
            'user_id' => $agent->id, 'customer_id' => $fiche->id, 'relationship_type' => 'agent_client',
            'status' => RelationshipStatus::Active, 'is_primary' => true,
        ]);
    }

    /** @return Collection<int, array<string, mixed>> */
    private function liste(string $query = '', ?User $lecteur = null)
    {
        Sanctum::actingAs($lecteur ?? $this->agent);

        return collect($this->getJson('/api/customers?fields[customers]=id,first_name,follow_up&per_page=100'.$query)
            ->assertOk()->json('data'));
    }

    /** @return array<string, mixed>|null */
    private function relance(Customer $fiche, ?User $lecteur = null): ?array
    {
        $ligne = $this->liste('', $lecteur)->firstWhere('id', $fiche->id);
        $this->assertNotNull($ligne);

        return $ligne['follow_up'];
    }

    /** AC2 — Yacine Diouf, en négociation, dernier contact il y a 9 jours, aucune tâche : `no_contact`, 9 jours ; à `lost` : rien. */
    public function test_ac2_sans_contact_depuis_neuf_jours_et_rien_quand_perdu(): void
    {
        $yacine = $this->fiche(CustomerPipelineStage::Negotiating, '2026-10-31 09:00:00', ['first_name' => 'Yacine', 'last_name' => 'Diouf']);

        $this->assertSame(
            ['reason' => 'no_contact', 'since' => '2026-10-31T09:00:00+00:00', 'days' => 9],
            $this->relance($yacine),
        );

        $yacine->forceFill(['pipeline_stage' => CustomerPipelineStage::Lost])->saveQuietly();
        $this->assertNull($this->relance($yacine));
    }

    public function test_sous_le_seuil_rien_et_le_seuil_se_regle_par_agence(): void
    {
        $recent = $this->fiche(CustomerPipelineStage::Lead, '2026-11-04 09:00:00');      // 5 jours
        $neuf = $this->fiche(CustomerPipelineStage::Qualified, '2026-10-31 09:00:00');   // 9 jours
        // Jamais contactée : le compte part de sa création (1er octobre).
        $jamais = $this->fiche(CustomerPipelineStage::Prospect);

        $this->assertNull($this->relance($recent));
        $this->assertSame(9, $this->relance($neuf)['days']);
        $this->assertSame(['reason' => 'no_contact', 'since' => '2026-10-01T09:00:00+00:00', 'days' => 39], $this->relance($jamais));

        Setting::query()->create([
            'key' => 'crm.follow_up_days', 'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
            'value' => ['value' => 10],
        ]);
        $this->assertNull($this->relance($neuf));
        $this->assertSame(39, $this->relance($jamais)['days']);
    }

    public function test_les_trois_raisons_et_la_plus_ancienne_l_emporte(): void
    {
        $tache = $this->fiche(CustomerPipelineStage::Lead, '2026-11-08 09:00:00');
        $this->tacheEchue($tache, '2026-11-06 09:00:00');

        $visite = $this->fiche(CustomerPipelineStage::Prospect, '2026-11-08 09:00:00');
        $this->visiteSansCompteRendu($visite, '2026-11-07 09:00:00');

        $toutes = $this->fiche(CustomerPipelineStage::Qualified, '2026-10-20 09:00:00');
        $this->tacheEchue($toutes, '2026-11-06 09:00:00');
        $this->visiteSansCompteRendu($toutes, '2026-11-07 09:00:00');

        $visiteAncienne = $this->fiche(CustomerPipelineStage::Qualified, '2026-11-08 09:00:00');
        $this->tacheEchue($visiteAncienne, '2026-11-08 08:00:00');
        $this->visiteSansCompteRendu($visiteAncienne, '2026-11-05 09:00:00');

        $this->assertSame(['reason' => 'overdue_task', 'since' => '2026-11-06T09:00:00+00:00', 'days' => 3], $this->relance($tache));
        $this->assertSame(['reason' => 'report_missing', 'since' => '2026-11-07T09:00:00+00:00', 'days' => 2], $this->relance($visite));
        $this->assertSame(['reason' => 'no_contact', 'since' => '2026-10-20T09:00:00+00:00', 'days' => 20], $this->relance($toutes));
        $this->assertSame('report_missing', $this->relance($visiteAncienne)['reason']);
    }

    /** `converted` et `lost` ne se relancent jamais, même avec une tâche échue. */
    public function test_gagnee_et_perdue_jamais(): void
    {
        foreach ([CustomerPipelineStage::Converted, CustomerPipelineStage::Lost] as $etape) {
            $fiche = $this->fiche($etape, '2026-09-01 09:00:00');
            $this->tacheEchue($fiche, '2026-11-01 09:00:00');
            $this->assertNull($this->relance($fiche), $etape->value);
        }
    }

    /** `filter[follow_up]=1` rend exactement les fiches dont `follow_up` n'est pas nul ; `=0`, les autres. */
    public function test_le_filtre_suit_exactement_l_attribut(): void
    {
        $this->fiche(CustomerPipelineStage::Lead, '2026-11-08 09:00:00');
        $this->fiche(CustomerPipelineStage::Negotiating, '2026-10-20 09:00:00');
        $this->fiche(CustomerPipelineStage::Lost, '2026-09-01 09:00:00');
        $this->tacheEchue($this->fiche(CustomerPipelineStage::Lead, '2026-11-08 09:00:00'), '2026-11-07 09:00:00');

        $toutes = $this->liste();
        $attendues = $toutes->filter(fn (array $l) => $l['follow_up'] !== null)->pluck('id')->sort()->values()->all();
        $this->assertCount(2, $attendues);

        $this->assertSame($attendues, $this->liste('&filter[follow_up]=1')->pluck('id')->sort()->values()->all());
        $this->assertSame(
            $toutes->filter(fn (array $l) => $l['follow_up'] === null)->pluck('id')->sort()->values()->all(),
            $this->liste('&filter[follow_up]=0')->pluck('id')->sort()->values()->all(),
        );
    }

    /** AC3 — mes relances, la plus en retard d'abord. */
    public function test_ac3_mes_relances_la_plus_en_retard_d_abord(): void
    {
        $collegue = $this->personnel($this->agence);

        $neufJours = $this->fiche(CustomerPipelineStage::Negotiating, '2026-10-31 09:00:00');
        $vingtJours = $this->fiche(CustomerPipelineStage::Lead, '2026-10-20 09:00:00');
        $aJour = $this->fiche(CustomerPipelineStage::Lead, '2026-11-08 09:00:00');
        $chezLeCollegue = $this->fiche(CustomerPipelineStage::Lead, '2026-10-01 09:00:00');
        foreach ([$neufJours, $vingtJours, $aJour] as $fiche) {
            $this->referent($fiche, $this->agent);
        }
        $this->referent($chezLeCollegue, $collegue);

        $this->assertSame(
            [$vingtJours->id, $neufJours->id],
            $this->liste('&filter[follow_up]=1&sort=-follow_up_days&filter[referent]=me')->pluck('id')->all(),
        );
        // Dans l'autre sens, la moins en retard d'abord ; les fiches sans relance en dernier.
        $this->assertSame(
            [$neufJours->id, $vingtJours->id, $aJour->id],
            $this->liste('&sort=follow_up_days&filter[referent]=me')->pluck('id')->all(),
        );
    }

    /** `filter[stage_group]=active` : lead, prospect, qualifié, négociation. */
    public function test_groupe_d_etapes_vivantes(): void
    {
        $vivantes = collect([CustomerPipelineStage::Lead, CustomerPipelineStage::Prospect, CustomerPipelineStage::Qualified, CustomerPipelineStage::Negotiating])
            ->map(fn ($e) => $this->fiche($e)->id)->sort()->values()->all();
        $this->fiche(CustomerPipelineStage::Converted);
        $this->fiche(CustomerPipelineStage::Lost);

        $this->assertSame($vivantes, $this->liste('&filter[stage_group]=active')->pluck('id')->sort()->values()->all());

        Sanctum::actingAs($this->agent);
        $this->getJson('/api/customers?filter[stage_group]=dormant')->assertStatus(422);
    }

    /**
     * Le bailleur qui a ajouté une fiche d'agence la lit (TCK-591 §9) : les comptes rendus sont du
     * seul personnel (ADR-0101), une visite à clore n'est donc pas une raison pour lui.
     */
    public function test_le_bailleur_auteur_ne_voit_pas_le_compte_rendu_manquant(): void
    {
        $bailleur = $this->bailleur($this->agence);
        $fiche = $this->fiche(CustomerPipelineStage::Lead, '2026-11-08 09:00:00', ['added_by_id' => $bailleur->id]);
        $this->visiteSansCompteRendu($fiche, '2026-11-07 09:00:00');

        $this->assertSame('report_missing', $this->relance($fiche)['reason']);
        $this->assertNull($this->relance($fiche, $bailleur));
        $this->assertSame([], $this->liste('&filter[follow_up]=1', $bailleur)->pluck('id')->all());
    }
}
