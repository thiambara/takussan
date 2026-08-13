---
id: TCK-287
title: "Filament — supprimer le panel ou le securiser"
status: todo
phase: P1
family: technique
estimate: S
wave: null
created: 2026-08-12
updated: 2026-08-12
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, securite, dette]
---

## Objectif utilisateur

Qu'aucune surface d'administration ne soit exposée sans que quelqu'un en réclame la responsabilité.

## Contraintes strictes (métier)

Mesuré le 2026-08-12 :

- Deux dépendances composer (`filament/filament`, `filament/spatie-laravel-media-library-plugin`).
- Un panel monté sur **`/admin`** avec `->login()`, dans `app/Providers/Filament/AdminPanelProvider.php`.
- **Une seule Resource** : Property — 6 fichiers au total.
- **Aucun middleware `super-admin` sur le panel.**
- **`User` n'implémente pas `FilamentUser`** — donc aucun `canAccessPanel()` ne filtre qui entre.

Pendant ce temps, le back-office réel est en Next.js, avec un espace `(super-admin)` complet.

**C'est une surface d'administration exposée dont personne ne réclame la responsabilité.** Ce n'est
pas nécessairement une faille — l'authentification Filament s'applique — mais **rien ne restreint
QUI peut s'y connecter parmi les comptes existants**, et personne ne l'a décidé.

## Delta à produire

Trancher, puis appliquer **l'une** des deux branches :

**A — supprimer** (probable) : retirer `app/Filament/`, `app/Providers/Filament/`, les deux
dépendances composer, les assets publiés, et la route `/admin` côté API. Vérifier qu'aucun lien
n'y mène.

**B — assumer** : implémenter `FilamentUser::canAccessPanel()` sur `User` (super-admins seuls),
poser le middleware `super-admin` sur le panel, et écrire l'ADR qui dit **pourquoi** deux
back-offices coexistent.

## Critères d'acceptation

- [ ] AC1 — branche A : `grep -ri filament takussan-api/composer.json app/` ne rend rien, et `/admin` répond 404.
- [ ] AC2 — branche B : un test vérifie qu'un compte **non super-admin** authentifié reçoit un 403 sur `/admin`, et un ADR est écrit.
- [ ] AC3 — dans les deux cas, l'entrée D-41 de `docs/ardoise.md` est fermée en citant ce ticket.

## Hors périmètre

- Le back-office Next.js, qui ne bouge pas.

## Notes d'implémentation

Ardoise D-41. La branche A est probable — mais elle reste un arbitrage, pas un nettoyage évident :
Filament donne un accès CRUD brut aux données, ce qui dépanne en incident.
