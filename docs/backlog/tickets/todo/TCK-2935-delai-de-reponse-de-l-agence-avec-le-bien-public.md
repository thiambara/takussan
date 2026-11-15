---
id: TCK-2935
title: "Le bien public porte le délai de réponse médian de son agence"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2936]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, public, agence, delai-de-reponse, connexion, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le visiteur qui demande une visite sait, en se connectant, en combien de temps l'agence répond d'ordinaire.

## Contrat de données

Relevé du 2026-11-15 : `agencies.median_response_minutes` existe (calculé par `RefreshDirectoryResponseTimes`) et est servi par la fiche publique d'agence (`PublicAgencyController`), mais pas par la lecture publique d'un bien que la connexion lit pour le « bien quitté » (`lib/queries/bien-quitte.ts` → `getProperty`). Écart TCK-2604 (`a-0`, « réponse en 2 h environ » : « jamais mesuré ») — il l'est.

- La lecture publique d'un bien (`GET /api/public/properties/{slug}`) rend `agency.median_response_minutes` (entier ou `null`).

## Contraintes strictes (métier)

- Même valeur et même règle d'affichage que la fiche publique d'agence (aucune seconde définition) ; `null` sous le seuil de mesures de la tâche.
- Pas d'autre champ d'agence ajouté.

## Delta à produire

- [x] Sélection et ressource du bien public.
- [x] Test : `PublicPropertyAgencyResponseTimeTest`.

## Critères d'acceptation

- [x] AC1 — Pour un bien d'une agence à `median_response_minutes = 120`, la lecture publique rend `agency.median_response_minutes: 120` ; pour une agence sans mesure, `null`.
- [x] AC2 — La valeur est identique à celle de `GET` fiche publique de la même agence (test qui compare les deux).

## Hors périmètre

- L'écran (TCK-2936).

## Notes d'implémentation

- **Prémisse re-mesurée (2026-11-15)** : `PropertyResource::buildAgency()` rendait `id, name, slug, logo_url, verified, rating, kind` — pas le délai. `agencies.median_response_minutes` est chargé en entier par `show()` (`with('agency.media')`, aucune sélection réduite).
- **Livré** : `buildAgency()` rend `median_response_minutes`, lu sur la colonne même que sert `PublicAgencyController` (`index` et `show`). Aucune seconde définition : le seul écrivain reste `RefreshDirectoryResponseTimes` (fenêtre 90 j, `null` sous le seuil de `ResponseTimes`). Ce n'est PAS la route `response-time` de TCK-2871 (`median_hours`, seuil 10, plancher 1 h) : le ticket exige la valeur de la fiche d'agence, et c'est l'écran (TCK-2936) qui applique la règle d'affichage de la fiche d'agence.
- **Décision mineure** : la clé est ÉTALÉE seulement si la colonne est chargée sur l'agence (`array_key_exists` sur les attributs). Le bloc `agency` sort aussi dans les listes qui chargent la relation : sous une sélection réduite, la clé est omise plutôt qu'un `null` inventé (la règle `whenHas` du dépôt). Côté front, `PropertyAgencyLite.median_response_minutes?: number | null` déclaré.
- **Cache (ADR-0052)** : la fiche est cachée côté Next 300 s, étiquetée `property:{slug}`. Le job nocturne écrit par le constructeur de requêtes (aucun observateur, aucune invalidation) : la fiche du bien rattrape la nouvelle valeur en ≤ 5 min, ce qui est cohérent pour une valeur recalculée une fois par nuit. Aucune invalidation ajoutée.
- **Tests** : `tests/Feature/Public/PublicPropertyAgencyResponseTimeTest.php` (3 tests : 120, `null` avec clé présente, égalité avec `GET /api/public/agencies/{slug}` sur 95 et `null`). Ablation (valeur forcée à `null` dans la ressource) : 2 rouges sur 3, fichier restauré (md5 vérifié). Plus `PropertyDetailTest`, `PropertyResourceSparseFieldsTest`, les trois balayages et les trois gardes d'architecture : 48 verts. Pint propre, `scripts/check-*.mjs` tous verts.
