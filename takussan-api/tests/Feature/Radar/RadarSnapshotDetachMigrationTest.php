<?php

namespace Tests\Feature\Radar;

use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Services\Radar\RadarPurger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2392 (ADR-0080) — le `down()` de `2026_10_30_392300` : la colonne redevient obligatoire, les instantanés que la
 * purge a détachés (sans annonce ni passage, dates au jour) sont supprimés, les autres restent ; l'`up()` rejoué la rend
 * nullable, et la clé étrangère reste en `ON DELETE CASCADE` à chaque étape. Le banc de la contre-vérification, devenu
 * test (le DDL de PostgreSQL est transactionnel : `RefreshDatabase` défait tout).
 */
class RadarSnapshotDetachMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const PATH = 'database/migrations/2026_10_30_392300_detach_radar_listing_snapshots_on_purge.php';

    private function nullable(): string
    {
        return DB::selectOne("select is_nullable from information_schema.columns where table_name = 'radar_listing_snapshots' and column_name = 'radar_listing_id'")->is_nullable;
    }

    private function cascade(): bool
    {
        return DB::selectOne("select confdeltype from pg_constraint where conrelid = 'radar_listing_snapshots'::regclass and conname = 'radar_snapshots_listing_fk'")?->confdeltype === 'c';
    }

    public function test_le_down_supprime_les_detaches_et_garde_les_lies_puis_l_up_rend_la_colonne_nullable(): void
    {
        $this->freezeSecond();
        $base = ['price' => 1000, 'first_seen_at' => now(), 'last_seen_at' => now(), 'observations' => 1];
        $echue = RadarListing::factory()->extracted()->create(['purge_at' => now()->subDay()]);
        $vivante = RadarListing::factory()->extracted()->create(['purge_at' => now()->addDays(30)]);
        RadarListingSnapshot::query()->create($base + ['radar_listing_id' => $echue->id]);
        RadarListingSnapshot::query()->create($base + ['radar_listing_id' => $vivante->id]);
        $this->app->make(RadarPurger::class)->run();
        $this->assertSame(1, RadarListingSnapshot::query()->whereNull('radar_listing_id')->count());
        $this->assertSame('YES', $this->nullable());

        Artisan::call('migrate:rollback', ['--path' => self::PATH, '--force' => true]);

        $this->assertSame('NO', $this->nullable());
        $this->assertSame([$vivante->id], RadarListingSnapshot::query()->pluck('radar_listing_id')->all());
        $this->assertTrue($this->cascade());

        Artisan::call('migrate', ['--path' => self::PATH, '--force' => true]);

        $this->assertSame('YES', $this->nullable());
        $this->assertTrue($this->cascade());
    }
}
