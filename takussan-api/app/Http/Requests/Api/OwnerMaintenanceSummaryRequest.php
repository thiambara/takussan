<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\JourIso;
use App\Support\Http\ParametreUnique;
use Carbon\CarbonImmutable;

/**
 * TCK-2911 (ADR-0120 § 4) — « Depuis janvier » : le bailleur du PROFIL ACTIF seul (403 avant toute
 * validation), et `since` au format `YYYY-MM-DD` (défaut : le 1er janvier de l'année en cours).
 */
class OwnerMaintenanceSummaryRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->agency_id !== null && $user->isOwnerAt((int) $user->agency_id);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['since' => ['nullable', 'date_format:Y-m-d', new JourIso]]; // TCK-2911 — l'année bornée (TCK-2768)
    }

    public function since(): CarbonImmutable
    {
        $since = ParametreUnique::chaine($this, 'since');

        return $since !== null
            ? CarbonImmutable::createFromFormat('Y-m-d', $since)->startOfDay()
            : CarbonImmutable::now()->startOfYear();
    }
}
