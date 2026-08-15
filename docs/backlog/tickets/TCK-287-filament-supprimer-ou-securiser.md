---
id: TCK-287
title: "Filament — supprimer le panel ou le securiser"
status: review
phase: P1
family: technique
estimate: S
wave: null
created: 2026-08-12
updated: 2026-08-15
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

- [x] AC1 — branche A : `grep -ri filament` ne rend plus rien sur `composer.json`, `app/`, `config/`,
      `bootstrap/`, `tests/`, `routes/`, `.github/` ni `scripts/`. Les 6 routes `filament.admin.*` ont
      disparu de `php artisan route:list`.
- [ ] AC2 — sans objet : branche B non retenue.
- [x] AC3 — `docs/ardoise.md` D-41 est fermée en citant ce ticket, après correction de son diagnostic.

## Hors périmètre

- Le back-office Next.js, qui ne bouge pas.

## Notes d'implémentation

**Branche A retenue le 2026-08-15, sur décision explicite. Voir [ADR-0013](../../adr/0013-un-seul-back-office-en-nextjs.md).**

Trois choses non évidentes, qui ne se lisent pas dans le diff :

**1. La prémisse de ce ticket était fausse, et son intitulé la portait.** « Supprimer ou sécuriser »
supposait une surface exposée. Elle ne l'était pas : `User` n'implémentant pas `FilamentUser`,
Filament est **fail-closed** hors `APP_ENV=local`
(`vendor/filament/filament/src/Http/Middleware/Authenticate.php:32-39`) — 403 en `staging` comme en
`production`. L'interface manquante fermait la porte que le middleware manquant était censé avoir
laissée ouverte. L'arbitrage réel était « supprimer ou **assumer** », et assumer aurait voulu dire
implémenter `canAccessPanel()`, c'est-à-dire **ouvrir** un panel aujourd'hui fermé.

**2. Le vrai piège de la suppression n'était pas dans le code mais dans `composer.json`.**
`post-autoload-dump` contenait `@php artisan filament:upgrade`, qui s'exécute à *chaque*
`composer install` — donc en CI et pendant le déploiement. Retirer le paquet sans cette ligne aurait
fait échouer toute installation ultérieure sur une commande introuvable, et la panne ne se serait pas
vue en local où `vendor/` était déjà peuplé. *Retirer une dépendance, c'est aussi retirer ce qu'on
avait branché sur son cycle de vie.*

**3. Trois des 29 paquets transitifs ressemblaient à des dépendances vivantes.** Vérifié avant de
supprimer : le 2FA passe par `pragmarx/google2fa` et `bacon/bacon-qr-code`, déclarés *directement* en
`require` — le paquet emporté, `pragmarx/google2fa-qrcode`, est un homonyme jamais importé ; les
exports passent par `maatwebsite/excel`, et `openspout` avait 0 usage. La chaîne npm/Vite de l'API ne
servait pas Filament non plus (elle construit `resources/css/app.css` pour `welcome.blade.php`) et
reste en place.

Portée réelle : 7 fichiers de code, 2 racines composer → 29 paquets exclusifs, 37 fichiers d'assets
(4,12 Mo), l'entrée de `bootstrap/providers.php`, une ligne de `composer.json`, et quatre documents.
