---
id: TCK-536
title: "Les réponses de l'API ignorent la langue des actions serveur, la préférence des comptes à jeton, et sont à moitié traduites"
status: done
phase: P0
family: bug
estimate: S
wave: 65
created: 2026-09-17
updated: 2026-09-17
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#1-user
tags: [front, back, i18n, auth]
---

## Objectif utilisateur

Un utilisateur lit les messages de l'API (erreurs de validation, refus) dans la langue de
l'écran qu'il regarde, et à défaut dans la langue choisie pour son compte.

## Contrat de données

- `Accept-Language` sur tout appel `apiRequest`, y compris côté serveur (server actions, RSC,
  route handlers).
- `users.preferred_language` (`fr` · `en` · `wo`) — `docs/models-spec.md#1-user`.
- Aucun endpoint, aucune migration.

## Contraintes strictes (métier)

- Deux défauts relevés par la vérification adverse de TCK-535, **re-mesurés le 2026-09-17** :
  1. **Front** — `apiRequest` ne lit la langue que dans `document.cookie`. Côté serveur, sans
     `locale` explicite, aucun `Accept-Language` ne part. Relevé sur :8002 :
     `POST /api/auth/login {}` → « The email field is required. » sans en-tête (`APP_LOCALE=en`),
     « Le champ email est obligatoire. » avec `Accept-Language: fr`. Les 19 modules de
     `src/app/actions/` hors `property.ts` passent tous par `apiRequest` via `src/lib/*` et ne
     transmettent pas la langue.
  2. **API** — `SetLocaleMiddleware` est dans le groupe `api`, donc AVANT `auth:sanctum`. La garde
     par défaut y est encore `web` : `$request->user()` rend `null` pour un appel par jeton
     Bearer, et `preferred_language` n'est jamais lu. Mesuré par un test à vrai jeton
     (`createToken` + `withToken`), compte `wo`, `Accept-Language: de` :
     « The first name field is required. ». Les tests existants restaient verts parce que
     `Sanctum::actingAs()` fait `shouldUse('sanctum')` avant la requête.
  3. **API, dictionnaires** — `lang/fr/validation.php` et `lang/wo/validation.php` ne portaient
     que **12 clés sur les 117** de Laravel 13 (mesuré contre
     `vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php`), et **aucun**
     `attributes`. `fallback_locale=en` : une règle absente sort en anglais, un nom de champ en
     snake_case. Mesuré en `fr` : « The end date field must be a date after start date. »,
     « Le champ guests est obligatoire. ».
- **Ordre de résolution retenu** : `?lang=` → `Accept-Language` → `preferred_language` → défaut.
  Le code faisait passer `preferred_language` avant l'en-tête (TCK-017). Inversé parce que le
  front transmet en en-tête la langue qu'il **affiche** — segment d'URL, puis cookie
  `NEXT_LOCALE` (ADR-0026 §5) ; la préférence gagnant, un compte `fr` recevait ses erreurs en
  français sur `/en/properties/x`. `setLocaleAction` écrit déjà le cookie ET `preferred_language`,
  donc les deux concordent dans le cas courant.

## Delta à produire

- [x] `SetLocaleMiddleware` : utilisateur résolu par `$request->user() ?? $request->user('sanctum')`,
      ordre `lang` → en-tête → préférence.
- [x] `src/lib/api.ts` : `apiRequest` retombe, côté serveur, sur `getLocale()` de next-intl quand ni
      le cookie navigateur ni `locale` ne donnent de langue.
- [x] `lang/fr/validation.php`, `lang/wo/validation.php` : les 117 clés du framework, les clés du
      dépôt, `attributes` (réservations d'abord, puis les champs les plus fréquents des
      FormRequests — 58 noms) et `values` (`today` / `now` des règles `after:` relatives).
- [x] `app/actions/property.ts` : `requeteApi` local retiré (strictement redondant : côté serveur,
      le cookie navigateur est absent, et `locale ?? getLocale()` est le repli central).
      `property.langue.test.ts` observe désormais l'en-tête ENVOYÉ, `apiRequest` réel.
- [x] Tests : `tests/Feature/Api/LocaleBearerTokenTest.php` (3 cas, vrai jeton),
      `tests/Unit/Lang/ValidationTranslationParityTest.php` (garde de parité des clés et des
      placeholders), `tests/Feature/Validation/ValidationMessagesLocaleTest.php` (prose 422 fr/wo),
      `src/lib/__tests__/api.langue-serveur.test.ts` (5 cas, environnement `node`).
