<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2657 — les filtres métier de l'historique des paiements : payeur, bailleur, moyen, recherche
 * libre, jours de retard, et le tri par retard. Chacun se pose des deux côtés (loyers et
 * réservations) et ne sort jamais du périmètre de l'appelant.
 */
class PaymentHistoryBusinessFiltersTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlordA;

    private User $landlordB;

    private Lease $leaseA;

    private Lease $leaseB;

    /** @var array<string, LeasePayment|BookingPayment> */
    private array $p = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlordA = User::factory()->create();
        $this->landlordB = User::factory()->create();

        $this->leaseA = $this->leaseOf($this->agency, $this->landlordA, 'Moussa', 'Diop', 'Villa des Almadies');
        $this->leaseB = $this->leaseOf($this->agency, $this->landlordB, 'Aïda', 'Diöp', 'Studio Plateau');

        // Bailleur A : trois échéances en retard de 5, 20 et 40 jours, une payée.
        $this->p['a5'] = $this->rent($this->leaseA, 5, PaymentStatus::Pending, PaymentMethod::Wave);
        $this->p['a20'] = $this->rent($this->leaseA, 20, PaymentStatus::Late, PaymentMethod::OrangeMoney);
        $this->p['a40'] = $this->rent($this->leaseA, 40, PaymentStatus::PartiallyPaid, PaymentMethod::Cash);
        $this->p['aPaid'] = $this->rent($this->leaseA, 60, PaymentStatus::Paid, PaymentMethod::BankTransfer);
        // Bailleur B : une échéance payée, une restitution de caution échue (jamais « en retard »).
        $this->p['bPaid'] = $this->rent($this->leaseB, 10, PaymentStatus::Paid, PaymentMethod::Wave);
        $this->p['bRefund'] = $this->rent($this->leaseB, 50, PaymentStatus::Pending, PaymentMethod::Cash, LeasePaymentType::DepositRefund);
        // Une réservation sur le bien de A, une sur celui de B.
        $this->p['bookingA'] = $this->booking($this->leaseA->property_id, 'Khady', 'Ba', PaymentMethod::Card);
        $this->p['bookingB'] = $this->booking($this->leaseB->property_id, 'Ousmane', 'Gueye', PaymentMethod::Wave);

        // Une autre agence, avec un payeur « Diöp » : jamais visible.
        $foreign = Agency::factory()->create();
        $this->rent($this->leaseOf($foreign, User::factory()->create(), 'Awa', 'Diöp', 'Villa étrangère'), 40, PaymentStatus::Pending, PaymentMethod::Wave);
    }

    private function leaseOf(Agency $agency, User $landlord, string $first, string $last, string $title): Lease
    {
        return Lease::factory()->create([
            'property_id' => Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id, 'title' => $title])->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $agency->id, 'first_name' => $first, 'last_name' => $last])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
    }

    private function rent(Lease $lease, int $daysLate, PaymentStatus $status, PaymentMethod $method, LeasePaymentType $type = LeasePaymentType::Rent): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => $type,
            'payment_method' => $method,
            'status' => $status,
            'amount' => 100_000,
            'due_date' => now('Africa/Dakar')->subDays($daysLate)->toDateString(),
            'paid_at' => $status === PaymentStatus::Paid ? now()->subDays($daysLate) : null,
        ]);
    }

    private function booking(int $propertyId, string $first, string $last, PaymentMethod $method): BookingPayment
    {
        $booking = Booking::factory()->create([
            'property_id' => $propertyId,
            'agency_id' => $this->agency->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => $first, 'last_name' => $last])->id,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'payment_method' => $method,
            'status' => PaymentStatus::Paid,
            'paid_at' => now()->subDay(),
        ]);
    }

    /** @return list<string> les clés de `$this->p` rendues, triées */
    private function found(string $query): array
    {
        $this->actingAsApi($this->admin);
        $data = $this->getJson('/api/payments/history?per_page=100&'.$query)->assertOk()->json('data');
        $byKey = [];
        foreach ($this->p as $key => $payment) {
            $byKey[($payment instanceof LeasePayment ? 'lease' : 'booking').':'.$payment->id] = $key;
        }
        $keys = array_map(fn (array $row) => $byKey[$row['source'].':'.$row['id']] ?? 'étranger', $data);
        sort($keys);

        return $keys;
    }

    private function sorted(string ...$keys): array
    {
        sort($keys);

        return $keys;
    }

    public function test_the_fixture_is_whole_without_a_filter(): void
    {
        $this->assertSame($this->sorted(...array_keys($this->p)), $this->found(''));
    }

    public function test_ac2_landlord_filter_returns_exactly_the_payments_of_his_properties(): void
    {
        $this->assertSame(
            $this->sorted('a5', 'a20', 'a40', 'aPaid', 'bookingA'),
            $this->found("filter[landlord_id]={$this->landlordA->id}"),
        );
        $this->assertSame(
            $this->sorted('bPaid', 'bRefund', 'bookingB'),
            $this->found("filter[landlord_id]={$this->landlordB->id}"),
        );
    }

    /** Le bailleur qu'une ligne affiche est celui par lequel on la retrouve, des deux côtés. */
    public function test_the_displayed_landlord_and_payer_are_the_filtered_ones(): void
    {
        $this->actingAsApi($this->admin);
        $rows = $this->getJson('/api/payments/history?per_page=100&include=payer,landlord')->assertOk()->json('data');
        $this->assertCount(count($this->p), $rows);

        foreach ($rows as $row) {
            $key = $row['source'].':'.$row['id'];
            foreach (['landlord' => 'landlord_id', 'payer' => 'payer_id'] as $relation => $filter) {
                $found = $this->getJson("/api/payments/history?per_page=100&filter[{$filter}]={$row[$relation]['id']}")->assertOk()->json('data');
                $this->assertContains($key, array_map(fn (array $r) => $r['source'].':'.$r['id'], $found), "{$key} par {$filter}");
            }
        }
    }

    public function test_payer_filter(): void
    {
        $this->assertSame($this->sorted('bPaid', 'bRefund'), $this->found("filter[payer_id]={$this->leaseB->tenant_id}"));
        $this->assertSame(['bookingA'], $this->found("filter[payer_id]={$this->p['bookingA']->booking->customer_id}"));
    }

    public function test_payment_method_filter_takes_a_list(): void
    {
        $this->assertSame($this->sorted('a40', 'bRefund', 'bookingA'), $this->found('filter[payment_method]=cash,card'));
    }

    public function test_an_unknown_payment_method_or_an_unreadable_id_is_refused(): void
    {
        $this->actingAsApi($this->admin);

        $this->getJson('/api/payments/history?filter[payment_method]=wave,bitcoin')
            ->assertStatus(422)->assertJsonPath('code', 'payment.filter_payment_method_invalid');
        $this->getJson('/api/payments/history?filter[landlord_id]=abc')
            ->assertStatus(422)->assertJsonPath('code', 'payment.filter_id_invalid');
        $this->getJson('/api/payments/history?filter[payer_id]=-1')
            ->assertStatus(422)->assertJsonPath('code', 'payment.filter_id_invalid');
        $this->getJson('/api/payments/history?filter[days_late_min]=trois')
            ->assertStatus(422)->assertJsonPath('code', 'payment.filter_days_late_invalid');
    }

    public function test_list_valued_new_filters_are_absent_filters(): void
    {
        $all = $this->found('');

        $this->assertSame($all, $this->found("filter[landlord_id][]={$this->landlordA->id}"));
        $this->assertSame($all, $this->found('filter[search][]=Diop'));
        $this->assertSame($all, $this->found('filter[days_late_min][]=31'));
        $this->assertSame($all, $this->found('filter[payment_method][]=cash'));
    }

    /**
     * AC3, tel que mesuré (Notes d'implémentation) : `CaseInsensitive` replie la casse, y compris
     * hors ASCII (« DIÖP » trouve « Diöp »), PAS les accents (ADR-0020 § 2, ADR-0025).
     */
    public function test_ac3_search_folds_non_ascii_case_and_stays_in_the_agency(): void
    {
        $this->assertSame($this->sorted('bPaid', 'bRefund'), $this->found('filter[search]='.urlencode('DIÖP')));
        $this->assertSame($this->sorted('bPaid', 'bRefund'), $this->found('filter[search]='.urlencode('diöp')));
        $this->assertSame($this->sorted('a5', 'a20', 'a40', 'aPaid'), $this->found('filter[search]=DIOP'));
    }

    public function test_search_reads_the_property_and_the_payment_reference(): void
    {
        $this->assertSame($this->sorted('a5', 'a20', 'a40', 'aPaid', 'bookingA'), $this->found('filter[search]=almadies'));
        $this->assertSame(['a20'], $this->found('filter[search]='.strtolower($this->p['a20']->reference_number)));
        $this->assertSame(['bookingB'], $this->found('filter[search]=ousmane gueye'));
        $reference = $this->leaseA->property->reference_number;
        $this->assertSame($this->sorted('a5', 'a20', 'a40', 'aPaid', 'bookingA'), $this->found('filter[search]='.urlencode($reference)));
    }

    /** Le repli de casse vaut des deux côtés : un nom RANGÉ en capitales accentuées se trouve en minuscules. */
    public function test_search_folds_a_non_ascii_capital_stored_in_the_database(): void
    {
        $lease = $this->leaseOf($this->agency, $this->landlordA, 'ÉLISE', 'NDIAYÉ', 'Duplex Mermoz');
        $this->p['upper'] = $this->rent($lease, 3, PaymentStatus::Pending, PaymentMethod::Wave);

        $this->assertSame(['upper'], $this->found('filter[search]='.urlencode('ndiayé')));
        $this->assertSame(['upper'], $this->found('filter[search]='.urlencode('élise')));
    }

    public function test_search_takes_like_wildcards_literally(): void
    {
        $this->assertSame([], $this->found('filter[search]='.urlencode('%')));
        $this->assertSame([], $this->found('filter[search]=_'));
    }

    public function test_ac5_days_late_bounds(): void
    {
        $this->assertSame(['a40'], $this->found('filter[days_late_min]=31'));
        $this->assertSame(['a5'], $this->found('filter[days_late_max]=7'));
        $this->assertSame(['a20'], $this->found('filter[days_late_min]=8&filter[days_late_max]=30'));
        $this->assertSame($this->sorted('a5', 'a20', 'a40'), $this->found('filter[days_late_min]=0'));
    }

    public function test_sort_by_days_late(): void
    {
        $this->actingAsApi($this->admin);
        $rows = $this->getJson('/api/payments/history?filter[days_late_min]=1&sort=-days_late')->assertOk()->json('data');

        $this->assertSame([40, 20, 5], array_column($rows, 'days_late'));

        $rows = $this->getJson('/api/payments/history?filter[days_late_min]=1&sort=days_late')->assertOk()->json('data');
        $this->assertSame([5, 20, 40], array_column($rows, 'days_late'));

        // Sans borne, les lignes sans retard (`null`) viennent en dernier, dans les deux sens.
        foreach (['-days_late' => [40, 20, 5], 'days_late' => [5, 20, 40]] as $sort => $expected) {
            $rows = $this->getJson("/api/payments/history?per_page=100&sort={$sort}")->assertOk()->json('data');
            $this->assertCount(count($this->p), $rows);
            $this->assertSame($expected, array_slice(array_column($rows, 'days_late'), 0, 3), $sort);
            $this->assertSame([null], array_values(array_unique(array_slice(array_column($rows, 'days_late'), 3), SORT_REGULAR)), $sort);
        }
    }

    public function test_totals_follow_the_filters(): void
    {
        $this->actingAsApi($this->admin);

        $this->getJson("/api/payments/history?filter[landlord_id]={$this->landlordB->id}&filter[payment_method]=wave")
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.totals.count', 2);
    }
}
