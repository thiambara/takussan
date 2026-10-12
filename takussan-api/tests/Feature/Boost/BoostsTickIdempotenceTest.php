<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditMovement;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §9) — `boosts:tick` toutes les 5 minutes : fin des boosts échus,
 * réconciliation, expiration des lots, préavis une fois. Rejoué, il ne fait rien de plus.
 */
class BoostsTickIdempotenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_deux_ticks_valent_un_tick(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $ledger = app(CreditLedger::class);
        $ledger->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $vedetteBien = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $masseBien = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $vedette = app(BoostPurchaseService::class)->purchase($vedetteBien, $this->vedette(7), $admin);
        // 15 jours : au 8e jour, elle n'est pas échue — c'est la réconciliation qui doit la mettre en pause.
        $masse = app(BoostPurchaseService::class)->purchase($masseBien, $this->vedette(15), $admin);
        // Octroyé APRÈS les achats : les deux Vedettes ont consommé le lot de bienvenue, celui-ci
        // reste plein, et c'est lui qui entre dans la fenêtre de préavis (expire au 10e jour).
        $echeant = $ledger->grant($agency, CreditLotOrigin::AdminGrant, 15, now()->addDays(10));

        // Écriture de MASSE : aucun observateur ne la voit, seul le tick la rattrape.
        DB::table('properties')->where('id', $masseBien->id)->update(['visibility' => 'private']);
        $this->travel(8)->days();

        $this->artisan('boosts:tick')->assertSuccessful();
        $etat = $this->etat();
        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame($etat, $this->etat(), 'le second tick n’a rien changé');
        $this->assertSame(BoostStatus::Ended, $vedette->fresh()->status);
        $this->assertFalse((bool) $vedetteBien->fresh()->featured);
        $this->assertSame(BoostStatus::Paused, $masse->fresh()->status);
        $this->assertNotNull($echeant->fresh()->expiry_notice_sent_at);
        Notification::assertSentToTimes($admin, BoostEndedNotification::class, 1);
        Notification::assertSentToTimes($admin, CreditsExpiringNotification::class, 1);

        $this->travel(3)->days();
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->assertSame(1, CreditMovement::query()->where('credit_lot_id', $echeant->id)->where('type', CreditMovementType::Expire)->count());
        $this->assertSame([], $ledger->invariantViolations());
    }

    /** @return array<string, mixed> */
    private function etat(): array
    {
        return [
            'boosts' => DB::table('property_boosts')->orderBy('id')->get(['id', 'status', 'ends_at', 'remaining_seconds'])->map(fn ($ligne) => (array) $ligne)->all(),
            'mouvements' => DB::table('credit_movements')->count(),
            'lots' => DB::table('credit_lots')->orderBy('id')->get(['id', 'remaining_amount', 'expiry_notice_sent_at'])->map(fn ($ligne) => (array) $ligne)->all(),
        ];
    }

    private function vedette(int $days): BoostProduct
    {
        return BoostProduct::query()->where('kind', 'featured')->where('duration_days', $days)->sole();
    }
}
