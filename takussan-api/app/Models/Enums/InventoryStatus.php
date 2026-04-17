<?php

namespace App\Models\Enums;

enum InventoryStatus: string
{
    case Draft = 'draft';
    case PendingSignature = 'pending_signature';
    case Signed = 'signed';
    case Disputed = 'disputed';
}
