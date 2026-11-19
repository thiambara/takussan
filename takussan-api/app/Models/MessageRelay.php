<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2980 (ADR-0132 § 1, § 4) — un passage par le pont : un message reçu (`direction = in`) ou envoyé (`out`) sur
 * un canal (`channel`, l'identifiant d'un pilote, `App\Services\Pont\CanalDuPont`).
 *
 * - `purpose` : `message` (un message du fil, reçu ou relayé), `invitation` (TCK-2981), `action_link` (TCK-2982),
 *   `digest` (TCK-2985) ;
 * - `provider_message_id` : l'identifiant chez le fournisseur, unique par canal (index partiel) : la clé
 *   d'idempotence du webhook et la cible de `context.id` ;
 * - `phone` : E.164, effacé après 90 jours (`pont:effacer-numeros`). **Rendu par aucune ressource.**
 *
 * Écrit par le pont seul ; aucune route ne le crée ni ne le lit dans ce ticket.
 */
class MessageRelay extends AbstractModel
{
    public const PURPOSE_MESSAGE = 'message';

    public const PURPOSE_INVITATION = 'invitation';

    public const PURPOSE_ACTION_LINK = 'action_link';

    public const PURPOSE_DIGEST = 'digest';

    public const DIRECTION_IN = 'in';

    public const DIRECTION_OUT = 'out';

    /** Un message reçu par le pont. Les statuts d'envoi (`envoye`, `remis`, `lu`, `echec`) sont ceux de TCK-2981. */
    public const STATUS_RECU = 'recu';

    // TCK-2981 — les statuts d'un envoi (et d'une invitation, et de l'attente d'accord).
    public const STATUS_ENVOYE = 'envoye';

    public const STATUS_REMIS = 'remis';

    public const STATUS_LU = 'lu';

    public const STATUS_ECHEC = 'echec';

    /** Un message du personnel écrit avant l'accord : il part à l'accord, dans l'ordre. */
    public const STATUS_EN_ATTENTE_ACCORD = 'en_attente_accord';

    /** Un message en attente d'accord, repris à l'accord (son envoi a son propre relais). */
    public const STATUS_REPRIS = 'repris';

    /** Une invitation acceptée par le bouton (ou un accord déjà donné ailleurs : joint d'emblée). */
    public const STATUS_ACCEPTE = 'accepte';

    /** Rien n'a pu partir (aucun canal disponible). */
    public const STATUS_NON_ENVOYE = 'non_envoye';

    protected $table = 'message_relays';

    protected $fillable = [
        'purpose', 'direction', 'message_id', 'conversation_id', 'agency_id', 'user_id', 'customer_id',
        'property_contact_lead_id', 'channel', 'form', 'template', 'phone', 'business_number_id',
        'provider_message_id', 'status', 'failure_reason', 'sent_at', 'delivered_at', 'read_at', 'failed_at',
    ];

    protected $hidden = ['phone'];

    protected $casts = [
        'sent_at' => 'datetime',
        'delivered_at' => 'datetime',
        'read_at' => 'datetime',
        'failed_at' => 'datetime',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(PropertyContactLead::class, 'property_contact_lead_id');
    }
}
