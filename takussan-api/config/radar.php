<?php

/*
|--------------------------------------------------------------------------
| Radar — ADR-0077
|--------------------------------------------------------------------------
| Squelette posé par TCK-2386 (les données) ; la lecture d'URL, les bornes et les captures s'y
| ajoutent avec leurs tâches. Seules les clés de l'empreinte se lisent dans l'environnement
| (TCK-2414), déclarées dans `.env.example` et `.env.docker` (`scripts/check-env-parity.mjs`).
*/

return [

    // ADR-0077 §9, TCK-2414 — la clé de l'empreinte (HMAC) du numéro d'un annonceur qui a dit STOP.
    // Vide : `RadarPhone` la dérive de `app.key`, et une rotation d'`APP_KEY` sans `APP_PREVIOUS_KEYS`
    // rend les refus méconnaissables (le numéro en clair est purgé). À poser avant la production ;
    // la sonde de santé `radar_phone_key` la réclame hors `local`. Elle ne tourne qu'avec l'ancienne
    // valeur gardée dans `phone_hmac_previous_keys`, puis `php artisan radar:rehash-phones`.
    'phone_hmac_key' => env('RADAR_PHONE_HMAC_KEY'),

    // TCK-2414 — les clés précédentes, séparées par des virgules : une lecture y reconnaît encore un
    // refus. Une ancienne clé ne se retire JAMAIS tant qu'un refus purgé a été écrit sous elle.
    'phone_hmac_previous_keys' => array_values(array_filter(array_map('trim', explode(',', (string) env('RADAR_PHONE_HMAC_PREVIOUS_KEYS', ''))))),

    // ADR-0077 §9 — la purge : le texte brut, les captures et le téléphone d'une annonce jamais
    // publiée s'effacent 90 jours après la collecte.
    'purge_after_days' => 90,

    // TCK-2391 (ADR-0077 §9, `privacy.ts` § 6) — la preuve d'un accord confirmé est conservée tant que les annonces
    // qu'elle couvre sont en ligne, puis ce nombre d'années à compter de leur retrait (`radar_consents.offline_since`).
    // Lu par `App\Services\Radar\RadarPurger`, et nulle part ailleurs.
    'consent_retention_years' => 3,

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

    // TCK-2389 (revue finale, I2) — « Publier pour lui » copie chaque photo de la réserve et encode sa vignette DANS sa
    // transaction, sous le `max_execution_time` de 60 s (temps d'horloge, image ZTS) : un travail non borné meurt sans rien
    // défaire des fichiers déjà écrits. `max_photos` borne la SOMME des réserves des annonces demandées en une requête ;
    // au-delà, 422 `radar.publish.too_many_photos` avant la moindre écriture, et l'aperçu annonce le plafond.
    // 30 photos : ~1 annonce bien garnie ×1,5 — à resserrer ou relâcher sur une mesure de la préproduction.
    // ⚠ Invariant : `max_photos` >= `photos.reserve_max` (20), sinon une annonce à réserve pleine ne se publierait jamais seule ;
    // tenu par `RadarPublisherPhotosTest::test_le_plafond_de_publication_laisse_passer_une_reserve_pleine`.
    'publish' => [
        'max_photos' => 30,
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

    // TCK-2390 (ADR-0077 §3) — le lien de réclamation des messages (`App\Services\Radar\ClaimLinks`) : il sert
    // `link_ttl_days` jours depuis son émission (le `created_at` du message d'accord, l'heure de composition du second
    // message), puis rend 410. Un STOP ou une révocation le tue avant, quelle que soit sa date.
    'claim' => [
        'link_ttl_days' => 30,
    ],

    // TCK-2406 (décision du porteur à prendre, avec l'avocat) — la matière collectée d'une annonce PUBLIÉE (texte brut, adresse
    // de la source, extraction, réserve, captures), puis le numéro en clair de son annonceur, s'effacent avec la preuve de
    // l'accord : `consent_retention_years` après le retrait du dernier bien. Éteint : la lettre d'ADR-0077 §9 et de `privacy.ts`
    // § 6 ne purge que l'annonce jamais publiée. L'allumer change l'une et l'autre, dans la même PR (VERSION_DOCUMENTS avance).
    // Lu par `App\Services\Radar\RadarPurger`, et nulle part ailleurs.
    'purge_published_material' => false,

];
