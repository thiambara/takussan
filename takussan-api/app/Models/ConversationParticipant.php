<?php

namespace App\Models;

use App\Models\Concerns\RefusesImpossibleRouteKeys;
use App\Models\Enums\ParticipantRole;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\EmetDesSignaux;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

class ConversationParticipant extends Pivot
{
    use EmetDesSignaux;
    use HasFactory;
    use RefusesImpossibleRouteKeys;

    protected $table = 'conversation_participants';

    public $incrementing = true;

    protected $fillable = [
        'conversation_id', 'user_id', 'role',
        'last_read_at', 'is_muted', 'joined_at', 'left_at', 'archived_at',
    ];

    protected $casts = [
        'role' => ParticipantRole::class,
        'last_read_at' => 'datetime',
        'is_muted' => 'boolean',
        'joined_at' => 'datetime',
        'left_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    /**
     * TCK-2955 (ADR-0129 § 2) — la COMPOSITION du fil a changé : `participants.updated` sur le fil, et
     * `boite.updated` à la personne ajoutée, retirée ou revenue. `attach()`, `detach()` et
     * `updateExistingPivot()` passent par ce pivot (`->using()`) et déclenchent ces événements ; une
     * écriture de masse (`ConversationParticipant::query()->update()`, `DB::table()`) ne les déclenche pas,
     * et doit donc passer par le modèle ou émettre elle-même.
     *
     * Sur `updated`, seuls `left_at` et `role` comptent (`'attributs'`) : `last_read_at`, `is_muted` et
     * `archived_at` changent à chaque lecture, sourdine ou archivage, et ne regardent que leur porteur.
     */
    protected static function signauxTempsReel(): array
    {
        // Le sujet n'a besoin que de sa classe et de sa clé (`CanauxTempsReel`) : aucune requête, et aucune
        // relation posée sur le modèle (qu'une sérialisation emporterait).
        $fil = fn (self $p): ?Conversation => $p->conversation_id === null ? null
            : (new Conversation)->setRawAttributes(['id' => (int) $p->conversation_id], true);
        $concerne = fn (self $p): array => [(int) $p->user_id];
        $composition = [[CodeDeSignal::ParticipantsUpdated, $fil], [CodeDeSignal::BoiteUpdated, $fil, 'a' => $concerne]];

        return [
            'created' => $composition,
            'deleted' => $composition,
            'updated' => [
                [CodeDeSignal::ParticipantsUpdated, $fil, 'attributs' => ['left_at', 'role']],
                [CodeDeSignal::BoiteUpdated, $fil, 'a' => $concerne, 'attributs' => ['left_at']],
            ],
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
