<?php

namespace Tests\Feature\Audit;

use App\Http\Controllers\Api\ActivityLogExportController;
use App\Jobs\Audit\PurgeExpiredActivityLogExports;
use App\Models\User;
use App\Notifications\ActivityLogExportReadyNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-1143 (P63.04) — les fichiers d'export du journal d'activité ne survivent pas à leur lien, et
 * la notification ne range pas l'URL signée.
 */
class ExportsDAuditEchusTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_purge_supprime_les_exports_d_audit_dont_le_lien_est_echu(): void
    {
        Storage::fake('local');
        $echu = ActivityLogExportController::storagePath(7, '11111111-1111-4111-8111-111111111111.csv');
        Storage::disk('local')->put($echu, 'ancien');
        touch(Storage::disk('local')->path($echu), now()->subHours(ActivityLogExportController::LINK_TTL_HOURS + 1)->getTimestamp());

        $recent = ActivityLogExportController::storagePath(7, '22222222-2222-4222-8222-222222222222.csv');
        Storage::disk('local')->put($recent, 'récent');

        (new PurgeExpiredActivityLogExports)->handle();

        Storage::disk('local')->assertMissing($echu);
        Storage::disk('local')->assertExists($recent);
    }

    public function test_la_notification_ne_range_pas_l_url_signee(): void
    {
        $notification = new ActivityLogExportReadyNotification('https://exemple.test/signee', 'audit.csv', 3);

        $this->assertSame(
            ['filename' => 'audit.csv', 'row_count' => 3],
            $notification->toArray(User::factory()->make()),
        );
    }
}
