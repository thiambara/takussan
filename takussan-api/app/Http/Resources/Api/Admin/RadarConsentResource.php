<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2388 (ADR-0077 §3) — une réponse d'annonceur déposée, pour la fiche de l'opérateur : la preuve, ses captures,
 * la transcription, le verdict de l'IA et la confirmation humaine.
 *
 * **Le verdict n'ouvre rien** : seule la confirmation (`confirmed_by`, `confirmed_at`) rend un accord valide. Les
 * captures (`radar_consent_captures`, disque privé) rendent leurs métadonnées et une URL signée
 * (`PrivateMediaAccess::signedUrl()`, ADR-0029), comme `RadarListingResource::captures` : la signature EST
 * l'autorisation, émise ici parce que la ressource n'est rendue que derrière `platform.radar.operate`.
 */
class RadarConsentResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'proof' => $this->enumValue($this->proof),
            'captures' => $this->media
                ->where('collection_name', 'radar_consent_captures')
                ->values()
                ->map(fn (Media $media): array => [
                    'id' => $media->id,
                    'url' => app(PrivateMediaAccess::class)->signedUrl($media),
                    'sha256' => $media->getCustomProperty('sha256'),
                ])->all(),
            'verification_status' => $this->enumValue($this->verification_status),
            'verification_reason' => $this->verification_reason,
            'verdict' => $this->ai_verdict,
            'transcript' => $this->transcript,
            'confirmed_by' => $this->confirmer === null ? null : [
                'id' => $this->confirmer->id,
                'name' => $this->confirmer->nameWithoutContact(),
            ],
            'confirmed_at' => $this->iso($this->confirmed_at),
            'confirmation_reason' => $this->confirmation_reason,
            'revoked_at' => $this->iso($this->revoked_at),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
