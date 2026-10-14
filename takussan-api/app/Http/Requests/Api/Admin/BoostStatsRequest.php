<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §10) — une fenêtre de dates, 92 jours au plus. */
class BoostStatsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from', 'before_or_equal:'.now()->addDay()->toDateString()],
        ];
    }

    protected function passedValidation(): void
    {
        if (Carbon::parse($this->input('from'))->diffInDays(Carbon::parse($this->input('to'))) > 92) {
            abort_code(422, 'boost.stats_window_too_wide');
        }
    }
}
