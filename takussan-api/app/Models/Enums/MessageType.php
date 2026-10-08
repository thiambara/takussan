<?php

namespace App\Models\Enums;

enum MessageType: string
{
    case Text = 'text';
    case Image = 'image';
    case Document = 'document';
    case System = 'system';
    // TCK-592 — ADR-0038 : note vocale, fichier dans la collection privée `attachments`.
    case Audio = 'audio';
}
