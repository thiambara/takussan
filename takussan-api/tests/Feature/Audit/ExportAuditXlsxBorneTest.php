<?php

namespace Tests\Feature\Audit;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\ApiTestCase;

/**
 * TCK-1418 (P78.03) — le XLSX de l'export d'audit d'agence est borné à 20 000 lignes.
 *
 * PhpSpreadsheet bâtit la feuille entière en mémoire (`Excel::raw()` d'un `FromArray`). Mesuré
 * après le préchargement de TCK-1414 : 20 000 lignes, 64 s (sous les 85 s du job) et 118 Mo de
 * surcroît (sous les 256 Mo de `memory_limit`). Au-delà, le refus que l'export connaît déjà ;
 * le CSV, lui, n'est pas borné ici.
 */
class ExportAuditXlsxBorneTest extends ApiTestCase
{
    use RefreshDatabase;

    private function journal(User $auteur, Agency $agency, int $lignes): void
    {
        $now = now();
        foreach (array_chunk(range(1, $lignes), 1000) as $lot) {
            DB::table('activity_log')->insert(array_map(fn () => [
                'log_name' => 'default', 'description' => 'updated', 'event' => 'updated',
                'subject_type' => Agency::class, 'subject_id' => $agency->id,
                'causer_type' => User::class, 'causer_id' => $auteur->id, 'agency_id' => $agency->id,
                'created_at' => $now, 'updated_at' => $now,
            ], $lot));
        }
    }

    public function test_un_xlsx_de_plus_de_20_000_lignes_est_refuse_et_le_csv_part_en_file(): void
    {
        Queue::fake();
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->journal($admin, $agency, 20_001);

        $this->apiGet('/api/activity-logs/export?format=xlsx')
            ->assertStatus(422)
            ->assertJsonPath('code', 'activity_log.export_too_large');
        Queue::assertNotPushed(ExportActivityLogJob::class);

        $this->apiGet('/api/activity-logs/export?format=csv')->assertStatus(202);
        Queue::assertPushed(ExportActivityLogJob::class);
    }

    public function test_un_xlsx_a_la_borne_part_en_file(): void
    {
        Queue::fake();
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        // La borne compte toutes les lignes de l'agence, factories comprises : on en retire autant.
        $deja = DB::table('activity_log')->where('agency_id', $agency->id)->count();
        $this->journal($admin, $agency, 20_000 - $deja);

        $this->apiGet('/api/activity-logs/export?format=xlsx')->assertStatus(202);
    }
}
