---
id: TCK-2524
title: Console : écrire la vitrine de l'agence et le profil public de l'agent
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2518]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models: []
tags: [front, console, agence, audit-ux]
---

## Objectif utilisateur

L'admin d'agence écrit son accroche, ses trois raisons et choisit six biens à montrer ; l'agent dit ses langues et ses quartiers — et chacun voit ce que la fiche publique en fera.

## Contrat de données

Écriture de TCK-2518 : `PATCH /api/agencies/{agency}` (`tagline`, `highlights`, `showcase_property_ids`) ; profil de l'agent (`languages`, `neighborhood_ids`).

## Direction UX / Artistique

- Dans la section d'administration d'agence (`/app/agency/*`), un bloc « Fiche publique » : accroche (compteur 120), trois lignes « Pourquoi nous » (compteur 80), sélection de six biens publics au plus (choix dans ses biens, réordonnables), et un aperçu de la couverture qui en résulte.
- Dans le profil de l'agent : langues (cases d'une liste fermée), quartiers (référentiel, cinq au plus).
- Lien « Voir ma fiche publique ».
- Champs uniformes de la console (garde `check-champs-uniformes`) ; vouvoiement de la console.

## Contraintes strictes (métier)

- Seul qui a la capacité de configurer l'agence écrit sa vitrine ; un agent n'écrit que son propre profil.
- Tout est facultatif ; vider un champ le retire de la fiche.
- Un bien non public ne se choisit pas dans la sélection.

## Delta à produire

- [ ] Bloc « Fiche publique » de l'agence, avec aperçu.
- [ ] Langues et quartiers dans le profil de l'agent.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (compteurs, six biens au plus, 422 remappée sur le champ, agent sans capacité d'agence).

## Critères d'acceptation

- [ ] AC1 — Une septième sélection est refusée avant l'envoi, et un 422 de l'API s'affiche sur le champ.
- [ ] AC2 — L'aperçu de couverture change quand la sélection change.
- [ ] AC3 — Un agent sans capacité de configuration ne voit pas le bloc de l'agence, mais voit et enregistre ses langues.

## Hors périmètre

- La photo de couverture téléversée (la couverture est faite des biens, décision 2a).

## Notes d'implémentation

_(à remplir par implementing-specs)_
