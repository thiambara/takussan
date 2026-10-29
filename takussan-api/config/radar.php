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
        // Délai TOTAL d'une lecture, tous sauts et `robots.txt` compris : au-delà, `radar.fetch.timeout`.
        // Sous le `$timeout` du job (85 s), pour que la lecture finisse avant que le worker ne le tue.
        'total_timeout_seconds' => 45,
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

    // ADR-0077 §2 — la saisie par l'opérateur (`StoreRadarListingRequest`) : une seule des trois
    // entrées par envoi. Une liste d'URL, un texte collé, ou des captures d'écran.
    'intake' => [
        'max_urls' => 20,
        'max_url_length' => 2_048,
        'text_min_chars' => 20,
        'text_max_chars' => 20_000,
    ],

    // ADR-0077 §2, §9 — les captures : images seulement (type relu dans le contenu, pas dans le nom),
    // nombre et taille bornés. Réencodées à la saisie (`RadarListingIntake`) : l'EXIF — position GPS
    // comprise — ne survit pas ; l'empreinte SHA-256 de l'original reste en propriété du média.
    'captures' => [
        'max_files' => 10,
        'max_kilobytes' => 8_192,
        'mimes' => ['image/jpeg', 'image/png', 'image/webp'],
        // Bornes de PIXELS, lues dans l'en-tête avant tout décodage : un PNG uni de 20 000 × 20 000
        // pèse quelques centaines de Ko mais demanderait ~1,6 Go à GD. Une longue capture défilée
        // de téléphone (1080 × 15 000, 16 Mpx) passe. 24 Mpx ≈ 96 Mo en truecolor, ×2 quand le
        // décodeur réoriente un JPEG (balise EXIF Orientation) : sous le `memory_limit` de 256M
        // (`docker/php.ini`), où la libgd embarquée compte ses allocations.
        'max_side' => 20_000,
        'max_pixels' => 24_000_000,
    ],

    // TCK-2387 (ADR-0054) — les photos source d'une annonce-URL : lues à la volée pour en calculer
    // l'empreinte, jamais conservées. Octets et pixels bornés AVANT le décodage (bombe de
    // décompression), selon le même raisonnement mémoire que `captures`.
    'photos' => [
        // Photos tentées au plus par annonce, dans l'ordre de `photo_urls`.
        'max_per_listing' => 10,
        // Corps lu au plus, par photo : 5 Mo.
        'max_bytes' => 5_000_000,
        'mimes' => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        'max_side' => 12_000,
        'max_pixels' => 24_000_000,
        // Durée d'un passage du calcul : au-delà, il s'arrête et le reste se reprend au passage suivant.
        'pass_budget_seconds' => 30,
        // TCK-2389 — la réserve de photos d'une annonce après l'accord (lues ou déposées) : au plus 20.
        'reserve_max' => 20,
    ],

    // ADR-0077 §5 — les bornes de vraisemblance d'une extraction, lues par
    // `App\Services\Radar\ExtractionNormalizer`. Hors bornes : drapeau `out_of_bounds` et confiance
    // `low` ; la valeur reste, l'humain tranche. Montants en XOF, bornes incluses.
    // Loyers hebdomadaire et annuel : sans borne propre, ils se déduisent du loyer mensuel au
    // prorata (× 12/52 et × 12), arrondis à l'unité — une seule paire de chiffres à tenir.
    'bounds' => [
        'rent' => [
            'monthly' => ['min' => 15_000, 'max' => 20_000_000],
            'daily' => ['min' => 5_000, 'max' => 1_000_000],
        ],
        'sale' => ['min' => 1_000_000, 'max' => 10_000_000_000],
        'surface_m2' => ['min' => 5, 'max' => 100_000],
        'bedrooms' => ['min' => 0, 'max' => 30],
        'bathrooms' => ['min' => 0, 'max' => 20],
    ],

    // TCK-2388 (ADR-0077 §4, plan écran 4) — les relances (décision 4, porteur 2026-10-28). Un message envoyé sans issue
    // depuis `after_days` jours entre dans la file « à relancer » ; une relance est un nouveau message sur les
    // mêmes annonces ; après `max` relances sans réponse, la file propose « sans réponse » et une relance de
    // plus est refusée. Lu par `RadarFollowUps` et `RadarOutreachWorkflow`, et nulle part ailleurs.
    'follow_ups' => [
        'after_days' => 3,
        'max' => 2,
    ],

];
