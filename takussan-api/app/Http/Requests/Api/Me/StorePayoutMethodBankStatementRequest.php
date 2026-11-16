<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\MediaUploadRequest;

/**
 * TCK-2863 — `POST /api/me/payout-methods/{payoutMethod}/bank-statement`. Le titulaire seul
 * (`PayoutMethodPolicy::update`) ; un PDF ou une image, aux bornes des documents de
 * `MediaUploadRequest`.
 */
class StorePayoutMethodBankStatementRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('payoutMethod')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:'.MediaUploadRequest::MAX_DOCUMENT_KB],
        ];
    }
}
