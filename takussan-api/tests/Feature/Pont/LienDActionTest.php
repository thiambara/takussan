<?php

namespace Tests\Feature\Pont;

use App\Models\ActionLink;
use App\Models\Activity;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Services\Pont\LiensDAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDuLienDAction;

/**
 * TCK-2982 (ADR-0132 § 5) — le lien d'action : un geste, sur un objet, pour un compte, une fois, 7 jours, par le
 * service et la politique de l'objet rejugée au moment du geste.
 */
class LienDActionTest extends ApiTestCase
{
    use MaintenanceActors;
    use RefreshDatabase;
    use SceneDuLienDAction;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->monterLaSceneDuLien();
    }

    public function test_confirmer_par_lien_produit_le_meme_etat_que_par_la_route(): void
    {
        $parLaRoute = $this->visiteAConfirmer();
        $parLeLien = $this->visiteAConfirmer(['scheduled_at' => $this->creneau(4)]);

        Sanctum::actingAs($this->bailleur);
        $this->postJson("/api/property-visits/{$parLaRoute->id}/confirm")->assertOk();
        $this->app['auth']->forgetGuards();

        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $parLeLien);
        $this->postJson("/api/a/{$jeton}")
            ->assertOk()
            ->assertJsonPath('data.state', 'done')
            ->assertJsonPath('data.object.status', 'confirmed');

        $this->assertSame(VisitStatus::Confirmed, $parLaRoute->fresh()->status);
        $this->assertSame(VisitStatus::Confirmed, $parLeLien->fresh()->status);
        // Le même journal, au nom du bailleur, pour les deux chemins.
        $journal = Activity::query()->where('event', 'visit.confirmed_by_owner')->where('subject_id', $parLeLien->id)->sole();
        $this->assertSame($this->bailleur->id, (int) $journal->causer_id);
        $this->assertNotNull($lien->fresh()->used_at);
    }

    public function test_ac1_le_droit_retire_apres_l_emission_refuse_le_geste_sans_consommer_le_lien(): void
    {
        $visite = $this->visiteAConfirmer();
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);
        $this->confier(false);

        $this->postJson("/api/a/{$jeton}")->assertForbidden()->assertJsonPath('code', 'visit.staff_only');

        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);
        $this->assertNull($lien->fresh()->used_at);
        // Le droit rendu, le même lien sert encore.
        $this->confier();
        $this->postJson("/api/a/{$jeton}")->assertOk();
    }

    public function test_ac3_un_lien_ne_fait_qu_un_geste(): void
    {
        $visite = $this->visiteAConfirmer();
        [$jeton] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);

        $this->postJson("/api/a/{$jeton}")->assertOk();
        $this->postJson("/api/a/{$jeton}")->assertStatus(410)->assertJsonPath('code', 'action_link.used');
        $this->getJson("/api/a/{$jeton}")->assertStatus(410)->assertJsonPath('code', 'action_link.used');
    }

    public function test_ac3_un_geste_refuse_par_la_machine_d_etat_ne_consomme_pas_le_lien(): void
    {
        $visite = $this->visiteAConfirmer(['status' => VisitStatus::Cancelled]);
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);

        $reponse = $this->postJson("/api/a/{$jeton}");

        $this->assertContains($reponse->status(), [409, 422], (string) $reponse->getContent());
        $this->assertNull($lien->fresh()->used_at);
        $this->assertSame(VisitStatus::Cancelled, $visite->fresh()->status);
    }

    public function test_ac3_un_geste_refuse_par_la_validation_ne_consomme_pas_le_lien(): void
    {
        $visite = $this->visiteAConfirmer();
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);

        $this->postJson("/api/a/{$jeton}", ['scheduled_at' => '2001-01-01T10:00:00Z'])->assertUnprocessable();

        $this->assertNull($lien->fresh()->used_at);
    }

    public function test_le_lien_expire_au_bout_de_7_jours(): void
    {
        $visite = $this->visiteAConfirmer(['scheduled_at' => $this->creneau(20)]);
        [$jeton] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);

        $this->travel(7 * 24 * 60 - 1)->minutes();
        $this->getJson("/api/a/{$jeton}")->assertOk();

        $this->travel(2)->minutes();
        $this->getJson("/api/a/{$jeton}")->assertStatus(410)->assertJsonPath('code', 'action_link.expired');
        $this->postJson("/api/a/{$jeton}")->assertStatus(410)->assertJsonPath('code', 'action_link.expired');
        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);
    }

    public function test_un_nouveau_lien_revoque_le_precedent(): void
    {
        $visite = $this->visiteAConfirmer();
        [$ancien] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);
        [$nouveau] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);

        $this->getJson("/api/a/{$ancien}")->assertStatus(410)->assertJsonPath('code', 'action_link.revoked');
        $this->postJson("/api/a/{$nouveau}")->assertOk();
    }

    public function test_la_premiere_lecture_pose_opened_at_sans_consommer(): void
    {
        $visite = $this->visiteAConfirmer();
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);

        $this->getJson("/api/a/{$jeton}")->assertOk()
            ->assertJsonPath('data.gesture', 'property_visit.confirm')
            ->assertJsonPath('data.state', 'open');
        $ouvert = $lien->fresh()->opened_at;
        $this->assertNotNull($ouvert);
        $this->travel(5)->minutes();
        $this->getJson("/api/a/{$jeton}")->assertOk();
        $this->assertEquals($ouvert, $lien->fresh()->opened_at);
        $this->assertNull($lien->fresh()->used_at);
    }

    public function test_ac4_la_base_ne_contient_que_l_empreinte_du_jeton(): void
    {
        $visite = $this->visiteAConfirmer();
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);
        $this->getJson("/api/a/{$jeton}")->assertOk();
        $this->postJson("/api/a/{$jeton}")->assertOk();

        $this->assertSame(43, strlen($jeton), 'au moins 32 octets aléatoires');
        $this->assertSame(hash('sha256', $jeton), DB::table('action_links')->where('id', $lien->id)->value('token_hash'));
        $lignes = json_encode(DB::table('action_links')->get()->all());
        $this->assertStringNotContainsString($jeton, (string) $lignes);
        $journal = json_encode(DB::table('activity_log')->get()->all());
        $this->assertStringNotContainsString($jeton, (string) $journal);
        $this->assertStringNotContainsString(hash('sha256', $jeton), (string) $journal);
    }

    public function test_un_jeton_inconnu_rend_404(): void
    {
        $inconnu = str_repeat('A', 43);

        $this->getJson("/api/a/{$inconnu}")->assertNotFound();
        $this->postJson("/api/a/{$inconnu}")->assertNotFound();
    }

    public function test_accepter_une_intervention_par_lien_produit_le_meme_etat_que_par_la_route(): void
    {
        ['mr' => $parLaRoute, 'provider' => $prestataire] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        ['mr' => $parLeLien, 'provider' => $autre] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $parLeLien->property->address()->create(['street' => '7 avenue Peytavin', 'neighborhood' => 'Medina', 'city' => 'Dakar', 'country' => 'SN']);
        $creneau = now()->addDays(3)->setTime(9, 0)->utc()->format('Y-m-d\TH:i:s\Z');

        Sanctum::actingAs($prestataire);
        $this->postJson("/api/maintenance-requests/{$parLaRoute->id}/accept", ['scheduled_at' => $creneau])->assertOk();
        $this->app['auth']->forgetGuards();

        [$jeton, $lien] = $this->lien($autre, 'maintenance_request.accept', $parLeLien);
        $reponse = $this->postJson("/api/a/{$jeton}", ['scheduled_at' => $creneau])->assertOk();

        $this->assertNotNull($parLaRoute->fresh()->accepted_at);
        $this->assertNotNull($parLeLien->fresh()->accepted_at);
        $this->assertEquals($parLaRoute->fresh()->scheduled_at, $parLeLien->fresh()->scheduled_at);
        $this->assertNotNull($lien->fresh()->used_at);
        // Après le geste, et une seule fois : ce que le prestataire lit de l'intervention acceptée.
        $this->assertSame($parLeLien->id, $reponse->json('data.object.id'));
    }

    public function test_un_prestataire_qui_n_est_plus_assigne_est_refuse_sans_consommer(): void
    {
        ['mr' => $mr, 'provider' => $prestataire, 'agency' => $agence] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        [$jeton, $lien] = $this->lien($prestataire, 'maintenance_request.accept', $mr);
        $mr->forceFill(['assigned_to' => $this->providerFor($agence)->id])->save();

        $this->postJson("/api/a/{$jeton}")->assertForbidden();

        $this->assertNull($mr->fresh()->accepted_at);
        $this->assertNull($lien->fresh()->used_at);
    }

    public function test_ac6_la_projection_ne_porte_ni_adresse_exacte_ni_telephone_ni_montant(): void
    {
        ['mr' => $mr, 'provider' => $prestataire, 'tenant' => $locataire] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $mr->property->address()->create(['street' => '7 avenue Peytavin', 'neighborhood' => 'Medina', 'city' => 'Dakar', 'country' => 'SN']);
        $mr->forceFill(['access_instructions' => 'Code portail 4521'])->save();
        $locataire->forceFill(['phone' => '+221770004455'])->save();
        [$jeton] = $this->lien($prestataire, 'maintenance_request.accept', $mr);

        $reponse = $this->getJson("/api/a/{$jeton}")->assertOk();

        $this->assertSame(['title', 'category', 'priority', 'quarter', 'city'], array_keys($reponse->json('data.object')));
        $this->assertSame('Medina', $reponse->json('data.object.quarter'));
        $corps = (string) $reponse->getContent();
        foreach (['Peytavin', '4521', '+221770004455', '770004455', 'amount', 'phone', 'street'] as $interdit) {
            $this->assertStringNotContainsString($interdit, $corps, "la projection porte « {$interdit} »");
        }

        [$jetonVisite] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer());
        $visite = (string) $this->getJson("/api/a/{$jetonVisite}")->assertOk()->getContent();
        foreach (['Carnot', '+221770001122', '770001122', 'phone', 'street'] as $interdit) {
            $this->assertStringNotContainsString($interdit, $visite, "la projection porte « {$interdit} »");
        }
    }

    public function test_un_lien_ne_s_emet_que_pour_un_geste_et_un_objet_du_registre(): void
    {
        $this->expectException(\LogicException::class);
        ['mr' => $mr, 'provider' => $prestataire] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        app(LiensDAction::class)->emettre($prestataire, 'property_visit.confirm', $mr);
    }

    public function test_le_numero_du_lien_s_efface_90_jours_apres_l_expiration(): void
    {
        [, $ancien] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer(), '+221770000001');
        [, $recent] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer(['scheduled_at' => $this->creneau(5)]), '+221770000002');
        $ancien->forceFill(['expires_at' => now()->subDays(91)])->save();
        $recent->forceFill(['expires_at' => now()->subDays(89)])->save();

        $this->artisan('pont:effacer-numeros')->assertSuccessful();

        $this->assertNull(DB::table('action_links')->where('id', $ancien->id)->value('phone'));
        $this->assertSame('+221770000002', DB::table('action_links')->where('id', $recent->id)->value('phone'));
    }

    public function test_un_objet_supprime_rend_le_lien_mort_sans_rien_dire(): void
    {
        $visite = $this->visiteAConfirmer();
        [$jeton] = $this->lien($this->bailleur, 'property_visit.confirm', $visite);
        $visite->delete();

        $this->getJson("/api/a/{$jeton}")->assertStatus(410)->assertExactJson([
            'code' => 'action_link.revoked',
            'message' => __('errors.action_link.revoked'),
        ]);
        $this->assertSame(1, ActionLink::query()->count());
    }
}
