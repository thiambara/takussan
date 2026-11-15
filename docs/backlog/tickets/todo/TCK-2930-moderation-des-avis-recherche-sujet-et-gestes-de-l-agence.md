---
id: TCK-2930
title: "Modération des avis : chercher dans la file, lire les autres avis et la note du sujet, et — si le porteur amende ADR-0043 — « Supprimer » et « Ignorer les signalements » pour l'admin d'agence"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2931]
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
tags: [back, moderation, avis, recherche, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin retrouve un avis par le bien, l'auteur ou l'agent, le juge en voyant ce que le même sujet a reçu d'autre, et agit sur les avis que la maquette lui confie.

## Contrat de données

Écarts acceptés de TCK-2673 (`b-0`, `b-1`, « contrat de données ») sans ticket. Relevé du 2026-11-15 : `ReviewController@index` filtre par `author_id` et `moderation_status`, sans recherche (lu, `:65-88`). Selon l'audit (non re-mesuré ici, à confirmer en tête d'implémentation) : le détail ne porte ni les autres avis du sujet ni sa note moyenne ; « Locataire depuis … » n'est rendu que parfois.

- `GET /api/reviews?filter[search]=…` : recherche insensible à la casse (`App\Support\CaseInsensitive`) sur le titre et la référence du bien, le nom de l'auteur, le nom de l'agent noté ; dans le périmètre déjà filtré côté serveur (ADR-0043).
- `GET /api/reviews/{review}/subject-summary` (`ReviewSubjectSummaryController`, même policy que le détail) : `subject.average_rating` et `subject.reviews_count` (avis publiés du même sujet, quel que soit son type : bien, agent, agence, prestataire), et les 3 derniers autres avis publiés du sujet (note, extrait, date).
- `author.tenant_since` : date de début du premier bail de l'auteur dans l'agence du sujet, quand il existe, pour tout avis.
- **Sous condition d'ADR** : « Supprimer » et « Ignorer les signalements » ouverts à l'admin d'agence (persona `admin` de la maquette `app-moderation`, écran e1).

## Contraintes strictes (métier)

- [ADR-0043](../../../adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md) réserve aujourd'hui « retirer, ignorer des signalements et supprimer » à la plateforme (motif : **juge et partie**). Ouvrir ces gestes à l'admin d'agence **contredit cet ADR** : le premier item du delta est l'amendement, soumis au porteur. S'il le refuse, AC4 est retiré et la fiche TCK-2673 garde l'écart avec ce motif — rien d'autre du ticket n'en dépend.
- La recherche reste bornée au périmètre du modérateur (un admin de l'agence A ne trouve jamais un avis de B).
- Les autres avis du sujet ne rendent que des avis publiés, jamais l'e-mail d'un signalant.

## Delta à produire

- [ ] Amendement d'ADR-0043 (gestes de l'admin d'agence sur un avis), soumis au porteur avant tout code de AC4.
- [ ] `filter[search]` sur la file des avis.
- [ ] Résumé du sujet (moyenne, compte, 3 derniers autres avis) et `tenant_since`.
- [ ] Si l'amendement est accepté : `ReviewModerationScope` / `ReviewPolicy` ouvrent `delete` et `dismissReports` à l'admin d'agence dans son périmètre, avec motif journalisé.
- [ ] Tests : `ReviewModerationSearchTest`, `ReviewSubjectSummaryTest`, `ReviewAgencyAdminDeleteTest` (si AC4).

## Critères d'acceptation

- [ ] AC1 — `filter[search]=sacré` trouve un avis sur le bien « Villa Sacré-Cœur » de l'agence A pour l'admin de A ; l'admin de B ne le trouve pas ; `filter[search]=SACRÉ` trouve le même avis ; `filter[search]=ndiaye` trouve un avis dont l'auteur s'appelle « Fatou Ndiaye ».
- [ ] AC2 — Le détail d'un avis sur un bien qui a 12 avis publiés de moyenne 4,2 rend `average_rating: 4.2`, `reviews_count: 12` et 3 autres avis (jamais l'avis lui-même, jamais un avis non publié). Même chose pour un avis sur un agent.
- [ ] AC3 — Un avis d'un auteur locataire depuis mars 2025 dans l'agence du sujet rend `tenant_since: 2025-03-…` ; sans bail, `null`.
- [ ] AC4 — (Si ADR-0043 est amendé.) L'admin de A supprime un avis publié sur un bien de A avec un motif (journalisé) et ignore ses signalements ; il reçoit 403 sur un avis visant l'agence A elle-même si l'amendement garde cette exception, et 403 sur un avis de B.

## Hors périmètre

- L'écran (TCK-2931).

## Notes d'implémentation

_(à remplir par implementing-specs)_
