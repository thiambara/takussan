<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1294 (P118.01) — l'écran des lignes d'un relevé demande `sort=posted_at`
 * (`takussan-web/src/lib/queries/reconciliation.ts`). Sans tri déclaré sur le modèle, spatie
 * refusait la requête en 400 : l'écran n'affichait jamais une ligne.
 */
class BankStatementLineSortTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_lignes_se_lisent_triees_par_date_comptable_puis_par_id(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $statement = BankStatement::factory()->create(['agency_id' => $agency->id, 'uploaded_by' => $admin->id]);

        $dates = ['2026-04-12', '2026-04-10', '2026-04-12', '2026-04-11', '2026-04-10'];
        $lines = collect($dates)->map(fn (string $date) => BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'posted_at' => $date,
        ]));
        // La vie normale d'une ligne : une mise à jour déplace sa position physique.
        $lines->first()->update(['label' => 'Relu']);

        $attendu = $lines
            ->sortBy([['posted_at', 'asc'], ['id', 'asc']])
            ->pluck('id')
            ->values()
            ->all();

        $response = $this->actingAs($admin)
            ->getJson("/api/bank-statements/{$statement->id}/lines?per_page=50&page=1&sort=posted_at")
            ->assertOk();

        $this->assertSame($attendu, collect($response->json('data'))->pluck('id')->all());
    }

    public function test_sans_tri_demande_les_lignes_sortent_dans_le_meme_ordre(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $statement = BankStatement::factory()->create(['agency_id' => $agency->id, 'uploaded_by' => $admin->id]);

        $lines = collect(['2026-04-12', '2026-04-10', '2026-04-11', '2026-04-10'])
            ->map(fn (string $date) => BankStatementLine::factory()->create([
                'bank_statement_id' => $statement->id,
                'posted_at' => $date,
            ]));
        $lines->first()->update(['label' => 'Relu']);

        $attendu = $lines
            ->sortBy([['posted_at', 'asc'], ['id', 'asc']])
            ->pluck('id')
            ->values()
            ->all();

        $response = $this->actingAs($admin)
            ->getJson("/api/bank-statements/{$statement->id}/lines")
            ->assertOk();

        $this->assertSame($attendu, collect($response->json('data'))->pluck('id')->all());
    }
}
