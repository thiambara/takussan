<?php

namespace App\Models\Enums;

enum MessageType: string
{
    case Text = 'text';
    case Image = 'image';
    case Document = 'document';
    case System = 'system';
}
