---
id: TCK-755
title: "Avertissement de départ sur les formulaires longs modifiés"
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
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone"
tags: [front, forms, mobile, pistes]
---

## Contexte

Réf : **P08.06** du fichier de pistes, `validé` (critère accordé : V7). `CreateLeaseForm`,
`CustomerForm` et `PropertyForm` (édition) n'ont ni brouillon ni gestionnaire `beforeunload` :
un rechargement ou un onglet fermé perd la saisie sans prévenir.

## Décision du porteur

avertissement beforeunload seulement quand le formulaire est modifié

## Objectif utilisateur

Ne pas perdre en silence la saisie d'un formulaire long en quittant la page.

## Contrat de données

Aucun endpoint. Comportement navigateur seul (`beforeunload`), dont le texte est celui du
navigateur : aucun libellé neuf.

## Contraintes strictes

- Aucun avertissement sur un formulaire intact.
- `isDirty` lu par `useFormState`, jamais par `form.formState` au rendu (TCK-571).

## Delta à produire

- [x] Hook `useAvertissementDepart(actif)` : un écouteur `beforeunload` posé tant que `actif`.
- [x] Branché sur `isDirty` dans les trois formulaires.
- [x] Tests du hook, et un test par formulaire.

## Critères d'acceptation

- [x] AC1 — Formulaire intact : `beforeunload` n'est pas annulé.
- [x] AC2 — Un champ saisi : `beforeunload` est annulé (le navigateur avertit).
- [x] AC3 — Redevenu intact ou démonté : plus d'avertissement.

## Hors périmètre

- La navigation interne de Next (liens, `router.push`), qui ne déclenche pas `beforeunload`.
- Le brouillon persistant (`useWizardDraft`), que la `Piste` proposait et que la décision écarte.

## Notes d'implémentation

- Avant correctif : les trois tests de formulaire rouges (`defaultPrevented` faux après saisie),
  celui du hook rouge (module absent).
- Ablation : écouteur retiré du hook → 4 rouges (1 du hook, 3 des formulaires) ; branchement
  retiré de `CustomerForm` seul → son test rouge ; remis → 46/46 verts.
