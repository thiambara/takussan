<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-600 (S19) — `GET /api/admin/search?q=`. L'autorisation est le geste `platform.search.global`
 * posé sur la route (ADR-0047) ; ici, la seule forme de la requête.
 */
class GlobalSearchRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['q' => ['required', 'string', 'min:2', 'max:100']];
    }
}
