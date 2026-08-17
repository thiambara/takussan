<?php

namespace App\Http\Requests\Api\Admin;

/** TCK-305 — création d'une règle d'alerte : tous les champs de structure sont exigés. */
class StoreAlertRuleRequest extends AlertRuleRequest
{
    protected function presence(): string
    {
        return 'required';
    }
}
