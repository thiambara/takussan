<?php

namespace App\Http\Resources;

use App\Models\Document;
use App\Services\Document\DocumentVersionService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Document $this */
        $file = $this->getFirstMedia('file');

        // Active version from the `versions` collection (if the collection is loaded).
        $activeVersion = $this->activeVersion();

        $includes = array_filter(array_map('trim', explode(',', (string) $request->query('include', ''))));
        $includeVersions = in_array('versions', $includes, true);

        return [
            'id' => $this->id,
            'documentable_id' => $this->documentable_id,
            'documentable_type' => $this->documentable_type,
            'uploaded_by' => $this->uploaded_by,
            'name' => $this->name,
            'type' => $this->type?->value,
            'description' => $this->description,
            'is_verified' => (bool) $this->is_verified,
            'verified_by' => $this->verified_by,
            'verified_at' => $this->verified_at?->toISOString(),
            'expiry_date' => $this->expiry_date?->toDateString(),
            // Legacy single-file collection.
            'file_url' => $file?->getFullUrl(),
            'file_name' => $file?->file_name,
            'file_size' => $file?->size,
            'mime_type' => $file?->mime_type,
            // Active version from the `versions` collection (null if no version uploaded yet).
            'active_version' => $activeVersion
                ? DocumentVersionResource::make($activeVersion)->toArray($request)
                : null,
            // Versions list — only included when explicitly requested via include=versions.
            'versions' => $includeVersions
                ? DocumentVersionResource::collection($this->getMedia(DocumentVersionService::COLLECTION)
                    ->sortByDesc(fn ($m) => $m->getCustomProperty('version_number', 0))
                    ->values()
                )->toArray($request)
                : null,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
