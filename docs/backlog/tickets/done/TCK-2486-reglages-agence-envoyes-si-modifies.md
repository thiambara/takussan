---
id: TCK-2486
title: Fiche de l'agence — un réglage de `settings` ne part que s'il a changé, pour ne plus écraser celui d'un autre admin
status: done
phase: P3
family: bug
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2483]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, agence, settings, concurrence]
---

## Objectif utilisateur

Deux admins d'une même agence qui enregistrent la fiche de l'agence l'un après l'autre ne
s'écrasent plus un réglage que l'un n'a pas touché.

## Contrat de données

`PATCH /api/agencies/{id}` (existant, inchangé) : l'API fusionne `settings` clé par clé sur la ligne
relue sous verrou (TCK-593, TCK-2362) — une clé absente est conservée, une clé à `null` revient au
défaut. Les clés de `settings` que la fiche gère : `require_team_two_factor`,
`late_fee_online_collection`, `hidden_modules` (types et défauts : `spec_refs.models`).

Relevé par TCK-2483 (suite (b), au navigateur) : la fiche envoie `require_team_two_factor` et
`late_fee_online_collection` à CHAQUE enregistrement, avec la valeur lue au chargement. L'admin A
coche « 2FA obligatoire » ; l'admin B, qui avait ouvert la fiche avant, enregistre son nom : la case
revient à `false`. `hidden_modules` suit déjà le bon patron (revue de TCK-2483, M5).

## Direction UX / Artistique

Aucun changement visible : mêmes cases, mêmes libellés.

## Contraintes strictes (métier)

- **Décision de la session** : le patron de M5 de TCK-2483 (`initialHiddenModules`) s'étend à TOUTES
  les clés de `settings` que le formulaire gère — une clé ne part que si sa valeur diffère de la
  valeur chargée.
- La valeur chargée se lit comme l'écran la lit (clé absente = défaut de l'API : `false`, `[]`) :
  une seule lecture, pour que « inchangé » ait le même sens à l'affichage et à l'envoi.
- Décocher une case cochée au chargement DOIT partir (`false`) : c'est une modification (TCK-589).
- Rien ne part de `settings` qu'on n'a pas modifié ; aucune autre clé (`watermark_*`, …) n'y entre
  (TCK-593, TCK-962).

## Delta à produire

- [x] `normaliseAgencyForm` : `require_team_two_factor` et `late_fee_online_collection` comparés à
      la valeur chargée, comme `hidden_modules`.
- [x] Le formulaire passe ce qu'il a chargé, lu par la même fonction que ses valeurs par défaut.
- [x] Tests : ceux qui figent les clés envoyées s'adaptent ; un test par clé « inchangée → absente »,
      « modifiée → présente », `false` compris.

## Critères d'acceptation

- [x] AC1 — Fiche chargée puis enregistrée sans toucher aux cases : `settings` ne porte ni
      `require_team_two_factor`, ni `late_fee_online_collection`, ni `hidden_modules`.
- [x] AC2 — Cocher une case décochée au chargement envoie `true` ; décocher une case cochée au
      chargement envoie `false` — pour chacune des deux clés booléennes.
- [x] AC3 — Un `settings` lu sans la clé vaut `false` à l'affichage ET à l'envoi : enregistrer sans
      toucher n'envoie rien ; cocher envoie `true`.
