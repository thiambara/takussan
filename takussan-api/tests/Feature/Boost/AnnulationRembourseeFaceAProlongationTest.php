<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * P246.01 (TCK-2367) — l'annulation remboursée d'une Vedette calculait `refundableCredits` sur le
 * boost reçu, hors de la transaction, et la réclamation ne rejugeait que le statut. Une prolongation
 * achetée entre la lecture de l'annulation et son écriture change `ends_at`, `duration_days` et
 * `price_credits` sans changer le statut : ses crédits étaient débités et jamais rendus. Mesuré
 * (db3e25230) : 17 rendus au lieu de 37, solde 477 au lieu de 497.
 *
 * Décision du porteur : le remboursement se calcule sur le boost relu sous verrou dans la
 * transaction de `closeWithRefund`.
 */
class AnnulationRembourseeFaceAProlongationTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-25 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    public function test_une_prolongation_achetee_apres_la_lecture_est_remboursee(): void
    {
        $vedette = $this->acheter(7);
        $this->travel(1)->days();

        $lu = PropertyBoost::query()->findOrFail($vedette->id);
        $this->acheter(7);
        $this->assertSame(14, $vedette->fresh()->duration_days, 'la prolongation tient sur la même ligne');

        app(BoostLifecycle::class)->cancel($lu, true, User::factory()->create(), 'Annonce frauduleuse');

        // 13 jours pleins restent : les 7 de la prolongation (20), puis 6 du premier achat → floor(20 × 6 / 7) = 17.
        $vedette->refresh();
        $this->assertSame(BoostStatus::Refunded, $vedette->status);
        $this->assertSame(37, $vedette->refunded_credits);
        $this->assertSame(500 - 40 + 37, app(CreditLedger::class)->balance($this->agency));
    }

    public function test_sans_prolongation_le_remboursement_ne_change_pas(): void
    {
        $vedette = $this->acheter(7);
        $this->travel(1)->days();

        app(BoostLifecycle::class)->cancel($vedette->fresh(), true, User::factory()->create(), 'Annonce frauduleuse');

        $this->assertSame(17, $vedette->fresh()->refunded_credits);
        $this->assertSame(500 - 20 + 17, app(CreditLedger::class)->balance($this->agency));
    }

    private function acheter(int $days): PropertyBoost
    {
        $produit = BoostProduct::query()->where('kind', BoostKind::Featured)->where('duration_days', $days)->sole();

        return app(BoostPurchaseService::class)->purchase($this->property->fresh(), $produit, $this->admin);
    }
}
