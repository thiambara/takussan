<?php

namespace App\Models\Enums;

enum PropertyStatus: string
{
    case Draft = 'draft';
    case Published = 'published';
    case Archived = 'archived';
}
