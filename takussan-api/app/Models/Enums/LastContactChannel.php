<?php

namespace App\Models\Enums;

/**
 * TCK-2766 — par quel moyen s'est fait le dernier contact d'une fiche client
 * (`customers.last_contact_channel`) : un des quatre gestes ({@see ContactGestureChannel}), une note
 * écrite sur la fiche, ou une visite (terminée, ou son compte rendu). Jamais une coordonnée.
 *
 * Distinct de `ContactGestureChannel` : `note` et `visit` ne sont pas des gestes qu'on poste
 * (`StoreContactGestureRequest` valide sur ce dernier).
 */
enum LastContactChannel: string
{
    case Whatsapp = 'whatsapp';
    case Call = 'call';
    case Email = 'email';
    case Sms = 'sms';
    case Note = 'note';
    case Visit = 'visit';

    public static function fromGesture(ContactGestureChannel $channel): self
    {
        return self::from($channel->value);
    }
}
