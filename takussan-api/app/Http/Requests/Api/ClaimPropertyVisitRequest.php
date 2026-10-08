<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\PropertyVisit;
use App\Rules\PersonnelDeLAgence;

/**
 * TCK-590 — « Prendre en charge » une visite : réservé au personnel de l'agence du bien.
 *
 * Le refus d'un agent d'une autre agence est un 403 et court ici, avant tout le reste. Reprendre
 * une visite déjà attribuée à un autre est un 409 — jugé par le contrôleur, qui seul sait si
 * l'appelant détient `crm.assign`.
 */
class ClaimPropertyVisitRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $visit = $this->route('visit');

        return $user !== null && $visit instanceof PropertyVisit && (
            $user->isSuperAdmin()
            || PersonnelDeLAgence::personnelActifDe($user, $visit->property?->agency_id)
        );
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
