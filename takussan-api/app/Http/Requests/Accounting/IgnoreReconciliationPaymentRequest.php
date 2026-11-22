<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use App\Models\BankStatement;
use App\Models\Enums\IgnoredPaymentReason;
use App\Services\Accounting\ReconciliationOverviewService;
use Illuminate\Validation\Rule;

/**
 * TCK-2932 — `POST …/reconciliation/ignored-payments` : le paiement (`payable_type` parmi les types
 * du reste à rapprocher, `payable_id`), le motif codé et, pour `other`, une note. Réservé à qui
 * rapproche (`BankStatementPolicy::viewAny`), jugé avant la validation : un agent reçoit 403.
 */
class IgnoreReconciliationPaymentRequest extends BaseFormRequest
{
    public const NOTE_MAX = 500;

    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', [BankStatement::class, $this->route('agency')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'payable_type' => ['required', 'string', Rule::in(array_keys(ReconciliationOverviewService::PAYMENT_TYPES))],
            'payable_id' => ['required', 'integer', 'min:1', 'max:9223372036854775807'],
            'reason' => ['required', 'string', Rule::enum(IgnoredPaymentReason::class)],
            'note' => ['nullable', 'string', 'max:'.self::NOTE_MAX, 'required_if:reason,'.IgnoredPaymentReason::Other->value],
        ];
    }
}
