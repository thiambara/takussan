---
id: TCK-2672
title: "Modération, côté API : l'avis avec son sujet et son risque, la publication par lot, le bien à valider vu en entier"
status: todo
phase: P1
family: back
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2673]
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#11-review"
    - "docs/models-spec.md#3-property"
tags: [back, moderation, reviews, properties, audit-ux, app]
---

## Objectif utilisateur

L'admin vide la file des avis sans risque en un geste, juge un avis à risque en voyant le bien ou l'agent qu'il vise, et valide une annonce en la voyant entière, avec ce qui cloche.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- `GET /api/reviews` (écrit à la main) : filtres `moderation_status`, `reported`, `subject_type`, `author_id` ; tris `created_at`, `reported_count`, `rating`, `pending_first`. `target` est toujours rendu (`{title, slug, subtitle}` pour un bien), **sans photo du bien** ni agent du bien ; pour un avis d'agent, `target.title` est son nom. Décisions par `PATCH /api/reviews/{id}/moderate` (`approve|hide|delete|ignore`, `reason_code`). **Aucune notion de risque, aucune décision groupée** pour l'agence (`decide-batch` est réservé à la plateforme). La réponse publique existe (`POST|DELETE /api/reviews/{id}/reply`, `reply_content`).
- `GET /api/properties/moderation` : seulement `pending_review`, forme « liste » de `PropertyResource` : **ni description, ni photos** (`main_photo_url` seule) ; `owner.is_agent` (booléen) au lieu du profil réel ; `submitted_at` présent. Rejet : `POST …/reject` (`rejection_reason` 20-1000), statut `rejected`, que l'auteur renvoie par `resubmit`. **Aucun code de motif**. **Aucune médiane de prix** sur le catalogue (l'Observatoire du Radar calcule des médianes sur des annonces externes, réservé à la plateforme).

## Contraintes strictes (métier)

- Périmètre inchangé : l'admin d'agence ne modère que les avis de ses biens et de ses agents ; un avis sur l'agence ou un prestataire relève de la plateforme (TCK-597).
- **Risque, règle fermée et déterministe** (aucune IA ici) : un avis est `high` s'il a une note ≤ 3, ou au moins un signalement, ou des coordonnées dans son texte (numéro de téléphone sénégalais, avec ou sans `+221`, adresse e-mail, URL) ; sinon `low`. Les raisons sont rendues en codes (`low_rating`, `reported`, `contact_details`). Règle neuve : `spec-delta.md`.
- La publication par lot n'accepte que la décision `approve`, au plus 100 avis, tous modérables par l'appelant ; sinon 422 et **rien** ne change. Chaque avis publié est journalisé comme une décision unitaire.
- « Demander une correction » reste le rejet d'aujourd'hui (statut `rejected`, renvoi par l'auteur) : il gagne un code de motif obligatoire (`photos`, `price`, `address`, `description`, `other`), la raison de 20 caractères reste exigée.
- Liste de contrôle d'un bien : photos (≥ 5 attendues), adresse (quartier et position), description (nombre de mots, coordonnées présentes ou non), prix comparé à la médiane des biens **publiés** de même type, même transaction et même quartier (`geo_neighborhood_id`) — `null` quand moins de 5 biens comparables.
- Les avis restent sans donnée personnelle de leur auteur au-delà de ce que `ReviewResource` rend déjà.

## Delta à produire

- [ ] `ReviewResource` : `target.photo_url` (photo principale du bien) et `target.agent {id, name}` (agent principal du bien) ; `risk {level, reasons[]}`.
- [ ] `ReviewController::index` : `filter[risk]=high|low`, tri `risk`, `meta.risk_counts {high, low}` sur la file filtrée.
- [ ] `App\Services\Reviews\ReviewRiskClassifier` (règle ci-dessus, testée seule).
- [ ] `POST /api/reviews/moderate-batch` → `ReviewController::moderateBatch`, `ModerateReviewBatchRequest` (`review_ids[]` ≤ 100, `decision: approve`), transaction.
- [ ] `GET /api/properties/moderation/{property}` → forme détaillée (description, photos, adresse, prix, type, transaction), `submitted_by {id, name, profile: owner|agent|agency_admin}`, `submitted_count_in_agency`, `checks {photos_count, address_complete, description_words, description_has_contact, price_vs_median {median, deviation_pct, sample_size} | null}`.
- [ ] Migration `add_rejection_reason_code_to_properties` ; `RejectPropertyRequest` : `reason_code` requis ; la ressource du bien rejeté le rend à l'auteur.
- [ ] Tests : `ReviewRiskClassifierTest`, `ReviewModerationBatchTest`, `ReviewTargetSubjectTest`, `PropertyModerationDetailTest`, `PropertyModerationChecksTest`, extension de `PropertyRejectTest`.

## Critères d'acceptation

- [ ] AC1 — Un avis 5 ★ contenant « appelez-moi au 77 418 90 22 » est `high` avec `contact_details` ; un avis 4 ★ sans signalement ni coordonnées est `low`.
- [ ] AC2 — `filter[risk]=low` sur une file de 55 avis dont 4 à risque rend 51 avis, et `meta.risk_counts` vaut `{high: 4, low: 51}`.
- [ ] AC3 — Un lot de 12 avis `low` → 12 avis publiés et 12 entrées de journal ; un lot qui contient un avis d'une autre agence → 422 et aucun avis publié (relu en base).
- [ ] AC4 — Un avis sur un bien rend la photo principale du bien et le nom de son agent principal.
- [ ] AC5 — Le détail d'un bien soumis rend sa description et toutes ses photos ; `submitted_by.profile = owner` pour un bien déposé par un bailleur.
- [ ] AC6 — Avec 4 biens comparables, `price_vs_median` vaut `null` ; avec 6, il rend la médiane et l'écart en pourcentage.
- [ ] AC7 — `reject` sans `reason_code` → 422 ; avec, l'auteur relit le code et la raison sur son bien.

## Hors périmètre

- Le pré-tri par IA (injures, hors sujet) : `features.md` § 2.11, P3.
- La médiane tirée du Radar.
- Les écrans (TCK-2673).

## Notes d'implémentation

_(à remplir par implementing-specs)_
