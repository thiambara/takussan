<?php

namespace App\Http\Requests\Api\Admin;

/** TCK-305 — mise à jour partielle : les mêmes champs, mais seulement s'ils sont envoyés. */
class UpdateAlertRuleRequest extends AlertRuleRequest
{
    protected function presence(): string
    {
        return 'sometimes';
    }
}
