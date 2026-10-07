<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class MessageResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'conversation_id' => $this->conversation_id,
            'sender_id' => $this->sender_id,
            'type' => $this->type?->value,
            'content' => $this->content,
            // TCK-592 — `metadata` (événement d'un avis système, durée d'une note vocale) et
            // `attachments` étaient déclarés par le type front et jamais rendus : un avis système
            // retombait sur sa prose française, et une note vocale n'aurait pas eu de fichier.
            'metadata' => $this->metadata,
            'attachments' => $this->attachments(),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /**
     * ADR-0038 — URL d'API signées (`PrivateMediaAccess`) : la réponse qui les émet est déjà
     * autorisée (participant actif de la conversation).
     *
     * @return list<array<string, mixed>>
     */
    private function attachments(): array
    {
        $access = app(PrivateMediaAccess::class);

        return $this->resource->getMedia('attachments')
            ->map(fn (Media $media): array => [
                'id' => $media->id,
                'name' => $media->file_name,
                'mime_type' => $media->mime_type,
                'size' => $media->size,
                'url' => $access->signedUrl($media),
            ])
            ->values()
            ->all();
    }
}
