<?php

use App\Http\Controllers\Public\PublicAgencyController;
use App\Http\Controllers\Public\PublicAgentController;
use App\Http\Controllers\Public\PublicPropertyController;
use App\Http\Controllers\Public\PublicPropertyTypeController;
use Illuminate\Support\Facades\Route;

Route::prefix('public')->name('public.')->middleware('throttle:public-read')->group(function () {
    Route::get('property-types', [PublicPropertyTypeController::class, 'index'])
        ->name('property-types.index');

    Route::get('properties', [PublicPropertyController::class, 'index'])
        ->name('properties.index');

    // TCK-341 — `etag` SEUL, délibérément : ni `public`, ni `max_age`.
    //
    // Ce que ça achète, mesuré : `search` est appelée depuis le NAVIGATEUR
    // (`takussan-web/src/hooks/useSearch.ts:218`, `useProperties.ts:66`), donc
    // `Cache-Control: no-cache` + `ETag` produit une revalidation réelle et un
    // 304 au rechargement. Ce que ça n'achète PAS, et le ticket l'affirmait :
    // un 304 N'ÉCONOMISE AUCUN CYCLE SERVEUR. `SetCacheHeaders::handle()`
    // appelle `$next($request)` D'ABORD : la recherche Meilisearch est jouée,
    // la ressource sérialisée, et c'est ce corps-là qui sert à calculer l'ETag
    // avant d'être jeté. Mesuré le 2026-08-21, 12 exécutions de chaque côté sur
    // `?per_page=20` (macOS, 8 cœurs, `load average` 6,26) : médiane 200 =
    // 67,2 ms, médiane 304 = 64,6 ms. L'écart de 2,6 ms est le temps d'écrire
    // 18 019 octets sur la boucle locale — c'est exactement ce que le 304
    // économise, et rien d'autre : des OCTETS (18 019 → 0), pas un calcul.
    // L'objectif du ticket — « ne pas la faire calculer deux fois » — décrit
    // donc un mécanisme qui n'existe pas ; il faudrait un cache applicatif
    // pour cela, et le ticket le range lui-même en hors périmètre.
    //
    // ⚠ Pourquoi PAS `public`, alors que `/api/search/suggest` le porte : le
    // corps de `search` varie avec l'APPELANT. `PropertySearchService` rend du
    // `PropertyResource`, et celui-ci émet `rejection_reason`, `submitted_at`,
    // `approved_at`, `rejected_at` dès que `$request->user() !== null` — ce qui
    // arrive sur cette route SANS `auth:sanctum`, parce que
    // `ResolveActiveProfile` propage délibérément un porteur Bearer au garde
    // par défaut sur tout `api/*` (TCK-179). Mesuré : mêmes paramètres, un
    // jeton Sanctum réel → 4 clés de plus. Un cache PARTAGÉ servirait donc la
    // variante authentifiée au visiteur suivant, et défairait en silence
    // exactement ce que TCK-335 venait de retirer. `cache.headers` ne sait pas
    // émettre de `Vary` ; sans `public`, il n'y a rien à faire varier.
    Route::get('properties/search', [PublicPropertyController::class, 'search'])
        ->middleware('cache.headers:etag')
        ->name('properties.search');

    // TCK-247 — the whole homepage in one call. Literal segment: it MUST stay
    // above `properties/{slug}` or it is swallowed as a slug.
    Route::get('properties/discovery', [PublicPropertyController::class, 'discovery'])
        ->name('properties.discovery');

    // TCK-431 — l'énumération du catalogue indexable pour `/sitemap.xml` du site public.
    // Segment littéral : elle DOIT rester au-dessus de `properties/{slug}`, sans quoi elle est
    // avalée comme un slug — c'est le piège que le commentaire de `discovery` signale déjà, et il
    // ne produit pas d'erreur, il produit un 404 sur une fiche nommée « sitemap ».
    //
    // Aucun `cache.headers` : le corps ne varie PAS avec l'appelant (ni `PropertyResource` ni
    // e-mail ici, seulement `slug` et `updated_at`), mais l'unique appelant est le SERVEUR Next,
    // dont le `fetch` est `no-store` par défaut sous Next 16 — il n'émettra jamais
    // d'`If-None-Match`. Un ETag ici ne servirait personne (même mesure que pour la fiche,
    // TCK-341).
    Route::get('properties/sitemap', [PublicPropertyController::class, 'sitemap'])
        ->name('properties.sitemap');

    // TCK-433 (passe 2) — le DOMAINE de la facette `city`. Jumeau de `property-types` : sans lui,
    // `?city=<n'importe quoi>` produisait une URL indexable et canonique d'elle-même, donc un
    // espace d'URL indexables non borné. Segment littéral : au-dessus de `properties/{slug}`.
    Route::get('properties/cities', [PublicPropertyController::class, 'cities'])
        ->name('properties.cities');

    Route::get('properties/compare', [PublicPropertyController::class, 'compare'])
        ->middleware('throttle:30,1')
        ->name('properties.compare');

    Route::get('properties/by-ids', [PublicPropertyController::class, 'byIds'])
        ->middleware('throttle:60,1')
        ->name('properties.by-ids');

    Route::get('properties/map', [PublicPropertyController::class, 'map'])
        ->middleware('throttle:60,1')
        ->name('properties.map');

    // TCK-341 — la fiche NE REÇOIT NI `public` NI `etag`, et c'est un refus
    // motivé, pas un oubli. Le ticket la listait pourtant dans son delta.
    // Trois mesures, chacune suffisante à elle seule :
    //
    //   1. Le corps varie avec l'appelant, comme `search` ci-dessus — et ici
    //      s'y ajoute l'e-mail d'un collaborateur, que
    //      `PropertyResource` ne masque que si `$request->user()` est null,
    //      sur une route qui eager-load `collaborators.user`. Un cache
    //      partagé le servirait au visiteur suivant.
    //   2. `show()` ÉCRIT : elle incrémente `views_count`, que la même
    //      ressource émet. Deux appels anonymes successifs depuis la même IP
    //      ne rendent donc pas le même corps (mesuré : 1 puis 2), et un ETag
    //      n'y serait stable qu'une fois les 3 crédits horaires du
    //      `RateLimiter` épuisés. Un ETag qui change trois fois avant de se
    //      fixer n'est pas une garantie de fraîcheur, c'est du bruit.
    //   3. Même stable, il ne servirait à personne : la fiche est cherchée par
    //      le SERVEUR Next (`takussan-web/src/lib/queries/public-property.ts:63`),
    //      et le `fetch` de Next 16 est `no-store` par défaut — il n'émet
    //      jamais d'`If-None-Match`. Contrairement à `search`, qui part du
    //      navigateur.
    Route::get('properties/{slug}', [PublicPropertyController::class, 'show'])
        ->name('properties.show');

    // Reveals the owner's phone number — tighter limit than the group default
    // to curb bulk phone-number harvesting across enumerable slugs.
    Route::get('properties/{slug}/contact', [PublicPropertyController::class, 'contact'])
        ->middleware('throttle:20,10')
        ->name('properties.contact');

    Route::get('properties/{slug}/similar', [PublicPropertyController::class, 'similar'])
        ->name('properties.similar');

    Route::get('properties/{slug}/reviews', [PublicPropertyController::class, 'reviews'])
        ->name('properties.reviews');

    // TCK-180 — gate the property review form. Anonymous = always false.
    Route::get('properties/{slug}/review-eligibility', [PublicPropertyController::class, 'reviewEligibility'])
        ->name('properties.review-eligibility');

    Route::post('properties/{slug}/report', [PublicPropertyController::class, 'report'])
        ->middleware('throttle:public-report')
        ->name('properties.report');

    Route::post('properties/{slug}/visit-request', [PublicPropertyController::class, 'visitRequest'])
        ->middleware('throttle:public-visit-request')
        ->name('properties.visit-request');

    Route::post('properties/{slug}/contact-lead', [PublicPropertyController::class, 'contactLead'])
        ->middleware('throttle:public-contact-lead')
        ->name('properties.contact-lead');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('properties/{slug}/booking-request', [PublicPropertyController::class, 'bookingRequest'])
            ->name('properties.booking-request');

        Route::post('properties/{slug}/contact-message', [PublicPropertyController::class, 'contactMessage'])
            ->name('properties.contact-message');

        // TCK-500 — jumelle EN LECTURE SEULE de `contact-message`. Le front la questionne au clic
        // sur « Envoyer un message » pour savoir s'il ouvre un fil existant (historique, champ
        // vide) ou un fil qui n'existe pas encore (brouillon pré-rempli). Segment littéral après
        // un `{slug}` : aucun risque d'être avalé, contrairement aux `properties/<mot>` du haut
        // de ce fichier.
        Route::get('properties/{slug}/conversation', [PublicPropertyController::class, 'conversation'])
            ->name('properties.conversation');
    });

    // TCK-436 — les deux INDEX de profils. Segments littéraux : ils DOIVENT rester au-dessus de
    // `agents/{slug}` et `agencies/{slug}`… ce qui est automatique ici, puisqu'ils n'ont AUCUN
    // segment après le nom de ressource. Le piège qui menace `properties/sitemap` et
    // `properties/discovery` — être avalé comme un slug — ne s'applique donc pas.
    //
    // Aucun `cache.headers`, pour la raison exacte de `properties/sitemap` : le corps ne varie pas
    // avec l'appelant (aucun champ de contact, aucune ressource sensible à `$request->user()`),
    // mais l'appelant est le SERVEUR Next, dont le `fetch` est `no-store` par défaut sous Next 16
    // — il n'émettra jamais d'`If-None-Match`. Un ETag ici ne servirait personne.
    Route::get('agencies', [PublicAgencyController::class, 'index'])
        ->name('agencies.index');

    Route::get('agents', [PublicAgentController::class, 'index'])
        ->name('agents.index');

    // TCK-177 — public agent / agency profile pages.
    Route::get('agents/{slug}', [PublicAgentController::class, 'show'])
        ->name('agents.show');

    // TCK-441 — contact ANONYME d'un agent. Meme regime que `properties/{slug}/contact-lead` :
    // pas de `auth:sanctum`, la barriere est le throttle. Il remplace le `mailto:` que la fiche
    // publiait a partir de l'adresse de CONNEXION de l'agent.
    Route::post('agents/{slug}/contact-lead', [PublicAgentController::class, 'contactLead'])
        ->middleware('throttle:public-contact-lead')
        ->name('agents.contact-lead');

    Route::get('agents/{slug}/properties', [PublicAgentController::class, 'properties'])
        ->name('agents.properties');

    Route::get('agencies/{slug}', [PublicAgencyController::class, 'show'])
        ->name('agencies.show');

    Route::get('agencies/{slug}/properties', [PublicAgencyController::class, 'properties'])
        ->name('agencies.properties');
});
