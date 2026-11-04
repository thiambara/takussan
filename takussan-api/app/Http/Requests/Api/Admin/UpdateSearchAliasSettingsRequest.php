<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-2476 (ADR-0088 §7, revue adverse du 2026-11-04) — allumer ou éteindre les variantes tenues par l'IA : `{enabled}`.
 * Celui qui l'allume en devient l'opérateur. `super_admin` seul (`platform.settings.manage`), jugé avant la validation.
 */
class UpdateSearchAliasSettingsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::SettingsManage) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
        ];
    }
}
