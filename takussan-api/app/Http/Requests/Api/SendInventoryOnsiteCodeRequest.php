<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\InventorySignRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-2913 (ADR-0098, amendement A) — `POST inventories/{inventory}/sign/onsite-code` : la partie à
 * qui le code part, `tenant` (absent : l'appel d'avant l'amendement) ou `landlord`. L'autorisation est
 * jugée par `InventorySignatureService::sendOnsiteCode()`, qui a le contexte de l'état des lieux.
 */
class SendInventoryOnsiteCodeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'party' => ['nullable', 'string', Rule::in(InventorySignRequest::ROLES)],
        ];
    }

    public function party(): string
    {
        return $this->validated('party') ?? InventorySignRequest::ROLE_TENANT;
    }
}
