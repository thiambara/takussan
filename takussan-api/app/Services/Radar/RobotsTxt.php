<?php

namespace App\Services\Radar;

/**
 * TCK-2386 (ADR-0077 §10) — l'interprétation d'un `robots.txt`, selon la RFC 9309.
 *
 * - Les groupes dont une ligne `User-agent` nomme le jeton produit du Radar (`TakussanRadar`, casse
 *   ignorée) s'appliquent ; à défaut, ceux de `*`. Plusieurs groupes du même robot se fusionnent.
 * - Parmi les règles `Allow` / `Disallow` du groupe retenu, celle dont le motif est le plus long
 *   décide ; à égalité, `Allow` l'emporte (la moins restrictive, RFC 9309 §2.2.2). Un `Disallow`
 *   vide ne compte pas. Sans règle qui s'applique, tout est permis.
 * - `*` vaut n'importe quelle suite de caractères, `$` en fin de motif ancre la fin de l'URL.
 * - `/robots.txt` est toujours permis.
 *
 * La lecture du fichier (absent → tout permis, 5xx ou injoignable → tout refusé) est le travail
 * d'`UrlFetcher` ; cette classe ne fait qu'interpréter un texte.
 */
final class RobotsTxt
{
    /** @param string $path le chemin ET la requête de l'URL (`/recherche?ville=dakar`) */
    public static function allows(string $robots, string $path, string $userAgent): bool
    {
        if ($path === '' || $path[0] !== '/') {
            $path = '/'.$path;
        }

        if ($path === '/robots.txt') {
            return true;
        }

        $groups = self::groups($robots);
        $token = self::productToken($userAgent);

        $rules = [];
        foreach ($groups as [$agents, $groupRules]) {
            if (in_array($token, $agents, true)) {
                array_push($rules, ...$groupRules);
            }
        }

        if ($rules === []) {
            foreach ($groups as [$agents, $groupRules]) {
                if (in_array('*', $agents, true)) {
                    array_push($rules, ...$groupRules);
                }
            }
        }

        $best = null;
        foreach ($rules as [$allow, $pattern]) {
            if (! self::matches($pattern, $path)) {
                continue;
            }

            $length = strlen($pattern);
            if ($best === null || $length > $best[1] || ($length === $best[1] && $allow)) {
                $best = [$allow, $length];
            }
        }

        return $best === null || $best[0];
    }

    /**
     * Le jeton produit d'un User-Agent : `TakussanRadar/1.0 (+https://…)` → `takussanradar`.
     */
    private static function productToken(string $userAgent): string
    {
        $token = preg_split('/[\/\s]/', trim($userAgent), 2)[0] ?? '';

        return strtolower($token);
    }

    /**
     * Les groupes du fichier : des lignes `User-agent` consécutives ouvrent un groupe, les règles qui
     * suivent lui appartiennent. Une règle avant tout `User-agent` est ignorée.
     *
     * @return list<array{list<string>, list<array{bool, string}>}>
     */
    private static function groups(string $robots): array
    {
        $robots = preg_replace('/^\xEF\xBB\xBF/', '', $robots) ?? $robots;

        $groups = [];
        $agents = [];
        $rules = [];
        $lastWasAgent = false;

        foreach (preg_split('/\r\n|\r|\n/', $robots) ?: [] as $line) {
            $line = trim(explode('#', $line, 2)[0]);
            if ($line === '' || ! str_contains($line, ':')) {
                continue;
            }

            [$field, $value] = array_map('trim', explode(':', $line, 2));
            $field = strtolower($field);

            if ($field === 'user-agent') {
                if (! $lastWasAgent && $agents !== []) {
                    $groups[] = [$agents, $rules];
                    $agents = [];
                    $rules = [];
                }
                $agents[] = strtolower($value);
                $lastWasAgent = true;

                continue;
            }

            $lastWasAgent = false;

            if (($field === 'allow' || $field === 'disallow') && $agents !== [] && $value !== '') {
                $rules[] = [$field === 'allow', $value];
            }
        }

        if ($agents !== []) {
            $groups[] = [$agents, $rules];
        }

        return $groups;
    }

    private static function matches(string $pattern, string $path): bool
    {
        $anchored = str_ends_with($pattern, '$');
        if ($anchored) {
            $pattern = substr($pattern, 0, -1);
        }

        $regex = implode('.*', array_map(
            fn (string $part) => preg_quote($part, '/'),
            explode('*', $pattern),
        ));

        return preg_match('/^'.$regex.($anchored ? '$' : '').'/s', $path) === 1;
    }
}
