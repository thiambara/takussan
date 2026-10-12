<?php

namespace App\Services\Property;

use App\Exceptions\ApiError;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-633 (lot C, AC11) — un bien ne devient public que si quelqu'un peut répondre.
 *
 * Refus 422 `property.publish_contact_incomplete`, avec `missing` ⊂ {`first_name`,
 * `verified_phone`, `terms`} et `contact_is_self` :
 *  - `first_name` / `verified_phone` se jugent sur le CONTACT PRINCIPAL du bien
 *    ({@see PrimaryPropertyContact}) — la personne que les visiteurs appelleront ;
 *  - `terms` se juge sur le PUBLIEUR : CGU déjà acceptées, ou acceptées par ce geste
 *    (`accept_terms`, la phrase sous le bouton Publier). La première publication les date.
 *
 * Appelé par les CINQ chemins qui rendent un bien public (`publish`, `visibility`, `store`,
 * `update`, `status`) : garder les deux premiers seuls laisserait publier par le corps d'une
 * création ou d'une mise à jour, ou remettre en ligne par le statut un bien qui en avait été
 * retiré. Un bien déjà en ligne se republie sans rien redemander.
 */
final class PublishReadiness
{
    /**
     * La version des CGU que la phrase désigne : `VERSION_DOCUMENTS.date` du front
     * (`takussan-web/src/content/legal/editeur.ts`, « 17 septembre 2026 »). À changer ensemble.
     */
    public const TERMS_VERSION = '2026-09-17';

    public const MISSING_FIRST_NAME = 'first_name';

    public const MISSING_VERIFIED_PHONE = 'verified_phone';

    public const MISSING_TERMS = 'terms';

    /**
     * « Déjà en ligne » se juge sur le prédicat public RÉEL ({@see Property::scopePublic()}), statut
     * compris. Ne lire que `visibility` et `published_at` laissait un bien retiré par son statut
     * (`unavailable`, `under_maintenance`…) passer pour en ligne, et revenir sans contrôle par
     * `publish` (vérification adverse du lot C, S2).
     */
    public function alreadyOnline(Property $property): bool
    {
        return $property->exists
            && Property::query()->public()->whereKey($property->getKey())->exists();
    }

    /**
     * Passer au statut `$status` remettrait-il en ligne un bien qui n'y est pas ? Il faut un statut
     * affichable (hors {@see Property::NON_PUBLIC_STATUSES}) sur un bien public et déjà publié une
     * fois : `PUT …/status` (et `status` dans le corps de `PUT …`) ne touche que le statut, si
     * bien que `visibility` et `published_at` sont ceux que la publication a posés.
     */
    public function statusPutsOnline(Property $property, PropertyStatus $status, ?PropertyVisibility $visibility = null): bool
    {
        return ! in_array($status->value, Property::NON_PUBLIC_STATUSES, true)
            && ($visibility ?? $property->visibility) === PropertyVisibility::Public
            && $property->published_at !== null
            && ! $this->alreadyOnline($property);
    }

    /** @return list<string> */
    public function missing(?User $contact, User $publisher, bool $acceptTerms): array
    {
        $manque = [];
        if ($contact === null || trim((string) $contact->first_name) === '') {
            $manque[] = self::MISSING_FIRST_NAME;
        }
        if ($contact === null || $contact->phone_verified_at === null || ! is_string($contact->phone) || $contact->phone === '') {
            $manque[] = self::MISSING_VERIFIED_PHONE;
        }
        if ($publisher->terms_accepted_at === null && ! $acceptTerms) {
            $manque[] = self::MISSING_TERMS;
        }

        return $manque;
    }

    public function ensure(?User $contact, User $publisher, bool $acceptTerms): void
    {
        $manque = $this->missing($contact, $publisher, $acceptTerms);
        if ($manque !== []) {
            throw (new ApiError(422, 'property.publish_contact_incomplete'))->with([
                'missing' => $manque,
                'contact_is_self' => $contact !== null && $contact->is($publisher),
            ]);
        }
    }

    public function ensureForProperty(Property $property, User $publisher, bool $acceptTerms): void
    {
        $property->loadMissing(PrimaryPropertyContact::eagerLoads());
        $this->ensure(PrimaryPropertyContact::for($property), $publisher, $acceptTerms);
    }

    /** La première publication date les CGU ; les suivantes ne réécrivent rien. */
    public function recordTerms(User $publisher, bool $acceptTerms): void
    {
        if ($publisher->terms_accepted_at !== null || ! $acceptTerms) {
            return;
        }

        $publisher->forceFill(['terms_accepted_at' => now(), 'terms_version' => self::TERMS_VERSION])->save();
    }
}
