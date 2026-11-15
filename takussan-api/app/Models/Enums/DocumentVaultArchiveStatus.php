<?php

namespace App\Models\Enums;

/** TCK-2812 — l'état d'une archive préparée du coffre (`document_vault_archives.status`). */
enum DocumentVaultArchiveStatus: string
{
    case Pending = 'pending';
    case Ready = 'ready';
    case Failed = 'failed';
}
