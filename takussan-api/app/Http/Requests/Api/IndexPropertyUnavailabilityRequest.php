<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Support\Carbon;

/**
 * TCK-596 §3B (ADR-0041) — les indisponibilités d'un bien sur une fenêtre bornée à 18 mois.
 */
class IndexPropertyUnavailabilityRequest extends BaseFormRequest
{
    public const MAX_MONTHS = 18;

    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after:from'],
        ];
    }

    public function from(): Carbon
    {
        return $this->filled('from') ? Carbon::parse($this->input('from')) : Carbon::today()->startOfMonth();
    }

    /** La fin de fenêtre, jamais au-delà de 18 mois après son début. */
    public function to(): Carbon
    {
        $max = $this->from()->addMonths(self::MAX_MONTHS);
        $to = $this->filled('to') ? Carbon::parse($this->input('to')) : $this->from()->addMonths(12);

        return $to->gt($max) ? $max : $to;
    }
}
