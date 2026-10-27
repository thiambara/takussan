<?php

namespace App\Models\Enums;

/** TCK-2383 (ADR-0076 §5) — pourquoi la passerelle a refusé un appel avant le fournisseur. */
enum AiRefusalReason: string
{
    case Forbidden = 'forbidden';
    case KillSwitch = 'kill_switch';
    case Budget = 'budget';
    case SensitiveData = 'sensitive_data';
    case DataClass = 'data_class';
}
