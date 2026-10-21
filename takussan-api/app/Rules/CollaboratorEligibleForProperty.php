<?php

namespace App\Rules;

use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\User;
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
 *
 * TCK-1152 (P86.01, ADR-0031 §2) — un BAILLEUR n'est éligible (`co_owner`, `viewer`) que si
 * l'auteur du geste peut déjà lire les bailleurs de l'agence : son personnel, ou le super-admin.
 * Le bailleur du bien, à qui `/api/owners` est refusé, désignait tout autre bailleur et en recevait
 * le nom, le courriel et le téléphone ; le refus est le même 422 que pour un compte hors de
 * l'agence, pour ne pas dire qui est bailleur. `$actor` nul garde la règle d'avant.
 */
class CollaboratorEligibleForProperty implements ValidationRule
{
    public function __construct(
        private readonly Property $property,
        private readonly ?string $role,
        private readonly ?User $actor = null,
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

        // TCK-587 — le prédicat « personnel de l'agence » d'ADR-0031, avec la joignabilité du
        // compte (TCK-1097, `PersonnelDeLAgence::estPersonnel()`) : un compte bloqué ne collabore pas.
        $personnel = fn (): bool => PersonnelDeLAgence::estPersonnel($user, $agencyId);
        $bailleur = fn (): bool => $this->actorMayDesignateOwners($agencyId) && $user->isOwnerAt($agencyId);

        return match ($role) {
            CollaboratorRole::Agent, CollaboratorRole::Manager => $personnel(),
            CollaboratorRole::CoOwner => $bailleur(),
            CollaboratorRole::Viewer => $personnel() || $bailleur(),
        };
    }

    private function actorMayDesignateOwners(int $agencyId): bool
    {
        return $this->actor === null
            || $this->actor->isSuperAdmin()
            || PersonnelDeLAgence::estPersonnel($this->actor, $agencyId);
    }
}
