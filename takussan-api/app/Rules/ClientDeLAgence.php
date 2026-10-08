<?php

namespace App\Rules;

use App\Models\Customer;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-590 (contrainte 3) — `customer_id` d'une visite désigne toujours une fiche de l'agence du
 * bien.
 *
 * `exists:customers,id` acceptait la fiche d'une AUTRE agence. La visite apparaissait alors dans
 * `index` chez l'utilisateur de cette fiche, et `PropertyVisitPolicy::view` lui en ouvrait la
 * lecture — et l'annulation, que `CancelPropertyVisitRequest` délègue à `view`. Un bien sans agence
 * n'a pas de fichier clients : aucune fiche n'y est rattachable.
 */
class ClientDeLAgence implements ValidationRule
{
    public function __construct(private readonly ?int $agencyId) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null) {
            return;
        }

        $customerAgencyId = is_numeric($value)
            ? Customer::query()->whereKey((int) $value)->value('agency_id')
            : null;

        if ($this->agencyId === null || $customerAgencyId === null || (int) $customerAgencyId !== $this->agencyId) {
            $fail(__('visits.customer_not_in_agency'));
        }
    }
}
