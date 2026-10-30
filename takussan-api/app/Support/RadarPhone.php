<?php

namespace App\Support;

/**
 * TCK-2386 (ADR-0077 §1, §9) — les numéros sénégalais d'une annonce, en E.164, et l'empreinte à clé
 * qui retrouve un annonceur sans garder son numéro.
 *
 * `fromText()` lit les MÊMES formes que le masquage ({@see PhoneMasker::MASK_PATTERN}, préfixe 71
 * compris, chiffres arabes et pleine chasse, invisibles retirés, `_`, `,`, `(77)`, espaces doubles —
 * TCK-2412) et n'en garde que les sénégalaises : ce que la passerelle IA masquerait pour un usage
 * public, le Radar le lit comme un numéro, sauf un numéro étranger. Un prix (`450.000f`) n'en est pas un.
 * Le refus STOP se juge sur `fromText()`, le plus large ; le contact choisi d'office sur `contactsFromText()`,
 * qui écarte en plus les limites connues du masqueur (une liste, une mesure, un prix).
 *
 * `hmac()` est ce qui survit à un STOP (ADR-0077 §9) : le numéro en clair s'efface, pas le refus.
 * Clé : `RADAR_PHONE_HMAC_KEY` (`config('radar.phone_hmac_key')`), à défaut dérivée de `app.key`.
 *
 * TCK-2414 — le numéro d'un refus étant purgé, son empreinte ne se recalcule pas sous une clé neuve :
 * une rotation la rendrait méconnaissable, et le Radar redémarcherait qui a dit STOP. `hmac()` écrit
 * sous la clé courante ; `hmacs()` est ce qu'une LECTURE cherche : la clé courante, les anciennes
 * (`RADAR_PHONE_HMAC_PREVIOUS_KEYS`) et le repli sur `app.key` et `APP_PREVIOUS_KEYS`, qui garde les
 * empreintes écrites avant la pose de la clé dédiée tant qu'`APP_KEY` n'a pas tourné sans eux.
 */
final class RadarPhone
{
    /**
     * Séparateurs tolérés entre les groupes d'un numéro isolé : tous ceux que le masquage admet (TCK-2412),
     * tirets Unicode (`–`, `−`…), `_` et `,` compris. Les parenthèses se retirent après le `(0)` de trunk.
     */
    private const SEPARATORS = '/[\s\x{00A0}\x{202F}.,_\-\/\x{2010}-\x{2015}\x{2212}]/u';

    /** Le `(0)` de trunk derrière l'indicatif (`+221 (0)77 …`) : il n'est pas un chiffre du numéro. */
    private const TRUNK = '/^((?:\+|00)?221)\(0\)/';

    /**
     * Juste avant le motif, un indicatif de pays (`+33`, `0033`, au plus un séparateur derrière lui) ou un
     * `+` / `00` nu (au plus trois séparateurs) : ce que le motif a trouvé est la suite d'un numéro étranger.
     * Un `+` nu devant le motif, c'est le motif qui commence par l'indicatif (`+33 7 7 1 2 …` lu `33 7 7 1 2 …`,
     * TCK-2412 B1) : tout préfixe sénégalais commence par un indicatif (3x, 7, 93). `221` excepté.
     * Un indicatif ne commence jamais par 0 : sans `[1-9]`, le `000` d'un prix (`450 000 77 123 45 67`) se
     * lisait `00` + indicatif `0`. Le séparateur est l'un de `SEPARATORS`, après un `)` éventuel (`(+1) 77 …`).
     * Une ou deux espaces sont admises entre le `+` et l'indicatif, comme pour le masquage (`+ 1 77 …`), et
     * l'indicatif peut être écrit chiffre à chiffre (`+3 3 7 7 1 …`). Ni une décimale (`1.00 7 …`) ni un millier.
     */
    private const FOREIGN_PREFIX = '/(?<![\d+.,])(?:\+|00)'
        .'(?:[\s\x{00A0}\x{202F}]{0,2}([1-9](?:[\s\x{00A0}\x{202F}.\-]?[0-9]){0,2})\)?[\s\x{00A0}\x{202F}.,_\-\/\x{2010}-\x{2015}\x{2212}]?|[\s\x{00A0}\x{202F}.\-\/\x{2010}-\x{2015}\x{2212}]{0,3})$/u';

