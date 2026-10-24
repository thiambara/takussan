<?php

namespace Tests\Feature\Authorization;

use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1932 (P190.03, décision du porteur) — `BookingPaymentPolicy::update`, qui garde l'initiation,
 * la vérification et les fournisseurs de la passerelle, acceptait `booking.property.user_id` sans
 * rien juger d'autre, et `PaymentController::history` listait de même : l'agent qui a saisi le bien,
 * suspendu ou retiré, ouvrait et vérifiait le paiement en ligne de ses acomptes et les lisait dans
 * l'historique. La branche du bien se juge par `BailleurDuBien::est` ; le client reste accepté.
 */
class AgentCreateurPaiementDesAcomptesTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function acompteDuBienDe(User $auteur): BookingPayment
    {
        $this->property->forceFill(['user_id' => $auteur->id])->save();

        return BookingPayment::factory()->create([
            'booking_id' => $this->bookingOfClient()->id,
            'amount' => 30_000,
            'currency' => Currency::XOF,
            'payment_type' => BookingPaymentType::Deposit,
            'status' => PaymentStatus::Pending,
            'paid_at' => null,
        ]);
    }

    /** @return list<int> */
    private function historiqueDe(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/payments/history')->assertOk()->json('data'))
            ->where('source', 'booking')->pluck('id')->all();
    }

    private function assertPlusRien(User $agent, BookingPayment $payment): void
    {
        $agent = $agent->fresh();
        $this->assertFalse($agent->can('update', $payment->fresh()));

        Sanctum::actingAs($agent);
        $this->getJson("/api/booking-payments/{$payment->id}/providers")->assertForbidden();
        $this->getJson("/api/booking-payments/{$payment->id}/verify")->assertForbidden();
        $this->assertNotContains($payment->id, $this->historiqueDe($agent));
    }

    public function test_l_agent_createur_suspendu_n_a_plus_la_main_sur_l_acompte(): void
    {
        $payment = $this->acompteDuBienDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertPlusRien($this->agent, $payment);
    }

    public function test_l_agent_createur_retire_n_a_plus_la_main_sur_l_acompte(): void
    {
        $payment = $this->acompteDuBienDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertPlusRien($this->agent, $payment);
    }

    /** Témoin : le client de la réservation reste accepté (décision du porteur). */
    public function test_le_client_de_la_reservation_reste_accepte(): void
    {
        $payment = $this->acompteDuBienDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertTrue($this->client->can('update', $payment->fresh()));
        Sanctum::actingAs($this->client);
        $this->getJson("/api/booking-payments/{$payment->id}/providers")->assertOk();
        $this->assertContains($payment->id, $this->historiqueDe($this->client));
    }

    /** Témoin : le bailleur du bien, bloqué compris, garde la main et l'historique, comme avant. */
    public function test_le_bailleur_du_bien_garde_la_main(): void
    {
        $payment = $this->acompteDuBienDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->assertTrue($this->landlord->fresh()->can('update', $payment->fresh()));
        $this->assertContains($payment->id, $this->historiqueDe($this->landlord));
    }
}
