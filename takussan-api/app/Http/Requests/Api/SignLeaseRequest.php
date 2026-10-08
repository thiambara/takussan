<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\LeaseSignature;
use Illuminate\Validation\Rule;

/**
 * TCK-596 §4B (ADR-0042) — `POST /api/leases/{lease}/signature` (`code` exigé) et
 * `POST /api/leases/{lease}/signature/otp` (`role` seul). L'autorisation par rôle est celle de
 * `LeasePolicy::sign`, puis le service revérifie le signataire.
 */
class SignLeaseRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $role = (string) $this->input('role');

        return in_array($role, LeaseSignature::ROLES, true)
            ? $this->user()?->can('sign', [$this->route('lease'), $role]) === true
            : true; // un rôle invalide est un 422 de validation, pas un 403
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'role' => ['required', 'string', Rule::in(LeaseSignature::ROLES)],
            'code' => [$this->routeIs('leases.signature.sign') ? 'required' : 'prohibited', 'string', 'regex:/^\d{6}$/'],
        ];
    }
}
