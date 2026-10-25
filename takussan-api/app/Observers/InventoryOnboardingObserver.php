<?php

namespace App\Observers;

use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\TenantOnboardingChecklist;
use App\Services\Tenant\TenantOnboardingService;

/**
 * TCK-266 — Quand un EDL d'entrée passe à `signed`, marque
 * `inventory_completed_at` sur la checklist du bail. On observe la
 * transition `wasChanged('status')` plutôt que d'émettre un event
 * `Inventory.signed` dédié : ça absorbe les deux paths de signature
 * existants (InventoryService::sign, retiré par TCK-596, + InventorySignatureService::sign)
 * sans toucher au workflow EDL — garde-fou explicitement demandé par
 * le ticket.
 *
 * Filtres : seul l'EDL **d'entrée** (`InventoryType::MoveIn`) compte
 * pour l'onboarding ; un EDL de sortie marque la fin du bail et n'a
 * pas à flipper la checklist.
 *
 * TCK-2368 (P238.01) — et la sortie de `signed` (contestation) décoche la case : la liste se
 * rouvre et le rappel J+7 rejoue, tant qu'aucun autre EDL d'entrée du bail n'est signé.
 */
class InventoryOnboardingObserver
{
    public function __construct(private readonly TenantOnboardingService $service) {}

    public function updated(Inventory $inventory): void
    {
        if (! $inventory->wasChanged('status')) {
            return;
        }
        if ($inventory->lease_id === null) {
            return;
        }
        if ($inventory->type !== InventoryType::MoveIn) {
            return;
        }

        if ($inventory->status === InventoryStatus::Signed) {
            $this->markChecklist($inventory);
        } elseif ($inventory->getOriginal('status') === InventoryStatus::Signed) {
            $this->reopenChecklist($inventory);
        }
    }

    public function created(Inventory $inventory): void
    {
        // Cas marginal : un EDL créé directement en `signed` (import legacy,
        // back-office). On couvre quand même.
        if ($inventory->status !== InventoryStatus::Signed) {
            return;
        }
        if ($inventory->lease_id === null) {
            return;
        }
        if ($inventory->type !== InventoryType::MoveIn) {
            return;
        }

        $this->markChecklist($inventory);
    }

    private function markChecklist(Inventory $inventory): void
    {
        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $inventory->lease_id)
            ->first();

        if ($checklist === null) {
            return;
        }

        $this->service->markItem($checklist, TenantOnboardingChecklist::ITEM_INVENTORY_COMPLETED);
    }

    private function reopenChecklist(Inventory $inventory): void
    {
        $anotherSigned = Inventory::query()
            ->where('lease_id', $inventory->lease_id)
            ->where('type', InventoryType::MoveIn)
            ->where('status', InventoryStatus::Signed)
            ->whereKeyNot($inventory->id)
            ->exists();
        if ($anotherSigned) {
            return;
        }

        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $inventory->lease_id)
            ->first();

        if ($checklist === null) {
            return;
        }

        $this->service->reopenItem($checklist, TenantOnboardingChecklist::ITEM_INVENTORY_COMPLETED);
    }
}
