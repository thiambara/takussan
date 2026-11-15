<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2922 — « Refuser » un reversement à approuver, depuis la carte « À faire » du point du mois :
 * l'annulation porte désormais son MOTIF (`reason`), gardé sur le reversement
 * (`metadata.cancel_reason`). Facultatif : l'« Annuler » du détail, plus ancien, n'en envoie pas.
 *
 * L'autorisation reste celle de l'annulation (`PayoutPolicy::update`), simple délégation comme
 * {@see MarkFailedPayoutRequest} : elle court avant la validation.
 */
class CancelPayoutRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('payout')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
