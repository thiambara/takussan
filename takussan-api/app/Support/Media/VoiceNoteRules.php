<?php

namespace App\Support\Media;

/**
 * TCK-2900 (ADR-0113 § 1, bornes d'ADR-0038 § 2 et § 3) — la note vocale, écrite UNE fois : formats,
 * taille appliquée et durée déclarée. La messagerie (`SendMessageConversationRequest`) et chaque
 * porteur d'une collection `voice_notes` (`HasVoiceNotes`) lisent cette classe ; une borne ne
 * s'écrit jamais ailleurs (l'amendement `video/mp4` d'ADR-0038 a déjà dû corriger une copie).
 */
final class VoiceNoteRules
{
    /**
     * ADR-0038 — formats que produisent les navigateurs mobiles (`MediaRecorder`) et les lecteurs
     * courants. `video/webm` : ce que `finfo` rend pour un enregistrement Chrome sans piste vidéo.
     * `video/mp4` (TCK-2058, amendement du 2026-10-23) : ce que `finfo` rend pour un MP4 audio de
     * marque générique (`isom`, `iso5`, `iso6`, `mp42`) — il juge la marque `ftyp`, pas la piste ;
     * seule la marque `M4A ` est lue `audio/x-m4a`. La borne de 2 Mo reste ce qui protège.
     */
    public const MIMETYPES = [
        'audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg',
    ];

    /** ADR-0038 — la borne APPLIQUÉE (Ko). La durée, elle, est déclarée par le client. */
    public const MAX_KB = 2048;

    /** ADR-0038 — la durée déclarée maximale, en secondes. */
    public const MAX_SECONDS = 60;

    /**
     * Les règles du fichier, après celles de présence propres à chaque porteur.
     *
     * @return list<string>
     */
    public static function file(): array
    {
        return ['file', 'mimetypes:'.implode(',', self::MIMETYPES), 'max:'.self::MAX_KB];
    }

    /**
     * Les règles de la durée déclarée (secondes entières), après celles de présence du porteur.
     *
     * @return list<string>
     */
    public static function duration(): array
    {
        return ['integer', 'min:1', 'max:'.self::MAX_SECONDS];
    }
}
