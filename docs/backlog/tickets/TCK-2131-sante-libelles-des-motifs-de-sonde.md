---
id: TCK-2131
title: "Les motifs wildcard_trusts_nobody et signing_secret_missing ont leur libellé, et un motif inconnu s'affiche en code encadré"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2129]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-219--clés-next-intl-bâties-sur-une-valeur-venue-de-lapi"
tags: [front, api, super-admin, sante, i18n, garde, pistes]
---

## Contexte

Réf : **P219.02** du fichier de pistes, `validé (délégué)` (V7 accordé). `HealthcheckService` émet
cinq motifs (`reason`) ; l'union `HealthReason` et le dictionnaire `superAdmin.systemHealth.hint.reason`
n'en portaient que trois. Depuis TCK-2129, les tuiles `proxies` et `lemon_squeezy_webhook`
existent : en `degraded`, elles peignaient la clé brute (ou levaient `MISSING_MESSAGE` hors production).

## Décision du porteur (déléguée)

`wildcard_trusts_nobody` et `signing_secret_missing` ajoutés à `HealthReason` et à `superAdmin.systemHealth.hint.reason` en `fr` et `en` (le `wo` au texte français), et `indice()` qui, pour un motif sans clé (`t.has()` faux), rend `hint.value` avec le code brut au lieu de la clé ; garde : un test PHP qui relève les `'reason' =>` de `HealthcheckService` et les compare à l'union `HealthReason` lue dans `super-admin.ts`, sur le modèle de `BookingQuoteConcordanceTest`

## Objectif utilisateur

L'opérateur lit en clair pourquoi la sonde des mandataires ou du webhook Lemon Squeezy est dégradée,
et jamais une clé de dictionnaire.

## Contrat de données

Aucun changement d'API.

## Delta à produire

- [x] `HealthReason` (`super-admin.ts`) : `wildcard_trusts_nobody`, `signing_secret_missing`.
- [x] `superAdmin.systemHealth.hint.reason.{wildcard_trusts_nobody,signing_secret_missing}` en `fr` et
  `en`, le `wo` au texte français (wolof en pause).
- [x] `indice()` : `t.has()` faux → `hint.value` avec le code brut.
- [x] Test PHP `HealthcheckMotifsConcordanceTest` : `'reason' =>` de `HealthcheckService` = union
  `HealthReason` lue dans `super-admin.ts`.
- [x] Test vitest `system-health.motifs.test.tsx` : les deux libellés rendus ; un motif inconnu rend
  « Valeur : <code> ».

## Critères d'acceptation

- [x] AC1 — Un motif émis par l'API absent de `HealthReason` (ou l'inverse) rougit le test PHP.
- [x] AC2 — Les deux motifs s'affichent en français sous `fr`, sans clé brute.
- [x] AC3 — Un motif sans clé au dictionnaire s'affiche « Valeur : <code> ».

## Hors périmètre

- Le test PHP ne lit pas le dictionnaire : la décision le borne à l'union ; le test vitest tient les
  deux libellés, et `scripts/check-status-labels.mjs` (TCK-2127) pourrait s'étendre à ces motifs.

## Notes d'implémentation

- Ablation : remettre `return t(cle)` sans `t.has()` rougit le cas « motif inconnu »
  (`MISSING_MESSAGE` levé par le harnais) ; retirer les deux cas de `HealthReason` rougit le test PHP.
- Le type du traducteur passé à `indice()` déclare `has`, que porte le `t` de next-intl.
