<?php

namespace App\Support;

/**
 * TCK-2386 (ADR-0077 §1, §9) — les numéros sénégalais d'une annonce, en E.164, et l'empreinte à clé
 * qui retrouve un annonceur sans garder son numéro.
 *
 * `fromText()` lit les MÊMES formes que le masquage ({@see PhoneMasker::PATTERN}, préfixe 71
 * compris, chiffres arabes et pleine chasse, invisibles retirés) : ce que la passerelle IA
 * masquerait pour un usage public, le Radar le lit comme un numéro. Un prix (`450.000f`) n'en est pas un.
 *
 * `hmac()` est ce qui survit à un STOP (ADR-0077 §9) : le numéro en clair s'efface, pas le refus.
 * Clé : `config('radar.phone_hmac_key')`, à défaut dérivée de `app.key` — aucune variable
 * d'environnement de plus dans ce ticket.
 */
final class RadarPhone
{
    /** Séparateurs tolérés entre les groupes d'un numéro isolé, parenthèses comprises. */
    private const SEPARATORS = '/[\s\x{00A0}\x{202F}.\-\/()]/u';

    /**
     * Un indicatif de pays (`+33`, `0033`) juste avant le motif, au plus un séparateur entre eux :
     * ce que le motif a trouvé est la suite d'un numéro étranger. `221` excepté.
     */
    private const FOREIGN_PREFIX = '/(?<![\d+])(?:\+|00)(\d{1,3})[\s\x{00A0}\x{202F}.\-\/]?$/u';

    /**
     * Les numéros du texte, en `+221XXXXXXXXX`, dédoublonnés, dans l'ordre d'apparition.
     *
     * @return list<string>
     */
    public static function fromText(string $text): array
    {
        $normalized = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text));
        if (preg_match_all(PhoneMasker::PATTERN, $normalized, $found, PREG_OFFSET_CAPTURE) === false) {
            return [];
        }

        $numbers = [];
        foreach ($found[0] as [$match, $offset]) {
            // La fin d'un numéro étranger (`+1 77 123 45 67 89`, `0033 771234567`) n'est pas un numéro
            // sénégalais : le masquage la masque quand même, le Radar ne la lit pas.
            if (preg_match(self::FOREIGN_PREFIX, substr($normalized, 0, $offset), $prefix) === 1 && $prefix[1] !== '221') {
                continue;
            }
            $e164 = self::canonical($match);
            if ($e164 !== null) {
                $numbers[$e164] = true;
            }
        }

        return array_keys($numbers);
    }

    /** Un numéro isolé, écrit comme on veut → E.164 sénégalais, ou null s'il n'en est pas un. */
    public static function canonical(string $raw): ?string
    {
        $clean = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $raw));
        $clean = (string) preg_replace(self::SEPARATORS, '', $clean);
        if (preg_match('/^\+?\d+$/', $clean) !== 1) {
            return null;
        }

        $e164 = CanonicalPhone::fold($clean);
        if (preg_match('/^\+221(\d{9})$/', $e164, $parts) !== 1) {
            return null;
        }

        // Le motif du masquage est la seule définition d'un numéro plausible : il doit couvrir tout le numéro.
        $national = '221'.$parts[1];
        if (preg_match(PhoneMasker::PATTERN, $national, $found) !== 1 || $found[0] !== $national) {
            return null;
        }

        return $e164;
    }

    /** L'empreinte à clé d'un numéro E.164 : 64 caractères hexadécimaux, stable, dépendante de la clé. */
    public static function hmac(string $e164): string
    {
        return hash_hmac('sha256', $e164, self::key());
    }

    private static function key(): string
    {
        $key = config('radar.phone_hmac_key');

        return is_string($key) && $key !== '' ? $key : 'radar-phone|'.config('app.key');
    }
}
