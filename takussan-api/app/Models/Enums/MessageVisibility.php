<?php

namespace App\Models\Enums;

use App\Services\Messaging\EquipeDuFil;

/**
 * TCK-2965 (ADR-0128 § 6) — qui lit un message du fil.
 *
 *  - `all` : tout lecteur du fil (le défaut, et la valeur de tout message d'avant la note d'équipe) ;
 *  - `team` : la « Note d'équipe », que seuls lisent les participants actifs qui sont personnel actif
 *    de l'agence du fil, et le super-admin hors impersonation
 *    ({@see EquipeDuFil}).
 */
enum MessageVisibility: string
{
    case All = 'all';
    case Team = 'team';

    /**
     * Les types qu'une note d'équipe peut porter : un texte, une note vocale, une pièce jointe. Jamais
     * une carte, un événement ni un avis système, qui sont toujours `all` (ADR-0128 § 6).
     *
     * @return list<MessageType>
     */
    public static function typesDeNote(): array
    {
        return [MessageType::Text, MessageType::Audio, MessageType::Image, MessageType::Document];
    }
}
