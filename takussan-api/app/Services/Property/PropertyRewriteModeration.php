<?php

namespace App\Services\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use App\Policies\PropertyModerationPolicy;

/**
 * TCK-611 (ADR-0043, amendement du 2026-11-16, décision du porteur) — une annonce RÉÉCRITE dans une
 * agence `moderation_required` perd son approbation, et repasse par la file si elle était en ligne.
 *
 * Une réécriture : la modification d'un champ que la fiche publique affiche, par un utilisateur
 * authentifié qui ne modère pas l'agence du bien. Les colonnes se jugent dans
 * `PropertyObserver::updating` ({@see applyToPendingSave()}) ; ce qui vit hors de `properties`
 * (adresse, photos, équipements) se signale après coup ({@see afterOffColumnRewrite()}).
 */
class PropertyRewriteModeration
{
    /**
     * Les colonnes de `properties` que `PropertyResource` sert sur la fiche publique. Hors liste,
     * délibérément : `status` / `visibility` / `published_at` (l'activation, ADR-0043 § 5), ce
     * qu'écrivent les boosts (`featured`, `badge*`, `sponsored_until`, `ranked_at`), les
     * compteurs, `metadata`, `reference_number`, `parent_id`.
     */
    public const DISPLAYED_COLUMNS = [
        'title', 'description', 'price', 'currency',
        'type', 'contract_type', 'rent_period', 'title_type', 'condition',
        'area', 'bedrooms', 'bathrooms', 'furnished',
        'floor_number', 'total_floors', 'year_built', 'parking_spaces',
        'available_from', 'check_in_from', 'check_out_before', 'virtual_tour_url',
        'deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges',
    ];

    /**
     * Dans `updating`, avant le jugement de l'activation : une colonne affichée a changé → efface
     * l'approbation et, si le bien était en ligne et y resterait, le met en file. Rend vrai quand
     * l'approbation a été retirée par la réécriture.
     */
    public function applyToPendingSave(Property $property): bool
    {
        if (! $property->isDirty(self::DISPLAYED_COLUMNS) || ! $this->concerns($property)) {
            return false;
        }

        $property->approved_at = null;
        $property->approved_by_user_id = null;

        if ($this->isOnline($property->getRawOriginal()) && $this->isOnline($property->getAttributes())) {
            $property->status = PropertyStatus::PendingReview;
            $property->submitted_at = now();
        }

        return true;
    }

    /**
     * Après une réécriture hors des colonnes (adresse, photo ajoutée ou supprimée, équipements) :
     * même effet, par une sauvegarde du bien — `PropertyObserver::updated` et les observateurs du
     * cache et de l'index font le reste (notification, boosts, fiche, index).
     */
    public function afterOffColumnRewrite(Property $property): void
    {
        if (! $this->concerns($property)) {
            return;
        }

        $updates = [];
        if ($property->approved_at !== null || $property->approved_by_user_id !== null) {
            $updates['approved_at'] = null;
            $updates['approved_by_user_id'] = null;
        }
        if ($this->isOnline($property->getAttributes())) {
            $updates['status'] = PropertyStatus::PendingReview;
            $updates['submitted_at'] = now();
        }

        if ($updates !== []) {
            $property->update($updates);
        }
    }

    /** Agence `moderation_required`, acteur authentifié qui ne la modère pas. */
    private function concerns(Property $property): bool
    {
        if (! $property->agency_id) {
            return false;
        }

        $actor = auth()->user();
        if (! $actor instanceof User || $actor->isSuperAdmin()) {
            return false;
        }

        $agencyId = (int) $property->agency_id;
        if (! (bool) Agency::query()->whereKey($agencyId)->value('moderation_required')) {
            return false;
        }

        return ! app(PropertyModerationPolicy::class)->moderatesAt($actor, $agencyId);
    }

    /**
     * En ligne au sens de {@see Property::conditionsEnLigne()}, colonnes du bien seules (l'agence,
     * active, est hors sujet).
     *
     * @param  array<string, mixed>  $brut  attributs bruts (actuels ou d'origine)
     */
    private function isOnline(array $brut): bool
    {
        $statut = $brut['status'] ?? null;
        $statut = $statut instanceof PropertyStatus ? $statut->value : $statut;
        $visibilite = $brut['visibility'] ?? null;
        $visibilite = $visibilite instanceof PropertyVisibility ? $visibilite->value : $visibilite;

        return $statut !== null
            && ! in_array($statut, Property::NON_PUBLIC_STATUSES, true)
            && ($brut['published_at'] ?? null) !== null
            && $visibilite === PropertyVisibility::Public->value
            && ! (bool) ($brut['is_test'] ?? false);
    }
}
