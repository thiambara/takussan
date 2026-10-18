<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditLot;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditExpiryNotifier;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-826 (P24.06) — un lot `refund` hérite de l'échéance de son lot d'origine (ADR-0061 §4). Quand
 * ce lot d'origine a déjà été prévenu, l'espace ne reçoit pas un second préavis pour la même date.
 */
class RefundLotExpiryNoticeTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private CreditLot $bienvenue;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-01 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        // Lot de bienvenue qui expire à J+20 ; préavis à 7 jours (réglage par défaut).
        $this->bienvenue = app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(20));
        $this->travel(10)->days();
        app(BoostPurchaseService::class)->purchase($this->property->fresh(), $this->vedette(15), auth()->user());
    }

    public function test_le_lot_rembourse_d_un_lot_deja_prevenu_ne_declenche_pas_un_second_preavis(): void
    {
        $this->travel(4)->days();
        $this->assertSame(1, $this->preavis(), 'le lot de bienvenue est prévenu à J+14');

        $this->property->fresh()->update(['status' => PropertyStatus::Rented]);
        $rembourse = $this->lotRembourse();
        $this->assertTrue($rembourse->expires_at->equalTo($this->bienvenue->expires_at), 'même échéance que le lot d’origine');

        $this->assertSame(0, $this->preavis(), 'aucun second préavis pour la même échéance');
        Notification::assertSentTimes(CreditsExpiringNotification::class, 1);
        $this->assertNotNull($rembourse->fresh()->expiry_notice_sent_at);
    }

    /** Témoin : un lot d'origine pas encore prévenu laisse le lot remboursé à prévenir. */
    public function test_le_lot_rembourse_d_un_lot_pas_encore_prevenu_reste_a_prevenir(): void
    {
        $this->travel(1)->days();
        $this->property->fresh()->update(['status' => PropertyStatus::Rented]);
        $rembourse = $this->lotRembourse();
        $this->assertNull($rembourse->expiry_notice_sent_at);

        $this->travel(3)->days();
        $this->assertSame(2, $this->preavis(), 'le lot de bienvenue et le lot remboursé');
        $this->assertNotNull($rembourse->fresh()->expiry_notice_sent_at);
    }

    private function preavis(): int
    {
        return app(CreditExpiryNotifier::class)->sendNotices();
    }

    private function lotRembourse(): CreditLot
    {
        return CreditLot::query()->where('agency_id', $this->agency->id)->where('origin', CreditLotOrigin::Refund)->sole();
    }

    private function vedette(int $days): BoostProduct
    {
        return BoostProduct::query()->where('kind', 'featured')->where('duration_days', $days)->sole();
    }
}
