---
id: TCK-2518
title: Profil public enrichi : accroche, « Pourquoi nous », sélection et couverture de l'agence ; langues, quartiers et délai de réponse
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2521, TCK-2522, TCK-2523, TCK-2524]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#35-agentprofile-"
tags: [back, directory, agence, audit-ux]
---

## Objectif utilisateur

Le chercheur choisit une agence ou un agent sur ce qui compte à Dakar — la langue, le quartier, la rapidité de réponse — et l'agence a une vitrine qui la vend sans photo à fournir.

## Contrat de données

1. **Agence** (`agencies`) : `tagline` string(120), `highlights` jsonb (trois chaînes ≤ 80), `showcase_property_ids` jsonb (≤ 6 biens de l'agence), `median_response_minutes` integer — cf. `spec_refs.models`.
2. **Agent** (`agent_profiles`) : `languages` jsonb (codes d'une liste fermée en config, `directory.languages`), `neighborhood_ids` jsonb (≤ 5, référentiel `geo_neighborhoods`), `median_response_minutes` integer.
3. **Écriture** : `PATCH /api/agencies/{agency}` accepte `tagline`, `highlights`, `showcase_property_ids` (capacité de configuration de l'agence existante ; un id qui n'est pas un bien de l'agence → 422) ; l'agent écrit `languages` et `neighborhood_ids` sur son propre profil (endpoint de profil existant, ou `PATCH /api/me/agent-profile` s'il n'y en a pas — à relever).
4. **Lecture publique** (`GET /api/public/agencies`, `/agencies/{slug}`, `/agents`, `/agents/{slug}`) : émet ces champs ; `cover` = trois photos de biens **publics** de l'agence (la sélection d'abord, sinon les plus récents), jamais un bien non public ; `showcase` = les biens de la sélection encore publics ; `leases_signed_this_month` (agence) = baux signés depuis le 1er du mois, compté à la lecture ; `median_response_minutes` (`null` sous cinq conversations) ; langues et quartiers (libellés côté front, codes et ids côté API).
5. **Délai de réponse** : job nocturne idempotent (`routes/console.php`, commentaire TCK) — médiane, sur 90 jours, du délai entre le premier message d'un visiteur dans une conversation ouverte depuis le site public et la première réponse d'un membre de l'agence (pour l'agent : la sienne) ; sous cinq conversations, `null`.

## Direction UX / Artistique

Sans objet (back). Maquettes servies : `p=annuaire`, `p=agence`, `p=agent`, approche D.

## Contraintes strictes (métier)

- Tous ces champs sont facultatifs : la fiche se passe de ce qui manque, sans trou.
- Le délai est une médiane honnête : jamais affiché sous le seuil, jamais une moyenne qu'une réponse lente fausse.
- Aucun numéro personnel d'agent dans une réponse d'annuaire (règle existante de `ProfileCard`).
- Migration réversible.

## Delta à produire

- [ ] Migration (agences, profils d'agent).
- [ ] Écriture (FormRequest, autorisation par capacité dans `authorize()`), validation des ids de sélection et de quartiers.
- [ ] Lecture publique : champs, `cover`, `showcase`, `leases_signed_this_month`.
- [ ] Job du délai de réponse + entrée planifiée commentée.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Une sélection qui contient un bien devenu loué émet les autres seulement, et `cover` ne contient aucune photo de bien non public.
- [ ] AC2 — `showcase_property_ids` avec le bien d'une autre agence → 422, rien d'écrit.
- [ ] AC3 — Quatre conversations répondues : `median_response_minutes: null` ; cinq : la médiane, à la minute.
- [ ] AC4 — Deux exécutions du job à la suite rendent le même état (idempotence).
- [ ] AC5 — Une agence sans accroche ni sélection émet `tagline: null`, `highlights: []` et une `cover` tirée de ses trois biens les plus récents.

## Hors périmètre

- Les écrans de saisie dans la console (TCK-2524) et les fiches publiques (TCK-2521 à TCK-2523).

## Notes d'implémentation

_(à remplir par implementing-specs)_
