<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RentPeriod;
use App\Models\KycDossier;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0048) — AC1 et AC2 : une agence suspendue disparaît du site ; la levée l'y remet.
 */
class AgencySuspensionTest extends TestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const MOTIF = 'Plaintes répétées de locataires, enquête en cours.';

    private Agency $agence;

    private Property $bien;

    private int $jour = 3;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = $this->agence();
        $this->bien = $this->bienDe($this->agence);
        $this->bien->forceFill(['rent_period' => RentPeriod::Daily->value])->save();
    }

    /** AC1. */
    public function test_suspendre_retire_les_biens_du_site_et_lever_les_y_remet(): void
    {
        $this->assertVisible(true);

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/agencies/{$this->agence->id}/suspend", ['reason' => self::MOTIF])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');
        $this->assertVisible(false);

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/agencies/{$this->agence->id}/reinstate", ['reason' => 'Enquête close.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->assertVisible(true);
    }

    /** `inactive` (désactivée) masque aussi : même règle que l'annuaire. Un bien sans agence n'en dépend pas. */
    public function test_une_agence_inactive_masque_ses_biens_et_un_bien_sans_agence_reste_public(): void
    {
        $libre = $this->bienDe(null);
        $this->agence->forceFill(['status' => AgencyStatus::Inactive])->save();

        $this->getJson("/api/public/properties/{$this->bien->slug}")->assertNotFound();
        $this->getJson("/api/public/properties/{$libre->slug}")->assertOk();
        $this->assertFalse($this->bien->fresh()->shouldBeSearchable());
        $this->assertTrue($libre->fresh()->shouldBeSearchable());
    }

    /**
     * Les pages publiques de l'agence et de ses agents suivent la même règle (verif-600 M2) : la
     * fiche, le portefeuille et le contact de l'agent rendent le 404 d'un agent inconnu, et l'index
     * ne le liste plus — même s'il publie aussi un bien sans agence, qui l'y ferait figurer.
     */
    public function test_la_fiche_publique_de_l_agence_et_la_page_de_l_agent_disparaissent(): void
    {
        foreach ([AgencyStatus::Suspended, AgencyStatus::Inactive] as $statut) {
            $this->agence->forceFill(['status' => AgencyStatus::Active])->save();
            $agent = $this->personnel($this->agence, attributes: ['username' => "agent-{$statut->value}"]);
            $this->bien->forceFill(['user_id' => $agent->id])->save();
            $this->bienDe(null, $agent);
            $page = "/api/public/agents/agent-{$statut->value}";

            $this->getJson("/api/public/agencies/{$this->agence->slug}")->assertOk();
            $this->getJson($page)->assertOk()->assertJsonPath('data.agency.id', $this->agence->id);
            $this->assertContains($this->bien->id, $this->getJson("{$page}/properties")->json('data.*.id'));
            $this->assertContains("agent-{$statut->value}", $this->getJson('/api/public/agents?per_page=48')->json('data.*.slug'));
            $this->postJson("{$page}/contact-lead", $this->demande())->assertCreated();

            $this->agence->forceFill(['status' => $statut])->save();

            $this->getJson("/api/public/agencies/{$this->agence->slug}")->assertNotFound();
            $this->getJson("/api/public/agencies/{$this->agence->slug}/properties")->assertNotFound();
            $inconnu = $this->getJson('/api/public/agents/personne-de-tel')->assertNotFound()->getContent();
            $this->assertSame($inconnu, $this->getJson($page)->assertNotFound()->getContent());
            $this->getJson("{$page}/properties")->assertNotFound();
            $this->assertNotContains("agent-{$statut->value}", $this->getJson('/api/public/agents?per_page=48')->json('data.*.slug'));
            $avant = PropertyContactLead::query()->count();
            $this->postJson("{$page}/contact-lead", $this->demande())->assertNotFound();
            $this->assertSame($avant, PropertyContactLead::query()->count(), "aucune demande déposée ({$statut->value})");
        }
    }

    /**
     * verif-600 m-A — la page lit l'agence par `User::agency()`, quel que soit le statut du profil
     * d'agent : le masque juge donc tout profil. Un agent au profil `inactive`, `suspended` ou `draft`
     * dans une agence suspendue gardait sa page (l'agence suspendue y figurait) et son contact.
     */
    public function test_le_masque_juge_l_agence_de_tout_profil_d_agent_quel_que_soit_son_statut(): void
    {
        foreach ([AgentProfileStatus::Inactive, AgentProfileStatus::Suspended, AgentProfileStatus::Draft] as $statutProfil) {
            $agence = $this->agence();
            $agent = $this->personnel($agence, attributes: ['username' => "agent-profil-{$statutProfil->value}"]);
            AgentProfile::query()->where('user_id', $agent->id)->update(['status' => $statutProfil->value]);
            $page = "/api/public/agents/agent-profil-{$statutProfil->value}";

            // Témoin : agence active, la page de l'agent s'ouvre et affiche son agence.
            $this->getJson($page)->assertOk()->assertJsonPath('data.agency.id', $agence->id);

            $agence->forceFill(['status' => AgencyStatus::Suspended])->save();

            $inconnu = $this->getJson('/api/public/agents/personne-de-tel')->assertNotFound()->getContent();
            $this->assertSame($inconnu, $this->getJson($page)->assertNotFound()->getContent(), $statutProfil->value);
            $avant = PropertyContactLead::query()->count();
            $this->postJson("{$page}/contact-lead", $this->demande())->assertNotFound();
            $this->assertSame($avant, PropertyContactLead::query()->count(), "aucune demande ({$statutProfil->value})");
            $this->assertNotContains("agent-profil-{$statutProfil->value}", $this->getJson('/api/public/agents?per_page=48')->json('data.*.slug'));
        }
    }

    /** @return array<string, string> */
    private function demande(): array
    {
        return ['name' => 'Moussa Fall', 'email' => 'moussa@example.test', 'message' => 'Bonjour, je cherche un F3.'];
    }

    /** AC2. */
    public function test_le_motif_est_requis_journalise_et_adresse_aux_admins(): void
    {
        Notification::fake();
        $admin = $this->personnel($this->agence, 'agency_admin');
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/agencies/{$this->agence->id}/suspend")->assertStatus(422);
        $this->assertSame(AgencyStatus::Active, $this->agence->fresh()->status);

        $this->postJson("/api/admin/agencies/{$this->agence->id}/suspend", ['reason' => self::MOTIF])->assertOk();

        $activite = Activity::query()->where('event', 'super_admin_agency_suspended')->sole();
        $this->assertSame(self::MOTIF, $activite->properties['reason']);
        // La fiche de la console l'affiche, motif et date compris — à un `viewer` aussi.
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->getJson("/api/admin/agencies/{$this->agence->id}")
            ->assertOk()
            ->assertJsonPath('data.suspension.reason', self::MOTIF)
            ->assertJsonPath('data.suspension.suspended_at', $activite->created_at->toIso8601String());
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        Notification::assertSentTo($admin, CodedNotification::class, function (CodedNotification $n) {
            return $n->code === NotificationCode::AgencySuspended && $n->params['reason'] === self::MOTIF;
        });

        $this->postJson("/api/admin/agencies/{$this->agence->id}/reinstate", ['reason' => 'Enquête close.'])->assertOk();
        $this->assertSame(
            'Enquête close.',
            Activity::query()->where('event', 'super_admin_agency_reinstated')->sole()->properties['reason'],
        );
        Notification::assertSentTo($admin, CodedNotification::class, self::deCode(NotificationCode::AgencyReinstated));
        $this->getJson("/api/admin/agencies/{$this->agence->id}")->assertOk()->assertJsonPath('data.suspension', null);
    }

    public function test_lever_n_agit_que_sur_une_agence_suspendue_et_garde_la_verification(): void
    {
        $this->agence->forceFill(['status' => AgencyStatus::Suspended, 'is_verified' => true, 'verified_at' => now()])->save();
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/agencies/{$this->agence->id}/reinstate", ['reason' => 'Enquête close.'])->assertOk();
        $this->assertTrue((bool) $this->agence->fresh()->is_verified);

        $this->postJson("/api/admin/agencies/{$this->agence->id}/reinstate", ['reason' => 'Encore.'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'agency.not_suspended');
    }

    /** Second chemin : ni `verify` ni `unverify` ne sortent de `suspended` sans motif. */
    public function test_verifier_ou_deverifier_ne_levent_pas_la_suspension(): void
    {
        Notification::fake();
        $this->agence->forceFill(['status' => AgencyStatus::Suspended, 'is_verified' => true, 'verified_at' => now()])->save();
        KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $this->agence->id,
            'status' => KycDossierStatus::Verified,
        ]);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        foreach (['verify', 'unverify'] as $geste) {
            $this->postJson("/api/admin/agencies/{$this->agence->id}/{$geste}")
                ->assertStatus(422)
                ->assertJsonPath('code', 'agency.reinstate_first');
        }

        $this->assertSame(AgencyStatus::Suspended, $this->agence->fresh()->status);
        $this->assertTrue((bool) $this->agence->fresh()->is_verified);
        Notification::assertNothingSent();
    }

    public function test_seul_le_super_admin_suspend(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->postJson("/api/admin/agencies/{$this->agence->id}/suspend", ['reason' => self::MOTIF])->assertForbidden();
        $this->assertSame(AgencyStatus::Active, $this->agence->fresh()->status);
    }

    private function assertVisible(bool $visible): void
    {
        $this->app['auth']->forgetGuards();
        $liste = collect($this->getJson('/api/public/properties?per_page=50')->assertOk()->json('data'))->pluck('id');
        $this->assertSame($visible, $liste->contains($this->bien->id), 'liste publique');
        $this->getJson("/api/public/properties/{$this->bien->slug}")->assertStatus($visible ? 200 : 404);

        $client = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $client->id]);
        $this->actingAs($client);
        $reservation = $this->postJson('/api/bookings', [
            'property_id' => $this->bien->id,
            'customer_id' => $fiche->id,
            'start_date' => now()->addDays($this->jour)->toDateString(),
            'end_date' => now()->addDays($this->jour + 2)->toDateString(),
        ]);
        $this->jour += 10;
        $visible
            ? $reservation->assertCreated()
            : $reservation->assertForbidden()->assertJsonPath('code', 'booking.property_unavailable');
        $this->app['auth']->forgetGuards();
    }
}
