<?php

namespace App\Support;

use App\Support\Telephone\LectureDesNumeros;
use App\Support\Telephone\NumeroTrouve;
use App\Support\Telephone\Politique;

/**
 * TCK-2386 (ADR-0077 §1, §9) — les numéros sénégalais d'une annonce, en E.164, et l'empreinte à clé
 * qui retrouve un annonceur sans garder son numéro.
 *
 * La lecture est celle de {@see LectureDesNumeros} (TCK-3004) : les mêmes formes que le masquage, préfixe 71 compris,
 * chiffres arabes et pleine chasse, invisibles retirés, `_`, `,`, `(77)`, espaces doubles (TCK-2412), dont le Radar ne garde
 * que les sénégalaises ; un prix (`450.000f`) n'en est pas un. Ce fichier choisit la politique : le refus STOP se juge sur
 * `fromText()` ({@see Politique::RefusStop}, la plus large), le contact choisi d'office sur `contactsFromText()`
 * ({@see Politique::ContactDOffice}, la plus étroite).
 *
 * `hmac()` est ce qui survit à un STOP (ADR-0077 §9) : le numéro en clair s'efface, pas le refus.
 * Clé : `RADAR_PHONE_HMAC_KEY` (`config('radar.phone_hmac_key')`), à défaut dérivée de `app.key`.
 * La clé de l'empreinte est `canonical()` : toute écriture qu'elle reconnaît doit le rester, sinon un refus n'est plus retrouvé
 * (`tests/Unit/Support/Telephone/EmpreintesFigeesTest.php`).
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
     * Les numéros du texte, en `+221XXXXXXXXX`, dédoublonnés, dans l'ordre d'apparition.
     *
     * @return list<string>
     */
    public static function fromText(string $text): array
    {
        return self::read($text, Politique::RefusStop);
    }

    /**
     * TCK-2412 — les numéros du texte qui peuvent désigner d'office le contact d'une annonce : ceux de `fromText()`, moins
     * ce que {@see Politique::ContactDOffice} écarte. Un contact manqué se rattrape à la main ; un faux numéro démarché, non.
     *
     * @return list<string>
     */
    public static function contactsFromText(string $text): array
    {
        return self::read($text, Politique::ContactDOffice);
    }

    /** Un numéro isolé, écrit comme on veut → E.164 sénégalais, ou null s'il n'en est pas un. */
    public static function canonical(string $raw): ?string
    {
        return LectureDesNumeros::e164($raw);
    }

    /** @return list<string> */
    private static function read(string $text, Politique $politique): array
    {
        $e164 = array_map(fn (NumeroTrouve $numero): ?string => $numero->e164(), LectureDesNumeros::lire($text, $politique) ?? []);

        return array_values(array_unique(array_filter($e164, is_string(...))));
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