- [x] Tests adaptés au nouvel ordre : `LocaleMiddlewareTest` (dont un test vert par coïncidence),
      `AgencyIndividualCustomRolesTest::test_le_refus_porte_un_libelle_dans_les_trois_langues`.

## Critères d'acceptation

- [x] AC1 — Un appel par jeton Bearer sans langue d'en-tête supportée est servi dans la
      `preferred_language` du compte. *Ablation (garde `sanctum` retirée) : rouge.*
- [x] AC2 — Un `Accept-Language` supporté l'emporte sur `preferred_language`, et `?lang=` sur les
      deux. *Ablation (préférence remise avant l'en-tête) : 3 tests rouges.*
- [x] AC3 — `apiRequest` exécuté côté serveur sans `locale` envoie la langue next-intl de la
      requête ; un module de `src/lib` appelé par une action en hérite sans rien passer.
      *Ablation (repli retiré) : 2 tests rouges.*
- [x] AC4 — Une `locale` explicite l'emporte ; hors requête (`getLocale` lève) ou langue non
      supportée, la requête part sans en-tête.

- [x] AC5 — Un 422 de la demande de réservation publique est entièrement traduit : en `fr`,
      « Le champ date de fin est obligatoire. », « Le champ nombre de voyageurs doit être un
      nombre entier. », « … postérieure à aujourd’hui. » ; en `wo`, idem. *Ablations : ancien
      `fr` → 4 rouges ; sans `attributes` → 3 ; sans `values` → 2.*
- [x] AC6 — `fr` et `wo` portent toutes les clés de validation du framework et du dépôt, avec les
      mêmes placeholders, et les mêmes clés entre elles (`ValidationTranslationParityTest`).
- [x] AC7 — Sans le repli central, `property.langue.test.ts` rougit (2 rouges) : il ne dépend plus
      du helper local retiré.

## Hors périmètre

- `lang/en/validation.php` n'est pas complété : le framework fournit les règles anglaises, et un
  nom de champ anglais se lit correctement en snake_case espacé.
- Les champs rares des FormRequests restent sans libellé (repli « period end ») ; la garde ne les
  exige pas, `attributes` étant un bloc libre.
- `apiFetch` ne reçoit pas le repli : ses appelants passent la langue en argument parce qu'elle
  entre dans leur clé de mémoïsation.
- **Le fuseau horaire utilisateur — DÉCISION À PRENDRE, rien n'a été changé.**
  `SetLocaleMiddleware` fait aussi `date_default_timezone_set($request->user()->timezone)`. Par le
  même défaut que la langue, ce code **n'a jamais tourné en production** pour un appel par jeton :
  `$request->user()` y est `null`. Il est laissé lu sur `$request->user()`, délibérément.
  - L'activer changerait le fuseau PHP de la requête : tout `now()` / `Carbon::now()` écrit en
    base (colonnes `timestamp` sans fuseau) sortirait de `app.timezone = UTC`. Inoffensif pour
    `Africa/Dakar` (UTC+0, défaut de la colonne), faux pour tout autre fuseau.
  - Options : (a) supprimer la ligne — le fuseau devient une affaire de présentation, côté front ;
    (b) l'activer après audit des écritures de dates ; (c) la garder morte, comme aujourd'hui, ce
    qui laisse un code qui ment. **Recommandation : (a)**, par ADR si l'on veut l'écrire.

## Notes d'implémentation

- Le repli serveur réutilise la garde de `resolveVisitorIp` (import dynamique + `try/catch`) : la
  variante `react-client` de `next-intl/server` lève, et le module `api.ts` est aussi chargé côté
  navigateur. Aucun `'use cache'` / `unstable_cache` dans le dépôt au 2026-09-17 ; s'il en apparaît
  un autour d'`apiRequest`, `getLocale()` y lira des en-têtes.
- La garde `sanctum` met l'utilisateur en mémoire : `auth:sanctum` ne résout pas le jeton une
  seconde fois.
- `validation.php` est un dictionnaire GLOBAL pour `bin/impacted-tests.php` : il impose la suite
  entière, à jouer par la session déléguante. Les 18 fichiers de test sensibles à la langue +
  `tests/Feature/Validation` + `BookingTest` ont été joués : 233 verts.
- Le wolof ajouté n'a pas été relu par un locuteur (dit dans l'en-tête du fichier) ; les noms de
  champs reprennent ceux de `takussan-web/src/messages/wo.json` quand ils existent.
- Non vérifié au navigateur : la mesure est au niveau HTTP (API) et unitaire (front).
