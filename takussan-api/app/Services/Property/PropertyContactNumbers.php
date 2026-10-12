<?php

namespace App\Services\Property;

use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\User;

/**
 * TCK-633 (lot C) — les numéros qu'un visiteur peut appeler pour un bien, dans l'ordre :
 * le numéro principal du contact principal ({@see PrimaryPropertyContact}) s'il est VÉRIFIÉ, son
 * second numéro s'il est VÉRIFIÉ, puis les contacts sur place par `position`.
 *
 * Correction du lot C, tour 2 (décision de la session sur D10) — la vérification n'est exigée qu'à
 * la publication ; un bien en ligne dont le contact perd son numéro vérifié (changement de numéro,
 * agent non vérifié confié au bien, approbation tardive) RESTE en ligne. La promesse faite au
 * visiteur — le numéro affiché est vérifié — tient donc ici, à l'émission, et non à la publication :
 * un numéro principal non vérifié ne sort ni par `…/contact`, ni comme WhatsApp, ni comme
 * « Appeler ». Les contacts sur place, saisis par l'annonceur pour ce bien, restent servis.
 *
 * Une seule définition pour l'endpoint limité (`GET …/contact`) et pour le drapeau
 * `has_whatsapp` de la fiche, qui doivent dire la même chose.
 */
final class PropertyContactNumbers
{
    /**
     * ⚠ Suppose `contacts` et {@see PrimaryPropertyContact::eagerLoads()} chargés.
     *
     * @return list<array{phone: string, whatsapp: bool, label: ?string, kind: string}>
     */
    public static function for(Property $property): array
    {
        $contact = PrimaryPropertyContact::for($property);
        $numeros = [];

        if ($contact !== null && self::principalUtilisable($contact)) {
            $numeros[] = ['phone' => $contact->phone, 'whatsapp' => (bool) $contact->phone_whatsapp, 'label' => null, 'kind' => 'primary'];
        }
        if ($contact !== null && self::secondUtilisable($contact)) {
            $numeros[] = ['phone' => (string) $contact->secondary_phone, 'whatsapp' => (bool) $contact->secondary_phone_whatsapp, 'label' => null, 'kind' => 'secondary'];
        }
        foreach ($property->contacts as $surPlace) {
            /** @var PropertyContact $surPlace */
            $numeros[] = ['phone' => $surPlace->phone, 'whatsapp' => $surPlace->has_whatsapp, 'label' => $surPlace->label, 'kind' => 'on_site'];
        }

        return $numeros;
    }

    /**
     * Au moins un numéro déclaré WhatsApp. Les contacts sur place ne comptent que s'ils sont
     * CHARGÉS : une liste de biens ne paie pas une requête par ligne pour un bouton de fiche.
     */
    public static function hasWhatsApp(Property $property, ?User $contact): bool
    {
        if ($contact !== null && self::principalUtilisable($contact) && $contact->phone_whatsapp) {
            return true;
        }
        if ($contact !== null && self::secondUtilisable($contact) && $contact->secondary_phone_whatsapp) {
            return true;
        }

        return $property->relationLoaded('contacts')
            && $property->contacts->contains(fn (PropertyContact $c) => $c->has_whatsapp);
    }

    /**
     * Au moins un numéro à appeler : le bouton « Appeler » de la fiche (`has_phone`). Mêmes règles
     * que {@see for()} ; les contacts sur place ne comptent que s'ils sont CHARGÉS.
     */
    public static function hasPhone(Property $property, ?User $contact): bool
    {
        if ($contact !== null && (self::principalUtilisable($contact) || self::secondUtilisable($contact))) {
            return true;
        }

        return $property->relationLoaded('contacts') && $property->contacts->isNotEmpty();
    }

    /** Tour 3 — la règle vit dans {@see User::numeroPrincipalPublic()}, son seul point. */
    private static function principalUtilisable(User $contact): bool
    {
        return $contact->numeroPrincipalPublic() !== null;
    }

    private static function secondUtilisable(User $contact): bool
    {
        return $contact->numeroSecondairePublic() !== null;
    }
}
