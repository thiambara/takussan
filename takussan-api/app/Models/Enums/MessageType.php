<?php

namespace App\Models\Enums;

enum MessageType: string
{
    case Text = 'text';
    case Image = 'image';
    case Document = 'document';
    case System = 'system';
    // TCK-592 — ADR-0038 : note vocale, fichier dans la collection privée `attachments`.
    case Audio = 'audio';

    /**
     * TCK-2958 (ADR-0128 § 3) — un participant pose un objet dans le fil. `metadata` fermé
     * (`{object: {type, id}, code, data}`), `content` = le code ; écrit par `EvenementsDuFil` seul.
     */
    case Card = 'card';

    /**
     * TCK-2958 (ADR-0128 § 3) — la plateforme écrit qu'un objet a changé. Sans auteur, immuable
     * comme un avis système, et ne compte comme non lu pour personne (TCK-2959 : `action_for`).
     */
    case Event = 'event';

    /**
     * TCK-2958 — les types dont `content` est un CODE neutre, jamais un texte : l'aperçu commun de la
     * liste et l'index de recherche ne portent rien qui dépende du lecteur ni de sa langue.
     *
     * @return list<self>
     */
    public static function aContenuCode(): array
    {
        return [self::System, self::Event, self::Card];
    }
}
