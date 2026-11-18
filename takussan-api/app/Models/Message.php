<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
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

    // TCK-2965 (ADR-0128 § 6) — `visibility` : `all` ou `team` (la note d'équipe).
    protected $fillable = [
        'conversation_id', 'sender_id', 'content', 'type', 'metadata', 'visibility',
    ];

    protected $casts = [
        'type' => MessageType::class,
        'metadata' => 'array',
        'visibility' => MessageVisibility::class,
    ];

    /**
     * TCK-2965 — le défaut de la colonne, porté aussi par le modèle : un message créé ne relit pas sa
     * ligne, et l'observateur, les signaux et la réponse de l'envoi liraient `null` sans lui.
     */
    protected $attributes = [
        'visibility' => 'all',
    ];

    /** TCK-2965 — une note d'équipe, que seul le personnel du fil lit ({@see EquipeDuFil}). */
    public function estUneNote(): bool
    {
        return $this->visibility === MessageVisibility::Team;
    }

    /**
     * TCK-2955 (ADR-0129 § 2) — un message écrit, modifié, supprimé ou restauré le signale sur le fil
     * (`sujet.conversation.{id}`), et à la boîte de chaque participant ACTIF du fil, en un seul envoi
     * ({@see ConversationAccess::idsDesParticipantsActifs()}). Au niveau du modèle : les trois écrivains
     * (`ConversationWriter`, le contact public d'une annonce, `SystemMessageFactory`) et `EvenementsDuFil`
     * émettent sans y penser.
     *
     * TCK-2965 (ADR-0128 § 6) — une NOTE D'ÉQUIPE n'émet RIEN sur le canal du fil, que tout abonné du fil
     * reçoit : ses signaux partent vers le seul canal personnel (`utilisateur.{id}`) de ceux qui la lisent
     * ({@see EquipeDuFil::idsDesLecteursDesNotes()}). Le sujet reste le fil (le `subject` du signal) ; seul
     * le canal change. Un message `all` garde ses deux signaux d'avant.
     */
    protected static function signauxTempsReel(): array
    {
        // Le sujet n'a besoin que de sa classe et de sa clé (`CanauxTempsReel`) : aucune requête, et aucune
        // relation posée sur le modèle (qu'une sérialisation emporterait).
        $fil = fn (self $m): ?Conversation => $m->conversation_id === null ? null
            : (new Conversation)->setRawAttributes(['id' => (int) $m->conversation_id], true);
        // TCK-2965 — le canal du fil, pour un message `all` seulement.
        $filPublic = fn (self $m): ?Conversation => $m->estUneNote() ? null : $fil($m);
        $lecteursDeLaNote = fn (self $m): array => $m->estUneNote() && $m->conversation_id !== null
            ? EquipeDuFil::idsDesLecteursDesNotes((int) $m->conversation_id)
            : [];
        $boites = fn (self $m): array => $m->estUneNote()
            ? $lecteursDeLaNote($m)
            : ConversationAccess::idsDesParticipantsActifs((int) $m->conversation_id);
        $signaux = fn (CodeDeSignal $code): array => [
            [$code, $filPublic],
            [$code, $fil, 'a' => $lecteursDeLaNote],
            [CodeDeSignal::BoiteUpdated, $fil, 'a' => $boites],
        ];

        return [
            'created' => $signaux(CodeDeSignal::MessageCreated),
            'updated' => $signaux(CodeDeSignal::MessageUpdated),
            'deleted' => $signaux(CodeDeSignal::MessageUpdated),
            'restored' => $signaux(CodeDeSignal::MessageUpdated),
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
            // TCK-2965 (ADR-0128 § 6) — filtrable : `MessageSearchService` écarte les notes d'équipe DANS le
            // moteur. Un document indexé avant cette clé n'a pas de `visibility` : aucune branche du filtre
            // ne le laisse passer (fermé par défaut) jusqu'à la réimportation que joue `docker/release.sh`. Sans
            // repli : une valeur absente reste absente, jamais `all`.
            'visibility' => $this->visibility?->value,
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

    /**
     * TCK-2964 — l'extrait d'une carte POSÉE par un participant, dans la langue `$locale` (l'avis de
     * nouveau message, émis par l'API dans la langue du destinataire). Une phrase générique, du seul
     * code : ni titre, ni prix, ni date — l'avis sort du fil, la projection n'y est pas relue.
     * `null` pour tout autre message, ou un code sans phrase (l'appelant retombe sur le contenu).
     *
     * `content` reste le code : l'aperçu commun de la liste ne porte que lui, le front écrit le libellé.
     */
    public function cardPreview(string $locale): ?string
    {
        if ($this->type !== MessageType::Card) {
            return null;
        }
        $code = $this->metadata['code'] ?? null;
        if (! is_string($code) || $code === '') {
            return null;
        }
        $cle = 'messaging.card_preview.'.str_replace('.', '_', $code);
        $phrase = __($cle, [], $locale);

        return is_string($phrase) && $phrase !== $cle ? $phrase : null;
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
