<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use LogicException;

class Conversation extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'subject', 'property_id', 'lease_id', 'maintenance_request_id',
        // TCK-2957 (ADR-0128 § 1) — l'objet auquel le fil appartient : une clé de `SujetsDuFil`, jamais une classe.
        'subject_type', 'subject_id',
        'type', 'status', 'created_by',
        'last_message_id', 'last_message_preview', 'last_message_at', 'metadata',
    ];

    protected $casts = [
        'type' => ConversationType::class,
        'status' => ConversationStatus::class,
        'last_message_at' => 'datetime',
        'metadata' => 'array',
        'subject_id' => 'integer',
    ];

    /**
     * TCK-2957 (ADR-0128 § 1) — le registre est fermé À L'ÉCRITURE aussi : un `subject_type` hors des
     * types sujets de `SujetsDuFil` (un nom de classe, un type de carte) ne s'enregistre pas, et un
     * type sans identifiant non plus.
     */
    protected static function booted(): void
    {
        static::saving(function (Conversation $conversation): void {
            if ($conversation->subject_type === null && $conversation->subject_id === null) {
                return;
            }
            if (! in_array($conversation->subject_type, SujetsDuFil::typesSujets(), true) || $conversation->subject_id === null) {
                throw new LogicException('Sujet de fil hors du registre : « '.($conversation->subject_type ?? 'null').' ».');
            }
        });
    }

    /**
     * TCK-2957 (ADR-0128 § 1) — l'objet auquel le fil appartient, résolu par le registre seul,
     * supprimé en douceur compris (`trashed()` le dit). `null` pour un fil sans sujet ou dont
     * l'objet a été supprimé définitivement.
     *
     * Une méthode, pas une relation : `subject` est déjà le TITRE du fil (l'attribut masquerait une
     * relation `subject()`), et la colonne ne porte pas de classe (pas de `morphTo`).
     */
    public function objetDuSujet(): ?Model
    {
        if ($this->subject_type === null || $this->subject_id === null) {
            return null;
        }

        return SujetsDuFil::resoudre($this->subject_type, (int) $this->subject_id);
    }

    /** TCK-2957 — les fils dont l'objet est le sujet. */
    public function scopeDeSujet(Builder $query, Model $objet): Builder
    {
        return $query
            ->where('subject_type', SujetsDuFil::typeDuSujet($objet))
            ->where('subject_id', $objet->getKey());
    }

    /**
     * TCK-576, TCK-1127 (P95.02) — ce que rend le détail d'une conversation : le bien, et les
     * membres ACTUELS avec leur avatar. `show` et les écritures qui rendent la conversation
     * (renommage, changement de rôle) l'appellent tous : sans les participants, la feuille d'infos
     * d'un groupe affichait « 0 participant » et cachait toute action d'administration.
     */
    public function loadForDetail(): static
    {
        return $this->loadMissing([
            'property',
            'participants' => fn ($q) => $q->wherePivotNull('left_at')->with('media'),
        ]);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function maintenanceRequest(): BelongsTo
    {
        return $this->belongsTo(MaintenanceRequest::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function lastMessage(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'last_message_id');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'conversation_participants')
            ->using(ConversationParticipant::class)
            ->withPivot(['id', 'role', 'last_read_at', 'is_muted', 'joined_at', 'left_at', 'archived_at'])
            ->withTimestamps();
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }
}
