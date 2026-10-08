<?php

namespace App\Http\Requests\Api\Payments;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-602 — `POST /api/lease-payments/{payment}/payment-link` : `regenerate=true` révoque le lien
 * actif et en émet un neuf. L'autorisation est celle de l'initiation (`update` sur l'échéance),
 * jugée par le contrôleur.
 */
class StoreLeasePaymentLinkRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'regenerate' => ['sometimes', 'boolean'],
        ];
    }
}
