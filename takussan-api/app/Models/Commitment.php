<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Services\Messaging\CodesDuFil;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2969 (ADR-0130) — un engagement : la promesse d'un participant d'un fil (« je repasse jeudi à
 * 10 h »), un objet du fil inscrit au registre `SujetsDuFil` sous le type `commitment`.
 *
 * Une table à lui, jamais une ligne de `tasks` : aucun lecteur de `tasks` ne le voit (ADR-0130 § 1).
 * « En retard » n'est pas un statut : {@see self::etat()} le dérive à l'instant.
 */
class Commitment extends AbstractModel
{
    use Auditable, HasFactory;

    /** L'état dérivé, que lisent la carte, la liste, la boîte et la fiabilité. */
    public const ETAT_PROPOSE = 'proposed';

    public const ETAT_OUVERT = 'open';

    public const ETAT_EN_RETARD = 'late';

    public const ETAT_TENU = 'kept';

    public const ETAT_ANNULE = 'cancelled';

    /** Le motif d'une annulation : un CODE, jamais un texte. */
    public const ANNULE_PAR_L_AUTEUR = 'by_author';

    public const ANNULE_PAR_LE_PERSONNEL = 'by_staff';

    public const ANNULE_OBJET_CLOS = 'object_closed';

    /**
     * Le journal dit qu'un engagement a eu lieu et a changé d'état, pas ce qu'il promet : ni `title` ni
     * `reopen_reason` (textes libres d'un participant).
     */
    public const AUDIT_ONLY = [
        'conversation_id', 'object_type', 'object_id', 'agency_id', 'holder_id', 'beneficiary_id',
        'created_by_id', 'due_at', 'status', 'confirmed_at', 'kept_at', 'kept_by_id', 'cancelled_at',
        'cancelled_by_id', 'cancel_reason', 'reopened_at', 'reopened_by_id', 'party_reopened_at',
        'overdue_at',
    ];

    protected $fillable = [
        'conversation_id', 'source_message_id', 'object_type', 'object_id', 'agency_id', 'holder_id',
        'beneficiary_id', 'created_by_id', 'title', 'due_at', 'status', 'confirmed_at', 'kept_at',
        'kept_by_id', 'cancelled_at', 'cancelled_by_id', 'cancel_reason', 'reopened_at', 'reopened_by_id',
        'reopen_reason', 'party_reopened_at', 'overdue_at', 'due_soon_sent_at',
        'overdue_signalled_at', 'relances', 'last_relance_at',
        // TCK-2970 — le marqueur de la question « Tenu ? ».
        'check_requested_at',
    ];

    /**
     * TCK-2970 (ADR-0130 § 4) — les marqueurs du signal planifié (`commitments:signal`) : ils tombent quand
     * `due_at` change, comme celui d'une tâche (`Task::booted`). `overdue_at` n'y est PAS : c'est
     * l'historique du retard, que lit la fiabilité (TCK-2971), et il ne tombe jamais.
     */
    public const MARQUEURS_DU_SIGNAL = [
        'due_soon_sent_at', 'overdue_signalled_at', 'relances', 'last_relance_at', 'check_requested_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => CommitmentStatus::class,
            'object_id' => 'integer',
            'due_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'kept_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'reopened_at' => 'datetime',
            'party_reopened_at' => 'datetime',
            'overdue_at' => 'datetime',
            'due_soon_sent_at' => 'datetime',
            'overdue_signalled_at' => 'datetime',
            'last_relance_at' => 'datetime',
            'relances' => 'integer',
            'check_requested_at' => 'datetime', // TCK-2970
        ];
    }

    /** TCK-2970 — une nouvelle échéance fait tomber les marqueurs du signal, jamais `overdue_at`. */
    protected static function booted(): void
    {
        static::updating(function (Commitment $engagement) {
            if (! $engagement->isDirty('due_at')) {
                return;
            }
            foreach (self::MARQUEURS_DU_SIGNAL as $marqueur) {
                $engagement->{$marqueur} = $marqueur === 'relances' ? 0 : null;
            }
        });
    }

    /** L'état dérivé : `proposed`, `open`, `late`, `kept` ou `cancelled`. */
    public function etat(): string
    {
        return match ($this->status) {
            CommitmentStatus::Proposed => self::ETAT_PROPOSE,
            CommitmentStatus::Open => $this->due_at !== null && $this->due_at->isPast() ? self::ETAT_EN_RETARD : self::ETAT_OUVERT,
            CommitmentStatus::Kept => self::ETAT_TENU,
            CommitmentStatus::Cancelled => self::ETAT_ANNULE,
        };
    }

    /**
     * TCK-2970 (ADR-0130 § 3) — la question « Tenu ? » attend-elle encore sa réponse ? Posée
     * (`check_requested_at`, qui tombe avec l'échéance), et sa dernière trace au fil est la question, pas un
     * code qui la clôt (`not_kept_yet`, `kept`, `rescheduled`, `cancelled` : les `eteint` du catalogue).
     * `check_requested_at` reste posé après la réponse, pour que la commande ne la repose pas avant une
     * nouvelle échéance : après « Pas encore », ou après « tenu » puis une réouverture, la question est close.
     */
    public function questionTenuOuverte(): bool
    {
        if ($this->status !== CommitmentStatus::Open || $this->check_requested_at === null) {
            return false;
        }

        $question = 'commitment.check_requested';
        $codes = [$question];
        foreach (CodesDuFil::clotures() as [$eteint, $parCode]) {
            if ($eteint === $question) {
                $codes[] = $parCode;
            }
        }

        $derniere = Message::query()
            ->where('conversation_id', $this->conversation_id)
            ->where('type', MessageType::Event->value)
            ->whereRaw("metadata->'object' = ?::jsonb", [json_encode(['type' => 'commitment', 'id' => (int) $this->id])])
            ->whereIn(DB::raw("metadata->>'code'"), $codes)
            ->orderByDesc('id')
            ->first(['id', 'metadata']);

        return ($derniere?->metadata['code'] ?? null) === $question;
    }

    public function enCours(): bool
    {
        return in_array($this->status, CommitmentStatus::EN_COURS, true);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sourceMessage(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'source_message_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function holder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'holder_id');
    }

    public function beneficiary(): BelongsTo
    {
        return $this->belongsTo(User::class, 'beneficiary_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
