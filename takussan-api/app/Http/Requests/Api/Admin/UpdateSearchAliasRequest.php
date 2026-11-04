<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\SearchAliasStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-2476 (ADR-0088 §7) — trancher une variante d'écriture : `{status: active|rejected}`. La variante devient `manual` :
 * l'IA ne la touche plus. `super_admin` seul (`platform.settings.manage`), jugé avant la validation.
 */
class UpdateSearchAliasRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::SettingsManage) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(SearchAliasStatus::class)],
        ];
    }
}
