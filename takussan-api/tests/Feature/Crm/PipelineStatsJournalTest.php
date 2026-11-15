<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2591 (ADR-0103 § 6) — les indicateurs du pipeline se lisent dans le journal des étapes,
 * jamais dans `updated_at` : le taux de conversion compte des SORTIES datées (passages vers
 * `converted` et `lost` des 30 derniers jours), et `median_days_in_stage` rend la médiane des
 * durées closes de chacune des six étapes.
 */
class PipelineStatsJournalTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
    }

    private function fiche(CustomerPipelineStage $stage = CustomerPipelineStage::Lead): Customer
    {
        return Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => $stage,
        ]);
    }

    /** @return array<string, mixed> */
    private function stats(string $query = ''): array
    {
        Sanctum::actingAs($this->agent);

        return $this->getJson('/api/customers/pipeline-stats'.$query)->assertOk()->json('data');
    }

    public function test_ac1_a_retouched_old_win_does_not_count_and_exits_of_the_month_do(): void
    {
        // Gagnée il y a 60 jours, retouchée aujourd'hui (téléphone) : hors du taux.
        $this->travelTo(now()->subDays(61));
        $old = $this->fiche(CustomerPipelineStage::Negotiating);
        $this->travel(1)->days();
        $old->update(['pipeline_stage' => CustomerPipelineStage::Converted]);
        $this->travelBack();
        $old->update(['phone' => '+221779998877']);

        // Ce mois-ci : deux passages vers `converted`, un vers `lost`.
        $this->travelTo(now()->subDays(10));
        $a = $this->fiche(CustomerPipelineStage::Qualified);
        $b = $this->fiche(CustomerPipelineStage::Negotiating);
        $c = $this->fiche(CustomerPipelineStage::Prospect);
        $this->travel(2)->days();
        $a->update(['pipeline_stage' => CustomerPipelineStage::Converted]);
        $b->update(['pipeline_stage' => CustomerPipelineStage::Converted]);
        $c->update(['pipeline_stage' => CustomerPipelineStage::Lost]);
        $this->travelBack();

        $stats = $this->stats();

        $this->assertSame(['converted' => 2, 'lost' => 1], $stats['exits_last_30d']);
        $this->assertEquals(0.6667, $stats['conversion_rate']);
        $this->assertSame(3, $stats['stage_counts']['converted']);
    }

    public function test_a_win_older_than_30_days_never_counts_even_when_still_converted(): void
    {
        $this->travelTo(now()->subDays(45));
        $this->fiche(CustomerPipelineStage::Converted);
        $this->travelBack();

        $stats = $this->stats();

        $this->assertSame(['converted' => 0, 'lost' => 0], $stats['exits_last_30d']);
        $this->assertEquals(0.0, $stats['conversion_rate']);
    }

    public function test_ac2_the_median_of_each_of_the_six_stages_on_a_known_journal(): void
    {
        // Trois fiches parcourent tout le pipeline ; leurs séjours dans chaque étape valent
        // 1, 2 et 6 jours (médiane 2) pour lead… 4, 4 et 10 pour lost (médiane 4).
        $sejours = [
            'lead' => [1, 2, 6],
            'prospect' => [3, 1, 2],
            'qualified' => [5, 5, 1],
            'negotiating' => [2, 8, 4],
            'converted' => [1, 3, 3],
            'lost' => [4, 4, 10],
        ];
        $chemin = ['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost', 'lead'];

        foreach (range(0, 2) as $i) {
            $this->travelTo(now()->startOfDay()->subDays(60));
            $fiche = $this->fiche(CustomerPipelineStage::Lead);
            foreach (array_slice($chemin, 1) as $k => $suivante) {
                $this->travel($sejours[$chemin[$k]][$i])->days();
                $fiche->update(['pipeline_stage' => CustomerPipelineStage::from($suivante)]);
            }
            $this->travelBack();
        }

        $stats = $this->stats();

        $this->assertSame([
            'lead' => 2, 'prospect' => 2, 'qualified' => 5, 'negotiating' => 4, 'converted' => 3, 'lost' => 4,
        ], array_map('intval', $stats['median_days_in_stage']));
        // La moyenne reste servie (compatibilité) : lead = (1 + 2 + 6) / 3.
        $this->assertEquals(3.0, $stats['avg_time_in_stage']['lead']);
    }

    public function test_a_stage_without_a_closed_stay_has_no_median(): void
    {
        $this->fiche(CustomerPipelineStage::Lead);

        $this->assertNull($this->stats()['median_days_in_stage']['lead']);
    }
}
