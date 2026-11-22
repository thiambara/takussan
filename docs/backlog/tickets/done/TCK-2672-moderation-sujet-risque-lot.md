---
id: TCK-2672
title: "Modération, côté API : l'avis avec son sujet et son risque, la publication par lot, le bien à valider vu en entier"
status: done
phase: P1
family: back
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-11
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

- [x] `ReviewResource` : `target.photo_url` (photo principale du bien) et `target.agent {id, name}` (agent principal du bien) ; `risk {level, reasons[]}`.
- [x] `ReviewController::index` : `filter[risk]=high|low`, tri `risk`, `meta.risk_counts {high, low}` sur la file filtrée.
- [x] `App\Services\Reviews\ReviewRiskClassifier` (règle ci-dessus, testée seule).
- [x] `POST /api/reviews/moderate-batch` → `ReviewController::moderateBatch`, `ModerateReviewBatchRequest` (`review_ids[]` ≤ 100, `decision: approve`), transaction.
- [x] `GET /api/properties/moderation/{property}` → forme détaillée (description, photos, adresse, prix, type, transaction), `submitted_by {id, name, profile: owner|agent|agency_admin}`, `submitted_count_in_agency`, `checks {photos_count, address_complete, description_words, description_has_contact, price_vs_median {median, deviation_pct, sample_size} | null}`.
- [x] Migration `add_rejection_reason_code_to_properties` ; `RejectPropertyRequest` : `reason_code` requis ; la ressource du bien rejeté le rend à l'auteur.
- [x] Tests : `ReviewRiskClassifierTest`, `ReviewModerationBatchTest`, `ReviewTargetSubjectTest`, `PropertyModerationDetailTest`, `PropertyModerationChecksTest`, extension de `PropertyRejectTest`.

## Critères d'acceptation

- [x] AC1 — Un avis 5 ★ contenant « appelez-moi au 77 418 90 22 » est `high` avec `contact_details` ; un avis 4 ★ sans signalement ni coordonnées est `low`.
- [x] AC2 — `filter[risk]=low` sur une file de 55 avis dont 4 à risque rend 51 avis, et `meta.risk_counts` vaut `{high: 4, low: 51}`.
- [x] AC3 — Un lot de 12 avis `low` → 12 avis publiés et 12 entrées de journal ; un lot qui contient un avis d'une autre agence → 422 et aucun avis publié (relu en base).
- [x] AC4 — Un avis sur un bien rend la photo principale du bien et le nom de son agent principal.
- [x] AC5 — Le détail d'un bien soumis rend sa description et toutes ses photos ; `submitted_by.profile = owner` pour un bien déposé par un bailleur.
- [x] AC6 — Avec 4 biens comparables, `price_vs_median` vaut `null` ; avec 6, il rend la médiane et l'écart en pourcentage.
- [x] AC7 — `reject` sans `reason_code` → 422 ; avec, l'auteur relit le code et la raison sur son bien.

## Hors périmètre

- Le pré-tri par IA (injures, hors sujet) : `features.md` § 2.11, P3.
- La médiane tirée du Radar.
- Les écrans (TCK-2673).

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-agence, lot audit UX /app). Prémisses re-mesurées sur l'arbre : aucune notion de risque ni de lot côté agence, pas de code de motif, pas de détail de bien soumis — conformes au contrat ci-dessus.

