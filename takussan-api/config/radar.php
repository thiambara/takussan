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

];
