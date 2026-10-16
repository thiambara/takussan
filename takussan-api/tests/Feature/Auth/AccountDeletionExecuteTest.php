<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\UserStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AccountDeletionExecuteTest extends TestCase
{
    use RefreshDatabase;

    public function test_execute_anonymizes_user_fields(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'first_name' => 'Alice',
            'last_name' => 'Doe',
            'phone' => '+221700000000',
            'bio' => 'About me',
            'google_id' => 'g-1',
        ]);
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $fresh = User::withTrashed()->find($user->id);
        // First/last name are NOT NULL on the schema, hence empty strings.
        $this->assertSame('', $fresh->first_name);
        $this->assertSame('', $fresh->last_name);
        $this->assertNull($fresh->phone);
        $this->assertNull($fresh->bio);
        $this->assertNull($fresh->google_id);
        $this->assertNull($fresh->facebook_id);
        $this->assertNull($fresh->apple_id);
        $this->assertSame('deleted-'.$user->id.'@takussan.local', $fresh->email);
        $this->assertSame(UserStatus::Deleted->value, $fresh->status->value);
        $this->assertNotNull($fresh->deleted_at);

        $this->assertNotNull($request->fresh()->executed_at);
    }

    /**
     * TCK-633 (lot C, vérification adverse S9) — le second numéro et les cases WhatsApp sont des
     * données personnelles posées par le lot C : l'effacement les retire comme `phone`. Les CGU
     * (date et version) restent : c'est la trace d'un consentement, pas une donnée qui identifie.
     */
    public function test_execute_efface_le_second_numero_et_les_cases_whatsapp(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'phone' => '+221700000971',
            'phone_verified_at' => now(),
            'phone_whatsapp' => true,
        ]);
        $user->forceFill([
            'secondary_phone' => '+221770000972',
            'secondary_phone_verified_at' => now(),
            'secondary_phone_whatsapp' => true,
        ])->save();
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $fresh = User::withTrashed()->find($user->id);
        $this->assertNull($fresh->secondary_phone);
        $this->assertNull($fresh->secondary_phone_verified_at);
        $this->assertFalse($fresh->secondary_phone_whatsapp);
        $this->assertNull($fresh->phone_whatsapp);
        $this->assertNull($fresh->phone_verified_at);
    }

    public function test_execute_preserves_payments_invoices_leases_bookings(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $user->id,
            'tenant_id' => $customer->id,
        ]);
        $leasePayment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
        ]);
        $booking = Booking::factory()->create(['created_by_id' => $user->id]);
        $bookingPayment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'payer_id' => $customer->id,
        ]);
        $invoice = Invoice::factory()->create(['customer_id' => $customer->id]);

        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        // Records still requestable.
        $this->assertNotNull($lease->fresh());
        $this->assertNotNull($leasePayment->fresh());
        $this->assertNotNull($booking->fresh());
        $this->assertNotNull($bookingPayment->fresh());
        $this->assertNotNull($invoice->fresh());
    }

    public function test_execute_dissociates_customer_from_user(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $this->assertNull($customer->fresh()->user_id);
    }

    public function test_execute_logs_activity_transition_and_sends_notification(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $log = Activity::query()->where('event', 'account.deletion.executed')->first();
        $this->assertNotNull($log);

        Notification::assertSentTo($user, AccountDeletionExecutedNotification::class);
    }

    /**
     * TCK-688 (P19.01) — l'anonymisation ne recopie pas l'identité d'origine dans `activity_log`,
     * et efface le diff des lignes déjà écrites sur ce compte. La ligne `account.deletion.executed`
     * reste : c'est la trace, sans diff.
     */
    public function test_execute_ne_laisse_pas_l_identite_d_origine_dans_activity_log(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'first_name' => 'Aminata',
            'last_name' => 'Diallo-P19',
            'email' => 'aminata.p19@example.test',
            'phone' => '+221771230019',
            'username' => 'aminata-p19',
        ]);
        $user->forceFill(['first_name' => 'Aminata-Bis'])->save();
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        $avant = Activity::query()
            ->where('subject_type', $user->getMorphClass())
            ->where('subject_id', $user->id)
            ->count();
        $this->assertGreaterThan(0, $avant, 'le test doit partir de lignes journalisées sur ce compte');

        app(AccountDeletionService::class)->executeDeletion($request);

        foreach (['aminata.p19@example.test', '+221771230019', 'Diallo-P19', 'aminata-p19', 'Aminata-Bis'] as $valeur) {
            $this->assertSame(
                0,
                Activity::query()
                    ->whereRaw('coalesce(attribute_changes::text, \'\') like ?', ['%'.$valeur.'%'])
                    ->orWhereRaw('coalesce(properties::text, \'\') like ?', ['%'.$valeur.'%'])
                    ->count(),
                "activity_log porte encore « {$valeur} » après l'anonymisation",
            );
        }

        // Anonymiser n'écrit aucune ligne de diff sur le compte (ni `updated`, ni `deleted`).
        $this->assertSame($avant, Activity::query()
            ->where('subject_type', $user->getMorphClass())
            ->where('subject_id', $user->id)
            ->count());

        $this->assertNotNull(Activity::query()->where('event', 'account.deletion.executed')->first());
    }

    public function test_execute_is_idempotent(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $request = AccountDeletionRequest::factory()->for($user)->due()->executed()->create();

        // Already executed: nothing should change.
        app(AccountDeletionService::class)->executeDeletion($request);

        // The user should NOT be soft-deleted because we never re-ran anonymization.
        $this->assertNotNull(User::query()->find($user->id));
    }
}
