<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\MessageType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Scout\Searchable;
use Spatie\Image\Enums\Fit;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class Message extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    /** TCK-2631 — largeur de la vignette d'une photo jointe (celle des photos d'intervention). */
    public const THUMBNAIL_WIDTH = 400;

    protected $fillable = [
        'conversation_id', 'sender_id', 'content', 'type', 'metadata',
    ];

    protected $casts = [
        'type' => MessageType::class,
        'metadata' => 'array',
    ];

    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'body' => $this->content,
            'sender_id' => $this->sender_id,
            'conversation_id' => $this->conversation_id,
            'created_at' => $this->created_at?->timestamp,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed();
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('attachments');
    }

    /**
     * TCK-2631 (ADR-0038, amendement du 2026-11-10) — la vignette d'une photo jointe, en file `media`,
     * sur le disque privé de l'original, servie par la route signée
     * (`PrivateMediaAccess::SERVABLE_CONVERSIONS`). Ni la note vocale ni le PDF n'en ont.
     */
    public function registerMediaConversions(?Media $media = null): void
    {
        if ($media !== null && ! str_starts_with((string) $media->mime_type, 'image/')) {
            return;
        }

        $this->addMediaConversion('thumbnail')
            ->fit(Fit::Max, self::THUMBNAIL_WIDTH, self::THUMBNAIL_WIDTH)
            ->format('jpg')
            ->quality(70)
            ->performOnCollections('attachments')
            ->queued();
    }

    /**
     * TCK-2631 — l'aperçu neutre d'un message à pièce (« Note vocale », « Photo », « Document ») :
     * celui de la liste des conversations et de l'avis de nouveau message, jamais le nom du fichier.
     * `null` pour un texte, dont l'aperçu est son contenu.
     */
    public function neutralPreview(): ?string
    {
        return match ($this->type) {
            MessageType::Audio => __('messaging.audio_preview'),
            MessageType::Image => __('messaging.image_preview'),
            MessageType::Document => __('messaging.document_preview'),
            default => null,
        };
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
