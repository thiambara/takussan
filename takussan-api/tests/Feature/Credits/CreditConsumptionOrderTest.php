<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — l'ordre de consommation : l'expiration la plus proche d'abord, les
 * lots sans expiration en dernier, puis l'ancienneté ; un mouvement par lot entamé.
 */
class CreditConsumptionOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_ordre_de_consommation(): void
    {
        $ledger = app(CreditLedger::class);
        $agency = Agency::factory()->create();

        $this->travelTo(now()->startOfDay());
        $a = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 100, now()->addDays(30));
        $c = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 200, null);
        $b = $ledger->grant($agency, CreditLotOrigin::Welcome, 50, now()->addDays(10));
        $this->travel(1)->minutes();
        // Créé APRÈS `b` mais expirant AVANT lui : l'expiration la plus proche prime sur l'ancienneté.
        $d = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(9));
        $echu = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 999, now()->addMinutes(2));
        $this->travel(5)->minutes();

        $premiers = $ledger->spend($agency, 120);

        $this->assertSame(
            [[$d->id, -40], [$b->id, -50], [$a->id, -30]],
            array_map(fn (CreditMovement $m) => [$m->credit_lot_id, $m->amount], $premiers),
        );

        $suivants = $ledger->spend($agency, 100);

        $this->assertSame(
            [[$a->id, -70], [$c->id, -30]],
            array_map(fn (CreditMovement $m) => [$m->credit_lot_id, $m->amount], $suivants),
        );
        $this->assertSame(999, $echu->fresh()->remaining_amount, 'un lot échu n’est jamais consommé');
        $this->assertSame(170, $ledger->balance($agency));
    }

    public function test_a_expiration_egale_l_anciennete_departage(): void
    {
        $ledger = app(CreditLedger::class);
        $agency = Agency::factory()->create();
        $this->travelTo(now()->startOfDay());
        $expire = now()->addDays(10);
        $ancien = $ledger->grant($agency, CreditLotOrigin::Welcome, 10, $expire);
        $this->travel(1)->minutes();
        $recent = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 10, $expire);

        $mouvements = $ledger->spend($agency, 15);

        $this->assertSame([[$ancien->id, -10], [$recent->id, -5]], array_map(fn (CreditMovement $m) => [$m->credit_lot_id, $m->amount], $mouvements));
    }
}
