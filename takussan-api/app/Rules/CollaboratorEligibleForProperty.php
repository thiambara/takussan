<?php

namespace App\Rules;

use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-586 — qui peut être collaborateur d'un bien.
 *
 * `user_id` acceptait n'importe quel compte de la plateforme. Or le plus ancien
 * collaborateur `agent` devient le contact principal (`PrimaryPropertyContact`),
 * et `GET /api/public/properties/{slug}/contact` — anonyme — rend SON téléphone :
 * un bailleur pouvait publier, sur la fiche de son bien, le numéro d'un
 * utilisateur quelconque et détourner vers lui les messages.
 *
 * | rôle               | éligible, dans l'agence du bien                    |
 * |--------------------|----------------------------------------------------|
 * | `agent`, `manager` | personnel de l'agence (ADR-0031) : profil agent ou  |
 * |                    | admin ACTIF, ou délégation active de ces rôles     |
 * | `co_owner`         | bailleur                                           |
 * | `viewer`           | l'un des trois                                     |
 *
 * Un bien sans agence n'a aucun éligible. Les profils supprimés ne comptent pas.
 * La règle vit ICI, une fois : les deux FormRequests de collaborateurs l'appellent.
 */
class CollaboratorEligibleForProperty implements ValidationRule
{
    public function __construct(
        private readonly Property $property,
        private readonly ?string $role,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $role = CollaboratorRole::tryFrom((string) $this->role);

        // Rôle absent ou inconnu, identifiant mal formé ou introuvable : leurs propres règles
        // refusent déjà, une seconde erreur n'apprendrait rien.
        if ($role === null || ! is_numeric($value)) {
            return;
        }

        $user = User::query()->find((int) $value);
        if ($user === null) {
            return;
        }

        if (! $this->eligible($user, $role)) {
            $fail(__('collaborators.not_in_agency'));
        }
    }

    private function eligible(User $user, CollaboratorRole $role): bool
    {
        $agencyId = $this->property->agency_id;
        if ($agencyId === null) {
            return false;
        }

        // TCK-587 — le prédicat « personnel de l'agence » d'ADR-0031, le même que juge
        // `PropertyController::assignAgent` pour la cible d'une affectation.
        $personnel = fn (): bool => app(MembershipCapabilityResolver::class)->isStaffAt($user, (int) $agencyId);

        return match ($role) {
            CollaboratorRole::Agent, CollaboratorRole::Manager => $personnel(),
            CollaboratorRole::CoOwner => $user->isOwnerAt($agencyId),
            CollaboratorRole::Viewer => $personnel() || $user->isOwnerAt($agencyId),
        };
    }
}