    /**
     * TCK-2412 (I1) — le `+` de l'étage d'une annonce (`R+1`, `R+10` : rez-de-chaussée plus un, plus dix) n'est pas
     * un indicatif : `Immeuble R+10 77 123 45 67` se lisait `+10` suivi de dix chiffres. Collé à un mot (`Tel+33 …`), si.
     * Le masqueur l'exempte aussi depuis TCK-2428 (`PhoneMasker::NOT_A_FLOOR`), mais `FOREIGN_PREFIX` en dépend encore :
     * sans lui, `Villa R+1 77 123 45 67` lit `+1` devant le numéro, qui devient étranger.
     *
     * TCK-2435 — aussi `RDC+1` et `R + 1`, `R +1`, `R+ 1` (au plus deux espaces de chaque côté), mais seulement pour un
     * étage de 0 à 19 que rien ne colle derrière, comme `PhoneMasker::NOT_A_FLOOR` : `R + 33 6 12 34 56 78` garde son `+`.
     */
    private const FLOOR_PLUS = '/(?<!\p{L})([Rr])\+(?=[0-9])'
        .'|(?<!\p{L})((?:r|rdc)[\s\x{00A0}\x{202F}]{0,2})\+(?=[\s\x{00A0}\x{202F}]{0,2}(?:[0-9]|1[0-9])(?![0-9]))/iu';

    /**
     * TCK-2412 — ce qui, derrière un numéro écrit sans indicatif, en fait une mesure, une durée ou un montant
     * (`30 20 5 20 10 min`, `… 5 % par an`, `(75) 500 00 00 F`) : les limites connues du masqueur. Une unité d'une
     * lettre (`h`, `m`, `f`) ne compte que suivie d'une espace ou de la fin du texte : `M. Diallo`, `h24`, `H24/7`
     * derrière un numéro ne sont pas des unités (contre-vérification C2).
     */
    private const NOT_A_CONTACT_AFTER = '/^[\s\x{00A0}\x{202F}]*(?:(?:%|min|mn|km|m²|m2|ml|cm|ha|ans?|mois|jours?'
        .'|f\s?cfa|cfa|xof|francs?|chambres?|pi[eè]ces?)(?!\p{L})|[hmf](?=[\s\x{00A0}\x{202F}]|$))/iu';

    /** TCK-2412 — le mot qui, juste devant, fait du nombre un prix, une mesure ou une liste (`Lots 3 0 1 2 …`). */
    private const NOT_A_CONTACT_BEFORE = '/(?<!\p{L})(?:prix|loyer|montant|total|caution|avance|frais|charges?|surface|superficie'
        .'|lots?|horaires?|distances?|dimensions?|mensualit[ée]s?)[\s\x{00A0}\x{202F}]*[:=-]?[\s\x{00A0}\x{202F}]*$|[\[{]$/iu';

    /**
     * Les numéros du texte, en `+221XXXXXXXXX`, dédoublonnés, dans l'ordre d'apparition.
     *
     * @return list<string>
     */
    public static function fromText(string $text): array
    {
        return self::read($text, false);
    }

    /**
     * TCK-2412 — les numéros du texte qui peuvent désigner d'office le contact d'une annonce : ceux de
     * `fromText()`, moins une forme précédée d'un `+` / `00` nu (`+77 …`, `+33 7 7 1 2 …`), moins une forme écrite
     * sans indicatif qu'une unité suit (`min`, `km`, `%`, `F`…), qu'un mot
     * de prix ou de liste précède (`Prix`, `Lots`, `Horaires`…), ou qu'ouvre un crochet. Un contact manqué se
     * rattrape à la main ; un faux numéro démarché, non.
     *
     * @return list<string>
     */
    public static function contactsFromText(string $text): array
    {
        return self::read($text, true);
    }

