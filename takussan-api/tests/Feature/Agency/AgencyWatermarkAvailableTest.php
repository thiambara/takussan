<?php

namespace Tests\Feature\Agency;

use App\Domain\Features\Flag;
use App\Models\Agency;
use App\Models\FeatureFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (décision du porteur, 2026-10-12) — la configuration d'agence ne propose « Regénérer les
 * filigranes » que si le filigrane est allumé pour la plateforme. Éteint (le défaut, lot A), le
 * bouton promettait un filigrane qu'aucune photo ne recevrait. L'écran ne lit pas le drapeau
 * (`media_watermark` n'est pas `clientVisible`) : la ressource d'agence lui en donne l'état.
 */
class AgencyWatermarkAvailableTest extends TestCase
{
    use RefreshDatabase;

    private function lireLAgence(): array
    {
        $agence = Agency::factory()->create();
        $this->actingAsRole('super_admin');

        return $this->getJson("/api/agencies/{$agence->id}")->assertOk()->json('data');
    }

    public function test_eteint_par_defaut_la_ressource_le_dit(): void
    {
        $this->assertFalse($this->lireLAgence()['watermark_available']);
    }

    public function test_allume_pour_la_plateforme_la_ressource_le_dit(): void
    {
        FeatureFlag::query()->updateOrCreate(
            ['key' => Flag::MediaWatermark->value],
            ['label' => Flag::MediaWatermark->value, 'enabled' => true, 'segments_json' => []],
        );
        app()->forgetScopedInstances();

        $this->assertTrue($this->lireLAgence()['watermark_available']);
    }
}
