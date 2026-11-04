<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/** TCK-2476 (ADR-0088 §7, revue adverse du 2026-11-04) — lire le réglage des variantes : aucun champ, `super_admin` seul. */
class ShowSearchAliasSettingsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::SettingsManage) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
