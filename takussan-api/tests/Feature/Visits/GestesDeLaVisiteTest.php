<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\GestesDeLaVisite;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-3005 (ADR-0139) — chaque geste de la visite a UNE garde (`GestesDeLaVisite::peut*`), que
 * `abilities` sert au lecteur, et UNE écriture, qui rejuge l'état sur la ligne relue sous verrou.
 *
 * La course se rejoue sans concurrence, comme `PropertyVisitCancelSousVerrouTest` : un écouteur
 * `retrieved` change la ligne en base juste après la liaison de route ; le contrôleur tient alors un
 * modèle resté `confirmed` pendant que la base dit `cancelled` — ce que voit le second de deux
 * collègues qui agissent au même moment.
 */
class GestesDeLaVisiteTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private User $agent;

    private User $visiteur;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->bien = $this->bienDe($this->agence);
        $this->agent = $this->personnel($this->agence);
        $this->visiteur = $this->client();
    }

    /** @param  array<string, mixed>  $attributs */
    private function visite(VisitStatus $statut, array $attributs = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributs + [
            'property_id' => $this->bien->id,
            'visitor_id' => $this->visiteur->id,
            'agent_id' => $this->agent->id,
            'status' => $statut,
            // L'heure est passée : « absent » et « clore » sont permis par l'horloge.
            'scheduled_at' => now()->subHour(),
        ]);
    }

    /** La première lecture de la visite (la liaison de route) laisse la base passer à `$statut`. */
    private function changerLaBaseApresLaLiaison(PropertyVisit $visite, VisitStatus $statut): void
    {
        $fait = false;
        PropertyVisit::retrieved(function (PropertyVisit $lue) use (&$fait, $visite, $statut): void {
            if ($fait || $lue->id !== $visite->id) {
                return;
            }
            $fait = true;
            DB::table('property_visits')->where('id', $lue->id)->update(['status' => $statut->value]);
        });
    }

    /* ─────────────── AC1 — clore et « absent » relisent la visite sous verrou ─────────────── */

    public function test_clore_une_visite_annulee_sous_la_ligne_rend_422_et_n_ecrit_rien(): void
    {
        $fiche = $this->ficheClient($this->agence, $this->visiteur);
        $visite = $this->visite(VisitStatus::Confirmed, ['customer_id' => $fiche->id]);
        $this->changerLaBaseApresLaLiaison($visite, VisitStatus::Cancelled);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/complete", ['notes' => 'Visite menée'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'visit.cannot_complete');

        $relue = $visite->fresh();
        $this->assertSame(VisitStatus::Cancelled, $relue->status);
        $this->assertNull($relue->completed_at);
        // Le dernier contact de la fiche n'avance pas pour une visite qui n'a pas été menée.
        $this->assertNull($fiche->fresh()->last_contacted_at);
    }

    public function test_declarer_absente_une_visite_annulee_sous_la_ligne_rend_422_et_ne_previent_personne(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);
        $this->changerLaBaseApresLaLiaison($visite, VisitStatus::Cancelled);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/no-show")
            ->assertStatus(422)
            ->assertJsonPath('code', 'visit.cannot_mark_no_show');

        $this->assertSame(VisitStatus::Cancelled, $visite->fresh()->status);
        Notification::assertNothingSent();
    }

    public function test_clore_et_absent_aboutissent_sur_une_visite_restee_confirmee(): void
    {
        $close = $this->visite(VisitStatus::Confirmed);
        $absente = $this->visite(VisitStatus::Confirmed);

        Sanctum::actingAs($this->agent);
        // La réponse porte les gestes de la visite APRÈS l'écriture : la fiche les relit sans relancer le geste.
        $this->postJson("/api/property-visits/{$close->id}/complete")->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.abilities.complete', false)
            ->assertJsonPath('data.abilities.no_show', false)
            ->assertJsonPath('data.abilities.cancel', false);
        $this->postJson("/api/property-visits/{$absente->id}/no-show")->assertOk()
            ->assertJsonPath('data.status', 'no_show')
            ->assertJsonPath('data.abilities.no_show', false)
            ->assertJsonPath('data.abilities.complete', false);

        $this->assertNotNull($close->fresh()->completed_at);
        $this->assertSame(VisitStatus::NoShow, $absente->fresh()->status);
    }

    /* ─────────────── les gardes du module : vraies, puis fausses ─────────────── */

    public function test_chaque_garde_est_vraie_pour_le_personnel_sur_une_visite_a_confirmer(): void
    {
        $visite = $this->visite(VisitStatus::Scheduled, ['agent_id' => null]);

        $this->assertTrue(GestesDeLaVisite::peutConfirmer($this->agent, $visite));
        $this->assertTrue(GestesDeLaVisite::peutClore($this->agent, $visite));
        $this->assertTrue(GestesDeLaVisite::peutDeclarerAbsent($this->agent, $visite));
        $this->assertTrue(GestesDeLaVisite::peutAnnuler($this->agent, $visite));
        $this->assertTrue(GestesDeLaVisite::peutDeplacer($this->agent, $visite));
        $this->assertTrue(GestesDeLaVisite::peutPrendreEnCharge($this->agent, $visite));
        $this->assertFalse(GestesDeLaVisite::peutProposerUnCreneau($this->agent, $visite), 'proposer est le geste du visiteur');
    }

    public function test_aucune_garde_ne_tient_quand_le_statut_ne_le_permet_plus(): void
    {
        foreach ([VisitStatus::Completed, VisitStatus::Cancelled, VisitStatus::NoShow] as $statut) {
            $visite = $this->visite($statut, ['agent_id' => null]);

            $this->assertFalse(GestesDeLaVisite::peutConfirmer($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutClore($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutDeclarerAbsent($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutAnnuler($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutDeplacer($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutPrendreEnCharge($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutAttribuer($this->agent, $visite), $statut->value);
            $this->assertFalse(GestesDeLaVisite::peutProposerUnCreneau($this->visiteur, $visite), $statut->value);
        }
    }

    public function test_une_visite_confirmee_ne_se_confirme_plus_mais_se_clot(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);

        $this->assertFalse(GestesDeLaVisite::peutConfirmer($this->agent, $visite));
        $this->assertTrue(GestesDeLaVisite::peutClore($this->agent, $visite));
        // Déjà attribuée : « prendre en charge » n'est pas offert, l'attribution passe par `assign`.
        $this->assertFalse(GestesDeLaVisite::peutPrendreEnCharge($this->agent, $visite));
    }

    public function test_le_visiteur_annule_et_propose_mais_ne_gere_pas(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);

        $this->assertTrue(GestesDeLaVisite::peutAnnuler($this->visiteur, $visite));
        $this->assertTrue(GestesDeLaVisite::peutProposerUnCreneau($this->visiteur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutConfirmer($this->visiteur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutClore($this->visiteur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutDeclarerAbsent($this->visiteur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutDeplacer($this->visiteur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutPrendreEnCharge($this->visiteur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutAttribuer($this->visiteur, $visite));
    }

    public function test_le_bailleur_d_un_bien_d_agence_n_a_aucun_geste_de_l_agence(): void
    {
        $bailleur = $this->bailleur($this->agence);
        $this->bien->update(['user_id' => $bailleur->id]);
        $visite = $this->visite(VisitStatus::Scheduled);

        // Sans le réglage `owners_confirm_visits`, pas même confirmer.
        $this->assertFalse(GestesDeLaVisite::peutConfirmer($bailleur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutClore($bailleur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutDeclarerAbsent($bailleur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutAnnuler($bailleur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutDeplacer($bailleur, $visite));
        $this->assertFalse(GestesDeLaVisite::peutPrendreEnCharge($bailleur, $visite));
    }

    public function test_attribuer_demande_crm_assign_dans_l_agence_du_bien(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);
        $admin = $this->personnel($this->agence, 'agency_admin');

        $this->assertTrue(GestesDeLaVisite::peutAttribuer($admin, $visite));
        // Le bailleur du bien n'agit pas pour l'agence ; le personnel d'une autre agence non plus.
        $this->assertFalse(GestesDeLaVisite::peutAttribuer($this->bailleur($this->agence), $visite));
        $this->assertFalse(GestesDeLaVisite::peutAttribuer($this->personnel($this->agence(), 'agency_admin'), $visite));
    }

    /* ─────────────── AC3 — `abilities` dit l'état autant que la policy ─────────────── */

    public function test_abilities_ouvre_les_gestes_d_une_visite_a_confirmer(): void
    {
        $visite = $this->visite(VisitStatus::Scheduled, ['agent_id' => null]);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.confirm', true)
            ->assertJsonPath('data.abilities.complete', true)
            ->assertJsonPath('data.abilities.no_show', true)
            ->assertJsonPath('data.abilities.cancel', true)
            ->assertJsonPath('data.abilities.reschedule', true)
            ->assertJsonPath('data.abilities.claim', true)
            ->assertJsonPath('data.abilities.assign', true)
            ->assertJsonPath('data.abilities.propose', false)
            ->assertJsonPath('data.can_confirm', true);
    }

    public function test_abilities_ferme_les_gestes_quand_le_statut_ne_le_permet_plus(): void
    {
        foreach ([VisitStatus::Completed, VisitStatus::Cancelled, VisitStatus::NoShow] as $statut) {
            $visite = $this->visite($statut, ['agent_id' => null]);

            Sanctum::actingAs($this->agent);
            $reponse = $this->getJson("/api/property-visits/{$visite->id}")->assertOk();
            foreach (['confirm', 'complete', 'no_show', 'cancel', 'reschedule', 'claim', 'assign', 'propose'] as $cle) {
                $reponse->assertJsonPath("data.abilities.{$cle}", false);
            }
            $reponse->assertJsonPath('data.can_confirm', false);
        }
    }

    public function test_abilities_d_une_visite_confirmee_ne_confirme_plus(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.confirm', false)
            ->assertJsonPath('data.abilities.complete', true)
            ->assertJsonPath('data.abilities.no_show', true)
            ->assertJsonPath('data.abilities.cancel', true);
    }

    public function test_abilities_du_visiteur(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);

        Sanctum::actingAs($this->visiteur);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.cancel', true)
            ->assertJsonPath('data.abilities.propose', true)
            ->assertJsonPath('data.abilities.confirm', false)
            ->assertJsonPath('data.abilities.complete', false)
            ->assertJsonPath('data.abilities.no_show', false)
            ->assertJsonPath('data.abilities.reschedule', false)
            ->assertJsonPath('data.abilities.claim', false)
            ->assertJsonPath('data.abilities.assign', false);
    }

    public function test_can_confirm_en_liste_suit_le_statut(): void
    {
        $aConfirmer = $this->visite(VisitStatus::Scheduled);
        $confirmee = $this->visite(VisitStatus::Confirmed);

        Sanctum::actingAs($this->agent);
        $lignes = collect($this->getJson('/api/property-visits?fields[property_visits]=id,can_confirm&per_page=50')->assertOk()->json('data'))
            ->keyBy('id');

        $this->assertTrue($lignes[$aConfirmer->id]['can_confirm']);
        $this->assertFalse($lignes[$confirmee->id]['can_confirm']);
    }
}
