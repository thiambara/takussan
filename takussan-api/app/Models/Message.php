<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\MessageType;
use App\Services\Messaging\ConversationAccess;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\EmetDesSignaux;
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
    use EmetDesSignaux, HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    /** TCK-2631 — largeur de la vignette d'une photo jointe (celle des photos d'intervention). */
    public const THUMBNAIL_WIDTH = 400;

    protected $fillable = [
        'conversation_id', 'sender_id', 'content', 'type', 'metadata',
    ];

    protected $casts = [
        'type' => MessageType::class,
        'metadata' => 'array',
    ];

    /**
     * TCK-2955 (ADR-0129 § 2) — un message écrit, modifié, supprimé ou restauré le signale sur le fil
     * (`sujet.conversation.{id}`), et à la boîte de chaque participant ACTIF du fil, en un seul envoi
     * ({@see ConversationAccess::idsDesParticipantsActifs()}). Au niveau du modèle : les trois écrivains
     * (`ConversationWriter`, le contact public d'une annonce, `SystemMessageFactory`) et `EvenementsDuFil`
     * émettent sans y penser.
     */
    protected static function signauxTempsReel(): array
    {
        // Le sujet n'a besoin que de sa classe et de sa clé (`CanauxTempsReel`) : aucune requête, et aucune
        // relation posée sur le modèle (qu'une sérialisation emporterait).
        $fil = fn (self $m): ?Conversation => $m->conversation_id === null ? null
            : (new Conversation)->setRawAttributes(['id' => (int) $m->conversation_id], true);
        $actifs = fn (self $m): array => ConversationAccess::idsDesParticipantsActifs((int) $m->conversation_id);
        $modifie = [[CodeDeSignal::MessageUpdated, $fil], [CodeDeSignal::BoiteUpdated, $fil, 'a' => $actifs]];

        return [
            'created' => [[CodeDeSignal::MessageCreated, $fil], [CodeDeSignal::BoiteUpdated, $fil, 'a' => $actifs]],
            'updated' => $modifie,
            'deleted' => $modifie,
            'restored' => $modifie,
        ];
    }

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

    /**
     * TCK-2958 (ADR-0128 § 3) — un `system`, un `event` ou une `card` n'est pas indexé : son `content`
     * est un code, pas un texte. Ceux déjà indexés avec leur texte français sont retirés par
     * `messages:unindex-coded` (une réimportation filtre, elle ne retire pas).
     */
    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed() && ! in_array($this->type, MessageType::aContenuCode(), true);
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
