<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\LeasePaymentReminder;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Whatsapp\WhatsappDriverInterface;
use App\Services\Notifications\Whatsapp\WhatsappMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2658 (ADR-0105) — la relance d'un impayé est NOTÉE, jamais envoyée : l'agence relance depuis
 * son téléphone (WhatsApp ou appel) et l'API garde la trace. La lecture fusionne les relances
 * notées et les rappels automatiques de `SendLeasePaymentReminders` (`metadata.reminder_*_sent_at`).
 */
class LeasePaymentReminderTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Lease $lease;

    private LeasePayment $overdue;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $landlord = User::factory()->create();
        $this->lease = Lease::factory()->create([
            'property_id' => Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id])->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
        $this->overdue = $this->instalment(PaymentStatus::Pending, 10);
    }

    private function instalment(PaymentStatus $status, int $daysLate, array $metadata = [], LeasePaymentType $type = LeasePaymentType::Rent): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $this->lease->id,
            'payer_id' => $this->lease->tenant_id,
            'payment_type' => $type,
            'status' => $status,
            'amount' => 100_000,
            'due_date' => now('Africa/Dakar')->subDays($daysLate)->toDateString(),
            'paid_at' => $status === PaymentStatus::Paid ? now()->subDays($daysLate) : null,
            'metadata' => $metadata === [] ? null : $metadata,
        ]);
    }

    private function remind(LeasePayment $payment, array $body = ['channel' => 'whatsapp'], ?User $as = null)
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->postJson("/api/lease-payments/{$payment->id}/reminders", $body);
    }

    public function test_ac1_an_overdue_instalment_records_the_reminder(): void
    {
        $this->remind($this->overdue, ['channel' => 'whatsapp', 'note' => 'Promet de payer vendredi'])
            ->assertCreated()
            ->assertJsonPath('data.source', 'manual')
            ->assertJsonPath('data.channel', 'whatsapp')
            ->assertJsonPath('data.by.id', $this->admin->id)
            ->assertJsonPath('data.note', 'Promet de payer vendredi');

        $reminder = LeasePaymentReminder::query()->sole();
        $this->assertSame($this->overdue->id, $reminder->lease_payment_id);
        $this->assertSame($this->agency->id, $reminder->agency_id);
        $this->assertSame($this->admin->id, $reminder->created_by_id);
        $this->assertSame('whatsapp', $reminder->channel->value);
    }

    public function test_ac1_a_settled_or_not_yet_due_instalment_is_refused_and_writes_nothing(): void
    {
        $refused = [
            'payée' => $this->instalment(PaymentStatus::Paid, 10),
            'à venir' => $this->instalment(PaymentStatus::Pending, -5),
            'échue aujourd\'hui' => $this->instalment(PaymentStatus::Pending, 0),
            'annulée' => $this->instalment(PaymentStatus::Cancelled, 10),
            'caution rendue' => $this->instalment(PaymentStatus::Pending, 10, type: LeasePaymentType::DepositRefund),
        ];

        foreach ($refused as $case => $payment) {
            $before = LeasePaymentReminder::query()->count();
            $this->remind($payment)->assertStatus(409)->assertJsonPath('code', 'lease_payment.not_overdue');
            $this->assertSame($before, LeasePaymentReminder::query()->count(), $case);
        }
        $this->assertSame(0, LeasePaymentReminder::query()->count());
    }

    public function test_a_call_and_a_late_or_partially_paid_instalment_are_accepted(): void
    {
        $this->remind($this->instalment(PaymentStatus::Late, 3), ['channel' => 'call'])->assertCreated();
        $this->remind($this->instalment(PaymentStatus::PartiallyPaid, 40))->assertCreated();

        $this->assertSame(2, LeasePaymentReminder::query()->count());
    }

    public function test_the_body_is_validated(): void
    {
        $this->remind($this->overdue, [])->assertStatus(422)->assertJsonValidationErrors('channel');
        $this->remind($this->overdue, ['channel' => 'sms'])->assertStatus(422)->assertJsonValidationErrors('channel');
        $this->remind($this->overdue, ['channel' => 'call', 'note' => str_repeat('a', 501)])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->remind($this->overdue, ['channel' => 'call', 'note' => str_repeat('a', 500)])->assertCreated();
    }

    public function test_ac2_the_admin_of_another_agency_is_refused_and_writes_nothing(): void
    {
        $other = $this->agencyAdmin(Agency::factory()->create());

        $this->remind($this->overdue, as: $other)->assertForbidden();
        // L'autorisation précède la validation : un corps invalide ne renseigne pas l'intrus.
        $this->remind($this->overdue, ['channel' => 'sms'], $other)->assertForbidden();
        $this->actingAsApi($other)->getJson("/api/lease-payments/{$this->overdue->id}/reminders")->assertForbidden();

        $this->assertSame(0, LeasePaymentReminder::query()->count());
    }

    /** « L'agence note qu'elle a relancé » : ni le locataire, ni le bailleur ne notent une relance. */
    public function test_the_tenant_and_the_landlord_cannot_record_a_reminder(): void
    {
        $tenant = User::factory()->create();
        Customer::query()->whereKey($this->lease->tenant_id)->update(['user_id' => $tenant->id]);

        $this->remind($this->overdue, as: $tenant)->assertForbidden();
        $this->remind($this->overdue, as: $this->lease->landlord)->assertForbidden();
        $this->assertSame(0, LeasePaymentReminder::query()->count());
    }

    public function test_an_agent_of_the_agency_records_a_reminder(): void
    {
        $this->remind($this->overdue, as: $this->agencyAgent($this->agency))->assertCreated();
    }

    public function test_ac3_manual_and_automatic_reminders_merge_newest_first(): void
    {
        $payment = $this->instalment(PaymentStatus::Pending, 8, [
            'reminder_due_soon_sent_at' => now()->subDays(11)->toIso8601String(),
            'reminder_overdue_1_sent_at' => now()->subDays(7)->toIso8601String(),
            'reminder_overdue_7_sent_at' => now()->subDay()->toIso8601String(),
            'paid_amount' => 0,
        ]);
        $this->remind($payment)->assertCreated();

        $entries = $this->getJson("/api/lease-payments/{$payment->id}/reminders")->assertOk()->json('data');

        $this->assertCount(4, $entries);
        $this->assertSame(['manual', 'automatic', 'automatic', 'automatic'], array_column($entries, 'source'));
        $this->assertSame(['id' => $this->admin->id, 'name' => $this->admin->full_name], $entries[0]['by']);
        $this->assertSame('whatsapp', $entries[0]['channel']);
        $this->assertNull($entries[1]['by']);
        $this->assertNull($entries[1]['channel']);
        $this->assertSame(['overdue_7', 'overdue_1', 'due_soon'], array_column(array_slice($entries, 1), 'milestone'));
        $this->assertSame(array_keys($entries[0]), ['at', 'source', 'channel', 'by', 'note', 'milestone']);
    }

    public function test_ac4_history_include_reminders_reads_the_last_one_and_the_count(): void
    {
        $payment = $this->instalment(PaymentStatus::Pending, 8, ['reminder_overdue_7_sent_at' => now()->subDay()->toIso8601String()]);
        $this->remind($payment)->assertCreated();

        $rows = collect($this->getJson('/api/payments/history?per_page=100&include=reminders')->assertOk()->json('data'))->keyBy('id');
        $row = $rows[$payment->id];
        $this->assertSame('manual', $row['last_reminder']['source']);
        $this->assertSame('whatsapp', $row['last_reminder']['channel']);
        $this->assertSame($this->admin->id, $row['last_reminder']['by']['id']);
        $this->assertSame(2, $row['reminders_count']);
        // Une échéance jamais relancée : aucune relance, compte nul.
        $this->assertNull($rows[$this->overdue->id]['last_reminder']);
        $this->assertSame(0, $rows[$this->overdue->id]['reminders_count']);

        $plain = collect($this->getJson('/api/payments/history?per_page=100')->assertOk()->json('data'))->keyBy('id');
        $this->assertArrayNotHasKey('last_reminder', $plain[$payment->id]);
        $this->assertArrayNotHasKey('reminders_count', $plain[$payment->id]);
    }

    public function test_ac5_recording_a_reminder_sends_nothing(): void
    {
        Notification::fake();
        Mail::fake();
        $whatsapp = new class implements WhatsappDriverInterface
        {
            public int $calls = 0;

            public function send(array|string $to, WhatsappMessage $message, array $context = []): array
            {
                $this->calls++;

                return [];
            }

            public function id(): string
            {
                return 'faux';
            }
        };
        $sms = new class implements SmsDriverInterface
        {
            public int $calls = 0;

            public function send(array|string $to, string $message, array $context = []): array
            {
                $this->calls++;

                return [];
            }

            public function id(): string
            {
                return 'faux';
            }
        };
        $this->app->instance(WhatsappDriverInterface::class, $whatsapp);
        $this->app->instance(SmsDriverInterface::class, $sms);

        $this->remind($this->overdue)->assertCreated();

        Notification::assertNothingSent();
        Mail::assertNothingOutgoing();
        $this->assertSame(0, $whatsapp->calls);
        $this->assertSame(0, $sms->calls);
    }

    public function test_the_reminder_enters_the_agency_audit_log_without_its_note(): void
    {
        $this->remind($this->overdue, ['channel' => 'call', 'note' => 'Joint au 77 000 00 00'])->assertCreated();

        $activity = Activity::query()->where('subject_type', (new LeasePaymentReminder)->getMorphClass())->sole();
        $this->assertSame($this->agency->id, (int) $activity->agency_id);
        $this->assertStringNotContainsString('77 000', json_encode($activity->attribute_changes ?? $activity->properties));
    }
}
