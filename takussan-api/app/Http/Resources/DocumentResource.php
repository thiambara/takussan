<?php

namespace App\Http\Resources;

use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Document $this */
        $file = $this->getFirstMedia('file');

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
            'file_url' => $file?->getFullUrl(),
            'file_name' => $file?->file_name,
            'file_size' => $file?->size,
            'mime_type' => $file?->mime_type,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
