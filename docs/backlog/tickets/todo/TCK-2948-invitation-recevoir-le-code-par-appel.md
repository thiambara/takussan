---
id: TCK-2948
title: "Page d'invitation : « ou le recevoir par appel » sous le code"
status: todo
phase: P3
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2940]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, entree, invitation, code, appel, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité qui ne reçoit pas le SMS demande que le code lui soit dicté par un appel.

## Contrat de données

- `POST /api/public/invitations/{token}/code` avec `channel: "voice"`, et l'indication que la voie est active (TCK-2940).

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-invitation`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-invitation.tsx`, visionneuse `?p=app-entree-invitation&a=a`, **e1 « Code »**, **téléphone et bureau** : « Rien reçu ? Renvoyer le code dans 0:38, ou le recevoir par appel. » (`:342`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-invitation e1, « écarts couverts » 5 ; fiche TCK-2611 (`#6`). Séparé de TCK-2941 pour que le reste de la page n'attende pas le choix d'un fournisseur.

## Contraintes strictes (métier)

- Le lien n'est rendu que si la voie est active ; il partage le rebours du renvoi (pas d'appel avant la fin du rebours).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de la page conservé.

## Delta à produire

- [ ] Lien « ou le recevoir par appel » et son appel.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Voie active, à la fin du rebours, « le recevoir par appel » envoie `channel: "voice"` à `…/code` et relance le rebours ; pendant le rebours, il est inactif.
- [ ] AC2 — Voie inactive, la phrase s'arrête à « Renvoyer le code dans … » (aucun lien d'appel).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2611 : entrée `#6` retirée.
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e1 ne rend aucun écart non expliqué.

## Hors périmètre

- Le fournisseur et la route (TCK-2940).

## Notes d'implémentation

_(à remplir par implementing-specs)_
