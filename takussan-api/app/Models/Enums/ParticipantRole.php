<?php

namespace App\Models\Enums;

/**
 * TCK-085 — Role of a participant inside a Conversation.
 *
 * `admin` can rename the conversation, add / remove / promote / demote
 * other participants. `member` is the default for anyone not the creator.
 *
 * Stored as a string on `conversation_participants.role` — the column has
 * existed since TCK-029 with a default of "member"; we only formalise the
 * enum here to keep value parity between API and DB.
 */
enum ParticipantRole: string
{
    case Admin = 'admin';
    case Member = 'member';
}
