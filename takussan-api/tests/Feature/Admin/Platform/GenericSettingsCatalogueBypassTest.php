<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-600 — AC21 : la route générique `/api/settings` n'écrivait plus une clé de catalogue en
 * portée globale (elle l'écrivait sans ses règles : une devise par défaut en TABLEAU passait).
 *
 * TCK-651 (ADR-0065) — elle n'écrit plus AUCUNE clé en portée globale, super-admin compris : ce que
 * le code lit en global s'écrit par un catalogue (les réglages métier de `ScopedSetting` y sont
 * entrés), et le reste n'a pas de lecteur. La portée `agency` reste ouverte.
 */
class GenericSettingsCatalogueBypassTest extends TestCase
{
    use RefreshDatabase;

    public function test_aucune_cle_globale_ne_se_cree_par_la_route_generique(): void
    {
        $this->actingAsRole('super_admin');

        foreach ([
            'currency.default', 'platform.session_max_minutes', 'enum.property_type.values',
            // TCK-651 — les réglages métier, au catalogue désormais, et une clé sans lecteur.
            'invoice.reminder_offsets_days', 'lease.rent_review_max_pct', 'site_name',
        ] as $cle) {
            $this->postJson('/api/settings', ['key' => $cle, 'value' => ['value' => 'x'], 'scope' => SettingScope::Global->value])
                ->assertStatus(422)
                ->assertJsonPath('code', 'setting.global_not_writable');
        }

        $this->assertSame(0, Setting::query()->count());
        $this->assertSame('XOF', app(PlatformSettingService::class)->getValue('currency.default'));
    }

    /** Second chemin : une ligne globale déjà là (écrite par l'éditeur) ne se modifie ni ne s'efface. */
    public function test_une_ligne_globale_ne_se_modifie_ni_ne_s_efface_par_la_route_generique(): void
    {
        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['lease.rent_review_max_pct' => 12.5])->assertOk();
        $ligne = Setting::query()->where('key', 'lease.rent_review_max_pct')->sole();

        $this->putJson("/api/settings/{$ligne->id}", ['value' => ['value' => 90]])
            ->assertStatus(422)->assertJsonPath('code', 'setting.global_not_writable');
        $this->patchJson("/api/settings/{$ligne->id}", ['value' => ['value' => 90]])
            ->assertStatus(422)->assertJsonPath('code', 'setting.global_not_writable');
        $this->deleteJson("/api/settings/{$ligne->id}")
            ->assertStatus(422)->assertJsonPath('code', 'setting.global_not_writable');

        $this->assertSame(12.5, $ligne->fresh()->value);
        $this->assertSame(12.5, app(PlatformSettingService::class)->getValue('lease.rent_review_max_pct'));
    }

    /**
     * La portée `agency` reste ouverte aux réglages métier du catalogue : la ligne d'agence l'emporte.
     * TCK-964 (P47.04, décision du porteur) — une clé hors catalogue y est désormais refusée en 422.
     */
    public function test_la_portee_agence_reste_ouverte(): void
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        Sanctum::actingAs($admin);

        $this->postJson('/api/settings', ['key' => 'lease.rent_review_max_pct', 'value' => ['value' => 8], 'scope' => SettingScope::Agency->value])
            ->assertCreated()
            ->assertJsonPath('data.scope_id', $agence->id);
        $this->postJson('/api/settings', ['key' => 'site_name', 'value' => ['name' => 'Takussan'], 'scope' => SettingScope::Agency->value])
            ->assertStatus(422)
            ->assertJsonValidationErrors('key');
    }
}
