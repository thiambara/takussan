---
id: TCK-760
title: "Tests du téléchargement d'export RGPD (BFF) et des actions de suppression de compte"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code"
tags: [front, tests, rgpd, pistes]
---

## Contexte

Réf : **P12.09** du fichier de pistes, `validé` (critère accordé : V8, l'ensemble des tests
manquants dépassait M ; le porteur en retient deux). Le handler BFF
`src/app/api/data-exports/[id]/download/route.ts` (téléchargement de l'export RGPD) et les server
actions de `src/app/actions/account-deletion.ts` ne sont importés par aucun test : le seul test qui
les nomme (`AccountDeletionSection.test.tsx`) remplace le module par `vi.mock`.

## Décision du porteur

deux tests : data-exports/[id]/download et account-deletion.ts

## Objectif utilisateur

Un défaut dans le relais de l'export RGPD ou dans les actions de suppression de compte rougit un
test avant d'atteindre l'utilisateur.

## Contrat de données

Aucun changement : les tests décrivent le contrat existant.

## Contraintes strictes

- Aucun code de production modifié.

## Delta à produire

- [x] `src/app/api/data-exports/[id]/download/__tests__/route.test.ts`
- [x] `src/app/actions/__tests__/account-deletion.test.ts`

## Critères d'acceptation

- [x] AC1 — Téléchargement : sans jeton, 401 sans appel amont ; segment invalide, refusé sans
  appel amont ; chemin nominal, l'appel amont porte le jeton (celui de l'impersonation s'il y en a
  une) et les octets, le statut et les trois en-têtes relayés (`content-type`,
  `content-disposition`, `content-length`) reviennent intacts, rien d'autre ; une erreur amont
  garde son statut.
- [x] AC2 — Suppression de compte : chaque action rend `{ ok: true, data }` sur le chemin nominal,
  un message traduit sans jeton (sans appel à l'API), et sur une `ApiError` le message, les
  `obligations` et les `errors` de la réponse ; une erreur qui n'est pas une `ApiError` rend le
  message de repli propre à l'action.

## Hors périmètre

- Les autres actions et handlers sans test relevés par la piste (`invitations`, `locale`,
  `kyc/{submit,upload}`, `admin-users`, `super-admin-properties`, `me/wizard-drafts`…).

## Notes d'implémentation

- Tests seuls, verts dès l'écriture (23/23) : la « reproduction » est l'absence de tout import de
  ces deux modules dans un test, re-mesurée par `grep` (seul `AccountDeletionSection.test.tsx` les
  nomme, et il remplace le module par `vi.mock`).
- Ablations, chacune remise après : `set-cookie` ajouté aux en-têtes relayés → 1 rouge ;
  `segmentAmont` retiré → 3 rouges ; `obligations` retirées de `failure()` → 4 rouges ; la clé
  de repli d'`cancelAccountDeletionAction` remplacée → 1 rouge.
- Le jeton manquant rend `errors.missingToken` : `requireToken` lève une `ApiError(401)` qui passe
  par `messageErreurApi`, et le test fige ce texte plutôt que « un message non vide ».
