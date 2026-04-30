<?php

namespace Database\Seeders\Support;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\UserType;
use App\Models\Enums\VisitStatus;
use App\Models\Favorite;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\PropertyVisit;
use Illuminate\Support\Str;

/**
 * Vérifie et corrige la cohérence référentielle des données seedées.
 *
 * S'assure que les relations entre entités sont réalistes et complètes :
 * - Properties rented ont un lease active
 * - Leases active ont des payments
 * - Customers ont des bookings ou leases
 * - etc.
 */
class ReferentialIntegrityChecker
{
    public function __construct(private readonly SeedingContext $ctx) {}

    /**
     * Exécute toutes les vérifications et corrections.
     */
    public function ensureIntegrity(): void
    {
        $this->ensureRentedPropertiesHaveActiveLeases();
        $this->ensureActiveLeasesHavePayments();
        $this->ensureCustomersHaveActivity();
        $this->ensureBookingsHavePaymentsWhenRequired();
        $this->ensurePropertiesHaveVisitsOrBookings();
        $this->syncPropertyStatusWithLeases();
    }

    /**
     * Vérifie que toutes les properties avec statut Rented ont au moins un lease Active.
     */
    public function checkPropertyHasActiveLease(Property $property): bool
    {
        if ($property->status !== PropertyStatus::Rented) {
            return true;
        }

        return Lease::where('property_id', $property->id)
            ->where('status', LeaseStatus::Active)
            ->exists();
    }

    /**
     * Vérifie qu'un lease active a des payments associés.
     */
    public function checkLeaseHasPayments(Lease $lease): bool
    {
        if ($lease->status !== LeaseStatus::Active) {
            return true;
        }

        return LeasePayment::where('lease_id', $lease->id)->exists();
    }

    /**
     * Vérifie qu'un customer a au moins une activité (booking ou lease).
     */
    public function checkCustomerHasActivity(Customer $customer): bool
    {
        $hasBooking = Booking::where('customer_id', $customer->id)->exists();
        $hasLease = Lease::where('tenant_id', $customer->id)->exists();

        return $hasBooking || $hasLease;
    }

    /**
     * Corrige les properties Rented sans lease active.
     */
    private function ensureRentedPropertiesHaveActiveLeases(): void
    {
        $propertiesNeedingLeases = Property::where('status', PropertyStatus::Rented)
            ->whereDoesntHave('leases', function ($query) {
                $query->where('status', LeaseStatus::Active);
            })
            ->get();

        foreach ($propertiesNeedingLeases as $property) {
            // Créer un lease active pour cette property
            $this->createMissingLeaseForProperty($property);
        }
    }

    /**
     * Crée un lease manquant pour une property.
     */
    private function createMissingLeaseForProperty(Property $property): void
    {
        $agencyId = $property->agency_id;
        $customers = $this->ctx->customersByAgency[$agencyId] ?? collect();

        if ($customers->isEmpty()) {
            return;
        }

        $customer = $customers->random();

        Lease::withoutEvents(fn () => Lease::create([
            'property_id' => $property->id,
            'landlord_id' => $property->user_id,
            'tenant_id' => $customer->id,
            'agency_id' => $agencyId,
            'reference_number' => 'LS-'.strtoupper(Str::random(8)),
            'type' => LeaseType::ResidentialRent->value,
            'status' => LeaseStatus::Active->value,
            'start_date' => now()->subMonths(2)->toDateString(),
            'end_date' => now()->addMonths(10)->toDateString(),
            'monthly_rent' => $property->price,
            'currency' => $property->currency?->value ?? 'XOF',
            'deposit_amount' => $property->price,
            'commission_rate' => 8.0,
            'payment_frequency' => PaymentFrequency::Monthly->value,
            'payment_day' => 5,
            'signed_at' => now()->subMonths(2)->subDays(2),
            'created_at' => now()->subMonths(2)->subDays(5),
            'updated_at' => now(),
        ]));
    }

    /**
     * Assure que tous les leases active ont au moins un payment.
     */
    private function ensureActiveLeasesHavePayments(): void
    {
        $leasesWithoutPayments = Lease::where('status', LeaseStatus::Active)
            ->whereDoesntHave('payments')
            ->get();

        foreach ($leasesWithoutPayments as $lease) {
            $this->createMissingPaymentsForLease($lease);
        }
    }

    /**
     * Crée des payments manquants pour un lease.
     */
    private function createMissingPaymentsForLease(Lease $lease): void
    {
        // Créer 2-3 payments historiques
        $paymentCount = random_int(2, 3);

        for ($i = 0; $i < $paymentCount; $i++) {
            $dueDate = now()->subMonths($paymentCount - $i);

            LeasePayment::create([
                'lease_id' => $lease->id,
                'payer_id' => $lease->tenant_id,
                'reference_number' => 'LP-'.strtoupper(Str::random(8)),
                'amount' => $lease->monthly_rent,
                'currency' => $lease->currency?->value ?? 'XOF',
                'due_date' => $dueDate->toDateString(),
                'paid_at' => $dueDate->copy()->addDays(random_int(0, 5)),
                'status' => PaymentStatus::Paid->value,
                'payment_method' => PaymentMethod::BankTransfer->value,
                'payment_type' => LeasePaymentType::Rent->value,
                'period_start' => $dueDate->copy()->startOfMonth()->toDateString(),
                'period_end' => $dueDate->copy()->endOfMonth()->toDateString(),
                'created_at' => $dueDate,
                'updated_at' => $dueDate,
            ]);
        }
    }

