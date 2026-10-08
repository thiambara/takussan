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
 * TCK-600 — AC21 : la route générique `/api/settings` n'écrit plus une clé de catalogue en
 * portée globale. Elle l'écrivait sans ses règles : une devise par défaut en TABLEAU passait, et
 * `getValue()` la rendait ensuite à chaque lecteur.
 */
class GenericSettingsCatalogueBypassTest extends TestCase
{
    use RefreshDatabase;

    public function test_une_cle_du_catalogue_ne_se_cree_pas_par_la_route_generique(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['currency.default', 'platform.session_max_minutes', 'enum.property_type.values'] as $cle) {
            $this->postJson('/api/settings', ['key' => $cle, 'value' => ['USD'], 'scope' => SettingScope::Global->value])
                ->assertStatus(422)
                ->assertJsonPath('code', 'setting.managed_by_catalogue');
        }

        $this->assertSame(0, Setting::query()->count());
        $this->assertSame('XOF', app(PlatformSettingService::class)->getValue('currency.default'));
    }

    /** Second chemin : une ligne déjà là (écrite par l'éditeur) ne se modifie ni ne s'efface. */
    public function test_une_ligne_du_catalogue_ne_se_modifie_ni_ne_s_efface_par_la_route_generique(): void
    {
        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['currency.default' => 'EUR'])->assertOk();
        $ligne = Setting::query()->where('key', 'currency.default')->sole();

        $this->putJson("/api/settings/{$ligne->id}", ['value' => ['USD']])
            ->assertStatus(422)->assertJsonPath('code', 'setting.managed_by_catalogue');
        $this->patchJson("/api/settings/{$ligne->id}", ['value' => ['USD']])
            ->assertStatus(422)->assertJsonPath('code', 'setting.managed_by_catalogue');
        $this->deleteJson("/api/settings/{$ligne->id}")
            ->assertStatus(422)->assertJsonPath('code', 'setting.managed_by_catalogue');

        $this->assertSame('EUR', $ligne->fresh()->value);
        $this->assertSame('EUR', app(PlatformSettingService::class)->getValue('currency.default'));
    }

    public function test_une_cle_hors_catalogue_et_la_portee_agence_restent_ouvertes(): void
    {
        $this->actingAsRole('super_admin');
        $this->postJson('/api/settings', ['key' => 'site_name', 'value' => ['name' => 'Takussan'], 'scope' => SettingScope::Global->value])
            ->assertCreated();

        $agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($admin);

        $this->postJson('/api/settings', ['key' => 'currency.default', 'value' => ['EUR'], 'scope' => SettingScope::Agency->value])
            ->assertCreated()
            ->assertJsonPath('data.scope_id', $agence->id);
    }
}
