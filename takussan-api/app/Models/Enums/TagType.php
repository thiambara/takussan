<?php

namespace App\Models\Enums;

enum TagType: string
{
    case Amenity = 'amenity';
    case Feature = 'feature';
    case Label = 'label';
    case Crm = 'crm';
}
