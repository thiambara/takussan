<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
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
 *   url (temporary signed URL via getTemporaryUrl or getFullUrl as fallback)
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

        // Attempt a temporary signed URL (local disk will fall back to getFullUrl).
        try {
            $url = $this->getTemporaryUrl(now()->addMinutes(15));
        } catch (\Exception) {
            $url = $this->getFullUrl();
        }

        return [
            'id' => $this->id,
            'file_name' => $this->file_name,
            'size' => $this->size,
            'mime_type' => $this->mime_type,
            'uploaded_by_id' => $uploadedById,
            'created_at' => $this->created_at?->toISOString(),
            'comment' => $comment,
            'is_active' => $isActive,
            'version_number' => $versionNumber,
            'url' => $url,
        ];
    }
}
