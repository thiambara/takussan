<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-1298 (P118.04) — sans `sort=`, les relevés d'une agence sortent du plus récent au plus
 * ancien, puis par `id` décroissant : l'ordre que le front demande déjà (`sort=-created_at`).
 */
class BankStatementDefaultOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_sans_tri_demande_les_releves_sortent_du_plus_recent_au_plus_ancien(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $creer = function (string $quand) use ($agency, $admin): BankStatement {
            Carbon::setTestNow($quand);
            $releve = BankStatement::factory()->create(['agency_id' => $agency->id, 'uploaded_by' => $admin->id]);
            Carbon::setTestNow();

            return $releve;
        };

        $releves = collect([
            $creer('2026-10-01 09:00:00'),
            $creer('2026-10-03 09:00:00'),
            $creer('2026-10-01 09:00:00'),
            $creer('2026-10-02 09:00:00'),
            $creer('2026-10-03 09:00:00'),
        ]);
        // La vie normale d'un relevé : une mise à jour déplace sa position physique.
        $releves->first()->update(['bank_name' => 'Relu']);
        $releves->get(1)->update(['bank_name' => 'Relu aussi']);

        $attendu = $releves
            ->sortBy([['created_at', 'desc'], ['id', 'desc']])
            ->pluck('id')
            ->values()
            ->all();

        $response = $this->actingAs($admin)
            ->getJson("/api/agencies/{$agency->id}/bank-statements")
            ->assertOk();

        $this->assertSame($attendu, collect($response->json('data'))->pluck('id')->all());
    }

    public function test_les_tris_que_le_front_envoie_restent_acceptes(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);
        BankStatement::factory()->count(2)->create(['agency_id' => $agency->id, 'uploaded_by' => $admin->id]);

        foreach (['-created_at', 'created_at', '-period_start', 'period_start', '-id'] as $tri) {
            $this->actingAs($admin)
                ->getJson("/api/agencies/{$agency->id}/bank-statements?sort={$tri}")
                ->assertOk();
        }
    }
}
