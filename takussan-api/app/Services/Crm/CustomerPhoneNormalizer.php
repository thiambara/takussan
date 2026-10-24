<?php

namespace App\Services\Crm;

use App\Services\Notifications\Sms\PhoneNumber;
use App\Support\TelephoneSaisi;

/**
 * TCK-591 — le numéro d'un client, ramené en E.164 à l'écriture (`+221` par défaut pour un numéro
 * national sénégalais).
 *
 * La saisie était un champ texte libre : « 77 123 45 67 », « 00221771234567 », « +221 77-123-45-67 »
 * désignaient la même personne sans que rien ne le voie — ni le dédoublonnage, ni le lien WhatsApp.
 *
 * Ce qui ne se normalise pas est rendu TEL QUEL (espaces de bord retirés) : un numéro existant
 * n'est jamais effacé, il est signalé par `crm:normalize-customer-phones --dry-run`. La règle de
 * validation (`TelephoneJoignable`) juge ensuite la valeur normalisée.
 */
class CustomerPhoneNormalizer
{
    public const DEFAULT_COUNTRY_CODE = '221';

    /**
     * P125.05 (TCK-2025) — la forme vient de {@see TelephoneSaisi::normaliser()}, le normaliseur de
     * saisie commun ; ce qui reste propre à la fiche client : `null` pour une saisie vide, et la
     * saisie rendue telle quelle (bords retirés) quand elle n'aboutit pas à un E.164.
     */
    public static function normalize(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }

        $trimmed = trim($raw);
        if ($trimmed === '') {
            return null;
        }

        $compact = (string) TelephoneSaisi::normaliser($trimmed);

        return PhoneNumber::isValid($compact) ? $compact : $trimmed;
    }

    /** Le numéro est-il déjà sous sa forme normalisée (E.164) ? */
    public static function isNormalized(?string $value): bool
    {
        return $value !== null && PhoneNumber::isValid($value) && self::normalize($value) === $value;
    }
}
