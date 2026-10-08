<?php

namespace App\Http\Requests\Api\Payments;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentProvider;
use Illuminate\Validation\Rule;

/**
 * TCK-602 (ADR-0051 §1) — `POST /api/pay/{token}/initiate` : le fournisseur, et RIEN d'autre.
 * Aucune URL de retour n'est lue : le serveur les construit vers la page du lien (redirection
 * ouverte sinon). Le porteur du lien n'a pas de compte : le jeton est l'autorisation.
 */
class InitiatePublicPaymentLinkRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'provider' => ['required', 'string', Rule::in(array_column(PaymentProvider::cases(), 'value'))],
        ];
    }
}
