<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\SettingScope;
use App\Models\Integration;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2024 (P116.02, décision du porteur) — la fiche de l'agence, son logo, ses réglages, ses
 * intégrations et la carte de mise en service ne jugeaient que « admin de l'agence » : l'admin dont
 * le rôle retire `agency.update` les configurait. Ils passent par `AgencyPolicy::configure`
 * (`update()` ET `agency.update`, l'admin principal passant), comme `AgencyIndicatorPolicy`.
 * `listMembers` reste sur `update()`.
 */
class ConfigurerLAgenceExigeAgencyUpdateTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase;

    private Agency $agency;

    private Setting $setting;

    private Integration $integration;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->setting = Setting::query()->create([
            'key' => 'lease.require_signature',
            'value' => ['value' => true],
            'scope' => SettingScope::Agency,
            'scope_id' => $this->agency->id,
        ]);
        $this->integration = Integration::factory()->create([
            'agency_id' => $this->agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 's'],
        ]);
    }

    /** @return array<string, int> le statut de chaque geste de configuration */
    private function gestes(User $user): array
    {
        Sanctum::actingAs($user);
        $a = $this->agency->id;

        return [
            'PATCH agence' => $this->patchJson("/api/agencies/{$a}", ['name' => 'Nom revu'])->status(),
            'logo' => $this->postJson('/api/media', [
                'file' => UploadedFile::fake()->image('logo.png', 200, 200),
                'collection' => 'logo',
                'model_type' => Agency::class,
                'model_id' => $a,
            ])->status(),
            'mise en service' => $this->getJson("/api/agencies/{$a}/setup-status")->status(),
            'réglages (liste)' => $this->getJson('/api/settings')->status(),
            'réglage (création)' => $this->postJson('/api/settings', [
                'key' => 'lease.require_signature', 'value' => ['value' => false], 'scope' => 'agency',
            ])->status(),
            'réglage (modification)' => $this->patchJson("/api/settings/{$this->setting->id}", ['value' => ['value' => false]])->status(),
            'intégrations (liste)' => $this->getJson('/api/integrations')->status(),
            'fournisseurs de paiement' => $this->getJson('/api/integrations/payment-providers')->status(),
            'intégration (création)' => $this->postJson('/api/integrations', [
                'provider' => 'orange_money',
                'credentials' => ['api_key' => 'k', 'merchant_key' => 'm', 'webhook_secret' => 's', 'client_id' => 'c', 'client_secret' => 'x'],
            ])->status(),
            'intégration (modification)' => $this->patchJson("/api/integrations/{$this->integration->id}", ['is_active' => true])->status(),
            'intégration (test)' => $this->postJson("/api/integrations/{$this->integration->id}/test")->status(),
            'intégration (webhook)' => $this->getJson("/api/integrations/{$this->integration->id}/webhook-endpoint")->status(),
            'réglage (suppression)' => $this->deleteJson("/api/settings/{$this->setting->id}")->status(),
            'intégration (suppression)' => $this->deleteJson("/api/integrations/{$this->integration->id}")->status(),
        ];
    }

    public function test_l_admin_sans_agency_update_ne_configure_rien(): void
    {
        $gestes = $this->gestes($this->adminWithout($this->agency, Capability::AgencyUpdate));

        $this->assertSame(array_fill_keys(array_keys($gestes), 403), $gestes);
        $this->assertNull($this->agency->fresh()->getFirstMedia('logo'));
        $this->assertNotSame('Nom revu', $this->agency->fresh()->name);
        $this->assertNotNull(Setting::query()->find($this->setting->id));
        $this->assertNotNull(Integration::query()->find($this->integration->id));
    }

    /** Aucun agent ne gagne ces gestes, même s'il tient `agency.update`. */
    public function test_l_agent_qui_tient_agency_update_ne_configure_rien(): void
    {
        $gestes = $this->gestes($this->agentWith($this->agency, Capability::AgencyUpdate));

        $this->assertSame(array_fill_keys(array_keys($gestes), 403), $gestes);
    }

    /** Témoin : l'admin du rôle système configure. */
    public function test_l_admin_du_role_systeme_configure(): void
    {
        $gestes = $this->gestes($this->agencyAdmin($this->agency));

        foreach ($gestes as $geste => $statut) {
            $this->assertLessThan(300, $statut, "{$geste} → {$statut}");
        }
    }

    /** L'admin principal ne s'enferme pas dehors, même si son rôle retire la capacité. */
    public function test_l_admin_principal_sans_agency_update_configure_encore(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::AgencyUpdate);
        $this->agency->forceFill(['primary_admin_id' => $admin->id])->save();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$this->agency->id}", ['name' => 'Nom revu'])->assertOk();
        $this->getJson('/api/settings')->assertOk();
        $this->getJson('/api/integrations')->assertOk();
    }

    /** La liste complète des membres reste à `update()` : l'admin sans la capacité la garde. */
    public function test_la_liste_des_membres_reste_a_l_admin_sans_agency_update(): void
    {
        Sanctum::actingAs($this->adminWithout($this->agency, Capability::AgencyUpdate));

        $this->getJson("/api/agencies/{$this->agency->id}/members")->assertOk();
    }
}
