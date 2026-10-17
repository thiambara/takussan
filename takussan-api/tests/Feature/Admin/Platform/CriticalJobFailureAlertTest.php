<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Alerts\AlertableEvents;
use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\SendAdminAlert;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\AlertRule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-772 (P14.04) — un job d'argent ou de bail planifié qui échoue écrit une activité alertable
 * dès le premier échec, au lieu d'attendre la rafale de 20 échecs par heure.
 */
class CriticalJobFailureAlertTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string}> */
    public static function jobs(): array
    {
        return [
            'pénalités de retard' => [ApplyLateFeesJob::class],
            'rappels de loyer' => [SendLeasePaymentReminders::class],
            'relances de factures' => [SendOverdueRemindersJob::class],
        ];
    }

    #[DataProvider('jobs')]
    public function test_le_premier_echec_ecrit_une_activite_alertable(string $class): void
    {
        $this->assertTrue(AlertableEvents::has('ops_critical_job_failed'));

        (new $class)->failed(new RuntimeException('refus SMTP pour locataire@example.test'));

        $activity = Activity::query()->where('event', 'ops_critical_job_failed')->sole();
        $this->assertSame(class_basename($class), $activity->properties['job']);
        $this->assertSame(RuntimeException::class, $activity->properties['exception']);
        $this->assertStringNotContainsString('locataire@example.test', json_encode($activity->properties->all()));
    }

    public function test_une_regle_active_part_des_le_premier_echec(): void
    {
        Bus::fake([SendAdminAlert::class]);
        AlertRule::create([
            'event' => 'ops_critical_job_failed',
            'channels_json' => ['email'],
            'recipients_json' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ]);

        (new ApplyLateFeesJob)->failed(new RuntimeException('boom'));

        Bus::assertDispatchedSync(SendAdminAlert::class, 1);
    }
}
