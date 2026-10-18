---
id: TCK-917
title: "Code mort du front retiré, et un seul formatCurrency"
status: done
phase: P3
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-6"
tags: [front, pistes, code-mort]
---

## Contexte

Réf : **P13.10** du fichier de pistes (angle 13, code mort et doublons), `validé`.

Un résolveur d'imports (tests exclus) relève, au 2026-10-18, des fichiers du front sans importeur
et des exports sans appelant, pas même un test. Deux `formatCurrency` homonymes coexistent :
`lib/format.ts` prend une langue en second argument, `lib/format/currency.ts` une devise.

## Décision du porteur

validé — fichiers et exports morts côté front, et un seul `formatCurrency` ; reste : le retrait des colonnes en base et le rapport des clés i18n inutilisées

## Reste à faire

le retrait des colonnes en base et le rapport des clés i18n inutilisées

## Objectif utilisateur

Aucun changement visible : un développeur ne retombe plus sur un formateur, un crochet ou un
composant que rien n'utilise, et `formatCurrency` n'a plus qu'une signature.

## Delta à produire

- [x] Retirer les fichiers sans importeur : `Money.tsx` et `useAgencyCurrency.ts` (le troisième
      formateur de montant), `ShareButton.tsx`, `useRequireAuth.ts`, `StubPlaceholder.tsx`, le
      baril `components/property/index.ts`, `types/common.ts`, `types/payment.ts`, avec les tests
      qui ne visaient qu'eux.
- [x] Retirer les exports sans aucun appelant (liste dans le test), dont
      `fetch/upsert/deleteWizardDraft`, `useUpdateLease`, `useRefundDeposit`,
      `useConfirmEarlyTermination`, `switchActiveProfileAction`.
- [x] `formatCurrency` de `lib/format/currency.ts` renommé `formatMontant` ; ses appelants suivent.
- [x] Test `src/lib/__tests__/code-mort.tck-917.test.ts`.

## Critères d'acceptation

- [x] AC1 — Les fichiers et exports listés par le test n'existent plus, et `tsc`, le lint et les
      tests des modules touchés restent verts.
- [x] AC2 — Seul `lib/format.ts` déclare `formatCurrency`, et rien ne l'importe de
      `lib/format/currency`.

## Hypothèses

- « Mort » veut dire **sans appelant hors tests et sans test non plus**. Les exports que seuls des
  tests importent (`clearCompare`, `CLE_I18N_ERREUR_INCONNUE`, `PIPELINE_STAGES`, `formatDate` de
  `lib/utils`…) restent : ils sont exportés pour être éprouvés, et les retirer demanderait de
  retirer ces tests.
- Les preuves de type de `lib/canonique.ts` (`_Preuve*`) restent : elles n'ont pas d'appelant par
  construction.
- `lib/share.ts`, que la piste disait mort, a désormais un appelant (`PropertyShareDialog`) : il
  reste.
- Le formateur de devise garde son comportement (locale tirée de la devise) ; seul son nom change.
  Choisir lequel des deux contrats doit l'emporter partout serait un changement visible.

## Notes d'implémentation

- **Reproduction** : `src/lib/__tests__/code-mort.tck-917.test.ts` → 40 rouges avant correctif
  (8 fichiers présents, 30 exports déclarés, deux déclarants de `formatCurrency` et sept modules
  qui l'importaient de `lib/format/currency`).
- **Ablation** : arbre d'avant remis, test gardé → 40 rouges ; correctif réappliqué → 40 verts.
- **Piège** : retirer un export en a rendu d'autres morts dans le même module
  (`buildMembersParams`, `FetchAgencyMembersParams`, `AgencyMembersFilters`,
  `SwitchProfileActionResult`, `KycUploadResponse`, `RefundDepositPayload`) : le lint les signale
  comme imports ou déclarations inutilisés, pas le résolveur d'imports.
- `useConfirmEarlyTermination` était le seul code du front qui visait
  `POST /api/leases/{id}/early-termination/confirm` : aucun écran ne confirme une résiliation
  anticipée. Le crochet est retiré comme mort ; le parcours manquant n'est pas traité ici.
- La clé `serverActions.profiles.switchFailed` n'a plus de lecteur : elle reste, avec le rapport
  des clés i18n inutilisées (reste du porteur).
