<?php

namespace App\Observers;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyPriceHistory;
use App\Services\Property\SimilarPropertiesService;

class PropertyObserver
{
    /**
     * TCK-597 — les statuts sous lesquels un bien s'AFFICHE : ceux que `Property::scopePublic()`
     * n'exclut pas (territoire de TCK-600 — la liste n'y est pas réécrite, elle est lue ici).
     */
    private const DISPLAYABLE_STATUSES = [
        PropertyStatus::Available,
        PropertyStatus::Published,
        PropertyStatus::Pending,
    ];

    /**
     * TCK-597 (ADR-0043 §5, verif-597 B1) — un retour vers l'un de ces statuts ANNULE une
     * approbation : le bien n'est plus « approuvé » au sens de la modération d'agence.
     */
    private const UNAPPROVING_STATUSES = [
        PropertyStatus::Draft,
        PropertyStatus::PendingReview,
        PropertyStatus::Rejected,
    ];

    public function creating(Property $property): void
    {
        if (! $property->agency_id) {
            return;
        }

        $agency = $property->agency ?? $property->agency()->first();
        if (! $agency?->moderation_required) {
            return;
        }

        // TCK-597 (verif-597 B1′) — un bien neuf ne porte jamais d'approbation debout : TOUT statut
        // affichable va dans la file, `pending` compris. Né `pending`, un bien partait d'un statut
        // affichable, et aucune transition ne le faisait plus passer par la file.
        if (in_array($property->status, self::DISPLAYABLE_STATUSES, true)) {
            $property->status = PropertyStatus::PendingReview;
            $property->submitted_at = now();
        }
    }

    /**
     * TCK-597 (ADR-0043 §4, §5) — UN point pour toute sauvegarde Eloquent d'un bien : `publish`,
     * `PUT …/status`, `PUT …/visibility`, `PUT …/{id}`, un lot, un `fill()`, un `update()` direct.
     *
     *  1. **Verrou plateforme** : tant que `platform_hold_at` est posé, rien ne rend le bien public,
     *     et rien ne lève le verrou hors de {@see Property::withoutModerationGate()} (422
     *     `moderation.platform_hold`).
     *  2. **Modération d'agence** : une activation d'un bien d'une agence `moderation_required`
     *     atterrit en `pending_review`, comme à `creating`. Pas d'exemption par rôle.
     *
     * L'activation se juge sur la DESTINATION et sur l'HISTOIRE du bien, jamais sur le seul statut
     * d'origine (verif-597 B1) : tout passage d'un statut non affichable à un statut affichable en
     * est une, sauf pour un bien qui porte une approbation que rien n'a annulée. Juger l'origine
     * laissait passer un brouillon, un bien refusé ou en file par un détour (`archived`,
     * `unavailable`, `under_maintenance`, `pending`). Un départ affichable n'exempte que le bien
     * déjà en ligne, c'est-à-dire déjà publié (verif-597 B1′) : un `pending` jamais approuvé ni
     * publié qu'on publie, rend public ou passe `available` est une activation.
     *
     * TCK-599 possède `updated` ; TCK-597 n'écrit que cette méthode.
     */
    public function updating(Property $property): void
    {
        if (Property::moderationGateBypassed()) {
            return;
        }

        $this->guardPlatformHold($property);
        $this->routeActivationThroughModeration($property);
    }

    private function guardPlatformHold(Property $property): void
    {
        $wasHeld = $property->getOriginal('platform_hold_at') !== null;

        abort_code_if(
            $wasHeld && $property->platform_hold_at === null,
            422,
            'moderation.platform_hold',
        );

        if ($property->platform_hold_at === null) {
            return;
        }

        abort_code_if($this->movesTowardPublic($property), 422, 'moderation.platform_hold');
    }

    /** La sauvegarde rapproche le bien de l'affichage : statut affichable, public, ou publié. */
    private function movesTowardPublic(Property $property): bool
    {
        return ($property->isDirty('status') && in_array($property->status, self::DISPLAYABLE_STATUSES, true))
            || ($property->isDirty('visibility') && $property->visibility === PropertyVisibility::Public)
            || ($property->isDirty('published_at') && $property->published_at !== null);
    }

    private function routeActivationThroughModeration(Property $property): void
    {
        if ($property->isDirty('status') && in_array($property->status, self::UNAPPROVING_STATUSES, true)) {
            $property->approved_at = null;
            $property->approved_by_user_id = null;

            return;
        }

        $from = $property->getOriginal('status');
        if (! $property->agency_id
            || ! in_array($property->status, self::DISPLAYABLE_STATUSES, true)
            || ! $this->movesTowardPublic($property)
            || $this->carriesStandingApproval($property)
            || $this->wasAlreadyOnline($property, $from)) {
            return;
        }

        $moderated = (bool) Agency::query()->whereKey($property->agency_id)->value('moderation_required');
        if (! $moderated) {
            return;
        }

        $keepsSubmission = $from === PropertyStatus::PendingReview && $property->getOriginal('submitted_at') !== null;

        $property->status = PropertyStatus::PendingReview;
        if (! $keepsSubmission) {
            $property->submitted_at = now();
        }
    }

    /**
     * verif-597 B1′ — « déjà en ligne » : un statut affichable ET une publication passée. Un bien
     * `pending` ou `available` privé, jamais approuvé ni publié (né avant que l'agence active la
     * modération), n'a jamais été en ligne : le publier, le rendre public ou changer son statut
     * affichable est une activation.
     */
    private function wasAlreadyOnline(Property $property, mixed $from): bool
    {
        return in_array($from, self::DISPLAYABLE_STATUSES, true)
            && $property->getOriginal('published_at') !== null;
    }

    /** Une approbation que rien n'a annulée depuis : un refus postérieur l'efface. */
    private function carriesStandingApproval(Property $property): bool
    {
        $approvedAt = $property->getOriginal('approved_at');
        if ($approvedAt === null) {
            return false;
        }

        $rejectedAt = $property->getOriginal('rejected_at');

        return $rejectedAt === null || $approvedAt->greaterThan($rejectedAt);
    }

    public function updated(Property $property): void
    {
        if ($property->wasChanged('price') && $property->getOriginal('price') !== null) {
            PropertyPriceHistory::create([
                'property_id' => $property->id,
                'old_price' => $property->getOriginal('price'),
                'new_price' => $property->price,
                'currency' => $property->currency?->value ?? 'XOF',
                'changed_at' => now(),
                'changed_by_id' => auth()->id(),
            ]);
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    public function created(Property $property): void
    {
        if ($property->agency_id) {
            $property->agency()->increment('properties_count');
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    public function deleted(Property $property): void
    {
        if ($property->agency_id) {
            $property->agency()->decrement('properties_count');
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }
}
