<?php

namespace App\Http\Requests\Api\Admin;

use App\Rules\InstantIso;
use App\Support\InstantRecu;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;

class MarkPlatformPayoutPaidRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'processed_at' => ['required', 'date', new InstantIso],
            // TCK-594 (ADR-0039 §4) — l'argent parti se prouve : la référence du virement.
            'payment_reference' => ['required', 'string', 'max:255'],
            'metadata' => ['nullable', 'array'],
            'metadata.bank_ref' => ['nullable', 'string', 'max:255'],
            'metadata.batch_id' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * TCK-2743 — la date du virement, l'instant qu'elle désigne ({@see InstantRecu}) : un `Carbon::parse()`
     * gardait le décalage reçu, et le cast `datetime` en écrivait l'heure murale.
     */
    public function processedAt(): Carbon
    {
        return Carbon::instance(InstantRecu::utc($this->validated('processed_at')));
    }
}
