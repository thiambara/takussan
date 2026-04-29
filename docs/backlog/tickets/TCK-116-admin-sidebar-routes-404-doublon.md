---
id: TCK-116
title: Admin sidebar — corriger routes 404 et doublon "Équipe"
status: done
phase: P1
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
tags: [front, bug, p1, sidebar, navigation]
---

## Objectif utilisateur

L'administrateur peut naviguer dans le back-office admin sans tomber sur des pages 404 ni des entrées dupliquées dans le menu.

## Contrat de données

Aucun changement backend — corrections de routing et navigation frontend uniquement.

## Direction UX / Artistique

Le sidebar admin doit être épuré : chaque entrée unique, chaque lien pointant vers une route existante.

## Contraintes strictes (métier)

Ne pas supprimer une route existante sans redirection. Si `/admin/properties` doit exister à terme, créer une page stub ou rediriger vers `/admin/moderation` en attendant.

## Delta à produire

- [ ] **`/admin/properties` (404)** — Déterminer la cible correcte : créer une page stub ou corriger le lien sidebar pour pointer vers la route admin des biens existante (ex: `/admin/moderation` onglet biens)
- [ ] **`/admin/moderation/reviews` (404)** — Corriger le lien sidebar pour pointer vers `/admin/moderation` (la vraie URL de la page de modération)
- [ ] **Doublon "Équipe"** — Localiser les deux entrées "Équipe" dans la config sidebar admin et supprimer le doublon
- [ ] Vérifier que toutes les autres entrées sidebar admin renvoient vers des routes accessibles

## Critères d'acceptation

- [ ] Le sidebar admin ne contient plus d'entrée "Équipe" en double
- [ ] Cliquer sur le lien "Biens" (ou équivalent) dans l'admin ne renvoie plus 404
- [ ] Cliquer sur le lien "Modération avis" dans l'admin ouvre bien la page `/admin/moderation`
- [ ] Toutes les entrées du sidebar admin aboutissent à une page accessible

## Hors périmètre

- Création de la page de gestion admin des biens si elle n'existe pas encore (ticket dédié)
- Refonte du design ou de l'ordre du sidebar

## Notes d'implémentation

- `/admin/moderation/reviews` : introuvable dans le code au moment de l'implémentation — le sidebar pointait déjà sur `/admin/moderation`. AC passant sans intervention.
- Doublon "Équipe" : `/admin/users` renommé "Utilisateurs" (cohérent avec §2.9 et le h1 de la page stub).
- `/admin/properties` : page stub créée avec guard `isSuperAdmin` + redirect `/admin` — identique au pattern `/admin/users/page.tsx`. La vraie page admin des biens reste hors périmètre.
