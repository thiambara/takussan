<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 (AC9) — un lien collé dans le formulaire du bien. */
class GeoResolveLinkRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['url' => ['required', 'string', 'max:2048', 'url:https']];
    }
}
