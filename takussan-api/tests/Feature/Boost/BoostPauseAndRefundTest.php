<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Boost\BoostRefundedNotification;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §8, AC15) — dépublier met en pause, republier reprend sans perte ; loué,
 * vendu ou supprimé par l'annonceur rembourse les jours pleins restants ; la modération clôt sans
 * rien rendre ; une Remontée et un Badge ne sont jamais remboursés automatiquement.
 */
class BoostPauseAndRefundTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    public function test_depublier_met_en_pause_republier_reprend_sans_perte(): void
    {
        $vedette = $this->vedette7j();
        $this->travel(2)->days();

        $this->property->update(['visibility' => PropertyVisibility::Private]);

        $vedette->refresh();
        $this->assertSame(BoostStatus::Paused, $vedette->status);
        $this->assertSame(5 * 86400, $vedette->remaining_seconds);
        $this->assertFalse((bool) $this->property->fresh()->featured);

        $this->travel(10)->days();
        $this->property->update(['visibility' => PropertyVisibility::Public]);

        $vedette->refresh();
        $this->assertSame(BoostStatus::Active, $vedette->status);
        $this->assertTrue($vedette->ends_at->equalTo(now()->addDays(5)), 'les dix jours de pause ne sont pas consommés');
        $this->assertTrue((bool) $this->property->fresh()->featured);
    }

    public function test_suspendre_l_espace_met_en_pause_le_reactiver_reprend(): void
    {
        $vedette = $this->vedette7j();

        $this->agency->update(['status' => AgencyStatus::Suspended]);
        $this->assertSame(BoostStatus::Paused, $vedette->fresh()->status);

        $this->agency->update(['status' => AgencyStatus::Active]);
        $this->assertSame(BoostStatus::Active, $vedette->fresh()->status);
    }

    public function test_louer_rembourse_les_jours_pleins_restants_au_prorata(): void
    {
        $vedette = $this->vedette7j();
        $badge = app(BoostPurchaseService::class)->purchase($this->property->fresh(), BoostProduct::query()->where('variant', 'urgent')->sole(), $this->admin);
        $this->travel(2)->days();
        $this->travel(3)->hours();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 4 j 21 h restants → 4 jours pleins → floor(20 × 4 / 7) = 11.
        $vedette->refresh();
        $this->assertSame(BoostStatus::Refunded, $vedette->status);
        $this->assertSame(11, $vedette->refunded_credits);
        $lot = CreditLot::query()->where('origin', CreditLotOrigin::Refund)->sole();
        $this->assertSame(11, $lot->initial_amount);
        $this->assertSame(BoostStatus::Ended, $badge->fresh()->status, 'un Badge n’est jamais remboursé automatiquement');
        $this->assertSame(500 - 20 - 10 + 11, app(CreditLedger::class)->balance($this->agency));
        $this->assertFalse((bool) $this->property->fresh()->featured);
        $this->assertNull($this->property->fresh()->badge);
        Notification::assertSentTo($this->admin, BoostRefundedNotification::class, fn ($n) => $n->credits === 11);
    }

    public function test_supprimer_par_l_annonceur_rembourse(): void
    {
        $vedette = $this->vedette7j();
        $this->travel(1)->days();

        $this->property->delete();

        $this->assertSame(BoostStatus::Refunded, $vedette->fresh()->status);
        $this->assertSame(intdiv(20 * 6, 7), $vedette->fresh()->refunded_credits);
    }

    public function test_la_moderation_clot_sans_rien_rendre(): void
    {
        $vedette = $this->vedette7j();

        // Ce qu'écrit `PropertyModerationService::hold()` (l. 251-264).
        $this->property->forceFill([
            'status' => PropertyStatus::Rejected, 'visibility' => PropertyVisibility::Private,
            'published_at' => null, 'platform_hold_at' => now(),
        ])->save();

        $this->assertSame(BoostStatus::Ended, $vedette->fresh()->status);
        $this->assertSame(0, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        Notification::assertSentTo($this->admin, BoostEndedNotification::class);
    }

    public function test_reconcilier_deux_fois_ne_rembourse_qu_une_fois(): void
    {
        $vedette = $this->vedette7j();
        $this->property->update(['status' => PropertyStatus::Sold]);

        app(BoostLifecycle::class)->reconcile($this->property->fresh());

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        $this->assertSame(BoostStatus::Refunded, $vedette->fresh()->status);
    }

    /**
     * La clôture se RÉCLAME en base (`UPDATE … WHERE status IN (live)`) : un second passage qui tient
     * une instance périmée — l'observateur et le tick, ou deux annulations — ne rembourse rien de plus.
     * `reconcile()` deux fois ne le prouve pas : il relit les boosts vivants et s'arrête avant.
     */
    public function test_deux_clotures_sur_une_instance_perimee_ne_remboursent_qu_une_fois(): void
    {
        $vedette = $this->vedette7j();
        $perimee = PropertyBoost::query()->findOrFail($vedette->id);
        $lifecycle = app(BoostLifecycle::class);

        $lifecycle->cancel($vedette, true, $this->admin, 'Annulation de test');
        $lifecycle->cancel($perimee, true, $this->admin, 'Annulation de test');

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        $this->assertSame(500 - 20 + 20, app(CreditLedger::class)->balance($this->agency));
    }

    /**
     * ADR-0061 §4 — la part payée par un lot déjà expiré n'est pas rendue ; le statut, la colonne
     * `refunded_credits` et la notification disent ce qui l'est RÉELLEMENT. Vérif. adverse, V4 :
     * « Crédits remboursés : 54 » pour un lot né expiré.
     */
    public function test_louer_ne_rend_que_la_part_des_lots_non_expires(): void
    {
        [$bien, $vedette] = $this->vedette30jPayeeEnDeuxLots(offert: 30, achete: 30);
        $this->travel(3)->days();

        $bien->update(['status' => PropertyStatus::Rented]);

        // 27 jours pleins → floor(60 × 27 / 30) = 54, soit 27 par lot ; l'offert a expiré à J+2.
        $vedette->refresh();
        $this->assertSame(BoostStatus::Refunded, $vedette->status);
        $this->assertSame(27, $vedette->refunded_credits, 'seul ce qui est rendu est compté');
        $part = CreditLot::query()->where('agency_id', $bien->agency_id)->where('origin', CreditLotOrigin::Refund)->sole();
        $this->assertSame(27, $part->initial_amount);
        $this->assertNull($part->expires_at, 'la part d’un crédit acheté n’expire pas');
        $this->assertSame(27, app(CreditLedger::class)->balance($bien->agency_id));
        Notification::assertSentTo($this->admin, BoostRefundedNotification::class, fn ($n) => $n->credits === 27 && $n->expired === 27);
    }

    public function test_louer_quand_tout_a_expire_ne_parle_pas_de_remboursement(): void
    {
        [$bien, $vedette] = $this->vedette30jPayeeEnDeuxLots(offert: 60, achete: 0);
        $this->travel(3)->days();

        $bien->update(['status' => PropertyStatus::Rented]);

        $vedette->refresh();
        $this->assertSame(BoostStatus::Ended, $vedette->status);
        $this->assertSame(0, (int) $vedette->refunded_credits);
        $this->assertSame(0, CreditLot::query()->where('agency_id', $bien->agency_id)->where('origin', CreditLotOrigin::Refund)->count());
        Notification::assertNotSentTo($this->admin, BoostRefundedNotification::class);
        Notification::assertSentTo($this->admin, BoostEndedNotification::class);
    }

    /** @return array{0: Property, 1: PropertyBoost} */
    private function vedette30jPayeeEnDeuxLots(int $offert, int $achete): array
    {
        $espace = Agency::factory()->create();
        $bien = Property::factory()->published()->create(['agency_id' => $espace->id]);
        app(CreditLedger::class)->grant($espace, CreditLotOrigin::Welcome, $offert, now()->addDays(2));
        if ($achete > 0) {
            $id = DB::table('credit_lots')->insertGetId([
                'agency_id' => $espace->id, 'origin' => CreditLotOrigin::Purchase->value, 'initial_amount' => $achete,
                'remaining_amount' => $achete, 'created_at' => now(), 'updated_at' => now(),
            ]);
            CreditMovement::record(['agency_id' => $espace->id, 'credit_lot_id' => $id, 'type' => CreditMovementType::Grant, 'amount' => $achete]);
        }
        $vedette = app(BoostPurchaseService::class)->purchase(
            $bien->fresh(),
            BoostProduct::query()->where('kind', 'featured')->where('duration_days', 30)->sole(),
            $this->admin,
        );

        return [$bien, $vedette];
    }

    private function vedette7j(): PropertyBoost
    {
        return app(BoostPurchaseService::class)->purchase(
            $this->property->fresh(),
            BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(),
            $this->admin,
        );
    }
}
