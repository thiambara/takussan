<?php

namespace Tests\Feature\Listeners;

use App\Events\Lease\LeaseActivated;
use App\Listeners\Lease\CreateTenantOnboardingChecklist;
use App\Listeners\Lease\GenerateCommissionEntries;
use App\Models\Lease;
use Illuminate\Events\CallQueuedListener;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-1392 (P142.04) — les lignes de commission d'un bail et sa checklist d'entrée ne naissent
 * que de ces deux écouteurs en file, sans autre appelant. Ils attendent entre deux essais, et
 * leur échec final écrit l'activité alertable `ops_critical_job_failed` dès le premier, comme
 * les jobs d'argent et de bail (`AlertsOnFirstFailure`, TCK-772).
 */
class EcouteursDuBailEnEchecTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string}> */
    public static function ecouteurs(): array
    {
        return [
            'commissions' => [GenerateCommissionEntries::class],
            'checklist d\'entrée' => [CreateTenantOnboardingChecklist::class],
        ];
    }

    #[DataProvider('ecouteurs')]
    public function test_l_ecouteur_en_file_attend_entre_deux_essais(string $class): void
    {
        Queue::fake();

        event(new LeaseActivated(Lease::factory()->create()));

        Queue::assertPushed(
            CallQueuedListener::class,
            fn (CallQueuedListener $job): bool => $job->class === $class && $job->backoff === [60, 300, 900],
        );
    }

    #[DataProvider('ecouteurs')]
    public function test_l_echec_final_ecrit_une_activite_alertable(string $class): void
    {
        $event = new LeaseActivated(Lease::factory()->create());
        $job = unserialize(serialize(new CallQueuedListener($class, 'handle', [$event])));

        $job->failed(new RuntimeException('refus pour locataire@example.test'));

        $activity = Activity::query()->where('event', 'ops_critical_job_failed')->sole();
        $this->assertSame(class_basename($class), $activity->properties['job']);
        $this->assertSame(RuntimeException::class, $activity->properties['exception']);
        $this->assertStringNotContainsString('locataire@example.test', json_encode($activity->properties->all()));
    }
}
