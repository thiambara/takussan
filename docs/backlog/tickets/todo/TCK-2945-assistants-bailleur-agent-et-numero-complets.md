---
id: TCK-2945
title: "Assistants d'entrée (bailleur, agent, numéro) : le volet de droite empilé sous 1280 au lieu de disparaître, la carte complète du premier prospect et les droits refusés"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2942]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#35-agentprofile-"
    - "docs/models-spec.md#7-customer"
tags: [front, entree, assistants, bailleur, agent, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le bailleur et l'invité gardent, entre 1024 et 1279 px, ce que la maquette leur montre ; l'agent connaît son premier prospect et les limites de son rôle ; l'étape du numéro dit ce qui attend l'invité.

## Contrat de données

- Prospect enrichi et `denied` (TCK-2942). Le panneau chiffré de l'étape du numéro, suspendu à l'amendement d'ADR-0094, est dans TCK-2949.
- Le reste est déjà lu par les assistants.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-assistants`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-assistants-a.tsx`, visionneuse `?p=app-entree-assistants&a=a`.
  - **e0 « Bailleur : tes biens »**, **bureau 1024-1279** : la grille est `grid-cols-1 … xl:grid-cols-[640px_1fr]` (`:177`) et l'aside « À faire pour être payé » + « Votre interlocuteur » n'est jamais caché (`:213`) : sous 1280 il passe **dessous**. Le produit le cache (`BiensDuBailleur.tsx:313` `hidden xl:block`, rappel `:280` `lg:hidden`). Téléphone et ≥ 1280 conformes.
  - **e1 « Agent : ton premier prospect »**, **téléphone et bureau** : carte avec le besoin « Cherche un 3 pièces à Sacré-Cœur » (`:274`), budget, dernier contact, « Venu par » (`:285`), note de l'agence ; droits refusés marqués ✗ (`:256-257`, `:341`).
  - **e4 « Ton numéro (étape commune) »** : **bureau 1024-1279** aside « {agence} vous attend » empilé dessous (`:931`, `:953`) — le produit le cache (`EtapeDuNumero.tsx:277`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-assistants (e0, e1, e4), « écarts couverts » 1, 3, 11 ; fiche TCK-2613.

## Contraintes strictes (métier)

- Sous 1280, la règle d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 4 : une colonne, l'aside **dessous** (comme les assistants agent et prestataire le font déjà), jamais caché.
- Chaque information du prospect n'est rendue que si l'API la rend ; aucune valeur inventée.
- Les droits refusés suivent `denied` de l'API ; jamais une liste écrite au front.
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de l'entrée conservé.

## Delta à produire

- [ ] Bailleur (e0) et numéro (e4) : aside empilé sous 1280 ; rappel des pièces cohérent à ces largeurs.
- [ ] Carte du premier prospect complète ; type `AgentFirstLeadEntry` étendu.
- [ ] Droits refusés (✗) dans le bloc des droits.
- [ ] Vérifications au navigateur (AC6).

## Critères d'acceptation

- [ ] AC1 — À 1024 et 1279, l'assistant du bailleur rend « À faire pour être payé » et « Votre interlocuteur » sous le tableau des biens ; à 1440, à droite (inchangé).
- [ ] AC2 — À 1024 et 1279, l'étape du numéro rend le panneau « {agence} vous attend » sous le formulaire.
- [ ] AC3 — Avec un prospect rendu par l'API avec besoin, budget, dernier contact, origine et note, la carte de l'agent affiche les cinq (au téléphone et au bureau) ; avec des `null`, les lignes correspondantes sont absentes.
- [ ] AC4 — Le bloc des droits d'un agent liste ses droits accordés (✓) puis ses droits refusés (✗) de `denied`.
- [ ] AC6 — Vérifier au navigateur, avec des profils de démo remplis : liste des biens, prospect, pièces à rappeler, interlocuteur (e0, e1). Corriger ce qui manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2613 mise à jour (entrées `[1]`, `[7]` retirées).
- [ ] AC-F2 — À 390 × 844, 1440 × 900 et 1024 × 768, `fidelite compare` sur e0, e1, e4 ne rend aucun écart non expliqué.

## Hors périmètre

- L'assistant du prestataire (TCK-2946), les pièces (TCK-2947), le panneau chiffré de l'étape du numéro (TCK-2949).

## Notes d'implémentation

_(à remplir par implementing-specs)_
