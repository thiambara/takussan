<?php

namespace App\Models\Enums;

enum InventoryType: string
{
    case MoveIn = 'move_in';
    case MoveOut = 'move_out';
}
