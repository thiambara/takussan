<?php

namespace App\Support;

/**
 * TCK-2430 (ADR-0084) — le point unique des empreintes HMAC-SHA256 hors du Radar, et les empreintes sous lesquelles
 * une même donnée a pu être écrite.
 *
 * TCK-614 (ADR-0084, amendement du 2026-11-16) — `of()` écrit sous `APP_HMAC_KEY` (`config('app.hmac_key')`), une
 * clé DISTINCTE d'`APP_KEY` : une rotation d'`APP_KEY` ne touche plus aux empreintes. Le nom de la classe est
 * historique. Sans clé dédiée (vide ou absente), repli explicite sur `APP_KEY`, à l'identique d'avant ; hors
 * `local`/`testing`, `security:rehash-fingerprints` refuse alors le déploiement.
 *
 * `all()` est ce qu'une LECTURE cherche : la clé dédiée, puis les clés HÉRITÉES — `APP_KEY` et chaque clé
 * d'`APP_PREVIOUS_KEYS` — sous lesquelles tout ce qui a été écrit avant la pose de la clé dédiée l'a été. Certaines de
 * ces empreintes ne se recalculent jamais (octroi de bienvenue d'un compte anonymisé) : la double lecture les garde,
 * `security:rehash-fingerprints` réécrit le reste.
 */
final class AppKeyHmac
{
    public static function of(string $data): string
    {
        return hash_hmac('sha256', $data, self::writeKey());
    }

    /**
     * La clé d'écriture d'abord, sans doublon.
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

    /** `APP_HMAC_KEY` est posée : les empreintes ne dépendent plus d'`APP_KEY`. */
    public static function hasDedicatedKey(): bool
    {
        $key = config('app.hmac_key');

        return is_string($key) && $key !== '';
    }

    /** La clé dédiée telle qu'écrite (elle n'a jamais servi à Laravel : pas de forme base64 à tolérer), sinon `APP_KEY`. */
    private static function writeKey(): string
    {
        return self::hasDedicatedKey() ? (string) config('app.hmac_key') : (string) config('app.key');
    }

    /**
     * Vérification adverse M3 — Laravel lit une clé `base64:` par ses OCTETS : recopiée sans son `=` final, elle
     * déchiffre encore. Un HMAC, lui, est calculé sur la CHAÎNE : sans cette tolérance, plus aucune empreinte ancienne
     * n'était reconnue, sans bruit. La lecture essaie donc la clé héritée telle qu'écrite ET sa forme base64
     * canonique. L'écriture garde la chaîne telle qu'écrite.
     *
     * @return list<string>
     */
    private static function spellings(string $key): array
    {
        $bytes = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : false;

        return $bytes === false ? [$key] : array_values(array_unique([$key, 'base64:'.base64_encode($bytes)]));
    }
}
