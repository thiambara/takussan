<?php

namespace App\Services\Tenant;

use App\Models\Lease;
use App\Models\TenantOnboardingChecklist;

/**
 * TCK-266 — Création + mutation de la checklist d'onboarding tenant.
 *
 * Unique entrée d'écriture : controllers, listeners et observers passent
 * tous par {@see self::create} (idempotent via `firstOrCreate`) et
 * {@see self::markItem} (idempotent via "skip if already set"). Toute
 * complétion d'un item *requis* qui ferme la checklist déclenche un
 * `tenant_checklist_completed` dans l'activity log — ce qui permet à la
 * console super-admin et aux KPIs de détecter la transition sans
 * ré-interroger la base.
 */
class TenantOnboardingService
{
    /**
     * Crée la checklist pour le bail si l'agence n'a pas désactivé le
     * workflow EDL via `Agency.settings.tenant_onboarding_enabled = false`.
     * Retourne `null` quand le flag est explicitement désactivé OU quand
     * le bail n'a pas de tenant lié à un user (rare — Customer sans
     * `user_id`).
     *
     * Idempotent : un second appel pour le même bail rend la ligne
     * existante (`firstOrCreate` sur la PK logique `lease_id`).
     */
    public function create(Lease $lease): ?TenantOnboardingChecklist
    {
        $lease->loadMissing(['agency', 'tenant.user']);

        // Default = activé. Seule la valeur strictement `false` désactive
        // le workflow ; null / absent / true → on crée la checklist.
        $enabled = data_get($lease->agency?->settings, 'tenant_onboarding_enabled', true);
        if ($enabled === false) {
            return null;
        }

        $tenantUser = $lease->tenant?->user;
        if ($tenantUser === null) {
            // Pas de user account côté tenant — la checklist n'a personne
            // à qui s'adresser. L'event LeaseActivated reviendra si jamais
            // le customer claim son invitation plus tard, mais en pratique
            // la cohorte concernée est marginale.
            return null;
        }

        /** @var TenantOnboardingChecklist $checklist */
        $checklist = TenantOnboardingChecklist::firstOrCreate(
            ['lease_id' => $lease->id],
            ['user_id' => $tenantUser->id],
        );

        if ($checklist->wasRecentlyCreated) {
            activity()
                ->causedBy($tenantUser)
                ->performedOn($checklist)
                ->withProperties(['lease_id' => $lease->id])
                ->log('tenant_checklist_created');
        }

        return $checklist;
    }

    /**
     * Marque un item comme done. No-op si l'item est déjà set OU si la
     * checklist est déjà complétée (on ne ré-écrit pas un timestamp).
     *
     * Quand l'item posé déclenche la complétion finale (les deux items
     * requis présents et `completed_at` encore null), ferme la checklist
     * dans la même transaction et log un `tenant_checklist_completed` ;
     * sinon log un `tenant_checklist_item_completed` par item.
     */
    public function markItem(TenantOnboardingChecklist $checklist, string $item): TenantOnboardingChecklist
    {
        if (! in_array($item, TenantOnboardingChecklist::ITEMS, true)) {
            throw new \InvalidArgumentException("Unknown checklist item: {$item}");
        }

        $column = TenantOnboardingChecklist::columnForItem($item);

        if ($checklist->getAttribute($column) !== null) {
            // Idempotent — un second event "inventory.signed" ou un
            // double-tap UI ne ré-écrit pas le timestamp.
            return $checklist->fresh() ?? $checklist;
        }

        $checklist->forceFill([$column => now()])->save();

        $causer = $checklist->user;

        $justCompleted = false;
        if ($checklist->completed_at === null && $checklist->hasAllRequiredItems()) {
            $checklist->forceFill(['completed_at' => now()])->save();
            $justCompleted = true;
        }

        activity()
            ->causedBy($causer)
            ->performedOn($checklist)
            ->withProperties([
                'lease_id' => $checklist->lease_id,
                'item' => $item,
            ])
            ->log('tenant_checklist_item_completed');

        if ($justCompleted) {
            activity()
                ->causedBy($causer)
                ->performedOn($checklist)
                ->withProperties(['lease_id' => $checklist->lease_id])
                ->log('tenant_checklist_completed');
        }

        return $checklist->refresh();
    }

    /**
     * Helper : marque un item sur la checklist d'un bail si elle existe.
     * No-op silencieux si la checklist n'a pas (encore) été créée — les
     * listeners s'en servent pour ne pas exploser sur les anciens baux
     * qui pré-existent à la migration TCK-266.
     */
    public function markItemForLease(Lease $lease, string $item): ?TenantOnboardingChecklist
    {
        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $lease->id)
            ->first();

        if ($checklist === null) {
            return null;
        }

        return $this->markItem($checklist, $item);
    }
}
