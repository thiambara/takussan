<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\BookingDossierItem;
use Illuminate\Http\Request;

/**
 * TCK-2872 (ADR-0110 § 2) — une pièce du dossier : attendue, reçue (son document VIVANT, chargé
 * par `BookingDossierService::items`), demandée le. Le document se nomme et s'ouvre par son id
 * (`GET /api/documents/{id}`, `DocumentPolicy`) ; qui a demandé la pièce n'est pas servi.
 *
 * @mixin BookingDossierItem
 */
class BookingDossierItemResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $document = $this->relationLoaded('document') ? $this->document : null;

        return [
            'piece' => $this->piece?->value,
            'required' => (bool) $this->required,
            'received' => $document !== null,
            'received_at' => $document !== null ? $this->iso($this->received_at) : null,
            'requested_at' => $this->iso($this->requested_at),
            'document' => $document === null ? null : [
                'id' => $document->id,
                'name' => $document->name,
                'type' => $document->type?->value,
                'created_at' => $this->iso($document->created_at),
            ],
        ];
    }
}
