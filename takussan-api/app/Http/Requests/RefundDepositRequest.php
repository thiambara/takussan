<?php

namespace App\Http\Requests;

/**
 * TCK-088 — `POST /api/leases/{lease}/deposit-refund` payload validator.
 *
 * The cross-field rules (status, max amount, reason required when partial)
 * are enforced inside `DepositRefundService::refund` so that direct
 * service callers (e.g. tests, admin commands) get the same guarantees as
 * the HTTP layer. This request only covers the shape of the input.
 */
class RefundDepositRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reason' => ['nullable', 'string', 'max:2000'],
            // Pre-existing media IDs already attached to the lease — they
            // get re-labelled to the `lease_deposit_refund` collection.
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['integer'],
            // Newly uploaded files — added directly to
            // `lease_deposit_refund`. Either or both can be provided.
            'uploads' => ['nullable', 'array', 'max:10'],
            'uploads.*' => ['file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf'],
        ];
    }
}
