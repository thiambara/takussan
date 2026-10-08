<?php

namespace Tests\Feature\Governance;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Integration;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC15, ADR-0044 §3) — un acte de gouvernance journalisé avertit les admins ACTIFS de
 * l'agence, sauf son auteur, dans la langue de chacun ; jamais ceux d'une autre agence.
 */
class GovernanceAlertTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $auteur;

    private User $collegue;

    private User $suspendu;

    private User $ailleurs;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->collegue = User::factory()->create(['preferred_language' => 'en']);
        AgencyAdminProfile::factory()->create(['user_id' => $this->collegue->id, 'agency_id' => $this->agency->id]);
        $this->suspendu = User::factory()->create();
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $this->suspendu->id, 'agency_id' => $this->agency->id]);
        $this->ailleurs = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $this->ailleurs->id, 'agency_id' => Agency::factory()->create()->id]);
        $this->auteur = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency, 'first_name' => 'Awa', 'last_name' => 'Auteure']);
        // L'arrivée de l'auteur est elle-même un acte : on part d'une boîte vide.
        AppNotification::query()->delete();
    }

    /** @return array<int, int> nombre de notifications du code, par destinataire */
    private function recus(NotificationCode $code): array
    {
        return collect([$this->auteur, $this->collegue, $this->suspendu, $this->ailleurs])
            ->mapWithKeys(fn (User $u) => [$u->id => AppNotification::query()->where('user_id', $u->id)->where('code', $code->value)->count()])
            ->all();
    }

    private function seulLeCollegue(NotificationCode $code): void
    {
        $this->assertSame([
            $this->auteur->id => 0,
            $this->collegue->id => 1,
            $this->suspendu->id => 0,
            $this->ailleurs->id => 0,
        ], $this->recus($code));
    }

    public function test_les_capacites_d_un_role_remplacees_avertissent_les_autres_admins(): void
    {
        $role = app(AgencyRoleService::class)->create($this->agency, ['name' => 'Comptable', 'base_profile_type' => AgencyRoleBaseType::Agent->value]);
        $this->actingAsWithStepUp($this->auteur);

        $this->apiPut("/api/agencies/{$this->agency->id}/roles/{$role->id}/capabilities", [
            'capabilities' => [Capability::CrmExport->value],
        ])->assertOk();

        $this->seulLeCollegue(NotificationCode::GovernanceRoleCapabilitiesChanged);
        // Dans la langue du destinataire, avec le rôle et l'auteur.
        $notification = AppNotification::query()->where('user_id', $this->collegue->id)->sole();
        $this->assertSame('Role permissions changed', $notification->title);
        $this->assertStringContainsString('Comptable', $notification->body);
        $this->assertStringContainsString('Awa', $notification->body);
    }

    public function test_un_export_crm_avertit_un_export_de_paiements_non(): void
    {
        activity('export')->causedBy($this->auteur)->event('data_exported')
            ->withProperties(['entity' => 'customers', 'agency_id' => $this->agency->id])->log('data_exported');
        $this->seulLeCollegue(NotificationCode::GovernanceDataExported);

        activity('export')->causedBy($this->auteur)->event('data_exported')
            ->withProperties(['entity' => 'payments', 'agency_id' => $this->agency->id])->log('data_exported');
        $this->seulLeCollegue(NotificationCode::GovernanceDataExported);
    }

    public function test_un_nouvel_admin_avertit_les_admins_en_place(): void
    {
        $nouveau = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Nouveau']);
        AgencyAdminProfile::factory()->create(['user_id' => $nouveau->id, 'agency_id' => $this->agency->id]);

        $this->seulLeCollegue(NotificationCode::GovernanceAdminAdded);
        $this->assertStringContainsString('Moussa', AppNotification::query()->where('user_id', $this->collegue->id)->sole()->body);
    }

    public function test_une_integration_creee_modifiee_supprimee_avertit_a_chaque_fois(): void
    {
        $integration = Integration::factory()->create(['agency_id' => $this->agency->id, 'provider' => 'wave']);
        $integration->update(['is_active' => false]);
        $integration->update(['last_used_at' => now()]); // ni acte, ni alerte
        $integration->delete();

        $this->assertSame(3, $this->recus(NotificationCode::GovernanceIntegrationChanged)[$this->collegue->id]);
        $this->assertSame(0, $this->recus(NotificationCode::GovernanceIntegrationChanged)[$this->auteur->id]);
        $this->assertSame(0, $this->recus(NotificationCode::GovernanceIntegrationChanged)[$this->ailleurs->id]);
        foreach (AppNotification::query()->where('user_id', $this->collegue->id)->get() as $notification) {
            $this->assertStringContainsString('wave', $notification->body);
        }
    }

    /** Une écriture sans auteur (seeder, commande) n'est pas un acte de membre : aucune alerte. */
    public function test_une_ecriture_sans_auteur_n_avertit_personne(): void
    {
        $this->app['auth']->forgetGuards();
        AgencyAdminProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $this->agency->id]);

        $this->assertSame(0, AppNotification::query()->count());
    }

    /** Raccord TCK-594 : l'événement de son service, écrit sur l'agence. */
    public function test_un_seuil_d_approbation_modifie_avertit(): void
    {
        activity()->causedBy($this->auteur)->performedOn($this->agency)
            ->event('agency_payout_threshold_changed')->withProperties(['old' => 100000, 'new' => 500000])
            ->log('agency_payout_threshold_changed');

        $this->seulLeCollegue(NotificationCode::GovernanceApprovalThresholdChanged);
    }
}
