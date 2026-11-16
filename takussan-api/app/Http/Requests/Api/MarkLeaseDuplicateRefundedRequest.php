<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-608 — « Doublon remboursé » : l'agence constate qu'elle a rendu au locataire l'encaissement en
 * double d'une échéance (le remboursement lui-même reste hors de la plateforme).
 *
 * **Simple DÉLÉGATION** : la règle vit dans `LeasePolicy::refundDuplicate`, appelée ICI pour qu'un appel
 * non autorisé et mal formé rende 403, jamais 422.
 */
class MarkLeaseDuplicateRefundedRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('refundDuplicate', $this->route('payment')?->lease) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