- [x] AC4 — Chaque test neuf est prouvé par ablation (retour à l'émission systématique → rouge).
- [ ] AC5 — Suites front et API vertes par la CI.

## Hors périmètre

- Un verrou optimiste (version de la ligne, 409) sur la fiche : deux admins qui modifient la MÊME
  clé restent en « dernier qui écrit gagne ».
- Les champs de premier niveau (nom, e-mail, taux…) : ils partent toujours ; leur écrasement est le
  même « dernier qui écrit gagne », hors de ce ticket.
- La section « Sécurité de l'équipe » d'une agence `individual` : TCK-2487.

## Notes d'implémentation

Commit `c9669caa7` (2026-11-06).

- **Une seule lecture** : `reglagesDeLaFiche(settings)` (`src/lib/schemas/agency.ts`) rend les trois clés gérées
  (clé absente ou hors forme = défaut de l'API). Elle sert aux valeurs par défaut du formulaire ET à la référence
  « inchangé » de l'envoi : une case affichée décochée ne peut pas être jugée modifiée.
- **Écart au patron M5** : le contexte ne porte plus `initialHiddenModules` mais `initialSettings` (le `settings`
  brut chargé, `agency.settings`) ; `hidden_modules` y est relu par la même fonction. Sans contexte, rien n'est
  chargé : les défauts. Un appelant qui oublierait `initialSettings` sur une agence au réglage `true` enverrait
  `false` en enregistrant : l'ablation A4 le fait rougir (5 tests).
- **Rien de modifié : `settings` ne part pas du tout** (plutôt que `{}`), ce que l'API accepte de toute façon
  (`sometimes`).
- Tests adaptés : `admin-schemas.test.ts` (TCK-962, TCK-589 réécrits ; bloc TCK-2486), `AgencyConfigForm.test.tsx`,
  `.penalites` (+ cas inchangé / désactiver), `.modules` (`settings` absent), `.double-facteur` (+ 2 cas : le
  scénario des deux admins du relevé de TCK-2483, et décocher → `false`).
- **Ablations** (`abl-2486.sh`, 2026-11-06, toutes restaurées, témoin 84/84 vert) : A1 les deux booléens toujours
  émis → 9 rouges ; A2 seul `require_team_two_factor` → 7 ; A3 seul `late_fee_online_collection` → 7 ; A4 le
  formulaire ne passe pas `initialSettings` → 5 ; A5 `settings: {}` envoyé vide → 4.
- Gardes avant commit : `tsc --noEmit`, `npm run lint`, tous les `npm run check:*`, `chemin-api.garde` (29/29),
  `scripts/check-*.mjs` — tous verts.

## Revue adverse

Revue des suites (2026-11-06) : 0 bloquant, deux mineurs sur ce ticket. Corrigés au commit `f3f80cfab`.

- **M1 — la référence « inchangé » était périmée jusqu'à l'arrivée de `router.refresh()`.** Elle était la
  prop `agency.settings`, que seul le refresh (non attendu) renouvelle : cocher, enregistrer, décocher,
  enregistrer coup sur coup → le second envoi ne portait pas `false`, la base gardait `true`, l'écran disait
  « Modifications enregistrées. » sur une case décochée (même forme, préexistante, pour `hidden_modules`).
  Correctif : `AgencyConfigForm` tient la référence en état, recalée dans `onSuccess` sur `saved.settings`
  (la réponse du `PATCH`), **et recale l'écran** sur la même réponse (les trois réglages, `shouldDirty: false`,
  patron de la modération, TCK-597). Recaler la seule référence aurait rouvert le défaut du ticket : un
  réglage posé par un autre admin entre le chargement et l'enregistrement, absent de l'écran périmé, serait
  reparti comme une modification. Limite : une case retouchée PENDANT l'envoi est ramenée à la réponse.
- **M2 — un booléen non JSON vrai pour l'API s'affichait faux, et n'était plus jamais réécrit.** Mesuré le
  2026-11-06 : les deux clés n'ont **pas** la même lecture côté API.
  - `late_fee_online_collection` : `Agency::collectsLateFeesOnline()` → `AgencySettings::read` →
    `filter_var(FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)` (php 8.4 : `1`, `'1'`, `'true'`, `'TRUE'`,
    `' yes '`, `'on'` → vrai ; `0`, `'0'`, `'off'`, `'no'`, `'false'`, `''` → faux ; `2`, `-1`, `'2'`, `'oui'`
    → défaut). La fiche lit désormais de même (`booleenCommeLApi`, `src/lib/schemas/agency.ts`).
  - `require_team_two_factor` : son seul lecteur à effet est `TwoFactorRequirement::requiredAtAgency()`,
    `where('settings->require_team_two_factor', true)` — SQL relevé (`toSql()`, pgsql) :
    `("settings"->'require_team_two_factor')::jsonb = 'true'::jsonb`, STRICT. `AgencySettings::read` n'est
    appelé pour cette clé par aucun code de `app/` (un test seulement). **Écart à l'arbitrage de la session**
    (« la même lecture que `AgencySettings::read` ») : la fiche garde ici le strict `=== true`, sinon un `1`
    stocké s'afficherait « exigée » pendant que `RequireTwoFactor` laisse passer le personnel.
  - Suite proposée (API) : une seule lecture côté API — `TwoFactorRequirement` par `AgencySettings::read`, ou
    les `settings` validés castés au type du catalogue dans `AgencyController::update` ; la fiche passerait
    alors la 2FA sur `booleenCommeLApi`.
- **Tests** : `.double-facteur` (+2 : deux enregistrements avant le refresh ; un réglage posé ailleurs
  s'affiche et ne repart pas), `.modules` (+1, même chose pour la liste), `.penalites` (+10 : `1`, `'1'`,
  `'true'`, `'on'`, `'yes'` activé et inchangé non envoyé ; `0`, `'0'`, `'off'`, `'no'`, `'false'` désactivé),
  `admin-schemas` (+28 : table de lecture des deux clés). La sonde de la revue
  (`revue-suites/fiche.revue.test.tsx`) passe : 2/2.
- **Ablations** (`abl-2486-corr.sh`, 2026-11-06, toutes restaurées, md5 identiques, témoin 99/99) : A1
  référence = prop → 2 rouges ; A2 référence non recalée → 2 ; A3 écran non recalé → 2 ; A3b `hidden_modules`
  seul non recalé → 1 ; A4 `late_fee` en `=== true` → 11 ; A5 la 2FA par `filter_var` → 4 ; A6 sans
  `trim`/casse → 2 ; A7 illisible → `true` au lieu du défaut → 5.
- Gardes avant commit : `tsc --noEmit`, `npm run lint`, tous les `npm run check:*`, `chemin-api.garde` (29/29),
  `scripts/check-*.mjs` — verts.
