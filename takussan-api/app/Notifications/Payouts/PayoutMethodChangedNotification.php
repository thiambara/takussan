<?php

namespace App\Notifications\Payouts;

use App\Models\PayoutMethod;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-594 (ADR-0039 §6) — au titulaire, à chaque ajout, modification ou suppression d'une de ses
 * destinations : c'est le signal d'un détournement après prise de compte. Critique : il part par
 * e-mail quelles que soient les préférences. Seule la forme masquée y figure.
 */
class PayoutMethodChangedNotification extends MoneyOutNotification
{
    /** @param  'added'|'updated'|'removed'  $action */
    public function __construct(public PayoutMethod $method, public string $action) {}

    protected function code(): string
    {
        return 'payout_method_changed';
    }

    protected function critical(): bool
    {
        return true;
    }

    protected function lines(): array
    {
        return ['intro', 'warning'];
    }

    protected function data(): array
    {
        return [
            'payout_method_id' => $this->method->id,
            'action' => $this->action,
            'kind' => $this->method->kind?->value,
            'destination' => $this->method->masked_identifier,
        ];
    }

    protected function params(): array
    {
        return array_merge(parent::params(), [
            'action' => __('money_out.notifications.payout_method_changed.actions.'.$this->action),
        ]);
    }

    protected function referenceable(): ?Model
    {
        return null;
    }
}
