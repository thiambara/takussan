<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-076 — sign an inventory as either the tenant or the landlord.
 *
 * Payload (both fields required):
 *   - `role`       : "tenant" | "landlord"
 *   - `signature`  : base64-encoded payload (typically a PNG data URL, e.g.
 *                    "data:image/png;base64,iVBORw0KGgo..."). We keep the
 *                    validation loose (string, max 2 MB) because the data URL
 *                    prefix varies per browser implementation.
 *
 * Authorisation (tenant vs landlord link) is enforced downstream in
 * `InventorySignatureService::sign()` — it needs the inventory context that is
 * not available here.
 */
class InventorySignRequest extends FormRequest
{
    public const ROLE_TENANT = 'tenant';

    public const ROLE_LANDLORD = 'landlord';

    public const ROLES = [self::ROLE_TENANT, self::ROLE_LANDLORD];

    /**
     * Hard cap on the raw signature payload (2 MB) — covers a generous
     * base64-encoded PNG canvas while blocking obvious abuse.
     */
    public const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'role' => ['required', Rule::in(self::ROLES)],
            'signature' => ['required', 'string', 'max:'.self::MAX_SIGNATURE_BYTES],
        ];
    }
}
