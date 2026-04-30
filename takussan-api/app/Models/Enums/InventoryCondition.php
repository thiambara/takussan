<?php

namespace App\Models\Enums;

enum InventoryCondition: string
{
    case Excellent = 'excellent';
    case Good = 'good';
    case Fair = 'fair';
    case Poor = 'poor';
}
