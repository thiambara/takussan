---
id: TCK-2949
title: "Étape du numéro des assistants d'invité : le panneau « {agence} vous attend » chiffré (biens suivis, dernier loyer, pièces à envoyer)"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2939]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, entree, assistants, invitation, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité qui vérifie son numéro voit déjà ce qui l'attend chez l'agence : ses biens, son dernier loyer, les pièces à envoyer.

## Contrat de données

- `GET /api/me/profiles/{profile}/invite-summary` (TCK-2939), suspendu à l'amendement d'ADR-0094 (décision « rien avant le code » de TCK-2613 `#8`). Si le porteur refuse l'amendement, ce ticket passe `obsolete` et la fiche TCK-2613 garde l'écart avec ce motif.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-assistants`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-assistants-a.tsx`, visionneuse `?p=app-entree-assistants&a=a`, **e4 « Ton numéro (étape commune) »**, **bureau** (le panneau n'existe pas au téléphone) : lignes « 3 biens suivis par l'agence » + titres, « Ton dernier loyer · 350 000 F reçus le 5 nov. », « 2 pièces à envoyer · RIB et pièce d'identité » (`:965-967`). La disposition sous 1280 (panneau empilé) est dans TCK-2945.
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-assistants e4 ; fiche TCK-2613 (`#8`).

## Contraintes strictes (métier)

- Chaque ligne n'est rendue que si l'API la sert ; sans résumé, les lignes génériques actuelles (`CeQuiVousAttend.tsx`).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de l'entrée conservé.

## Delta à produire

- [ ] Lignes chiffrées du panneau, par rôle (bailleur, agent, prestataire).
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Pour un bailleur dont `invite-summary` rend 3 biens et un dernier loyer de 350 000 F le 5 nov., le panneau affiche « 3 biens suivis par l'agence » avec les trois titres et « Ton dernier loyer · 350 000 F reçus le 5 nov. ».
- [ ] AC2 — Sans résumé (404 ou champs nuls), les lignes génériques actuelles sont rendues, sans erreur.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2613 : entrée `#8` retirée.
- [ ] AC-F2 — À 1440 × 900, `fidelite compare` sur e4 ne rend aucun écart non expliqué.

## Hors périmètre

- La disposition sous 1280 (TCK-2945). La règle d'accès (TCK-2939).

## Notes d'implémentation

_(à remplir par implementing-specs)_
