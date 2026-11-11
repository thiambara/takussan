<?php

namespace App\Http\Requests\Api\Payments;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ReminderChannel;
use Illuminate\Validation\Rule;

/**
 * TCK-2658 (ADR-0105 § 2) — `POST /api/lease-payments/{payment}/reminders` : le canal de la relance
 * (`whatsapp`, `call`) et une note libre facultative. Le texte du message n'est pas reçu : le front le
 * possède et ne l'envoie pas. L'autorisation (`LeasePaymentPolicy::remind`) précède la validation :
 * un intrus reçoit 403, jamais la liste des canaux.
 */
class StoreLeasePaymentReminderRequest extends BaseFormRequest
{
    public const NOTE_MAX = 500;

    public function authorize(): bool
    {
        return $this->user()?->can('remind', $this->route('payment')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'channel' => ['required', 'string', Rule::enum(ReminderChannel::class)],
            'note' => ['nullable', 'string', 'max:'.self::NOTE_MAX],
        ];
    }
}
