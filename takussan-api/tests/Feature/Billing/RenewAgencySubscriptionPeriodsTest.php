<?php

namespace Tests\Feature\Billing;

use App\Jobs\Billing\RenewAgencySubscriptionPeriods;
use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use App\Services\Billing\AgencySubscriptionService;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-1303 (P115.03) — la période d'un abonnement d'agence n'était écrite qu'à l'attribution
 * (maintenant → + 1 mois) : un mois plus tard, l'écran de facturation affichait une période échue
 * comme période en cours. Une tâche quotidienne la reconduit tant que l'abonnement est `active`.
 */
class RenewAgencySubscriptionPeriodsTest extends TestCase
{
    use RefreshDatabase;

    private Plan $plan;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-02 02:20:00');
        $this->plan = Plan::query()->create([
            'code' => 'pro',
            'label' => 'Pro',
            'monthly_price_xof' => 10_000,
            'platform_fee_pct' => 0,
            'trial_days' => 0,
            'limits' => [],
            'is_active' => true,
            'sort_order' => 10,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function subscription(AgencySubscriptionStatus $status, string $start, string $end, array $extra = []): AgencySubscription
    {
        return AgencySubscription::query()->create(array_merge([
            'agency_id' => Agency::factory()->create()->id,
            'plan_id' => $this->plan->id,
            'status' => $status,
            'current_period_start' => $start,
            'current_period_end' => $end,
        ], $extra));
    }

    public function test_la_periode_echue_d_un_abonnement_actif_est_reconduite_jusqu_a_la_periode_en_cours(): void
    {
        // Attribué le 2026-09-01 : la période a échu deux fois, le 1er octobre puis le 1er novembre.
        $active = $this->subscription(AgencySubscriptionStatus::Active, '2026-09-01 10:00:00', '2026-10-01 10:00:00');
        $current = $this->subscription(AgencySubscriptionStatus::Active, '2026-10-20 10:00:00', '2026-11-20 10:00:00');
        $trialing = $this->subscription(AgencySubscriptionStatus::Trialing, '2026-09-01 10:00:00', '2026-10-01 10:00:00', ['trial_ends_at' => '2026-12-01 00:00:00']);
        $ended = $this->subscription(AgencySubscriptionStatus::Ended, '2026-09-01 10:00:00', '2026-10-01 10:00:00', ['ended_at' => '2026-09-15 00:00:00']);

        $this->assertSame(1, app(AgencySubscriptionService::class)->renewPeriods());

        $active->refresh();
        $this->assertSame('2026-11-01 10:00:00', $active->current_period_start->format('Y-m-d H:i:s'));
        $this->assertSame('2026-12-01 10:00:00', $active->current_period_end->format('Y-m-d H:i:s'));
        $this->assertSame(AgencySubscriptionStatus::Active, $active->status);

        $this->assertSame('2026-11-20 10:00:00', $current->refresh()->current_period_end->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-01 10:00:00', $trialing->refresh()->current_period_end->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-01 10:00:00', $ended->refresh()->current_period_end->format('Y-m-d H:i:s'));

        // Idempotente : un second passage ne trouve plus de période échue.
        $this->assertSame(0, app(AgencySubscriptionService::class)->renewPeriods());
    }

    public function test_une_fin_de_mois_ne_deborde_pas_sur_le_mois_suivant(): void
    {
        $subscription = $this->subscription(AgencySubscriptionStatus::Active, '2026-08-31 10:00:00', '2026-09-30 10:00:00');

        (new RenewAgencySubscriptionPeriods)->handle(app(AgencySubscriptionService::class));

        $subscription->refresh();
        $this->assertSame('2026-10-30 10:00:00', $subscription->current_period_start->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-30 10:00:00', $subscription->current_period_end->format('Y-m-d H:i:s'));
    }

    public function test_la_tache_est_planifiee_chaque_jour_sans_chevauchement(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->description, RenewAgencySubscriptionPeriods::class));

        $this->assertNotNull($event, 'RenewAgencySubscriptionPeriods absente du planificateur');
        $this->assertSame('20 2 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }
}
