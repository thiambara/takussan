<?php

namespace App\Models\Bases\Enums;

enum ProprietyStatus: string
{
    case Available = 'available';
    case Sold = 'sold';
    case Rented = 'rented';
    case UnderMaintenance = 'under_maintenance';
    case Unavailable = 'unavailable';
    case Pending = 'pending';
}
