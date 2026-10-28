<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2386 (ADR-0077) — une annonce du Radar pour la console. Chaque colonne passe par `whenHas` :
 * sous un sparse fieldset (`fields[radar_listings]=…`), une colonne non lue est omise plutôt
 * qu'inventée nulle. `stage_reason` est un code (`radar.*`, `ai.*`), jamais une phrase.
 *
 * Les captures (fiche seule, `captures`) ne rendent que leurs métadonnées : un fichier privé ne
 * sort que par `PrivateMediaAccess`, après autorisation (ADR-0029), et aucune route ne l'expose ici.
 */
class RadarListingResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'radar_advertiser_id' => $this->whenHas('radar_advertiser_id'),
            'source_kind' => $this->whenHas('source_kind', fn () => $this->enumValue($this->source_kind)),
            'source_site' => $this->whenHas('source_site', fn () => $this->enumValue($this->source_site)),
            'source_url' => $this->whenHas('source_url'),
            'raw_text' => $this->whenHas('raw_text'),
            'photo_urls' => $this->whenHas('photo_urls', fn () => $this->photo_urls ?? []),
            'content_fingerprint' => $this->whenHas('content_fingerprint'),
            'extracted' => $this->whenHas('extracted'),
            'matches' => $this->whenHas('matches', fn () => $this->matches ?? []),
            'stage' => $this->whenHas('stage', fn () => $this->enumValue($this->stage)),
            'stage_reason' => $this->whenHas('stage_reason'),
            'extraction_attempts' => $this->whenHas('extraction_attempts'),
            'extracted_at' => $this->whenHas('extracted_at', fn () => $this->iso($this->extracted_at)),
            'property_id' => $this->whenHas('property_id'),
            'captured_by' => $this->whenHas('captured_by'),
            'purge_at' => $this->whenHas('purge_at', fn () => $this->iso($this->purge_at)),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
            'updated_at' => $this->whenHas('updated_at', fn () => $this->iso($this->updated_at)),
            'advertiser' => $this->whenLoaded('advertiser', fn () => $this->advertiser === null ? null : [
                'id' => $this->advertiser->id,
                'phone' => $this->advertiser->phone,
                'display_name' => $this->advertiser->display_name,
                'nature' => $this->enumValue($this->advertiser->nature),
                'do_not_contact_at' => $this->iso($this->advertiser->do_not_contact_at),
            ]),
            'captures' => $this->whenLoaded('media', fn () => $this->media
                ->where('collection_name', 'radar_captures')
                ->values()
                ->map(fn (Media $media): array => [
                    'id' => $media->id,
                    'mime_type' => $media->mime_type,
                    'size' => $media->size,
                    'sha256' => $media->getCustomProperty('sha256'),
                ])->all()),
        ];
    }
}
