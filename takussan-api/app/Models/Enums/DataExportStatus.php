<?php

namespace App\Models\Enums;

enum DataExportStatus: string
{
    case Queued = 'queued';
    case Processing = 'processing';
    case Ready = 'ready';
    case Expired = 'expired';
    case Failed = 'failed';
}
