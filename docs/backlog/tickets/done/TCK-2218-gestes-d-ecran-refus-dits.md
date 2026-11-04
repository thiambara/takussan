---
id: TCK-2218
title: "Cinq écrans disent le refus de gestes qui échouaient sans un mot"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-228--mutations-lancées-par-mutate-sans-onerror-et-dont-lécran-ne-lit-pas-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, erreurs, pistes]
---

## Contexte

Réf : **P228.05** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 fixe le rendu par
`useMessageErreurApi()` ; chaque geste se branche sur la zone d'erreur que l'écran a déjà, ou sur
une ligne `role="alert"`, sans texte neuf).

Gestes lancés par `mutate()` sans chemin d'erreur : l'envoi à la signature d'un état des lieux
(`InventoryDetail`), la fin d'une absence (`AgentAbsencesSection`), le retrait, le départ, le
changement de rôle et la sourdine d'un groupe (`ConversationInfoSheet`), l'accusé de réception des
documents (`TenantOnboardingChecklistWidget`) et la fermeture d'une annonce
(`GlobalAnnouncementBanner`). Leur refus tient surtout à un écran périmé.

## Hypothèses retenues

- `ConversationInfoSheet` : la zone `AlerteErreurs` existante reçoit le message, effacé au geste
  suivant.
- `GlobalAnnouncementBanner` : le message garde la couleur du bandeau (un rouge sur ses fonds
  pleins ne se lirait pas).
- Les autres : une ligne `role="alert"` sous le geste, qui lit l'erreur de la mutation ou la pose
  par l'`onError` de l'appel.

## Delta à produire

- [x] Les cinq composants : refus dit par `useMessageErreurApi()`.
- [x] Cinq tests vitest `*.p228-05.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Chacun des huit gestes, rejeté par l'API, affiche le message dans un `role="alert"`.

## Hors périmètre

- Un toast commun des erreurs de mutation (P228.06 traite la garde).

## Notes d'implémentation

- Ablation : les cinq composants de `pre-dev` → 9/9 rouges ; correctif remis → 9/9 verts, et les
  huit fichiers de test voisins verts (33 tests).
- Le test a été écrit après le correctif dans ce passage ; son rouge a été constaté sur les
  composants de `pre-dev` (ablation ci-dessus).
