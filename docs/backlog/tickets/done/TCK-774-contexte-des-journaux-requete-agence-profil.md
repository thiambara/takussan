---
id: TCK-774
title: "request_id, agence et profil actifs dans le contexte des journaux de l'API"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, journaux, observabilite, pistes]
---

## Contexte

Réf : **P14.12** du fichier de pistes, `validé` (critère accordé : V8, deux tickets ; le porteur
n'en confie qu'un).

Aucun `Log::withContext` ni `Context::add` dans `app/` ni `bootstrap/` : une erreur journalisée ne
se relie ni à sa requête ni à une agence.

## Décision du porteur

`request_id`, agence et profil dans le contexte des journaux (`Log::withContext`) ; reste : la sonde payments et son seuil d'alerte

## Reste à faire

la sonde payments et son seuil d'alerte

## Objectif utilisateur

L'exploitant relie une ligne de journal à sa requête, à l'agence et au profil actifs.

## Contraintes strictes

- `request_id` : le `X-Request-Id` entrant s'il est un jeton sûr (`[A-Za-z0-9._-]{1,64}`), sinon un UUID.
- `agency_id`, `profile_type` (nom court de la classe), `profile_id` : ceux de `request()->activeProfile()`, `null` sans profil.
- Rien d'autre : ni l'utilisateur, ni une donnée de la requête.

## Delta à produire

- [x] `App\Http\Middleware\ShareRequestLogContext`, ajouté au groupe `api` juste après `ResolveActiveProfile` (`bootstrap/app.php`).
- [x] `tests/Feature/Logging/RequestLogContextTest.php`.

## Critères d'acceptation

- [x] AC1 — Un journal écrit pendant une requête authentifiée porte un `request_id` UUID, l'agence et le profil actifs.
- [x] AC2 — Un `X-Request-Id` sûr est repris ; un trop long est remplacé par un UUID ; sans profil, agence et profil sont `null`.

## Hors périmètre

- La sonde `payments` et son seuil d'alerte (reste du porteur).
- Les journaux des jobs et des commandes, hors requête HTTP.
- Renvoyer `X-Request-Id` dans la réponse.

## Notes d'implémentation

- **Ablation** : le middleware retiré du groupe `api` → 2 rouges sur 2 ; remis → 2 verts.
- `bootstrap/` est un déclencheur dur d'`impacted-tests` : ce ticket fait rejouer la suite entière, que la CI joue.
- Un agent créé par `actingAsRole('agent')` peut aussi porter un autre profil de la même agence : le test vérifie que le profil journalisé est l'un des siens, pas lequel.
