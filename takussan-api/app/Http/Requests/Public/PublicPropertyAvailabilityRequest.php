<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Support\Carbon;

/**
 * TCK-596 §3B (ADR-0041) — la fenêtre des plages occupées d'un bien public, bornée à 18 mois.
 */
class PublicPropertyAvailabilityRequest extends BaseFormRequest
{
    public const MAX_MONTHS = 18;

    public function authorize(): bool
    {
        return true;
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
        $from = $this->filled('from') ? Carbon::parse($this->input('from')) : Carbon::today();

        return $from->lt(Carbon::today()) ? Carbon::today() : $from;
    }

    public function to(): Carbon
    {
        $max = $this->from()->addMonths(self::MAX_MONTHS);
        $to = $this->filled('to') ? Carbon::parse($this->input('to')) : $this->from()->addMonths(12);

        return $to->gt($max) ? $max : $to;
    }
}