    /**
     * Assure que tous les customers ont au moins une activité.
     */
    private function ensureCustomersHaveActivity(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();

            foreach ($customers as $customer) {
                if (! $this->checkCustomerHasActivity($customer)) {
                    $this->createActivityForCustomer($customer, $agency->id);
                }
            }
        }
    }

    /**
     * Crée une activité (booking ou favori) pour un customer sans activité.
     */
    private function createActivityForCustomer(Customer $customer, int $agencyId): void
    {
        $properties = $this->ctx->propertiesByAgency[$agencyId] ?? collect();

        if ($properties->isEmpty()) {
            return;
        }

        // 70% de chances de créer un booking, 30% un favori seulement
        if (random_int(1, 100) <= 70) {
            $property = $properties->random();
            $agents = $this->ctx->usersOfType($agencyId, UserType::Agent->value);

            Booking::withoutEvents(fn () => Booking::create([
                'property_id' => $property->id,
                'customer_id' => $customer->id,
                'created_by_id' => $agents->isNotEmpty() ? $agents->random()->id : null,
                'agency_id' => $agencyId,
                'reference_number' => 'BK-'.strtoupper(Str::random(8)),
                'status' => BookingStatus::Completed->value,
                'total_amount' => $property->price,
                'deposit_amount' => (int) ($property->price * 0.2),
                'currency' => $property->currency?->value ?? 'XOF',
                'start_date' => now()->addWeek()->toDateString(),
                'end_date' => now()->addMonth()->toDateString(),
                'confirmed_at' => now(),
                'created_at' => now()->subDays(3),
                'updated_at' => now(),
            ]));
        } elseif ($customer->user_id !== null) {
            // Créer un favori (uniquement si le customer a un user lié)
            $property = $properties->random();
            Favorite::create([
                'user_id' => $customer->user_id,
                'property_id' => $property->id,
                'created_at' => now()->subDays(random_int(1, 30)),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Assure que les bookings confirmed/completed ont des payments.
     */
    private function ensureBookingsHavePaymentsWhenRequired(): void
    {
        $bookingsNeedingPayments = Booking::whereIn('status', [
            BookingStatus::Confirmed->value,
            BookingStatus::Completed->value,
        ])
            ->whereDoesntHave('payments')
            ->get();

        foreach ($bookingsNeedingPayments as $booking) {
            BookingPayment::create([
                'booking_id' => $booking->id,
                'amount' => $booking->deposit_amount,
                'currency' => $booking->currency?->value ?? 'XOF',
                'payment_type' => BookingPaymentType::Deposit->value,
                'status' => PaymentStatus::Paid->value,
                'payment_method' => PaymentMethod::BankTransfer->value,
                'paid_at' => $booking->confirmed_at ?? $booking->created_at,
                'created_at' => $booking->confirmed_at ?? $booking->created_at,
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Assure que les properties available ont des visits ou bookings.
     */
    private function ensurePropertiesHaveVisitsOrBookings(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();

            foreach ($properties as $property) {
                if ($property->status !== PropertyStatus::Available) {
                    continue;
                }

                $hasVisits = PropertyVisit::where('property_id', $property->id)->exists();
                $hasBookings = Booking::where('property_id', $property->id)->exists();

                if (! $hasVisits && ! $hasBookings) {
                    $this->createVisitForProperty($property);
                }
            }
        }
    }

    /**
     * Crée une visite pour une property.
     */
    private function createVisitForProperty(Property $property): void
    {
        $customers = $this->ctx->customersByAgency[$property->agency_id] ?? collect();
        $agents = $this->ctx->usersOfType($property->agency_id, UserType::Agent->value);

        if ($customers->isEmpty() || $agents->isEmpty()) {
            return;
        }

        PropertyVisit::create([
            'property_id' => $property->id,
            'customer_id' => $customers->random()->id,
            'agent_id' => $agents->random()->id,
            'scheduled_at' => now()->subDays(random_int(1, 30)),
            'status' => VisitStatus::Completed->value,
            'notes' => $this->ctx->faker()->sentence(),
            'created_at' => now()->subDays(random_int(5, 35)),
            'updated_at' => now(),
        ]);
    }

    /**
     * Synchronise le statut des properties avec leurs leases.
     */
    private function syncPropertyStatusWithLeases(): void
    {
        // Properties avec lease active mais statut non-Rented
        $propertiesWithActiveLease = Property::whereHas('leases', function ($query) {
            $query->where('status', LeaseStatus::Active);
        })
            ->where('status', '!=', PropertyStatus::Rented->value)
            ->get();

        foreach ($propertiesWithActiveLease as $property) {
            Property::withoutEvents(fn () => $property->update(['status' => PropertyStatus::Rented]));
        }
    }
}
