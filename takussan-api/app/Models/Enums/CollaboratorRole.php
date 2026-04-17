<?php

namespace App\Models\Enums;

enum CollaboratorRole: string
{
    case Manager = 'manager';
    case CoOwner = 'co_owner';
    case Agent = 'agent';
    case Viewer = 'viewer';
}
