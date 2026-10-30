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
        $previous = array_filter((array) config('app.previous_keys', []), fn (mixed $key): bool => is_string($key) && $key !== '');

        return array_values(array_unique([
            self::of($data),
            ...array_map(fn (string $key): string => hash_hmac('sha256', $data, $key), $previous),
        ]));
    }
}
