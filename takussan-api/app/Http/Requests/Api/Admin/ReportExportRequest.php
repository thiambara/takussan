<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class ReportExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'format' => ['required', 'in:csv,xlsx'],
            'metric' => ['nullable', 'in:agencies,users,listings'],
            'period' => ['nullable', 'in:30d,90d,3m,6m,12m'],
            'granularity' => ['nullable', 'in:day,week,month'],
            'cohort_basis' => ['nullable', 'in:signup_month'],
            'depth' => ['nullable', 'integer', 'min:1', 'max:24'],
        ];
    }
}
