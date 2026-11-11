<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\OperateursPlateforme;

/**
 * TCK-2657 — l'historique des paiements nomme ses lignes à la demande :
 * `include=payer,property,landlord`, et `days_late` sur une échéance de bail.
 *
 * Sans paramètre neuf, la ligne garde sa forme d'avant, clé pour clé et dans le même ordre (AC1).
 */
class PaymentHistoryNamedRowsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use OperateursPlateforme;
    use RefreshDatabase;

    /** Les clés d'une ligne de bail avant TCK-2657, dans leur ordre. */
    private const LEASE_ROW_KEYS = [
        'source', 'id', 'reference_number', 'amount', 'currency', 'payment_method', 'payment_type', 'status',
        'paid_amount', 'remaining_amount', 'late_fee_amount', 'late_fee_outstanding', 'late_fee_payable_online',
        'amount_due', 'date', 'paid_at', 'period_start', 'period_end', 'due_date', 'booking_id', 'lease_id',
        'property_id', 'customer_id', 'created_at',
    ];

    /** Les clés d'une ligne de réservation avant TCK-2657, dans leur ordre. */
    private const BOOKING_ROW_KEYS = [
        'source', 'id', 'reference_number', 'amount', 'currency', 'payment_method', 'payment_type', 'status',
        'paid_amount', 'remaining_amount', 'date', 'paid_at', 'booking_id', 'lease_id', 'property_id',
        'customer_id', 'created_at',
    ];

    private const NEW_KEYS = ['payer', 'property', 'landlord', 'days_late'];

    private Agency $agency;

    private User $admin;

    private User $landlordA;

    private User $landlordB;

    private Property $propertyA;

    private Property $propertyB;

    private Customer $tenantA;

    private Lease $leaseA;

    private LeasePayment $lateRent;

    private LeasePayment $paidRent;

    private LeasePayment $upcomingRent;

    private BookingPayment $bookingPayment;

    private Customer $bookingCustomer;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);

        $this->landlordA = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->landlordB = User::factory()->create(['first_name' => 'Ibrahima', 'last_name' => 'Fall']);
        $this->propertyA = Property::factory()->create(['user_id' => $this->landlordA->id, 'agency_id' => $this->agency->id, 'title' => 'Villa des Almadies']);
        $this->propertyB = Property::factory()->create(['user_id' => $this->landlordB->id, 'agency_id' => $this->agency->id, 'title' => 'Studio Plateau']);
        $this->tenantA = Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Moussa', 'last_name' => 'Diop', 'phone' => '+221770000001']);

        $this->leaseA = Lease::factory()->create([
            'property_id' => $this->propertyA->id,
            'landlord_id' => $this->landlordA->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => $this->tenantA->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
        $this->lateRent = $this->rent(PaymentStatus::Pending, 20);
        $this->paidRent = $this->rent(PaymentStatus::Paid, 40);
        $this->upcomingRent = $this->rent(PaymentStatus::Pending, -10);

        $this->bookingCustomer = Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Fatou', 'last_name' => 'Sall', 'phone' => '+221770000002']);
        $booking = Booking::factory()->create([
            'property_id' => $this->propertyB->id,
            'customer_id' => $this->bookingCustomer->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->bookingPayment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'status' => PaymentStatus::Paid,
            'paid_at' => now()->subDays(3),
        ]);
    }

    private function rent(PaymentStatus $status, int $daysLate, ?Lease $lease = null): LeasePayment
    {
        $lease ??= $this->leaseA;

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'status' => $status,
            'amount' => 150_000,
            'due_date' => now('Africa/Dakar')->subDays($daysLate)->toDateString(),
            'paid_at' => $status === PaymentStatus::Paid ? now()->subDays($daysLate) : null,
        ]);
    }

    /** @return array<string, array<string, mixed>> les lignes, par `source:id` */
    private function rows(string $query = ''): array
    {
        $this->actingAsApi($this->admin);

        return collect($this->getJson('/api/payments/history?per_page=100'.$query)->assertOk()->json('data'))
            ->keyBy(fn (array $row) => $row['source'].':'.$row['id'])
            ->all();
    }

    public function test_ac1_include_names_the_payer_the_property_and_the_landlord(): void
    {
        $rows = $this->rows('&include=payer,property,landlord');

        $lease = $rows['lease:'.$this->lateRent->id];
        $this->assertSame(['id' => $this->tenantA->id, 'name' => 'Moussa Diop', 'phone' => '+221770000001'], $lease['payer']);
        $this->assertSame(['id' => $this->propertyA->id, 'title' => 'Villa des Almadies', 'reference_number' => $this->propertyA->reference_number], $lease['property']);
        $this->assertSame(['id' => $this->landlordA->id, 'name' => 'Awa Ndiaye'], $lease['landlord']);

        $booking = $rows['booking:'.$this->bookingPayment->id];
        $this->assertSame(['id' => $this->bookingCustomer->id, 'name' => 'Fatou Sall', 'phone' => '+221770000002'], $booking['payer']);
        $this->assertSame('Studio Plateau', $booking['property']['title']);
        $this->assertSame(['id' => $this->landlordB->id, 'name' => 'Ibrahima Fall'], $booking['landlord']);
    }

    public function test_ac1_an_include_alone_adds_only_the_requested_relation(): void
    {
        $lease = $this->rows('&include=property')['lease:'.$this->lateRent->id];

        $this->assertArrayHasKey('property', $lease);
        $this->assertArrayNotHasKey('payer', $lease);
        $this->assertArrayNotHasKey('landlord', $lease);
    }

    public function test_ac1_without_a_new_parameter_the_row_keeps_its_former_shape(): void
    {
        $plain = $this->rows();
        $named = $this->rows('&include=payer,property,landlord');

        $this->assertSame(self::LEASE_ROW_KEYS, array_keys($plain['lease:'.$this->lateRent->id]));
        $this->assertSame(self::BOOKING_ROW_KEYS, array_keys($plain['booking:'.$this->bookingPayment->id]));

        // Les valeurs d'avant sont rendues telles quelles : les clés neuves s'AJOUTENT.
        foreach ($named as $key => $row) {
            $this->assertSame($plain[$key], array_diff_key($row, array_flip(self::NEW_KEYS)), $key);
        }
    }

    public function test_days_late_counts_the_days_of_an_unsettled_overdue_instalment_only(): void
    {
        $rows = $this->rows('&include=payer');

        $this->assertSame(20, $rows['lease:'.$this->lateRent->id]['days_late']);
        $this->assertNull($rows['lease:'.$this->paidRent->id]['days_late']);
        $this->assertNull($rows['lease:'.$this->upcomingRent->id]['days_late']);
        $this->assertNull($rows['booking:'.$this->bookingPayment->id]['days_late']);
    }

    public function test_a_list_valued_include_is_an_absent_include(): void
    {
        $lease = $this->rows('&include[]=payer')['lease:'.$this->lateRent->id];

        $this->assertSame(self::LEASE_ROW_KEYS, array_keys($lease));
    }

    public function test_names_never_leave_the_caller_s_perimeter(): void
    {
        $other = Agency::factory()->create();
        $this->actingAsApi($this->agencyAdmin($other));

        $response = $this->getJson('/api/payments/history?include=payer,property,landlord')->assertOk();

        $this->assertSame([], $response->json('data'));
        $this->assertStringNotContainsString('Moussa', $response->getContent());
        $this->assertStringNotContainsString('Ndiaye', $response->getContent());
    }

    /** TCK-600 — un opérateur plateforme `viewer` n'est pas super-admin : il ne lit aucune ligne, donc aucun nom. */
    public function test_a_platform_viewer_reads_no_name(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);

        $response = $this->getJson('/api/payments/history?include=payer,property,landlord')->assertOk();

        $this->assertSame([], $response->json('data'));
        $this->assertStringNotContainsString('Moussa', $response->getContent());
        $this->assertStringNotContainsString('+221770000001', $response->getContent());
    }

    public function test_names_are_eager_loaded_whatever_the_number_of_rows(): void
    {
        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->rows('&include=payer,property,landlord');
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };
        $before = $count();

        foreach (range(1, 3) as $i) {
            $landlord = User::factory()->create();
            $lease = Lease::factory()->create([
                'property_id' => Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id])->id,
                'landlord_id' => $landlord->id,
                'agency_id' => $this->agency->id,
                'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
                'status' => LeaseStatus::Active,
            ]);
            $this->rent(PaymentStatus::Pending, $i, $lease);
        }

        $this->assertSame($before, $count());
    }
}
