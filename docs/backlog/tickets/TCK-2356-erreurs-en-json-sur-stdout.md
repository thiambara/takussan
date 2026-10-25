---
id: TCK-2356
title: "Les erreurs de l'API et du front partent en une ligne JSON sur stdout, sans donnée de la requête"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features: []
  adr:
    - "docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md"
    - "docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [api, web, logging, observability, infra, pistes]
---

## Contexte

Réf : **P14.07** du fichier de pistes, `validé` par le porteur le 2026-10-25. Il n'y avait aucun
rapporteur d'erreurs. Côté front, ni `instrumentation.ts` ni `global-error.tsx` : les frontières
d'erreur faisaient un `console.error` dans le navigateur, et le `digest` montré à l'utilisateur ne
renvoyait à rien de consultable. Côté API, une exception partait sur `LOG_CHANNEL`, en texte, avec
son message.

## Décision du porteur

- **P14.07** :
  > validé — validation du porteur (2026-10-25) : `instrumentation.ts` (`onRequestError`) et `global-error.tsx` journalisent les erreurs en JSON sur stdout, côté front comme côté API ; reste : l'ADR du rapporteur d'erreurs (GlitchTip auto-hébergé ou Sentry), avant la phase F

## Delta à produire

- [x] API : canal `exceptions` (`config/logging.php`) — `StreamHandler` sur `php://stdout`,
      `JsonFormatter`, niveau `error`.
- [x] API : rapporteur de `bootstrap/app.php`, enregistré avant celui des `QueryException` (qui
      s'arrête), sans `stop()` : la forme `SafeExceptionContext`, la méthode, le gabarit de la
      route et l'utilisateur.
- [x] API : `phpunit.xml` détourne le canal (`LOG_EXCEPTIONS_STREAM=php://memory`).
- [x] Front : `src/instrumentation.ts` (`onRequestError`) et `src/lib/journal-erreur.ts`.
- [x] Front : `src/app/global-error.tsx` et son écran `EcranErreurGlobale`.
- [x] `deploy/takussan/smoke-api.sh image` : `verifier_journal_des_exceptions`.
- [x] `docs/infra/hebergement.md` : la ligne « Journal des erreurs ».

## Critères d'acceptation

- [x] AC1 — Une exception non rattrapée d'une route de l'API part en UNE ligne JSON sur le canal
      `exceptions` : classe, `fichier:ligne`, pile, `POST`, `api/…/{jeton}`, l'utilisateur. Ni le
      message, ni le corps (`password`), ni `Authorization`, ni le cookie, ni l'URL réelle.
- [x] AC2 — Une `QueryException` y part aussi, malgré son rapporteur qui s'arrête, avec son
      SQLSTATE et sans ses valeurs liées. Un 404 du framework n'y part pas.
- [x] AC3 — Dans l'image, sous `php_server`, la ligne est sur la sortie STANDARD du conteneur
      (`docker logs 2>/dev/null`), et pas sur stderr.
- [x] AC4 — `onRequestError` écrit une ligne JSON sur stdout (`console.log`) : classe, `digest`,
      méthode, gabarit de la route, type de rendu. Ni le chemin réel, ni les en-têtes, ni le
      message, ni la première ligne de la pile.
- [x] AC5 — `global-error.tsx` rend le texte de `errors.boundary` dans la langue de l'URL (à défaut
      le cookie, puis le français), la référence et le bouton ; il journalise une ligne JSON avec
      le `digest` et sans le message.

## Mesures (2026-10-25)

- **API, image locale** : la sonde `report(new RuntimeException(...))` sous `php_server` donne une
  ligne `{"message":"exception","context":{"exception":"RuntimeException",...},"level_name":"ERROR",...}`
  sur stdout, zéro sur stderr (où le serveur web écrit ses propres lignes) ; aucune sur l'image
  précédente.
- **Front, image locale** (`docker build` de `takussan-web`, API injoignable) : `GET /app/overview`
  → `500`, et la ligne `{"message":"request_error","context":{"exception":"TypeError","digest":"3227098399",
  "method":"GET","route":"/app/overview","route_type":"render",...}}` sur stdout. Requête envoyée avec
  `Authorization` et `Cookie` témoins : aucun dans le journal.

## Hypothèses

- **La forme** est l'enveloppe du `JsonFormatter` de Monolog des deux côtés (`message`, `context`,
  `level`, `level_name`, `channel`, `datetime`, `extra`) : un collecteur n'aura qu'un format à lire.
- **Aucun message**, côté front non plus : c'est la règle d'ADR-0044 § 2 pour l'API, appliquée au
  front. Le `digest` relie la ligne à l'écran. **Le gabarit de la route, jamais le chemin** :
  `/pay/<jeton>` et `/invitations/<jeton>` portent un droit.
- **`user_id`** entre dans la ligne de l'API, comme dans celle des `QueryException` (TCK-601) ; le
  contexte partagé de TCK-774 (`request_id`, agence, profil) s'y ajoute de lui-même.
- **Le rapport par défaut continue** (pas de `stop()`) : retirer l'écriture sur `LOG_CHANNEL`
  aurait retiré quelque chose à un lecteur existant.
- **`global-error.tsx` journalise dans la console du NAVIGATEUR** : un composant client n'a pas de
  sortie standard. La ligne serveur de la même erreur est celle d'`onRequestError`.
- **Son texte vient du dictionnaire**, chargé par `import()` dynamique, un morceau par langue,
  téléchargé seulement quand le layout racine tombe. Aucun provider ne l'entoure, et une copie en
  dur contredirait le principe n° 5.

## Hors périmètre

- **L'ADR du rapporteur d'erreurs** (GlitchTip auto-hébergé ou Sentry), avant la phase F : reste de
  P14.07.
- `LOG_CHANNEL` et `LOG_LEVEL` dans `docs/infra/prod-drivers.json` : P14.08, faite par la session.
- Le rapport par défaut de Laravel sur `LOG_CHANNEL` écrit toujours le message d'une exception hors
  SQL ; et Next écrit lui-même l'erreur, message compris, sur stderr. Les deux sont antérieurs, et
  la décision ne les touche pas.
- `onRequestError` est appelé plusieurs fois pour une même erreur de rendu RSC (trois lignes, même
  `digest`, mesuré) : c'est Next qui l'appelle ainsi.

## Notes d'implémentation

- Ablations de l'API (`ExceptionJsonStdoutTest`) : rapporteur retiré → 2 rouges ; URL réelle au
  lieu du gabarit → 1 rouge ; en-têtes et corps ajoutés → 1 rouge ; rapporteur déplacé après celui
  des `QueryException` → 1 rouge (la `QueryException` n'y arrive plus).
- Ablations du front : pile gardée avec sa première ligne → 1 rouge ; chemin réel → 1 rouge ;
  en-têtes → 1 rouge ; message ajouté au journal de `global-error` → 1 rouge ; langue de l'URL
  ignorée → 1 rouge.
- Ablation du smoke : sur l'image précédente, `verifier_journal_des_exceptions` rougit (aucune ligne).
- La sonde du smoke lie une requête au conteneur (`$app->instance('request', …)`) : sans elle, le
  noyau HTTP amorcé hors requête meurt sur `Class "request" does not exist`, avant tout rapport.
- Le rapporteur est dans un `try` : un journal injoignable ne doit pas changer la réponse décrite.
