<?php

namespace Tests\Feature\Database;

use App\Models\Agency;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-640 — la ligne « globale » d'une unicité composée (colonne de portée à `NULL`) est unique EN
 * BASE, pas seulement par la discipline des écrivains.
 *
 * Les écritures passent par `DB::table()` : c'est la base qu'on juge, pas un `updateOrCreate`.
 * Chaque refus attendu s'exécute dans un point de sauvegarde — une erreur SQL abandonne la
 * transaction entière sous PostgreSQL.
 */
class GlobalRowUniquenessTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_second_global_setting_with_the_same_key_is_refused(): void
    {
        $this->setting('credits.welcome_amount', null, now());

        $this->assertRefused(fn () => $this->setting('credits.welcome_amount', null, now()));
        $this->assertSame(1, DB::table('settings')->where('key', 'credits.welcome_amount')->count());
    }

    public function test_the_same_key_stays_allowed_once_per_agency_and_once_globally(): void
    {
        $agencies = Agency::factory()->count(2)->create();

        $this->setting('booking.auto_expire_hours', null, now());
        $this->setting('booking.auto_expire_hours', $agencies[0]->id, now());
        $this->setting('booking.auto_expire_hours', $agencies[1]->id, now());

        $this->assertRefused(fn () => $this->setting('booking.auto_expire_hours', $agencies[0]->id, now()));
        $this->assertSame(3, DB::table('settings')->where('key', 'booking.auto_expire_hours')->count());
    }

    public function test_a_second_live_platform_integration_for_a_provider_is_refused(): void
    {
        $this->integration('wave', null);

        $this->assertRefused(fn () => $this->integration('wave', null));
    }

    public function test_a_soft_deleted_integration_does_not_block_its_replacement(): void
    {
        $agency = Agency::factory()->create();
        $this->integration('wave', null, deleted: true);
        $this->integration('wave', $agency->id, deleted: true);

        $this->integration('wave', null);
        $this->integration('wave', $agency->id);

        $this->assertSame(4, DB::table('integrations')->where('provider', 'wave')->count());
        $this->assertRefused(fn () => $this->integration('wave', $agency->id));
    }

    /**
     * Les doublons antérieurs au durcissement : la migration garde la ligne de paramètre la plus
     * récemment écrite (la dernière voulue), et l'intégration active, puis la plus récente — les
     * autres intégrations sont supprimées en douceur, jamais effacées.
     */
    public function test_the_migrations_resolve_existing_duplicates_before_hardening(): void
    {
        $settings = require database_path('migrations/2026_10_14_120000_make_settings_unique_nulls_not_distinct.php');
        $integrations = require database_path('migrations/2026_10_14_120100_make_integrations_unique_live_nulls_not_distinct.php');
        $settings->down();
        $integrations->down();

        $stale = $this->setting('platform.name', null, now()->subDay(), 'ancien');
        $latest = $this->setting('platform.name', null, now(), 'récent');

        $active = $this->integration('wave', null, active: true, updatedAt: now()->subDay());
        $inactive = $this->integration('wave', null, active: false, updatedAt: now());

        $settings->up();
        $integrations->up();

        $this->assertSame([$latest], DB::table('settings')->where('key', 'platform.name')->pluck('id')->all());
        $this->assertNull(DB::table('integrations')->where('id', $active)->value('deleted_at'));
        $this->assertNotNull(DB::table('integrations')->where('id', $inactive)->value('deleted_at'));
        $this->assertSame(2, DB::table('integrations')->where('provider', 'wave')->count());
        $this->assertDatabaseMissing('settings', ['id' => $stale]);
    }

    private function setting(string $key, ?int $agencyId, $updatedAt, string $value = 'v'): int
    {
        return DB::table('settings')->insertGetId([
            'key' => $key,
            'value' => json_encode($value),
            'scope' => $agencyId === null ? 'global' : 'agency',
            'scope_id' => $agencyId,
            'created_at' => $updatedAt,
            'updated_at' => $updatedAt,
        ]);
    }

    private function integration(string $provider, ?int $agencyId, bool $deleted = false, bool $active = true, $updatedAt = null): int
    {
        return DB::table('integrations')->insertGetId([
            'provider' => $provider,
            'agency_id' => $agencyId,
            'credentials' => 'chiffré',
            'is_active' => $active,
            'created_at' => $updatedAt ?? now(),
            'updated_at' => $updatedAt ?? now(),
            'deleted_at' => $deleted ? now() : null,
        ]);
    }

    private function assertRefused(callable $write): void
    {
        DB::beginTransaction();
        try {
            $write();
            $this->fail('La base a accepté une ligne en double.');
        } catch (UniqueConstraintViolationException) {
            $this->addToAssertionCount(1);
        } finally {
            DB::rollBack();
        }
    }
}
