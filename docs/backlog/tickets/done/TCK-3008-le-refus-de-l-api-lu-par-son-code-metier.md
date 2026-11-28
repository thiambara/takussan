---
id: TCK-3008
title: "Le refus de l'API lu par son code métier : ApiError.codeMetier, une cascade de messages écrite une fois, les server actions rendent le code"
status: done
phase: P2
family: front
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-28
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

- [x] Intention : `ApiError` expose le code métier, ses paramètres, et l'aplatissement des erreurs de validation (une méthode)
- [x] Intention : le hook de message d'erreur accepte, en option, une table code → clé i18n et un résolveur de paramètres, et porte la cascade (table → validation → message de l'API → repli) une seule fois
- [x] Les extracteurs locaux et les cascades du Radar disparaissent au profit de ces deux points ; les lectures en ligne passent à `err.codeMetier`
- [x] Server actions : le résultat d'échec porte `code` et `params` en plus de `message`
- [x] Tests : la cascade en unitaire (table, paramètres, 422, repli) ; les tests d'écran existants restent verts

## Critères d'acceptation

- [x] AC1 — `grep -rn "as { code?: unknown }" src --include=*.ts --include=*.tsx | grep -v __tests__` est vide.
- [x] AC2 — Les fonctions `codeDe`, `codeDuRefus`, `codeDeLErreur` (et équivalents de la liste) n'existent plus.
- [x] AC3 — `Object.values(…).flat()` d'aplatissement 422 n'apparaît plus qu'une fois, dans `lib/api.ts`.
- [x] AC4 — Une server action en échec rend `code` (test sur au moins une action).
- [x] AC5 — `tsc --noEmit`, `npm run lint` et les tests touchés sont verts.

## Hors périmètre

- Les libellés eux-mêmes ; le préfixe `/api` (TCK-3009 n'y touche pas non plus).

## Notes d'implémentation

Re-mesuré le 2026-11-27 sur l'arbre partagé de `feat/approfondissements-architecture`.

**Ce qui différait du relevé.**

- `copilote.ts:259` (`codeDuRefus`) n'avait **aucun appelant** : supprimé, sans test possible ; la lecture de `data.error.code` disparaît avec lui.
- `lien-d-action.ts:72` prenait `error` puis `message` pour un code : un 410 `{message: 'action_link.used'}` rendait « utilisé ». Test rouge avant le correctif (`lib/queries/__tests__/lien-d-action.lien-mort.tck-3008.test.ts`), vert après.
- Le relevé oubliait un défaut que le changement CRÉAIT : `avecGardeDoubleFacteurAction` traitait tout `code` d'un résultat d'action comme un refus de second facteur. Puisque les actions rendent désormais le code de tout refus, la garde ne reconnaît plus que `two_factor_*` (test rouge avant, `lib/__tests__/double-facteur.code-metier.tck-3008.test.ts`).
- Défaut voisin corrigé : `kpis.ts` et `alerts.ts` rendaient `(err as Error).message`, soit « API error 422 » à l'écran. Ils passent par `refusDAction`.
- `RadarCollecte` n'avait pas d'étape de validation dans sa cascade : il ne l'a toujours pas (`validation` est une option du hook, absente par défaut).

**Ce qui est en place.**

- `ApiError` : `codeMetier`, `params` (objet vide sans `params`), `messagesDeValidation()` (le seul `Object.values(…).flat()`, dans `lib/api.ts`). Une lecture privée `texteDuCorps` sert le code, la prose, le code BFF et `messageCorpsErreurBff`. `codeMetierDe(erreur: unknown)` pour les `catch (e)`.
- `useMessageErreurApi({ tables, validation })` : tables consultées dans l'ordre (traducteur d'espace + codes → clés + résolveur de paramètres optionnel, à défaut les `params` simples de l'API), validation sur demande, puis `messageErreurApi` (message de l'API, puis repli). Sans options, comportement et identité inchangés.
- Les six cascades du Radar passent par le hook avec leurs cas spéciaux (champs de `radar.review.incomplete`, `until` formaté, 413, URL refusée d'un lot, bornes de la publication). Le 413 de la fiche annonceur se teste désormais AVANT les tables : aucun 413 ne porte de code du Radar (celui du proxy porte `payload_too_large`).
- `refusDAction(err, t, repli)` → `{message, code?, params?}` : les 26 modules d’actions qui rendent un message d’échec le portent. Trois tests d'actions fixaient l'ancienne forme sans code (`security.double-facteur`, `invitations.email-masque.tck-2727`, `property.contact-indisponible`) : mis à jour.

**Zones des réservations et des visites**, migrées en second temps une fois libérées : `BookingTunnel.tsx` (code par `err.codeMetier`, aplatissement par `messagesDeValidation()`), `useIdentiteParTelephone.ts`, `PlanifierUneVisite.tsx` (`codeDe` supprimé ; `existing` lu à côté du code), `saisie-de-demande.ts` (`codeDuRefus` supprimé) et ses trois appelants (`bookings/detail/dossier.tsx`, `bookings/detail/garants.tsx`, `visits/compte-rendu/FormulaireDuCompteRendu.tsx`, par `codeMetierDe`). Les trois grep des AC1 à AC3 sont vides sur tout `src/` (un seul `Object.values(…).flat()`, dans `lib/api.ts`).

**AC5, mesuré le 2026-11-28.** `npx tsc --noEmit` complet : propre. Lint et `check:i18n` : rouges SEULEMENT sur `src/app/[locale]/(public)/playground/maquettes/`, maquettes locales ignorées par git (3 erreurs jsx-a11y ; 127 constats i18n, tous sous ce chemin). ⚠ `npm run lint` tel quel s'arrête en local avant de rien juger (« could not find plugin "jsx-a11y" ») à cause de `takussan-web/.fidelite/`, répertoire de captures ignoré par git : mesuré par `eslint --ignore-pattern '.fidelite/**' .`, qui ne rapporte que les maquettes. La CI, sans ces deux répertoires, n'est pas touchée. Même cause pour `surface-publique.contraste.test.ts`, rouge en local sur 186 couples, tous sous `playground/maquettes`.

**Laissé volontairement.** `lib/double-facteur.ts` garde `codeDoubleFacteur`, qui ne lit plus rien lui-même (`err.codeMetier`) mais rétrécit au type `CodeDoubleFacteur`. `components/boost/types.ts` (`manqueDeCredits`) lit désormais `codeMetier` : son test (`BoostDialog.test.tsx`) passait un faux `{status, data}` que `useApiMutation` ne rejette jamais, remplacé par une vraie `ApiError`.

**Écarts au brief.** La validation 422 est une option du hook (`validation: true`), jamais un défaut : sans options, la prose de Laravel l'emporte toujours. `reset-password` affiche `proseServeur` (sentinelles écartées) au lieu du `message` brut.
