<?php

namespace App\Models\Enums;

enum VisitType: string
{
    case InPerson = 'in_person';
    case Virtual = 'virtual';
    case SelfGuided = 'self_guided';
    case Hybrid = 'hybrid';
}
