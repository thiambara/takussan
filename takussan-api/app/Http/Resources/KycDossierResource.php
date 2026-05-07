<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\KycDossier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

class KycDossierResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var KycDossier $dossier */
        $dossier = $this->resource;

        return [
            'id' => $dossier->id,
            'subject_type' => class_basename($dossier->subject_type),
            'subject_id' => $dossier->subject_id,
            'status' => $this->enumValue($dossier->status),
            'submitted_at' => $this->iso($dossier->submitted_at),
            'reviewed_at' => $this->iso($dossier->reviewed_at),
            'reviewed_by' => $dossier->reviewed_by,
            'rejection_reason' => $dossier->rejection_reason,
            'metadata' => $dossier->metadata ?? [],
            'documents' => $dossier->getMedia('documents')->map(fn ($media) => [
                'id' => $media->id,
                'file_name' => $media->file_name,
                'mime_type' => $media->mime_type,
                'size' => (int) $media->size,
                'document_type' => $media->getCustomProperty('document_type'),
                'signed_url' => URL::temporarySignedRoute('kyc.documents.show', now()->addMinutes(15), ['media' => $media->id]),
                'expires_at' => now()->addMinutes(15)->toISOString(),
            ])->values()->all(),
            'created_at' => $this->iso($dossier->created_at),
            'updated_at' => $this->iso($dossier->updated_at),
        ];
    }
}