- **Coordonnées** — `App\Support\ContactDetails` : UNE définition (mobile 70/75/76/77/78 et fixe 30/33, avec ou sans `+221`/`00221`, groupés par espaces, points ou tirets ; e-mail ; URL ou domaine nu en `.com|.sn|.net|.org|.fr|.io|.co|.info|.biz|.me`), lue en PHP (`found()`) et en SQL (`sql()`, `~*` de PostgreSQL). Les motifs sont écrits pour être compris à l'identique par les deux moteurs ; `ContactDetailsParityTest` passe 21 exemples par les deux. Un prix n'est pas un numéro : neuf chiffres suivis d'une devise (`F`, `FCFA`, `CFA`, `XOF`, `francs`) ne comptent pas — « 780 000 000 FCFA » a la forme d'un mobile.
- **Risque** — `App\Services\Review\ReviewRiskClassifier` (écart de nom : `Services\Review`, le dossier qui existe déjà, et non `Services\Reviews`). Calculé, jamais stocké : `classify()` pour une ligne, `highSql()` pour la file (filtre, tri, comptes). `meta.risk_counts` porte sur la file filtrée **avant** le filtre de risque (les deux pastilles se lisent ensemble). `sort=risk` met les avis à risque **d'abord**, `sort=-risk` les sans risque d'abord. `risk` n'est rendu qu'à qui peut `viewReports` l'avis (le modérateur de son périmètre) : absent pour l'auteur et le public — la clé est inscrite aux `CLES_JAMAIS_ATTEINTES` de `DateInventoryByValueTest`. Le filtre, le tri et les comptes restent ouverts sur la liste de l'auteur (`filter[author_id]=me`) : rien n'y est révélé, l'auteur lit déjà la note, le texte et `reported_count` de ses propres avis.
- **Sujet** — `target.photo_url` par `PublicPhotoUrl::upTo(…, 'preview')` (jamais l'original), `target.agent {id, name}` par `PrimaryPropertyContact::collaborateurPrincipal()` ; préchargés par `morphWith` (médias et contact principal), une fois par page.
- **Lot** — `POST /api/reviews/moderate-batch` (`reviews.moderate-batch`), autorisé par `viewModerationQueue`. `ReviewModerationService::approveBatch()` : une transaction, lignes verrouillées dans l'ordre des identifiants, **toutes** les vérifications (existence, `pending`, `canModerate` approve) avant la première écriture, sinon 422 `review.batch_not_moderatable` et rien ne change. Seuls les avis **en attente**, même pour la plateforme (un avis signalé se tranche à l'unité, avec son motif). Chaque avis est publié par `approve()` comme une décision unitaire et journalisé `review.moderated` `{decision: approve, batch: true, batch_size}`. ⚠ La décision unitaire (`PATCH …/moderate`) n'écrit, elle, **aucun** journal : « journalisé comme une décision unitaire » s'est lu « une ligne par avis », et la décision unitaire n'a pas été touchée. 2FA exigée des profils plateforme (`PLATFORM_TWO_FACTOR`), jamais de l'admin d'agence — comme la décision unitaire.
- **Détail d'un bien soumis** — `GET /api/properties/moderation/{property}` (`properties.moderation.show`, déclarée après la liste), gardé par `reject-property` + `AgencyKindGuard`, rendu par `PropertyModerationDetailResource`. `submitted_by` = l'auteur du dernier passage en `pending_review` relevé au journal (`Auditable`), à défaut le titulaire (`user_id`) ; le profil est jugé dans l'agence du bien (`agency_admin`, puis `agent`, sinon `owner`). `submitted_count_in_agency` = les biens de l'agence que cette personne a mis en revue ou dont elle est titulaire, celui-ci compris, chacun une fois.
- **Médiane** — `PropertyModerationChecks::priceVsMedian()` : `percentile_cont(0.5)` sur les biens **en ligne** (`scopePublic()`, la règle du public), même type, même transaction, **même période de loyer** pour une location (un loyer journalier ne se compare pas à un mensuel — précision ajoutée à la règle), même `geo_neighborhood_id`, prix > 0, le bien lui-même exclu ; `null` sous 5 comparables. Sur la base de démo, seules des locations mensuelles existent (73 lignes, médiane 1 220 000).
- **Motif codé** — migration `2026_11_11_160000_add_rejection_reason_code_to_properties` (string(20), nullable ; `down()` éprouvé sur une base jetable : up → down → up). `RejectPropertyRequest::REASON_CODES` ; `reason_code` requis. Le code est effacé à l'approbation, au renvoi, et au verrou plateforme (`hold`). `PropertyResource` le rend sous la même garde que `rejection_reason`.
- Tests : `PropertyRejectTest` n'existe pas — c'est `PropertyModerationTest` qui est étendu (code requis, relu par l'auteur, effacé à l'approbation et au verrou) ; `ModerationDAgenceExigePublierTest` passe le code.
- ⚠ **Le front casse jusqu'à TCK-2673** : l'écran de modération (`rejectProperty` de `takussan-web/src/lib/queries/property-moderation.ts`, seul appelant : `components/admin/PropertyModerationDetail.tsx`) poste `reject` sans `reason_code` → 422.
- À reporter par `/sync-specs` : `properties.rejection_reason_code` (models-spec), la règle de risque d'un avis, les deux routes neuves.
