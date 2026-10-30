<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Services\Radar\ConsentMessageComposer;
use Illuminate\Validation\Rule;

/** TCK-2394 — la relance d'activation, lue ou marquée envoyée : seule la langue du message se choisit. */
class RadarActivationReminderRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['locale' => ['nullable', 'string', Rule::in(ConsentMessageComposer::LOCALES)]];
    }

    public function locale(): string
    {
        return (string) ($this->validated('locale') ?? ConsentMessageComposer::DEFAULT_LOCALE);
    }
}
