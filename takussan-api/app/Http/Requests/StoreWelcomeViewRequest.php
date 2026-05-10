<?php

namespace App\Http\Requests;

/**
 * TCK-251 — Validates the body for `POST /api/me/welcome-seen`.
 *
 * `key` is an opaque short identifier owned by the frontend
 * (e.g. `customer-welcome`, `host-welcome`). The regex matches the
 * route constraint used by other `/api/me/...` endpoints so the same
 * naming convention applies.
 */
class StoreWelcomeViewRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'key' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9._:-]+$/'],
        ];
    }
}
