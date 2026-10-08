<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-593 (Partie 5, AC11) — un réglage enregistré n'en efface aucun autre.
 *
 * `AgencyController::update` faisait `fill($request->validated())` : un `settings` partiel
 * REMPLAÇAIT la colonne. L'écran de configuration de l'agence n'envoie que trois clés ; chaque
 * enregistrement effaçait donc les autres, et un filigrane désactivé (`watermark_enabled = false`)
 * revenait à son défaut, `true`, sans que personne ne l'ait demandé.
 */
class AgencySettingsMergeTest extends TestCase
{
    use RefreshDatabase;

    private function agencyWithSettings(array $settings): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'settings' => $settings,
        ]);

        return [$admin, $agency];
    }

    public function test_un_patch_de_settings_n_efface_pas_les_autres_cles(): void
    {
        [$admin, $agency] = $this->agencyWithSettings([
            'watermark_enabled' => false,
            'timezone' => 'Africa/Dakar',
        ]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['late_fee_online_collection' => true],
        ])->assertOk();

        $settings = $agency->refresh()->settings;
        $this->assertFalse($settings['watermark_enabled']);
        $this->assertSame('Africa/Dakar', $settings['timezone']);
        $this->assertTrue($settings['late_fee_online_collection']);
        $this->assertTrue($agency->collectsLateFeesOnline());
    }

    public function test_une_cle_a_null_revient_au_defaut(): void
    {
        [$admin, $agency] = $this->agencyWithSettings([
            'watermark_enabled' => false,
            'late_fee_online_collection' => true,
        ]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['late_fee_online_collection' => null],
        ])->assertOk();

        $settings = $agency->refresh()->settings;
        $this->assertArrayNotHasKey('late_fee_online_collection', $settings);
        $this->assertFalse($settings['watermark_enabled']);
        $this->assertFalse($agency->collectsLateFeesOnline());
    }

    public function test_settings_null_est_refuse(): void
    {
        [$admin, $agency] = $this->agencyWithSettings(['watermark_enabled' => false]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => null])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings');

        $this->assertFalse($agency->refresh()->settings['watermark_enabled']);
    }

    public function test_le_reglage_de_penalite_refuse_une_valeur_non_booleenne(): void
    {
        [$admin, $agency] = $this->agencyWithSettings([]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['late_fee_online_collection' => 'peut-etre'],
        ])->assertStatus(422)->assertJsonValidationErrors('settings.late_fee_online_collection');
    }

    public function test_agence_neuve_n_a_pas_la_cle_et_n_encaisse_pas_en_ligne(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/agencies', ['name' => 'Agence Neuve '.uniqid()]);
        $response->assertCreated();

        $agency = Agency::query()->findOrFail($response->json('data.id'));
        $this->assertArrayNotHasKey('late_fee_online_collection', $agency->settings ?? []);
        $this->assertFalse($agency->collectsLateFeesOnline());
    }
}
