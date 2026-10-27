<?php

/*
|--------------------------------------------------------------------------
| Radar — ADR-0077
|--------------------------------------------------------------------------
| Squelette posé par TCK-2386 (les données) ; la lecture d'URL, les bornes et les captures s'y
| ajoutent avec leurs tâches. Aucune clé ne se lit dans l'environnement : ce lot n'ajoute aucune
| variable (`scripts/check-env-parity.mjs`).
*/

return [

    // ADR-0077 §9 — la clé de l'empreinte (HMAC) du numéro d'un annonceur qui a dit STOP. Null :
    // `RadarPhone` la dérive de `app.key`. Une clé dédiée se pose ici le jour où l'on veut pouvoir
    // faire tourner `app.key` sans perdre les refus.
    'phone_hmac_key' => null,

    // ADR-0077 §9 — la purge : le texte brut, les captures et le téléphone d'une annonce jamais
    // publiée s'effacent 90 jours après la collecte.
    'purge_after_days' => 90,

    // ADR-0077 §10 — la lecture d'une URL : polie (délai par domaine, `robots.txt`, User-Agent qui
    // se nomme) et protégée (SSRF, redirections suivies à la main, corps et délais bornés). Lue par
    // `App\Services\Radar\UrlFetcher` et `HtmlCleaner`.
    'fetch' => [
        // Délai minimal entre deux lectures d'un même domaine, en secondes.
        'min_delay_seconds' => 5,
        'timeout_seconds' => 10,
        'connect_timeout_seconds' => 5,
        // Redirections suivies au plus, chacune contrôlée comme l'URL de départ.
        'max_redirects' => 3,
        // Corps lu au plus (en-tête `Content-Length` et octets reçus) : 2 Mo.
        'max_bytes' => 2_000_000,
        // Texte nettoyé gardé au plus, en caractères.
        'max_text_chars' => 20_000,
        'user_agent' => 'TakussanRadar/1.0 (+https://takussan.com)',
        // Durée de vie du `robots.txt` d'un domaine en cache : un jour.
        'robots_cache_seconds' => 86_400,
    ],

];
