<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\TaskPriority;
use App\Models\Task;
use App\Models\ThresholdAlert;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1302 (P134.03) — `sort=priority` des tâches et `sort=severity` des alertes de seuil trient
 * par RANG, et non sur la chaîne : `ORDER BY priority DESC` rendait `medium, low, high`, et
 * `ORDER BY severity` rendait `critical, info, warning`.
 */
class TrisParRangTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<int,string> */
    private function lire(string $url, string $cle): array
    {
        return collect($this->getJson($url)->assertOk()->json('data'))->pluck($cle)->all();
    }

    public function test_les_taches_se_trient_par_rang_de_priorite(): void
    {
        foreach ([TaskPriority::Medium, TaskPriority::High, TaskPriority::Low] as $priorite) {
            Task::factory()->create(['priority' => $priorite]);
        }
        $this->actingAsRole('super_admin');

        $this->assertSame(['low', 'medium', 'high'], $this->lire('/api/tasks?sort=priority', 'priority'));
        $this->assertSame(['high', 'medium', 'low'], $this->lire('/api/tasks?sort=-priority', 'priority'));
    }

    public function test_les_alertes_de_seuil_se_trient_par_rang_de_gravite(): void
    {
        $agency = Agency::factory()->create();
        foreach (['warning', 'critical', 'info'] as $gravite) {
            ThresholdAlert::create([
                'agency_id' => $agency->id,
                'metric' => 'unpaid_rate_percent',
                'operator' => '>',
                'threshold' => 10.0,
                'severity' => $gravite,
                'is_enabled' => true,
                'cooldown_hours' => 24,
            ]);
        }
        $this->actingAsRole('super_admin');

        $this->assertSame(['info', 'warning', 'critical'], $this->lire('/api/threshold-alerts?sort=severity', 'severity'));
        $this->assertSame(['critical', 'warning', 'info'], $this->lire('/api/threshold-alerts?sort=-severity', 'severity'));
    }

    public function test_les_taches_de_meme_priorite_se_departagent_dans_le_sens_du_tri(): void
    {
        $taches = collect(range(1, 4))->map(fn () => Task::factory()->create(['priority' => TaskPriority::High]));
        $taches->first()->update(['title' => 'Relue']);
        $this->actingAsRole('super_admin');

        $ids = $taches->pluck('id')->sort()->values()->all();

        $this->assertSame(array_reverse($ids), $this->lire('/api/tasks?sort=-priority', 'id'));
        $this->assertSame($ids, $this->lire('/api/tasks?sort=priority', 'id'));
    }
}
