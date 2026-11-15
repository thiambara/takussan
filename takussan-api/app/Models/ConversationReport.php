<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2859 (ADR-0114 § 2) — le signalement d'une conversation par un de ses participants : un motif
 * codé (`reason`), un commentaire libre facultatif (`comment`, ≤ 500). Un seul par auteur et par fil.
 *
 * Il ne gèle rien : le fil reste ouvert, personne n'est prévenu. Il se lit par le seul super-admin
 * (`GET /api/admin/conversation-reports`), sans le contenu des messages.
 */
class ConversationReport extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['conversation_id', 'reporter_id', 'reason', 'comment'];

    protected static array $queryFields = ['id', 'conversation_id', 'reporter_id', 'reason', 'comment', 'created_at'];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class)->withTrashed();
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }
}
