---
id: TCK-2722
title: "Le nombre de signalements d'un avis ne se lit que par qui le modère"
status: done
phase: P1
family: back
estimate: S
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2672]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
tags: [back, avis, moderation, confidentialite, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'auteur d'un avis, et le public qui le lit sur une fiche, n'apprennent pas combien de fois l'avis a été signalé ; le
modérateur, lui, le lit toujours.

## Contexte

Suivi de TCK-2672 (risque d'un avis au seul modérateur). Relevé sur l'arbre du lot 1 :

- `ReviewResource` sert `reported_count` **à tout lecteur** : l'auteur (`GET /api/reviews?filter[author_id]=me`) et le
  public (`PublicPropertyController`, `PublicAgencyController`, `PublicAgentController`, qui rendent les avis
  `is_approved = true`). Avec la note et le texte, le risque que TCK-2672 réserve au modérateur se recalcule en partie.
- Sous `filter[author_id]=me`, `ReviewController::index` applique encore `filter[reported]=1`
  (`reported_count > 0`) et le tri `reported_count` — par défaut `-reported_count,-created_at`.
- **Ce que ce ticket ne ferme pas, mesuré** : `ReviewReportService::REPORTED_THRESHOLD = 1` — le premier signalement fait
  passer l'avis au statut `reported` (`Approved → Reported` est permis), et `status` est servi à tous ; l'auteur peut aussi
  filtrer `filter[moderation_status]=reported|flagged`, trier `pending_first`, et `meta.pending_count` compte les
  `reported`. Tant que l'avis est `reported`, l'auteur le sait par là. Ce que le ticket ferme : **le nombre** de
  signalements, et **la trace** d'un signalement après que le modérateur a ré-approuvé l'avis (statut redevenu
  `approved`, `reported_count` resté > 0), pour l'auteur comme pour le public. Un `reported` approuvé garde
  `is_approved = true` (le signalement ne le touche pas) : le public lit aujourd'hui son `status` et son compte.
- Front : seuls `ModerationQueueList` et `ModerationDetail` lisent `reported_count` (lecteurs modérateurs) ; le type de
  `lib/queries/reviews.ts` le déclare sans qu'aucun composant de l'auteur ne le lise.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tout »).**

- **a) (recommandé)** `reported_count` au seul lecteur qui passe `viewReports` sur l'avis ; `filter[reported]` et
  `sort=reported_count` sans effet sous `filter[author_id]=me` (tri par défaut de l'auteur : `-created_at`).
- b) statu quo.

La question voisine — l'auteur et le public doivent-ils lire le statut `reported` — reste ouverte (« Hors périmètre ») :
la trancher est une autre décision.

## Contrat de données

- `ReviewResource.reported_count` : clé **absente** pour un lecteur sans `viewReports` sur l'avis (même forme que `risk`,
  TCK-2672) ; inchangée pour le modérateur et le super-admin.
- `GET /api/reviews?filter[author_id]=me` : `filter[reported]` ignoré, `reported_count` retiré des tris acceptés, tri par
  défaut `-created_at`. La file de modération (hors filtre de l'auteur) est inchangée.

## Contraintes strictes (métier)

- Le jugement est `viewReports` **sur l'avis**, la règle de `GET …/reports` et de `risk` — pas le profil actif seul.
- Les pages publiques ne gagnent ni ne perdent aucun avis : seule la clé disparaît.

## Delta à produire

- [ ] `ReviewResource` : `reported_count` sous `$this->when($viewer?->can('viewReports', …))`.
- [ ] `ReviewController::index` : en mode auteur, `filter[reported]` ignoré, `reported_count` hors des tris, défaut
      `-created_at`.
- [ ] Type du front (`lib/queries/reviews.ts`) : `reported_count?` facultatif.
- [ ] Tests : `ReviewReportedCountVisibilityTest`.

## Critères d'acceptation

- [ ] AC1 — Avis de l'auteur U signalé deux fois puis ré-approuvé par le modérateur (`status = approved`,
      `reported_count = 2`) : dans `GET /api/reviews?filter[author_id]=me` (U) et sur la fiche publique du bien, la ligne
      n'a **pas** de clé `reported_count` ; pour le modérateur de l'agence, `reported_count = 2`.
- [ ] AC2 — U a deux avis approuvés, A (jamais signalé) et B (signalé puis ré-approuvé) : `filter[author_id]=me&filter[reported]=1`
      rend A et B, comme sans le filtre.
- [ ] AC3 — Même décor, A plus récent que B : `filter[author_id]=me` (tri par défaut) rend A puis B ;
      `…&sort=-reported_count` rend aussi A puis B.
- [ ] AC4 — File de modération (`viewModerationQueue`) : `filter[reported]=1` et `sort=-reported_count` inchangés.

## Hors périmètre

- Le statut `reported` servi à l'auteur et au public, `filter[moderation_status]=reported|flagged` et `pending_first`
  sous le filtre de l'auteur, et `meta.pending_count` de l'auteur : tant que l'avis est `reported`, l'auteur le sait par
  eux (seuil à 1 signalement). À trancher à part.
- La boîte des avis **reçus** (`ReviewController::received`, `IndexReceivedReviewsRequest`, qui offre
  `filter.status=reported`) : la personne notée lit le statut de ses avis reçus ; à juger avec la question du statut.
- Le seuil `REPORTED_THRESHOLD`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
