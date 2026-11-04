<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\SearchAliasOrigin;
use App\Models\Enums\SearchAliasStatus;
use App\Models\Enums\SearchAliasTargetKind;
use Illuminate\Validation\Rule;

/**
 * TCK-2476 (ADR-0088 §7) — lister les variantes d'écriture : `filter[status]`, `filter[origin]`, `filter[target_kind]`,
 * pagination. `super_admin` seul (`platform.settings.manage`).
 */
class ListSearchAliasesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::SettingsManage) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter.status' => ['sometimes', Rule::enum(SearchAliasStatus::class)],
            'filter.origin' => ['sometimes', Rule::enum(SearchAliasOrigin::class)],
            'filter.target_kind' => ['sometimes', Rule::enum(SearchAliasTargetKind::class)],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
