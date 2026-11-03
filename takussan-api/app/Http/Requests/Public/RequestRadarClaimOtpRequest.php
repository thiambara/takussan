<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2390 (ADR-0077 §3) — `POST /api/radar/claims/{token}/otp`. **Aucun champ** : le code part au numéro de l'annonceur
 * que le lien désigne, et à lui seul ; un `phone` glissé dans le corps n'est pas lu. Le lien est l'autorisation.
 */
class RequestRadarClaimOtpRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
