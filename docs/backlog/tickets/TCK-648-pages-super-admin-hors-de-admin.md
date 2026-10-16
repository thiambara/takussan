---
id: TCK-648
title: Les deux pages super-admin de /admin rejoignent /super-admin
status: done
phase: P1
family: front
estimate: S
wave: 78
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: [TCK-649, TCK-650, TCK-651]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, adr-0064]
---

## Objectif utilisateur

Le super-admin trouve dans sa console tout ce qui relève de la plateforme, et rien de la
plateforme ne reste dans l'espace d'une agence.

## Contrat de données

- Consommé, inchangé : `/api/settings` (table clé-valeur `settings`, portée globale), déjà lu par
  `/admin/settings`.
- Décision : [ADR-0064](../../adr/0064-l-administration-d-agence-vit-dans-app.md) §1.

## Direction UX / Artistique

- L'éditeur des paramètres globaux s'ouvre à `/super-admin/settings/global`, dans la coque
  `/super-admin`, reconnaissable comme un voisin des « Paramètres plateforme » de
  `/super-admin/settings` — et non confondu avec eux : deux vues de la même table `settings`, par deux API (brute et catalogue).

## Contraintes strictes (métier)

- `/super-admin/settings/global` n'est ouvert qu'au `super_admin` — la garde du layout de
  `/super-admin` le couvre ; l'API rejuge (`routes/api/settings.php` : la portée `global` exige le super-admin).
- `/admin/properties` n'est pas déplacée : `/super-admin/properties` couvre le besoin. Avant de la
  supprimer, vérifier que rien de ce qu'elle offre (filtres, actions) ne manque à
  `/super-admin/properties` ; un manque se signale, il ne bloque pas la suppression.

## Delta à produire

- [x] Page `/super-admin/settings/global`, qui reprend l'éditeur de `/admin/settings`.
- [x] Entrée de menu dans la barre `/super-admin`.
- [x] Suppression de `/admin/settings` et `/admin/properties`, et de leurs lignes dans `PAGES_ADMIN`.
- [x] L'onglet « Intégrations » de l'ancien éditeur ne pointe plus vers une page super-admin.
- [x] Tests : la page neuve (rendu, garde), la table sans ces deux lignes.

## Critères d'acceptation

- [x] AC1 — un super-admin lit et modifie les paramètres globaux depuis `/super-admin/settings/global`.
- [x] AC2 — un admin d'agence qui ouvre `/super-admin/settings/global` est refusé, comme pour toute
      page de `/super-admin`.
- [x] AC3 — `/admin/settings` et `/admin/properties` rendent 404 ; aucun lien du front n'y mène.

## Hors périmètre

- La fusion des deux éditeurs de paramètres en un seul (une table, deux API).
- Le déplacement des pages d'agence (TCK-649).

## Notes d'implémentation

- **Une table, deux API** (la première rédaction disait « deux tables ») : `/api/settings` (éditeur
  brut, `auth:sanctum` seul, portée `global` réservée au super-admin) et `/api/admin/settings` (vue
  catalogue typée) écrivent la même table `settings` ; la route brute refuse les clés du catalogue.
  ADR-0064 et ce ticket corrigés.
- **Garde à la page, pas seulement au layout** : depuis TCK-600 le layout `/super-admin` ouvre la
  console aux opérateurs `viewer`/`support` ; la page exige `isSuperAdmin` et renvoie à `/super-admin`.
- `/admin/properties` → `/super-admin/properties` ne couvre pas les filtres fins, les KPI ni
  l'assignation en masse ; la même liste reste ouverte au super-admin sur `/app/properties`.
- Reste hors périmètre : les actions de `admin-settings.ts` lisent `getToken()`, donc le jeton
  d'impersonation pendant une session (même précédent que `/super-admin/tags`) — aucune élévation,
  écritures globales en 403. Traité par TCK-650 (`app/actions/console.ts`, au jeton de l'opérateur).
- Commit 635dec27.
