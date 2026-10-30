<?php

namespace App\Support;

/**
 * TCK-2430 (ADR-0084) — une empreinte HMAC-SHA256 sous `APP_KEY`, et les empreintes sous lesquelles une même donnée
 * a pu être écrite.
 *
 * Laravel relit `APP_PREVIOUS_KEYS` pour déchiffrer et pour vérifier une URL signée, jamais pour un `hash_hmac`
 * écrit à la main : faire tourner `APP_KEY` rendait méconnaissable chaque empreinte déjà en base. `of()` est ce
 * qu'une ÉCRITURE pose, sous la clé courante ; `all()` est ce qu'une LECTURE cherche : la clé courante, puis chaque
 * ancienne clé d'`APP_PREVIOUS_KEYS`. Le patron de {@see RadarPhone::hmacs()} (ADR-0082), sans clé dédiée.
 */
final class AppKeyHmac
{
    public static function of(string $data): string
    {
        return hash_hmac('sha256', $data, (string) config('app.key'));
    }

    /**
     * La clé courante d'abord, sans doublon.
     *
     * @return list<string>
     */
    public static function all(string $data): array
    {
        $keys = array_filter(
            [(string) config('app.key'), ...(array) config('app.previous_keys', [])],
            fn (mixed $key): bool => is_string($key) && $key !== '',
        );
        $hashes = [self::of($data)];
        foreach ($keys as $key) {
            foreach (self::spellings($key) as $spelling) {
                $hashes[] = hash_hmac('sha256', $data, $spelling);
            }
        }

        return array_values(array_unique($hashes));
    }

    /**
     * Vérification adverse M3 — Laravel lit une clé `base64:` par ses OCTETS : recopiée sans son `=` final, elle
     * déchiffre encore. Un HMAC, lui, est calculé sur la CHAÎNE : sans cette tolérance, plus aucune empreinte ancienne
     * n'était reconnue, sans bruit. La lecture essaie donc la clé telle qu'écrite ET sa forme base64 canonique.
     * L'écriture (`of()`) garde la chaîne telle qu'écrite : les empreintes déjà posées sous elle ne changent pas.
     *
     * @return list<string>
     */
    private static function spellings(string $key): array
    {
        $bytes = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : false;

        return $bytes === false ? [$key] : array_values(array_unique([$key, 'base64:'.base64_encode($bytes)]));
    }
}
