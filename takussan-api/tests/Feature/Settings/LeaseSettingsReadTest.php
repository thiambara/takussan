<?php

namespace Tests\Feature\Settings;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\SettingScope;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2920 (ADR-0111) — `GET /api/settings/lease` se lit par tout le personnel ACTIF de l'agence
 * de l'espace actif (admin, agent) et par le super-admin ; il ne s'écrit que par qui configure
 * l'agence (`AgencyPolicy::configure`), et `can_edit` le dit pour l'appelant, calculé.
 */
class LeaseSettingsReadTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const CLES = [
        'lease.late_fee_percent',
        'lease.late_fee_grace_days',
        'lease.early_termination_penalty_months',
        'lease.rent_review_max_pct',
    ];

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
    }

    // ── AC1 : l'agent lit, sans pouvoir écrire ────────────────────────────────────────────────────

    public function test_ac1_l_agent_actif_lit_les_quatre_reglages_sans_pouvoir_les_modifier(): void
    {
        Setting::query()->create([
            'key' => 'lease.late_fee_percent', 'value' => ['value' => 5],
            'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
        ]);

        $this->actingAsApi($this->agencyAgent($this->agence));
        $reponse = $this->getJson('/api/settings/lease')->assertOk()
            ->assertJsonPath('data.can_edit', false)
            ->assertJsonPath('data.settings.0.value', 5)
            ->assertJsonPath('data.settings.0.source', 'agency');

        $this->assertSame(self::CLES, array_column($reponse->json('data.settings'), 'key'));
    }

    // ── AC2 : `can_edit` suit `AgencyPolicy::configure` ──────────────────────────────────────────

    public function test_ac2_l_admin_principal_lit_et_peut_modifier(): void
    {
        $admin = $this->agencyAdmin($this->agence);
        $this->agence->forceFill(['primary_admin_id' => $admin->id])->save();

        $this->actingAsApi($admin);
        $this->getJson('/api/settings/lease')->assertOk()->assertJsonPath('data.can_edit', true);
    }

    public function test_ac2_l_admin_sans_agency_update_lit_mais_ne_peut_pas_modifier(): void
    {
        $this->actingAsApi($this->adminWithout($this->agence, Capability::AgencyUpdate));
        $this->getJson('/api/settings/lease')->assertOk()
            ->assertJsonPath('data.can_edit', false);
    }

    public function test_ac2_l_admin_qui_porte_agency_update_lit_et_peut_modifier(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agence));
        $this->getJson('/api/settings/lease')->assertOk()->assertJsonPath('data.can_edit', true);
    }

    // ── AC3 : hors du personnel actif, 403 ───────────────────────────────────────────────────────

    /** @return array<string, array{string}> */
    public static function horsDuPersonnelActif(): array
    {
        return [
            'agent suspendu' => ['agentSuspendu'],
            'agent inactif' => ['agentInactif'],
            'compte d’agent bloqué' => ['agentBloque'],
            'bailleur de l’agence' => ['bailleur'],
            'prestataire de l’agence' => ['prestataire'],
        ];
    }

    #[DataProvider('horsDuPersonnelActif')]
    public function test_ac3_la_lecture_est_refusee_hors_du_personnel_actif(string $qui): void
    {
        $this->actingAsApi($this->{$qui}());
        $this->getJson('/api/settings/lease')->assertForbidden();
    }

    /**
     * L'admin de l'agence B n'atteint jamais A : la route lit l'agence de SON espace actif. Prémisse
     * du ticket (« 403 ») corrigée : il lit les siens (200), jamais la valeur de A.
     */
    public function test_ac3_l_admin_d_une_autre_agence_ne_lit_jamais_les_reglages_de_celle_ci(): void
    {
        Setting::query()->create([
            'key' => 'lease.late_fee_percent', 'value' => ['value' => 7],
            'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
        ]);

        $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()));
        $this->getJson('/api/settings/lease')->assertOk()
            ->assertJsonPath('data.settings.0.source', 'platform')
            ->assertJsonPath('data.settings.0.setting_id', null);
    }

    /** Agent de A dont l'espace actif est un profil de bailleur dans B : ni A, ni B. */
    public function test_ac3_l_agent_d_une_agence_sous_un_espace_de_bailleur_ailleurs_est_refuse(): void
    {
        $agent = $this->agencyAgent($this->agence);
        $ailleurs = Agency::factory()->create();
        $bailleur = OwnerProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $ailleurs->id]);

        $this->actingAsApi($agent);
        $this->withHeader('X-Profile-Id', 'owner:'.$bailleur->id)
            ->getJson('/api/settings/lease')->assertForbidden();
    }

    // ── AC4 : ouvrir la lecture n'ouvre aucune écriture ──────────────────────────────────────────

    public function test_ac4_l_agent_qui_lit_ne_peut_toujours_ni_poser_ni_retirer_un_reglage(): void
    {
        $ligne = Setting::query()->create([
            'key' => 'lease.late_fee_percent', 'value' => ['value' => 4],
            'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
        ]);
        $agent = $this->agencyAgent($this->agence);

        $this->actingAsApi($agent);
        $this->getJson('/api/settings/lease')->assertOk();
        $this->postJson('/api/settings', [
            'key' => 'lease.late_fee_percent', 'value' => ['value' => 6], 'scope' => 'agency',
        ])->assertForbidden();
        $this->deleteJson('/api/settings/'.$ligne->id)->assertForbidden();

        $this->assertSame(['value' => 4], $ligne->fresh()?->value);
    }

    // ── Les comptes ──────────────────────────────────────────────────────────────────────────────

    private function agentSuspendu(): User
    {
        return $this->agentAuStatut(AgentProfileStatus::Suspended);
    }

    private function agentInactif(): User
    {
        return $this->agentAuStatut(AgentProfileStatus::Inactive);
    }

    private function agentAuStatut(AgentProfileStatus $statut): User
    {
        $agent = $this->agencyAgent($this->agence);
        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => $statut->value]);

        return $agent->fresh();
    }

    private function agentBloque(): User
    {
        $agent = $this->agencyAgent($this->agence);
        $agent->forceFill(['status' => 'blocked'])->save();

        return $agent->fresh();
    }

    private function bailleur(): User
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agence->id]);

        return $bailleur;
    }

    private function prestataire(): User
    {
        $profil = ServiceProviderProfile::factory()->create();
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $this->agence->id,
            'status' => CollaborationStatus::Active,
            'started_at' => now()->toDateString(),
        ]);

        return $profil->user()->firstOrFail();
    }
}
