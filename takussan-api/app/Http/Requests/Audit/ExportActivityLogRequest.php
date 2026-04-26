<?php

namespace App\Http\Requests\Audit;

use App\Http\Requests\BaseFormRequest;
use Carbon\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ExportActivityLogRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'format' => ['required', Rule::in(['csv', 'xlsx'])],
            'filter' => ['sometimes', 'array'],
            'filter.causer_id' => ['sometimes', 'nullable', 'integer'],
            'filter.date_from' => ['sometimes', 'nullable', 'date'],
            'filter.date_to' => ['sometimes', 'nullable', 'date'],
            'filter.event' => ['sometimes', 'nullable', 'string', 'max:50'],
            'filter.subject_type' => ['sometimes', 'nullable', 'string', 'max:255'],
            'filter.search' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function ($v) {
            $from = $this->input('filter.date_from');
            $to = $this->input('filter.date_to');

            if ($from && $to) {
                $parsedFrom = Carbon::parse($from);
                $parsedTo = Carbon::parse($to);

                if ($parsedFrom->gt($parsedTo)) {
                    $v->errors()->add('filter.date_from', 'date_from must be before or equal to date_to.');
                } elseif ($parsedFrom->diffInDays($parsedTo) > 365) {
                    $v->errors()->add('filter.date_from', 'Date range must not exceed 1 year.');
                }
            }
        });
    }

    /**
     * Resolved filter values with defaults applied.
     */
    public function resolvedFilters(): array
    {
        $raw = $this->input('filter', []);

        return [
            'causer_id' => $raw['causer_id'] ?? null,
            'date_from' => $raw['date_from'] ?? now()->subDays(30)->toDateString(),
            'date_to' => $raw['date_to'] ?? now()->toDateString(),
            'event' => $raw['event'] ?? null,
            'subject_type' => $raw['subject_type'] ?? null,
            'search' => $raw['search'] ?? null,
        ];
    }
}
