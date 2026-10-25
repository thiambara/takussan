<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

class LeaseSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyLeases($agency->id);
        }

        $this->ctx->activeLeases = $this->ctx->leases
            ->filter(fn (Lease $l) => $l->status === LeaseStatus::Active)
            ->values();
    }

    private function seedAgencyLeases(int $agencyId): void
    {
        // TCK-2376 — un bail de location ne porte que sur un bien EN LOCATION, publié et bâti : tiré
        // dans tout le parc, il tombait sur des biens à vendre (172 baux sur 584) et sur des terrains.
        $properties = ($this->ctx->propertiesByAgency[$agencyId] ?? collect())
            ->filter(fn (Property $p) => $p->contract_type === ContractType::Rent
                && $p->status === PropertyStatus::Available
                && self::typeDeBailPour($p) !== null)
            ->values();
        $customers = $this->ctx->customersByAgency[$agencyId] ?? collect();
        if ($properties->isEmpty() || $customers->isEmpty()) {
            return;
        }

        $customerIds = $customers->pluck('id')->values();

        $statusCounts = StatusDistribution::split($this->ctx->config->leasesPerAgency, [
            LeaseStatus::Active->value => 70,
            LeaseStatus::Terminated->value => 15,
            LeaseStatus::Expired->value => 8,
            LeaseStatus::Renewed->value => 4,
            LeaseStatus::Draft->value => 3,
        ]);

        foreach ($statusCounts as $status => $count) {
            for ($i = 0; $i < $count; $i++) {
                $property = Tirage::un($properties);
                $startDate = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedStart()->addMonths(10),
                );
                $endDate = $startDate->addYear();

                // Le loyer du bail est celui que l'annonce affiche, à la négociation près (±10 %,
                // arrondi à 5 000) : tiré sans lien avec le prix, il ne lui ressemblait pas.
                $monthlyRent = (int) (round((float) $property->price * $this->ctx->faker()->randomFloat(2, 0.9, 1.1) / 5_000) * 5_000);
                $depositAmount = $monthlyRent * ($property->deposit_months ?: 1);
                $terminatedAt = $status === LeaseStatus::Terminated->value
                    ? Timeline::randomDateBetween($startDate->addMonths(2), Timeline::seedEnd())
                    : null;

                $lease = Lease::withoutEvents(function () use (
                    $property, $customerIds, $agencyId, $status,
                    $startDate, $endDate, $monthlyRent, $depositAmount, $terminatedAt
                ) {
                    return Lease::create([
                        'property_id' => $property->id,
                        'landlord_id' => $property->user_id,
                        'tenant_id' => Tirage::un($customerIds),
                        'agency_id' => $agencyId,
                        'reference_number' => 'LS-'.strtoupper(Tirage::code(8)),
                        'type' => self::typeDeBailPour($property)->value,
                        'status' => $status,
                        'start_date' => $startDate->toDateString(),
                        'end_date' => $endDate->toDateString(),
                        'monthly_rent' => $monthlyRent,
                        'currency' => 'XOF',
                        'deposit_amount' => $depositAmount,
                        'commission_rate' => $this->ctx->faker()->randomFloat(2, 5, 10),
                        'payment_frequency' => PaymentFrequency::Monthly->value,
                        'payment_day' => 5,
                        'signed_at' => $status === LeaseStatus::Draft->value ? null : $startDate->subDays(2),
                        'terminated_at' => $terminatedAt,
                        'termination_reason' => $terminatedAt ? 'Départ du locataire' : null,
                        'created_at' => $startDate->subDays(5),
                        'updated_at' => $terminatedAt ?? $startDate,
                    ]);
                });

                $this->ctx->leases->push($lease);
            }
        }

        // Mark leased properties as Rented.
        $rentedPropertyIds = $this->ctx->leases
            ->where('status', LeaseStatus::Active)
            ->pluck('property_id')
            ->unique()
            ->values();
        if ($rentedPropertyIds->isNotEmpty()) {
            Property::whereIn('id', $rentedPropertyIds)
                ->update(['status' => PropertyStatus::Rented->value]);
        }
    }

    /**
     * Le type de bail que le bien admet : résidentiel pour une habitation, commercial pour un local
     * professionnel, aucun pour du foncier.
     */
    private static function typeDeBailPour(Property $property): ?LeaseType
    {
        return match (PropertyLabels::famille($property->type)) {
            PropertyLabels::FAMILLE_HABITATION => LeaseType::ResidentialRent,
            PropertyLabels::FAMILLE_PROFESSIONNEL => LeaseType::CommercialRent,
            default => null,
        };
    }
}
