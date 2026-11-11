<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class MessageResource extends BaseResource
{
    /**
     * TCK-2736 (décision du porteur du 2026-11-11) — l'échéance des URL signées d'une pièce jointe
     * (photo, PDF, note vocale) et de sa vignette : 5 minutes, comme la présignature de
     * {@see PrivateMediaAccess::redirect()}. `media.private.show` est hors `auth:sanctum`, la
     * signature y tient lieu d'autorisation : un participant retiré lisait un lien déjà reçu pendant
     * les 30 minutes par défaut. La fenêtre est réduite, pas fermée. Le front relit le fil pour une
     * URL neuve (`PieceJointeDuFil.tsx`) : le lien AVANT d'ouvrir s'il est périmé, car un onglet
     * neuf ne remonte pas son 403 ; la note vocale APRÈS son échec, puis elle rejoue.
     */
    public const ATTACHMENT_URL_TTL_MINUTES = 5;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'conversation_id' => $this->conversation_id,
            'sender_id' => $this->sender_id,
            // TCK-2013 (P175.04) — l'auteur, que `ChatView` écrit au-dessus d'un message reçu :
            // son nom montré à un autre compte (`nameWithoutContact()`, jamais une coordonnée).
            // Nul pour un compte effacé, que la portée `SoftDeletes` ne charge pas.
            'sender' => $this->whenLoaded('sender', fn () => $this->resource->sender === null ? null : [
                'id' => $this->resource->sender->id,
                'full_name' => $this->resource->sender->nameWithoutContact(),
            ]),
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
        $expiresAt = now()->addMinutes(self::ATTACHMENT_URL_TTL_MINUTES);

        return $this->resource->getMedia('attachments')
            ->map(fn (Media $media): array => [
                'id' => $media->id,
                'name' => $media->file_name,
                'mime_type' => $media->mime_type,
                'size' => $media->size,
                'url' => $access->signedUrl($media, $expiresAt),
                // TCK-2631 — la vignette d'une photo jointe, signée comme l'original ; `null` pour
                // une note vocale, un PDF, ou tant que la file `media` ne l'a pas produite.
                'thumbnail_url' => $access->signedConversionUrl($media, 'thumbnail', $expiresAt),
            ])
            ->values()
            ->all();
    }
}
