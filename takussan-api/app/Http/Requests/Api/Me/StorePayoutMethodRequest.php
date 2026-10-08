<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PayoutMethodKind;
use Illuminate\Validation\Rule;

/**
 * TCK-594 (ADR-0039 §6) — `POST /api/me/payout-methods` : une destination du titulaire connecté.
 * Un numéro mobile money se reconnaît à sa forme ; un RIB, à sa longueur.
 */
class StorePayoutMethodRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return self::shape($this->input('kind'), required: true);
    }

    /** @return array<string, mixed> */
    public static function shape(mixed $kind, bool $required): array
    {
        $presence = $required ? 'required' : 'sometimes';
        $mobile = is_string($kind) && PayoutMethodKind::tryFrom($kind)?->isMobileMoney() === true;

        return [
            'kind' => [$presence, Rule::enum(PayoutMethodKind::class)],
            'account_identifier' => $mobile
                ? [$presence, 'string', 'regex:/^\+?[0-9][0-9 .-]{6,19}$/']
                : [$presence, 'string', 'min:8', 'max:64'],
            'account_holder_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'is_default' => ['sometimes', 'boolean'],
        ];
    }
}
