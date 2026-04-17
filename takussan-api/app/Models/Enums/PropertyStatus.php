<?php

namespace App\Models\Enums;

enum PropertyStatus: string
{
    case Available = 'available';
    case Sold = 'sold';
    case Rented = 'rented';
    case UnderMaintenance = 'under_maintenance';
    case Unavailable = 'unavailable';
    case Pending = 'pending';
    case Draft = 'draft';
    case Published = 'published';
    case Archived = 'archived';
}
