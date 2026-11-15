<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2874 (ADR-0110 § 7) — le refus transmis : `booking.rejected` porte le motif CODÉ
 * (`reason_code`) et la précision du personnel (`message`), telle quelle. Un refus sans motif garde
 * le texte d'avant.
 */
class BookingRejectionMessageTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private User $client;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->client = User::factory()->create(['preferred_language' => 'fr']);
        $customer = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => $this->client->id]);
        $monthly = Property::factory()->published()->create([
            'agency_id' => $agency->id, 'currency' => Currency::XOF, 'title' => 'Studio Yoff',
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
        Sanctum::actingAs($this->agent);
        $this->booking = Booking::query()->findOrFail($this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $monthly->id,
            'customer_id' => $customer->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id'));
    }

    private function rejected(): AppNotification
    {
        return AppNotification::query()
            ->where('user_id', $this->client->id)
            ->where('code', NotificationCode::BookingRejected->value)
            ->sole();
    }

    public function test_ac2_the_reason_code_and_the_message_reach_the_customer(): void
    {
        $this->postJson("/api/bookings/{$this->booking->id}/reject", [
            'reason_code' => 'incomplete_file',
            'message' => "Il manque l'engagement du garant",
        ])->assertOk()->assertJsonPath('data.status', 'rejected');

        $avis = $this->rejected();
        $this->assertSame('incomplete_file', $avis->params['reason_code']);
        $this->assertSame("Il manque l'engagement du garant", $avis->params['message']);
        $this->assertStringContainsString("Motif : Dossier incomplet — Il manque l'engagement du garant", (string) $avis->body);
        // Le motif reste écrit en `cancellation_reason` : la précision, faute de motif en mots.
        $this->assertSame("Il manque l'engagement du garant", $this->booking->refresh()->cancellation_reason);
    }

    public function test_a_code_only_rejection_keeps_its_code_on_the_booking(): void
    {
        $this->postJson("/api/bookings/{$this->booking->id}/reject", ['reason_code' => 'insufficient_income'])->assertOk();

        $this->assertSame(['reason_code' => 'insufficient_income'], $this->booking->refresh()->metadata['rejection'] ?? null);
        $this->assertStringContainsString('Motif : Revenus insuffisants', (string) $this->rejected()->body);
    }

    public function test_the_message_alone_is_transmitted_as_is(): void
    {
        $this->postJson("/api/bookings/{$this->booking->id}/reject", ['message' => 'Le bien vient d’être attribué.'])->assertOk();

        $avis = $this->rejected();
        $this->assertArrayNotHasKey('reason_code', $avis->params);
        $this->assertStringContainsString('Motif : Le bien vient d’être attribué.', (string) $avis->body);
    }

    public function test_a_rejection_without_reason_keeps_the_former_text(): void
    {
        $this->postJson("/api/bookings/{$this->booking->id}/reject", ['reason' => 'Dossier incomplet'])->assertOk();

        $avis = $this->rejected();
        $this->assertArrayNotHasKey('reason_code', $avis->params);
        $this->assertArrayNotHasKey('message', $avis->params);
        $this->assertStringNotContainsString('Motif', (string) $avis->body);
        $this->assertStringNotContainsString('—', (string) $avis->body);
        $this->assertSame('Dossier incomplet', $this->booking->refresh()->cancellation_reason);
    }

    public function test_an_unknown_code_and_a_too_long_message_are_refused(): void
    {
        $this->postJson("/api/bookings/{$this->booking->id}/reject", ['reason_code' => 'dossierIncomplet'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason_code');
        $this->postJson("/api/bookings/{$this->booking->id}/reject", ['message' => str_repeat('a', 501)])
            ->assertUnprocessable()->assertJsonValidationErrors('message');

        $this->assertSame('pending', $this->booking->refresh()->status->value);
    }

    public function test_the_sms_stays_short_and_the_mail_carries_the_message(): void
    {
        $renderer = app(NotificationRenderer::class);
        $params = ['reference' => 'BK-1', 'property' => 'Studio Yoff', 'reason_code' => 'incomplete_file', 'message' => str_repeat('garant ', 70)];

        $sms = $renderer->render(NotificationCode::BookingRejected, $params, 'fr', 'Africa/Dakar', 'sms');
        $this->assertStringNotContainsString('garant', $sms);
        $this->assertStringContainsString('Dossier incomplet — garant', $renderer->render(NotificationCode::BookingRejected, $params, 'fr', 'Africa/Dakar', 'mail_body'));
        $this->assertStringContainsString('Reason: Incomplete file', $renderer->render(NotificationCode::BookingRejected, $params, 'en', 'Africa/Dakar', 'body'));
    }
}
