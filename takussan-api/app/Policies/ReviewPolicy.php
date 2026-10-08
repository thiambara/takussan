<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Review\ReviewModerationScope;

/**
 * TCK-597 (ADR-0043 §1) — modérer, lire les signalements, répondre.
 *
 * Avant ce ticket, la règle était RECOPIÉE dans quatre méthodes de `ReviewController` et deux
 * FormRequest, et aucune copie ne comparait l'agence de l'avis à celle de l'acteur. Elle vit ici,
 * une fois ; le super-admin passe par `Gate::before`.
 *
 * verif-597 passe 2 n2 — `ReviewResource` interroge `reply` et `moderate` pour chaque avis d'une
 * liste : les prédicats de l'acteur passent par {@see ReviewModerationScope}, qui les calcule une
 * fois par requête.
 */
class ReviewPolicy extends BasePolicy
{
    /**
     * Résolu par le conteneur à l'usage, pas injecté : aucune policy du dépôt n'a de constructeur,
     * et `BasePolicyCapabilityTest` les instancie par `new`. Le service est `scoped` et sa mémoire
     * vit sous la requête : le résoudre à chaque appel ne coûte rien.
     */
    private function scope(): ReviewModerationScope
    {
        return app(ReviewModerationScope::class);
    }

    /** Ouvrir la file de modération des avis (filtrée ensuite par {@see ReviewModerationScope}). */
    public function viewModerationQueue(User $user): bool
    {
        return $this->scope()->agencyFor($user) !== null;
    }

    /** `$decision` nommée : l'admin d'agence n'approuve ou ne masque qu'un avis en attente. */
    public function moderate(User $user, Review $review, ?string $decision = null): bool
    {
        return $this->scope()->canModerate($user, $review, $decision);
    }

    public function viewReports(User $user, Review $review): bool
    {
        return $this->scope()->inAgencyScope($user, $review);
    }

    /**
     * Répondre : le publieur du bien (bailleur actif ou personnel), le personnel de l'agence de
     * l'avis, l'agent visé tant qu'il en est, le prestataire visé. Jamais un bailleur ou un client
     * qui ne serait que membre de l'agence.
     */
    public function reply(User $user, Review $review): bool
    {
        $subject = $review->reviewable;

        return match (true) {
            $subject instanceof Property => $this->publisherReplies($user, $subject)
                || $this->isStaffOf($user, $review->agency_id ?? $subject->agency_id),
            $subject instanceof User => ($subject->id === $user->id
                    && ($review->agency_id === null || $this->scope()->isStaffAt($user, (int) $review->agency_id)))
                || $this->isStaffOf($user, $review->agency_id),
            $subject instanceof Agency => $this->isStaffOf($user, $subject->id),
            $subject instanceof ServiceProviderProfile => (int) $subject->user_id === $user->id,
            default => false,
        };
    }

    public function deleteReply(User $user, Review $review): bool
    {
        return $this->reply($user, $review);
    }

    /**
     * Le publieur du bien répond tant qu'il est bailleur ACTIF (un bailleur bloqué perd les
     * écritures, ADR-0031 §2) ou personnel de l'agence du bien. Un agent retiré qui reste
     * `properties.user_id` ne répond plus.
     */
    private function publisherReplies(User $user, Property $property): bool
    {
        if ($property->user_id === null || (int) $property->user_id !== $user->id) {
            return false;
        }

        if ($property->agency_id === null) {
            return true;
        }

        return $this->scope()->isOwnerAt($user, (int) $property->agency_id)
            || $this->scope()->isStaffAt($user, (int) $property->agency_id);
    }

    /** {@see BasePolicy::isStaffOf()}, sur l'agence de personnel mémorisée par requête. */
    protected function isStaffOf(User $user, mixed $agencyId): bool
    {
        if ($agencyId === null) {
            return false;
        }

        $staffAgencyId = $this->scope()->staffAgencyId($user);

        return $staffAgencyId !== null && $staffAgencyId === (int) $agencyId;
    }
}
