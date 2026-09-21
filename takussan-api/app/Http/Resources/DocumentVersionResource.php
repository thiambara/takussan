<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * JSON representation of a single document version (a Spatie Media item from
 * the `versions` collection).
 *
 * Shape:
 *   id, file_name, size, mime_type,
 *   uploaded_by_id, created_at, comment,
 *   is_active, version_number,
 *   url (URL d'API signée — `PrivateMediaAccess::signedUrl()`, TCK-539 ; jamais l'URL du fichier)
 */
class DocumentVersionResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var Media $this */
        $isActive = (bool) $this->getCustomProperty('is_active', false);
        $versionNumber = $this->getCustomProperty('version_number');
        $comment = $this->getCustomProperty('comment');
        $uploadedById = $this->getCustomProperty('uploaded_by_id');

        // TCK-539 — l'ancien repli sur `getFullUrl()` exposait l'URL directe du fichier dès que
        // le disque ne savait pas présigner (`public`, le défaut d'alors).
        $url = app(PrivateMediaAccess::class)->signedUrl($this->resource);

        return [
            'id' => $this->id,
            'file_name' => $this->file_name,
            'size' => $this->size,
            'mime_type' => $this->mime_type,
            'uploaded_by_id' => $uploadedById,
            'created_at' => $this->iso($this->created_at),
            'comment' => $comment,
            'is_active' => $isActive,
            'version_number' => $versionNumber,
            'url' => $url,
        ];
    }
}
