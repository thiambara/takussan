<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\TenantOnboardingChecklist;
use App\Services\Tenant\TenantOnboardingService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

/**
 * TCK-2381 — l'« Espace résident » de chaque locataire qui a un compte (TCK-266) : la liste d'entrée que
 * `CreateTenantOnboardingChecklist` crée à l'activation du bail, puis ses items cochés aux dates où
 * l'application les coche — l'état des lieux d'entrée signé (`InventoryOnboardingObserver`), le premier
 * loyer payé (`LeasePaymentOnboardingObserver`), et les deux items informatifs, au fil des visites.
 *
 * Tout passe par `TenantOnboardingService`, seule entrée d'écriture : un bail renouvelé, un locataire
 * sans compte ou une agence qui a coupé l'Espace résident n'en ont pas, comme dans l'application.
 */
class TenantOnboardingSeeder extends Seeder
{
    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly TenantOnboardingService $service,
    ) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();

        foreach ($this->ctx->leases->sortBy('id') as $lease) {
            $lease = $lease->fresh();
            if ($lease === null || in_array($lease->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true)
                || $lease->renewed_from_lease_id !== null || $lease->signed_at === null) {
                continue;
            }
            $active = CarbonImmutable::parse($lease->signed_at);
            if ($active->greaterThan($maintenant)) {
                continue;
            }
            $checklist = Timeline::aLaDate($active, fn () => $this->service->create($lease));
            if ($checklist === null) {
                continue;
            }

            foreach ($this->items($lease, $active, $maintenant) as $item => $le) {
                Timeline::aLaDate($le, fn () => $this->service->markItem($checklist->refresh(), $item));
            }
        }
    }

    /**
     * Les items et la date où chacun est coché, dans l'ordre chronologique ; un item que rien n'a coché
     * à ce jour reste vide.
     *
     * @return array<string, CarbonImmutable>
     */
    private function items(Lease $lease, CarbonImmutable $active, CarbonImmutable $maintenant): array
    {
        $items = [];

        if (Tirage::un(range(1, 10)) <= 8) {
            $items[TenantOnboardingChecklist::ITEM_WELCOME_SEEN] = $active->addHours(Tirage::un([2, 5, 20, 30]));
        }

        $edl = Inventory::query()
            ->where('lease_id', $lease->id)
            ->where('type', InventoryType::MoveIn->value)
            ->where('status', InventoryStatus::Signed->value)
            ->orderBy('id')
            ->value('tenant_signed_at');
        if ($edl !== null) {
            $items[TenantOnboardingChecklist::ITEM_INVENTORY_COMPLETED] = CarbonImmutable::parse($edl)->max($active);
        }

        $premier = LeasePayment::query()
            ->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->where('status', PaymentStatus::Paid->value)
            ->whereNotNull('paid_at')
            ->orderBy('paid_at')
            ->value('paid_at');
        if ($premier !== null) {
            $items[TenantOnboardingChecklist::ITEM_FIRST_PAYMENT] = CarbonImmutable::parse($premier)->max($active);
        }

        if (Tirage::un(range(1, 10)) <= 5) {
            $items[TenantOnboardingChecklist::ITEM_DOCUMENTS_ACKNOWLEDGED] = $active->addDays(Tirage::un([1, 3, 6]));
        }

        $items = array_filter($items, fn (CarbonImmutable $le) => $le->lessThanOrEqualTo($maintenant));
        asort($items);

        return $items;
    }
}