    /** Le `+` d'un étage (`R+1`) remplacé par `#`, un octet pour un octet : les positions du texte restent justes. */
    public static function withoutFloorPlus(string $text): string
    {
        return (string) preg_replace(self::FLOOR_PLUS, '$1$2#', $text);
    }

    /**
     * TCK-2412 — l'octet où commence le `+` / `00` d'un indicatif écrit à la fin de `$before` (voir
     * `FOREIGN_PREFIX`), ou null : `RadarAmountParser` étend la plage d'un numéro jusque-là (`0033 7 7 1 …`
     * ne laisse pas un « prix » de 33).
     */
    public static function prefixStart(string $before): ?int
    {
        return preg_match(self::FOREIGN_PREFIX, $before, $prefix, PREG_OFFSET_CAPTURE) === 1 ? $prefix[0][1] : null;
    }

    /** @return list<string> */
    private static function read(string $text, bool $contactsOnly): array
    {
        $normalized = self::withoutFloorPlus(PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text)));
        // Le motif du masquage, sénégalais ou étranger : `canonical()` écarte ensuite tout ce qui n'est pas `+221…`.
        if (preg_match_all(PhoneMasker::MASK_PATTERN, $normalized, $found, PREG_OFFSET_CAPTURE) === false) {
            return [];
        }

        $numbers = [];
        foreach ($found[0] as [$match, $offset]) {
            $before = substr($normalized, 0, $offset);
            // La fin d'un numéro étranger (`+1 77 123 45 67 89`, `0033 771234567`, `+33 7 7 1 2 …`) n'est pas un
            // numéro sénégalais : le masquage la masque quand même, le Radar ne la lit pas.
            $code = preg_match(self::FOREIGN_PREFIX, $before, $prefix) === 1 ? (string) preg_replace('/[^0-9]/', '', $prefix[1] ?? '') : null;
            // Un `+` / `00` nu ne compte que pour le contact d'office (contre-vérification C1) : `77 … + 78 …` ou `+77 …`
            // restent lus pour le refus STOP et pour l'opérateur ; le numéro recollé de B1 n'y coûte qu'un refus par excès.
            if ($code !== null && ($code === '' ? $contactsOnly && ! str_starts_with($match, '221') : $code !== '221')) {
                continue;
            }
            if ($contactsOnly && preg_match('/^(?:\+|00|221)/', $match) !== 1
                && (preg_match(self::NOT_A_CONTACT_BEFORE, $before) === 1
                    || preg_match(self::NOT_A_CONTACT_AFTER, substr($normalized, $offset + strlen($match))) === 1)) {
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
        $clean = str_replace(['(', ')'], '', (string) preg_replace(self::TRUNK, '$1', $clean));
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

    /**
     * Les empreintes sous lesquelles ce numéro a pu être écrit, la clé courante d'abord, sans doublon.
     *
     * @return list<string>
     */
    public static function hmacs(string $e164): array
    {
        $keys = [self::key(), ...(array) config('radar.phone_hmac_previous_keys', [])];
        foreach ([config('app.key'), ...(array) config('app.previous_keys', [])] as $appKey) {
            $keys[] = self::fallback($appKey);
        }
        $keys = array_filter($keys, fn (mixed $key): bool => is_string($key) && $key !== '');

        return array_values(array_unique(array_map(fn (string $key): string => hash_hmac('sha256', $e164, $key), $keys)));
    }

    /** La clé dédiée est posée : `app.key` peut tourner sans toucher aux refus (TCK-2414, sonde de santé). */
    public static function hasDedicatedKey(): bool
    {
        $key = config('radar.phone_hmac_key');

        return is_string($key) && $key !== '';
    }

    private static function key(): string
    {
        return self::hasDedicatedKey() ? (string) config('radar.phone_hmac_key') : self::fallback(config('app.key'));
    }

    /** Le repli d'avant la clé dédiée : à ne jamais changer, les empreintes écrites sous lui en dépendent. */
    private static function fallback(mixed $appKey): string
    {
        return 'radar-phone|'.$appKey;
    }
}
