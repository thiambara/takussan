<?php

namespace Tests\Feature\Api\Admin;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\PlatformPayout;
use App\Models\User;
use App\Services\Billing\PlatformPayoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2056 (P182.05) — l'annulation d'un reversement plateforme juge la transition sur la ligne
 * VERROUILLÉE, dans sa transaction, comme `approve` et `markPaid`. Avant : `cancel` jugeait le
 * modèle lié à la route, hors transaction ; un `markPaid` validé entre-temps était écrasé en
 * `cancelled`, et ses lignes détachées redevenaient éligibles à une nouvelle clôture.
 */
class PlatformPayoutCancelLockTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_reversement_paye_derriere_un_modele_reste_approuve_ne_s_annule_pas(): void
    {
        $agency = Agency::factory()->create();
        $payout = PlatformPayout::factory()->approved()->create(['agency_id' => $agency->id]);
        $item = BookingPayment::factory()->paid()->create(['platform_payout_id' => $payout->id]);

        // Le `markPaid` concurrent, validé entre la lecture du modèle et l'annulation.
        DB::table('platform_payouts')->where('id', $payout->id)->update(['status' => PlatformPayoutStatus::Paid->value]);
        $this->assertSame(PlatformPayoutStatus::Approved, $payout->status, 'Le modèle en mémoire est resté `approved`.');

        try {
            app(PlatformPayoutService::class)->cancel($payout, User::factory()->create(), 'doublon');
            $this->fail('Un reversement payé a été annulé.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('platform_payout.status_transition_invalid', $e->errorCode);
        }

        $this->assertSame(PlatformPayoutStatus::Paid->value, DB::table('platform_payouts')->where('id', $payout->id)->value('status'));
        $this->assertSame($payout->id, $item->refresh()->platform_payout_id, 'Les lignes d\'un reversement payé ont été détachées.');
    }

    public function test_temoin_un_reversement_approuve_s_annule_et_detache_ses_lignes(): void
    {
        $agency = Agency::factory()->create();
        $payout = PlatformPayout::factory()->approved()->create(['agency_id' => $agency->id]);
        $item = BookingPayment::factory()->paid()->create(['platform_payout_id' => $payout->id]);

        $result = app(PlatformPayoutService::class)->cancel($payout, User::factory()->create(), 'doublon');

        $this->assertSame(PlatformPayoutStatus::Cancelled, $result->status);
        $this->assertSame('doublon', $result->failure_reason);
        $this->assertNull($item->refresh()->platform_payout_id);
    }
}
