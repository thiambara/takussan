<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Crm\CustomerInvitationService;

/**
 * P15.01 (TCK-2351) — `POST /api/customers/{customer}/invite`. Aucun corps : le destinataire est la
 * coordonnée de la fiche ({@see CustomerInvitationService}).
 */
class InviteCustomerRequest extends BaseFormRequest
{
    /** Simple délégation : la règle vit dans `CustomerPolicy::invite()`. */
    public function authorize(): bool
    {
        return $this->user()?->can('invite', $this->route('customer')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
