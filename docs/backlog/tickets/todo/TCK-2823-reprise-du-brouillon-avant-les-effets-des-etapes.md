---
id: TCK-2823
title: "Rechargée à l'étape 6, l'annonce rouvre : le brouillon entre au formulaire avant les effets des étapes"
status: todo
phase: P3
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  adr:
    - "docs/adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md"
tags: [front, defaut, publication, brouillon, i18n, audit-ux, app]
---

## Objectif utilisateur

Une personne qui ferme l'onglet pendant le code (ou recharge `/publish`) à la dernière étape retrouve son annonce,
titre compris. Aujourd'hui, en développement, la page tombe sur la frontière d'erreur ; en production, le titre
proposé est perdu.

## Origine

Relevé de l'agent publish-2601, 2026-11-14, reproduit deux fois au navigateur : `/publish` rechargé avec un
brouillon local à l'étape 6 lève une `IntlError` (`MISSING_MESSAGE`, levée hors production par `surErreurIntl`)
dans `suggestTitle` (`StepFinition.tsx` → `suggest-title.ts`, `tType(type)` avec un type vide). Cela casse « un
onglet fermé pendant le code rouvre l'annonce » (ADR-0093).

## Cause

`PropertyWizard` décide la reprise PENDANT le rendu (`setIndex(etape)`, `etatBrouillon = 'restaure'`), mais écrit
le brouillon dans react-hook-form par un `useEffect`. Les effets passifs d'un enfant passent AVANT ceux du parent :
l'effet de `StepFinition` lit donc `type`, `title`, `city`… sur le formulaire VIDE, un commit avant le `reset`.
Le même écart vaut pour le brouillon serveur de l'assistant connecté (`useWizardDraft`), même code.

## Delta

- Le brouillon entre au formulaire avant tout effet passif d'une étape (effet de mise en page dans
  `PropertyWizard`) ; `suggestTitle` ne change pas (son `type` est requis par contrat).

## Critères d'acceptation

- [x] AC1 — Brouillon à l'étape 6 avec un titre : le titre du brouillon s'affiche, aucune `IntlError` sous le
  `onError` de l'application (`surErreurIntl`).
- [x] AC2 — Brouillon à l'étape 6 avec un type et sans titre : le titre proposé est composé DEPUIS le brouillon
  (« Villa 3 chambres à Mbour »), pas perdu. Tolérer un type vide dans `suggestTitle` laisserait ce critère rouge.
- [x] AC3 — Aucune sauvegarde du brouillon n'emporte des valeurs initiales (type vide) à la reprise.
- [x] AC4 — Au navigateur, rechargement de `/publish` à l'étape 6 avec un brouillon local : l'annonce rouvre,
  aucune frontière d'erreur, aucun `MISSING_MESSAGE`.

## Preuves (2026-11-14)

- AC1 à AC3 : `src/components/property-form/__tests__/PropertyWizard.reprise-etape-6.tck-2823.test.tsx`, monté sous `onError={surErreurIntl}` (avec `withIntl`, sans `onError`, le
  `MISSING_MESSAGE` n'irait qu'à la console et le test serait vert sans correctif). Rouge avant : 3/3,
  frontière d'erreur `MISSING_MESSAGE`. Ablation (`useLayoutEffect` → `useEffect`) : 3/3 rouges ; restauré, md5 vérifié.
- AC4 : `next dev`, contexte isolé, brouillon IndexedDB écrit à l'étape 6 puis page rechargée : sans titre,
  « Villa 3 chambres à Mbour » proposé ; avec titre, « Ma villa de Saly » ; étape 6 sur 6, aucune frontière,
  console vide (origine `localhost:3000`). Brouillon relu après rechargement : type `villa`, étape 5. Aucune écriture en base.

## Notes d'implémentation

Correctif à la cause : le `reset` du brouillon passe de `useEffect` à `useLayoutEffect` dans `PropertyWizard`.
Écarté : tolérer un type vide dans `suggestTitle` (ou `if (!type) return` dans `StepFinition`) — l'effet de
l'étape a des dépendances stables et ne repasse pas après le `reset` : le titre proposé serait perdu (AC2 rouge),
et toute autre étape à effet garderait le même écart. Couvre aussi l'assistant connecté (`useWizardDraft`, même code).
