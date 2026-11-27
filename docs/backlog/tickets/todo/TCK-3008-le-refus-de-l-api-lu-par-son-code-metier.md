---
id: TCK-3008
title: "Le refus de l'API lu par son code métier : ApiError.codeMetier, une cascade de messages écrite une fois, les server actions rendent le code"
status: todo
phase: P2
family: front
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: []
blocks: [TCK-3009, TCK-3010]
spec_refs:
  features: []
  models: []
tags: [front, erreurs, i18n, radar, architecture]
---

## Objectif utilisateur

Quand l'API refuse un geste, l'écran affiche le bon message, formulé une seule fois pour tous les écrans qui rencontrent ce refus.

## Contrat de données

Enveloppe de l'API (`takussan-api/bootstrap/app.php:138-185`) : `{code, message, params?}` + `extra` ; la 422 de validation garde `{message, errors}`. Le BFF relaie le corps tel quel (`lib/relais-api.ts:149`) : le code survit. Les server actions (29 modules) rendent `{ok:false, message}` : le code s'y perd.

Relevé du 2026-11-27 (`dev` 4e3a929f7), `takussan-web/src/lib/api.ts` :

- `ApiError.code` (:451) ne rend que les codes du BFF ; `codeErreur` (:493) écarte le code métier dès qu'un `message` est présent ; `codeLaravel` (:410) est privé.
- ~11 extracteurs nommés (`GestesDuFil.tsx:48`, `RadarClaimReception.tsx:79`, `PlanifierUneVisite.tsx:694`, `CalendarSubscription.tsx:31`, `PhotosDeQuartiers.tsx:43`, `RadarIntakeSheet.tsx:53`, `useMessageEchecFiche.ts:12`, `useMessageRefusCible.ts:11`, `FeuilleDeRevision.tsx:72`, `SignaturesSurPlace.tsx:48`, `saisie-de-demande.ts:111`, `kyc-queue.tsx:82`, `copilote.ts:259`, `lien-d-action.ts:72`, `double-facteur.ts:19`) et ~30 lectures en ligne `(x.data as {code?}).code`.
- Cascades recopiées dans le Radar (`useMessageEchecFiche`, `useMessageRefusCible`, `useMessageEchecAnnonceur`, `RadarIntakeSheet`, `RadarCollecte`, `RevisionsDemande`) ; aplatissement 422 recopié 5 fois.

## Contraintes strictes (métier)

- `ApiError.codeMetier: string | undefined` (pas d'union générée) ; `ApiError.params` exposé.
- Par défaut l'écran affiche le message déjà localisé par l'API (ADR-0032) ; une table locale ne sert qu'à reformuler ou paramétrer.
- Le contrat de `messageErreurApi` / `codeErreur` tenu par `lib/__tests__/api-erreurs-bff.test.tsx`, `useApiForm.test.tsx`, `DeleteRoleDialog.test.tsx` ne change pas (« la prose l'emporte »).
- Défauts supprimés : `lien-d-action.ts:72` ne prend plus le `message` pour un code ; `copilote.ts:259` ne lit plus `data.error.code` (enveloppe que l'API n'émet pas).
- Les tests de parité des codes Radar (`codes-radar.tck-2387.test.ts`…) restent verts.

## Delta à produire

- [ ] Intention : `ApiError` expose le code métier, ses paramètres, et l'aplatissement des erreurs de validation (une méthode)
- [ ] Intention : le hook de message d'erreur accepte, en option, une table code → clé i18n et un résolveur de paramètres, et porte la cascade (table → validation → message de l'API → repli) une seule fois
- [ ] Les extracteurs locaux et les cascades du Radar disparaissent au profit de ces deux points ; les lectures en ligne passent à `err.codeMetier`
- [ ] Server actions : le résultat d'échec porte `code` et `params` en plus de `message`
- [ ] Tests : la cascade en unitaire (table, paramètres, 422, repli) ; les tests d'écran existants restent verts

## Critères d'acceptation

- [ ] AC1 — `grep -rn "as { code?: unknown }" src --include=*.ts --include=*.tsx | grep -v __tests__` est vide.
- [ ] AC2 — Les fonctions `codeDe`, `codeDuRefus`, `codeDeLErreur` (et équivalents de la liste) n'existent plus.
- [ ] AC3 — `Object.values(…).flat()` d'aplatissement 422 n'apparaît plus qu'une fois, dans `lib/api.ts`.
- [ ] AC4 — Une server action en échec rend `code` (test sur au moins une action).
- [ ] AC5 — `tsc --noEmit`, `npm run lint` et les tests touchés sont verts.

## Hors périmètre

- Les libellés eux-mêmes ; le préfixe `/api` (TCK-3009 n'y touche pas non plus).

## Notes d'implémentation
