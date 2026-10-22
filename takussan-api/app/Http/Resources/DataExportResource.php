<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-1519 (P73.03) — pas de `download_url` : le front télécharge par son relais
 * `data-exports/[id]/download`, et le champ, fabriqué par `url()`, n'avait aucun lecteur.
 */
class DataExportResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'requested_by' => $this->requested_by,
            'reason' => $this->reason,
            'status' => $this->enumValue($this->status),
            'size_bytes' => $this->size_bytes,
            'requested_at' => $this->iso($this->requested_at),
            'ready_at' => $this->iso($this->ready_at),
            'expires_at' => $this->iso($this->expires_at),
            'last_downloaded_at' => $this->iso($this->last_downloaded_at),
        ];
    }
}
