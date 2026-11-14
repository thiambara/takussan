<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use Carbon\CarbonImmutable;
use Database\Seeders\Activity\PayoutSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

/**
 * TCK-2760 — le jeu de démo ne date aucun reversement `completed` dans le futur. Le mois en cours n'est pas
 * encore reversé : son reversement tomberait du 1er au 5 du mois suivant. Mesuré le 2026-11-12 : 119
 * reversements « faits » du 1er au 5 décembre, qui soldaient d'avance le reste à verser cumulé (décision 4 (a)).
 */
class PayoutSeederSansReversementFuturTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_mois_en_cours_n_est_pas_encore_reverse(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-12 10:00:00'));
        $agence = Agency::factory()->create();
        $bail = Lease::factory()->create(['agency_id' => $agence->id, 'status' => LeaseStatus::Active]);
        foreach (['2026-10-01', '2026-11-01'] as $mois) {
            LeasePayment::factory()->paid()->create([
                'lease_id' => $bail->id,
                'amount' => 100_000,
                'period_start' => $mois,
                'period_end' => CarbonImmutable::parse($mois)->endOfMonth()->toDateString(),
                'paid_at' => CarbonImmutable::parse($mois)->addDays(3),
            ]);
        }

        $contexte = new SeedingContext(new SeedingConfig(agencies: 1, includeDemoUsers: false));
        $contexte->leases = new Collection([$bail]);
        app()->instance(SeedingContext::class, $contexte);
        app()->call([app(PayoutSeeder::class), 'run']);

        $reverses = Payout::query()->where('lease_id', $bail->id)->get();
        $this->assertSame(['2026-10-01'], $reverses->map(fn (Payout $p) => $p->period_start->toDateString())->all(), 'octobre est reversé, novembre pas encore');
        $this->assertSame(PayoutStatus::Completed, $reverses->first()->status);
        $this->assertTrue($reverses->first()->processed_at->lessThanOrEqualTo(now()));
    }
}
