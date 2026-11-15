<?php

namespace App\Http\Requests\Accounting;

use App\Models\Enums\PaymentMethod;
use Illuminate\Validation\Rule;

/**
 * TCK-2674 — `GET …/reconciliation/pending-payments` : le mois, `filter[payment_method]` (liste
 * séparée par des virgules, valeurs de `PaymentMethod`), `filter[has_suggestion]` (`1` / `0`) et
 * `per_page` (au plus 100).
 */
class ReconciliationPendingPaymentsRequest extends ReconciliationOverviewRequest
{
    public const MAX_PER_PAGE = 100;

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        $methods = data_get($this->query('filter'), 'payment_method');
        if (is_string($methods)) {
            $this->merge(['payment_methods' => array_values(array_filter(array_map('trim', explode(',', $methods)), fn ($m) => $m !== ''))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'filter' => ['nullable', 'array'],
            'filter.payment_method' => ['nullable', 'string'],
            'payment_methods' => ['nullable', 'array', 'max:'.count(PaymentMethod::cases())],
            'payment_methods.*' => ['string', Rule::enum(PaymentMethod::class)],
            'filter.has_suggestion' => ['nullable', 'in:0,1,true,false'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ];
    }

    /** @return list<string>|null */
    public function methods(): ?array
    {
        $methods = $this->validated('payment_methods');

        return is_array($methods) && $methods !== [] ? array_values($methods) : null;
    }

    public function hasSuggestion(): ?bool
    {
        $value = data_get($this->validated('filter'), 'has_suggestion');

        return $value === null ? null : in_array($value, ['1', 'true', 1, true], true);
    }

    public function pageSize(): int
    {
        return (int) ($this->validated('per_page') ?? 20);
    }
}
