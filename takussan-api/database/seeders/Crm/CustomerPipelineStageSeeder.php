<?php

namespace Database\Seeders\Crm;

use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\VisitStatus;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Le stade CRM de chaque client, déduit de ce qu'il a fait (TCK-2377).
 *
 * Tiré au hasard à la création du client, il disait `lead` de 92 locataires sur 161 (mesuré le
 * 2026-10-25). Il se lit désormais dans l'ordre du parcours : un bail signé fait un client
 * `converted`, un bail en préparation ou une réservation un client en négociation, une visite un
 * prospect ; un contact resté sans suite depuis longtemps est perdu.
 */
class CustomerPipelineStageSeeder extends Seeder
{
    /** Au-delà, un contact sans suite est perdu plus souvent qu'à son tour. */
    private const SANS_SUITE = 120;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $locataires = DB::table('leases')->where('status', '!=', LeaseStatus::Draft->value)->pluck('tenant_id')->flip();
        $enPreparation = DB::table('leases')->where('status', LeaseStatus::Draft->value)->pluck('tenant_id')->flip();
        $reservations = DB::table('bookings')
            ->whereIn('status', [BookingStatus::Pending->value, BookingStatus::Confirmed->value])
            ->pluck('customer_id')->flip();
        $derniereVisite = DB::table('property_visits')
            ->where('status', VisitStatus::Completed->value)
            ->groupBy('customer_id')
            ->selectRaw('customer_id, MAX(completed_at) AS derniere')
            ->pluck('derniere', 'customer_id');

        $stades = [];
        foreach (collect($this->ctx->customersByAgency)->flatten(1) as $customer) {
            /** @var Customer $customer */
            $stade = match (true) {
                $locataires->has($customer->id) => CustomerPipelineStage::Converted,
                $enPreparation->has($customer->id), $reservations->has($customer->id) => CustomerPipelineStage::Negotiating,
                $derniereVisite->has($customer->id) => $this->apresUneVisite(CarbonImmutable::parse($derniereVisite[$customer->id])),
                default => CarbonImmutable::parse($customer->created_at)->lessThan(Timeline::seedEnd()->subDays(self::SANS_SUITE)) && mt_rand(1, 100) <= 25
                    ? CustomerPipelineStage::Lost
                    : CustomerPipelineStage::Lead,
            };
            $stades[$stade->value][] = $customer->id;
        }

        foreach ($stades as $stade => $ids) {
            Customer::whereIn('id', $ids)->update(['pipeline_stage' => $stade]);
        }
    }

    /** Un client qui a visité sans réserver : qualifié si c'est récent, perdu parfois si c'est ancien. */
    private function apresUneVisite(CarbonImmutable $visite): CustomerPipelineStage
    {
        $ancienne = $visite->lessThan(Timeline::seedEnd()->subDays(self::SANS_SUITE));

        return CustomerPipelineStage::from(StatusDistribution::pick($ancienne ? [
            CustomerPipelineStage::Lost->value => 45,
            CustomerPipelineStage::Prospect->value => 40,
            CustomerPipelineStage::Qualified->value => 15,
        ] : [
            CustomerPipelineStage::Prospect->value => 50,
            CustomerPipelineStage::Qualified->value => 40,
            CustomerPipelineStage::Lost->value => 10,
        ]));
    }
}
