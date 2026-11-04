---
id: TCK-2476
title: "Recherche : l'IA tient chaque semaine les variantes d'écriture (Wakam → Ouakam, appart, F4) à partir des recherches sans résultat"
status: todo
phase: P2
family: back
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2472, TCK-2474]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [api, search, suggestion, ia, adr-0088]
---

## Objectif utilisateur

La recherche comprend de mieux en mieux la façon dont les gens écrivent, sans que personne n'ait à tenir un dictionnaire.

## Contrat de données

- Migration `create_search_aliases_table` : `id`, `alias` (string 80, replié), `target_kind` (`city` | `neighborhood` |
  `property_type` | `term`), `target_value` (string), `target_city` (string null), `origin` (`ai` | `manual`), `status`
  (`active` | `rejected`), `evidence` (jsonb : visiteurs distincts, période), timestamps ; unique (`alias`, `target_kind`,
  `target_value`).
- Usage IA `search.variantes` (rôle `extraction`, plafond quotidien modeste) : entrée = saisies normalisées sans résultat
  du journal (≥ 2 visiteurs distincts sur 30 jours, au plus 200) + la liste des entités connues (lieux, types, termes) ;
  sortie = `[{alias, target_kind, target_value, target_city?, confidence}]`.
- Commande `search:refresh-aliases` (hebdomadaire, idempotente) ; les alias actifs alimentent `DatabasePlaceLexicon`
  (TCK-2473) et l'index des suggestions (TCK-2474).
- Routes `GET /api/admin/search/aliases` (pagination, `filter[status]`, `filter[origin]`) et `PATCH
  /api/admin/search/aliases/{alias}` (`{status}`) — super-admin (`platform.*` existant le plus proche, à re-mesurer).

## Contraintes strictes (métier)

- **Une variante n'est retenue que si sa cible existe** (lieu du référentiel, type de `PropertyType`, terme du vocabulaire
  de TCK-2473) ; sinon écartée.
- Une variante `rejected` ne revient jamais par l'IA ; une variante `manual` n'est jamais modifiée par l'IA.
- Aucune donnée personnelle dans l'entrée : les saisies retenues ont déjà passé les exclusions d'ADR-0088 §3.

## Delta à produire

- [ ] Migration, modèle `SearchAlias`, usage et agent, service `SearchAliasCurator`, commande planifiée, contrôleur,
      FormRequest, ressource.
- [ ] Tests : `SearchAliasCuratorTest` (passerelle simulée : cible inexistante écartée, `rejected` jamais rouvert,
      `manual` intact), et « après `wakam → Ouakam`, `q=wakam` interprète `location=Ouakam` ».

## Critères d'acceptation

- [ ] AC1 — Une proposition vers un quartier inexistant n'est pas enregistrée.
- [ ] AC2 — Une variante rejetée n'est pas recréée au passage suivant.
- [ ] AC3 — Une variante active est comprise par le parseur et trouvée dans l'index des suggestions.

## Hors périmètre

- Une page de console pour les variantes (l'API suffit pour l'instant).

## Notes d'implémentation

_(à remplir)_
