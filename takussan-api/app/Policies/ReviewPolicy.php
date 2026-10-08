<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Review\ReviewModerationScope;

/**
 * TCK-597 (ADR-0043 §1) — modérer, lire les signalements, répondre.
 *
 * Avant ce ticket, la règle était RECOPIÉE dans quatre méthodes de `ReviewController` et deux
 * FormRequest, et aucune copie ne comparait l'agence de l'avis à celle de l'acteur. Elle vit ici,
 * une fois ; le super-admin passe par `Gate::before`.
 */
class ReviewPolicy extends BasePolicy
{
    public function __construct(
        private readonly ReviewModerationScope $scope,
        private readonly MembershipCapabilityResolver $resolver,
    ) {}

    /** Ouvrir la file de modération des avis (filtrée ensuite par {@see ReviewModerationScope}). */
    public function viewModerationQueue(User $user): bool
    {
        return $this->scope->agencyFor($user) !== null;
    }

    public function moderate(User $user, Review $review): bool
    {
        return $this->scope->canModerate($user, $review);
    }

    public function viewReports(User $user, Review $review): bool
    {
        return $this->scope->canModerate($user, $review);
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
                    && ($review->agency_id === null || $this->resolver->isStaffAt($user, (int) $review->agency_id)))
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

        return $user->isOwnerAt((int) $property->agency_id)
            || $this->resolver->isStaffAt($user, (int) $property->agency_id);
    }
}
