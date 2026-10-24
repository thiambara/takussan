<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Models\Invoice;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de InvoiceController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreInvoiceRequest extends BaseFormRequest
{
    /**
     * TCK-528 — l'autorisation court ICI, avant la validation, comme pour les autres FormRequest
     * de TCK-305 : placée dans le contrôleur, un appelant sans la capacité recevrait 422 et le
     * détail des règles pour un corps mal formé, au lieu de 403.
     *
     * **Simple DÉLÉGATION** à `InvoicePolicy::create()` — la règle vit dans la policy. Cette
     * méthode rendait `true` : la capacité `invoices.create` n'était jugée nulle part.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('create', Invoice::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_id' => ['required', Rule::exists('customers', 'id')->withoutTrashed()],
            'invoiceable_type' => ['nullable', 'string', 'required_with:invoiceable_id'],
            'invoiceable_id' => ['nullable', 'integer', 'required_with:invoiceable_type'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
            // P133.02 (TCK-1377) — les lignes saisies font le sous-total, que l'API recompte
            // (`InvoiceService::priceLines`) : un `subtotal` fourni avec elles est ignoré. Sans
            // lignes, le sous-total reste requis. Bornes reprises de `SubmitQuoteRequest`.
            // TCK-1922 (P170.05) — sans lignes, les bornes d'une ligne (`decimal:0,2`, `max:`), puis
            // l'arrondi à la devise (`InvoiceService::create`) : 10,5 XOF était émis, et un grand
            // nombre rendait une 500 (`numeric field overflow`).
            'subtotal' => ['required_without:items', 'nullable', 'numeric', 'min:0', 'max:1000000000', 'decimal:0,2'],
            'items' => ['sometimes', 'array', 'min:1', 'max:50'],
            'items.*.description' => ['required', 'string', 'max:500'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'max:100000', 'decimal:0,2'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0', 'max:1000000000', 'decimal:0,2'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'notes' => ['nullable', 'string'],
        ];
    }
}
