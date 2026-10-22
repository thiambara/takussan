<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-1178 (P100.01) — l'échéancier d'un bail de plus de 100 échéances.
 *
 * `useLeasePayments` demande `sort=due_date` et `per_page=100`. Le contrôleur triait en dur par
 * `period_start` décroissant et ignorait le `sort` : la première page rendait les 100 plus
 * récentes, et les plus anciennes, celles qui tombent en retard les premières, n'arrivaient ni à
 * l'échéancier, ni au compte des retards de la fiche, ni au dialogue d'encaissement.
 */
class LeasePaymentIndexSortTest extends TestCase
{
    use LeaseDueFixture;
    use RefreshDatabase;

    /** @return array{lease: Lease, tenant: User, oldest: string} */
    private function bailDe110Echeances(): array
    {
        $ctx = $this->leaseDue(null, [
            'due_date' => '2015-01-05',
            'period_start' => '2015-01-01',
            'period_end' => '2015-01-31',
        ]);

        $debut = Carbon::parse('2015-02-01');
        for ($i = 0; $i < 109; $i++) {
            $mois = $debut->copy()->addMonthsNoOverflow($i);
            LeasePayment::factory()->create([
                'lease_id' => $ctx['lease']->id,
                'amount' => 150_000,
                'status' => $i < 2 ? PaymentStatus::Late : PaymentStatus::Pending,
                'period_start' => $mois->toDateString(),
                'period_end' => $mois->copy()->endOfMonth()->toDateString(),
                'due_date' => $mois->copy()->addDays(4)->toDateString(),
                'late_fee_amount' => null,
                'late_fee_applied_at' => null,
            ]);
        }

        return ['lease' => $ctx['lease'], 'tenant' => $ctx['tenant'], 'oldest' => '2015-01-05'];
    }

    public function test_sort_due_date_rend_les_echeances_de_la_plus_ancienne_a_la_plus_recente(): void
    {
        $ctx = $this->bailDe110Echeances();
        Sanctum::actingAs($ctx['tenant']);

        $url = "/api/leases/{$ctx['lease']->id}/payments?sort=due_date&per_page=100";

        $page1 = $this->getJson($url)->assertOk();
        $page1->assertJsonPath('meta.total', 110)->assertJsonPath('meta.last_page', 2);
        $dates = array_column($page1->json('data'), 'due_date');
        $this->assertSame($ctx['oldest'], $dates[0]);
        $copie = $dates;
        sort($copie);
        $this->assertSame($copie, $dates);
        $this->assertSame(3, collect($page1->json('data'))->where('status', 'late')->count());

        $page2 = $this->getJson($url.'&page=2')->assertOk();
        $this->assertCount(10, $page2->json('data'));
        $this->assertGreaterThan(end($dates), $page2->json('data.0.due_date'));
    }

    public function test_sort_moins_due_date_rend_l_ordre_decroissant(): void
    {
        $ctx = $this->bailDe110Echeances();
        Sanctum::actingAs($ctx['tenant']);

        $dates = array_column(
            $this->getJson("/api/leases/{$ctx['lease']->id}/payments?sort=-due_date&per_page=100")->assertOk()->json('data'),
            'due_date',
        );
        $copie = $dates;
        rsort($copie);
        $this->assertSame($copie, $dates);
        $this->assertNotContains($ctx['oldest'], $dates);
    }

    public function test_sans_sort_l_ordre_reste_period_start_decroissant(): void
    {
        $ctx = $this->bailDe110Echeances();
        Sanctum::actingAs($ctx['tenant']);

        $rows = $this->getJson("/api/leases/{$ctx['lease']->id}/payments?per_page=5")->assertOk()->json('data');
        $this->assertSame('2024-02-01', $rows[0]['period_start']);
    }
}
