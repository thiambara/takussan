<?php

namespace Tests\Feature\Visits;

use App\Domain\Notifications\NotificationCode;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2849 (ADR-0112) — le bailleur ACTIF d'un bien d'agence confirme une visite, ou en propose un
 * autre créneau, quand l'agence le lui confie (`settings.owners_confirm_visits`, faux par défaut). Ce
 * geste seul : `update`, `complete`, `no-show` et `cancel` restent au personnel (TCK-590). L'agent
 * attribué est prévenu avec le nom du bailleur, et le journal nomme le bailleur.
 */
class OwnerConfirmsAgencyVisitTest extends ApiTestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $bailleur;

    private User $visiteur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bailleur = $this->bailleur($this->agence, ['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->visiteur = $this->client(['phone' => '+221770001122']);
        $this->bien = $this->bienDe($this->agence, $this->bailleur);
    }

    private function confier(bool $oui = true): void
    {
        $this->agence->update(['settings' => array_replace($this->agence->settings ?? [], ['owners_confirm_visits' => $oui])]);
    }

    private function visite(array $attributs = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributs + [
            'property_id' => $this->bien->id,
            'visitor_id' => $this->visiteur->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => $this->creneau(),
            'duration_minutes' => 30,
        ]);
    }

    public function test_ac1_reglage_faux_le_bailleur_actif_recoit_403_staff_only(): void
    {
        $visite = $this->visite();

        Sanctum::actingAs($this->bailleur);
        $this->postJson("/api/property-visits/{$visite->id}/confirm")
            ->assertForbidden()->assertJsonPath('code', 'visit.staff_only');

        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);
        Notification::assertNothingSent();
    }

    public function test_ac2_reglage_vrai_le_bailleur_confirme_le_visiteur_et_l_agent_sont_prevenus(): void
    {
        $this->confier();
        $visite = $this->visite();

        Sanctum::actingAs($this->bailleur);
        $this->postJson("/api/property-visits/{$visite->id}/confirm")
            ->assertOk()->assertJsonPath('data.status', 'confirmed');

        $this->assertSame(VisitStatus::Confirmed, $visite->fresh()->status);
        Notification::assertSentTo($this->visiteur, CodedNotification::class, self::deCodeSur(NotificationCode::VisitConfirmed, $visite->id));
        Notification::assertSentTo(
            $this->agent,
            CodedNotification::class,
            fn (CodedNotification $n) => $n->code === NotificationCode::VisitConfirmedByOwner
                && ($n->target['id'] ?? null) === $visite->id
                && $n->params['owner'] === 'Awa Ndiaye',
        );
        // Le bailleur n'est pas prévenu de son propre geste.
        Notification::assertNotSentTo($this->bailleur, CodedNotification::class, self::deCode(NotificationCode::VisitConfirmedByOwner));

        $journal = Activity::query()->where('event', 'visit.confirmed_by_owner')->sole();
        $this->assertSame($this->bailleur->id, (int) $journal->causer_id);
        $this->assertSame($visite->id, (int) $journal->subject_id);
        $this->assertSame($this->agence->id, (int) $journal->agency_id);
    }

    public function test_ac3_reglage_vrai_autre_creneau_pose_avec_la_garde_de_l_agent(): void
    {
        $this->confier();
        $visite = $this->visite();
        $nouveau = $this->creneau(3, 15);

        Sanctum::actingAs($this->bailleur);
        $this->postJson("/api/property-visits/{$visite->id}/confirm", ['scheduled_at' => $nouveau])->assertOk();

        $relue = $visite->fresh();
        $this->assertSame(VisitStatus::Confirmed, $relue->status);
        $this->assertTrue($relue->scheduled_at->equalTo(CarbonImmutable::parse($nouveau)));
        $journal = Activity::query()->where('event', 'visit.confirmed_by_owner')->sole();
        $this->assertNotNull($journal->properties['previous_scheduled_at']);

        // L'agent est déjà pris à l'heure demandée sur un autre bien de l'agence : 422, rien n'est écrit.
        $occupe = $this->creneau(4, 11);
        PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $this->client()->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => $occupe,
            'duration_minutes' => 30,
        ]);
        $autre = $this->visite(['scheduled_at' => $this->creneau(5)]);
        $this->postJson("/api/property-visits/{$autre->id}/confirm", ['scheduled_at' => $occupe])
            ->assertStatus(422)->assertJsonPath('code', 'visit.agent_overlap');
        $this->assertSame(VisitStatus::Scheduled, $autre->fresh()->status);
    }

    public function test_ac4_reglage_vrai_bailleur_suspendu_parti_ou_en_attente_refuse(): void
    {
        $this->confier();

        foreach ([OwnerProfileStatus::Blocked, OwnerProfileStatus::Inactive, OwnerProfileStatus::Draft] as $statut) {
            $visite = $this->visite();
            OwnerProfile::query()->where('user_id', $this->bailleur->id)->update(['status' => $statut->value]);

            Sanctum::actingAs($this->bailleur->fresh());
            $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertForbidden();
            $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status, $statut->value);
        }
    }

    /**
     * AC5 — le cas qui ATTEINT la branche du bailleur : un profil `draft` passe `update`
     * (`landlordWrites` ne refuse que `blocked` et `inactive`), et c'est la condition « profil actif »
     * de `bailleurConfirmeDans` qui le refuse. Retirer cette condition rougit ce test.
     */
    public function test_ac5_profil_en_attente_refuse_par_la_branche_du_bailleur(): void
    {
        $this->confier();
        $visite = $this->visite();
        OwnerProfile::query()->where('user_id', $this->bailleur->id)->update(['status' => OwnerProfileStatus::Draft->value]);

        Sanctum::actingAs($this->bailleur->fresh());
        $this->postJson("/api/property-visits/{$visite->id}/confirm")
            ->assertForbidden()->assertJsonPath('code', 'visit.staff_only');
    }

    public function test_ac4_reglage_vrai_le_bailleur_d_un_autre_bien_est_refuse(): void
    {
        $this->confier();
        $autreBailleur = $this->bailleur($this->agence);
        $visite = $this->visite();

        Sanctum::actingAs($autreBailleur);
        $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertForbidden();
        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);
    }

    public function test_reglage_vrai_le_bailleur_ne_fait_rien_d_autre(): void
    {
        $this->confier();
        $visite = $this->visite();

        Sanctum::actingAs($this->bailleur);
        $this->postJson("/api/property-visits/{$visite->id}/cancel")->assertForbidden();
        $this->postJson("/api/property-visits/{$visite->id}/complete")->assertForbidden();
        $this->postJson("/api/property-visits/{$visite->id}/no-show")->assertForbidden();
        $this->patchJson("/api/property-visits/{$visite->id}", ['scheduled_at' => $this->creneau(6)])->assertForbidden();
        $this->patchJson("/api/property-visits/{$visite->id}", ['agent_id' => null])->assertForbidden();
        $this->assertSame(VisitStatus::Scheduled, $visite->fresh()->status);

        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.manage', false)
            ->assertJsonPath('data.abilities.confirm', true)
            ->assertJsonPath('data.can_confirm', true);
    }

    public function test_la_confirmation_en_lot_suit_la_regle_du_geste_unitaire(): void
    {
        $visite = $this->visite();
        Sanctum::actingAs($this->bailleur);

        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $visite->id]]])
            ->assertOk()->assertJsonPath('data.0.ok', false)->assertJsonPath('data.0.code', 'visit.staff_only');

        $this->confier();
        $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $visite->id]]])
            ->assertOk()->assertJsonPath('data.0.ok', true);
        $this->assertSame(VisitStatus::Confirmed, $visite->fresh()->status);
        Notification::assertSentTo($this->agent, CodedNotification::class, self::deCodeSur(NotificationCode::VisitConfirmedByOwner, $visite->id));
    }

    public function test_le_personnel_qui_confirme_ne_declenche_ni_l_avis_ni_le_journal_du_bailleur(): void
    {
        $this->confier();
        $visite = $this->visite();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/confirm")->assertOk();

        Notification::assertNotSentTo($this->agent, CodedNotification::class, self::deCode(NotificationCode::VisitConfirmedByOwner));
        $this->assertSame(0, Activity::query()->where('event', 'visit.confirmed_by_owner')->count());
    }

    /**
     * La capacité rendue avec la visite : `can_confirm` en liste (sur demande) vaut `abilities.confirm`
     * du détail, pour chaque lecteur — la liste la juge sur le contexte relu, le détail sur le prédicat.
     */
    public function test_can_confirm_de_la_liste_vaut_le_detail_pour_chaque_lecteur(): void
    {
        $visite = $this->visite();
        $particulier = $this->client();
        $visiteSansAgence = $this->visite(['property_id' => $this->bienDe(null, $particulier)->id, 'agent_id' => null]);

        $attendu = fn (bool $confie) => [
            [$this->bailleur, $visite, $confie],
            [$this->agent, $visite, true],
            [$this->visiteur, $visite, false],
            [$particulier, $visiteSansAgence, true],
        ];

        foreach ([false, true] as $confie) {
            $this->confier($confie);
            foreach ($attendu($confie) as [$lecteur, $v, $peut]) {
                Sanctum::actingAs($lecteur);
                $this->getJson("/api/property-visits/{$v->id}")->assertOk()
                    ->assertJsonPath('data.abilities.confirm', $peut);
                $ligne = collect($this->getJson('/api/property-visits?fields[property_visits]=id,status,can_confirm&per_page=50')
                    ->assertOk()->json('data'))->firstWhere('id', $v->id);
                $this->assertNotNull($ligne, "la visite {$v->id} est dans la liste de {$lecteur->id}");
                $this->assertSame($peut, $ligne['can_confirm'], "lecteur {$lecteur->id}, réglage ".($confie ? 'vrai' : 'faux'));
            }
        }

        // Sans la demander, la liste ne la sert pas.
        Sanctum::actingAs($this->bailleur);
        $this->assertArrayNotHasKey('can_confirm', $this->getJson('/api/property-visits')->assertOk()->json('data.0'));
    }

    public function test_le_reglage_s_ecrit_par_l_administrateur_et_se_lit_dans_la_ressource(): void
    {
        // L'administrateur principal, comme `AgencySettingsMergeTest` (le personnel `agency_admin`
        // passe en plus par la 2FA de l'opération sensible, hors du sujet).
        $admin = $this->client();
        $this->agence->update(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($this->agent);
        $this->patchJson("/api/agencies/{$this->agence->id}", ['settings' => ['owners_confirm_visits' => true]])->assertForbidden();
        $this->assertFalse($this->agence->fresh()->setting('owners_confirm_visits'));

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$this->agence->id}", ['settings' => ['owners_confirm_visits' => true]])
            ->assertOk()->assertJsonPath('data.settings.owners_confirm_visits', true);
        $this->assertTrue($this->agence->fresh()->setting('owners_confirm_visits'));
    }
}
