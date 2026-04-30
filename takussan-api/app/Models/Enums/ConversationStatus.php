<?php

namespace App\Models\Enums;

enum ConversationStatus: string
{
    case Active = 'active';
    case Archived = 'archived';
    case Closed = 'closed';
}
