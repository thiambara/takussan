---
id: TCK-098
title: "Modération & validation avant publication bien"
status: done
phase: P2
family: applicatif
estimate: M
wave: 11
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-034, TCK-067]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#3-property
tags: [back, front, moderation, property, admin]
---

## Objectif utilisateur

Permettre à un Admin d'agence de **valider ou rejeter** chaque nouvelle
publication de bien soumise par un Agent avant qu'elle ne devienne visible
sur le site public, afin de garantir la qualité et la conformité des
annonces.

## Contrat de données

**Backend — endpoints à exposer :**

- `GET /api/admin/properties/moderation` — file d'attente paginée des biens
  en attente (filtrage `filter[status]=pending_review`, `filter[search]`,
  tri par `submitted_at`).
- `POST /api/admin/properties/{property}/approve` — approuve, transitionne
  vers `active` (ou état précédemment voulu par l'agent), enregistre
  `approved_by` + `approved_at`.
- `POST /api/admin/properties/{property}/reject` — rejette avec
  `rejection_reason` (texte requis), transitionne vers `rejected`,
  enregistre `rejected_by` + `rejected_at`.
- `POST /api/admin/properties/{property}/resubmit` — l'agent corrige et
  resoumet → `pending_review`.
- Hook sur la création / activation d'un Property : si la flag agence
  `properties.moderation_required` est activée, status → `pending_review`
  au lieu de `active`. Sinon comportement actuel inchangé.

Ajouter au modèle Property (cf. `spec_refs.models`) : champs de modération
déjà prévus (`status`, `rejection_reason`, `submitted_at`, `approved_at`,
`rejected_at`, `approved_by_user_id`, `rejected_by_user_id`).

**Frontend — endpoints à consommer :** ceux ci-dessus + lecture de
`AgencySetting.moderation_required` exposée dans le bundle de config
agence (TCK-064).

## Direction UX / Artistique

**Page Admin `/admin/moderation/properties`** : queue type "inbox" — liste
gauche (cards compactes : photo, titre, agent, date soumission, badge
`pending`), panneau droit avec preview complète du bien (photos, infos,
amenités) + 2 CTA : `Approuver` (vert) et `Rejeter` (rouge avec dialog
demandant raison obligatoire ≥ 20 caractères).

Badge global dans la sidebar admin (`Modération (N)`) avec count temps
réel via polling léger ou refresh sur navigation.

**Côté Agent** : sur la fiche d'édition de bien, bandeau d'état clair selon
status : `pending_review` (orange "En attente de validation"),
`rejected` (rouge avec raison + bouton `Corriger et resoumettre`),
`active` (vert).

## Contraintes strictes (métier)

- Seuls les rôles `agency_admin` ou `super_admin` peuvent approuver /
  rejeter (Policy `PropertyModerationPolicy`).
- La modération est **toggleable par agence** via
  `AgencySetting.moderation_required` (bool, défaut `false`). Si désactivée,
  le workflow reste celui d'avant ce ticket — pas de breaking change.
- Un bien `rejected` ne doit **jamais** apparaître dans les résultats de
  recherche publics ni sur la fiche publique.
- La raison de rejet est **obligatoire**, longueur min 20 caractères,
  max 1000.
- Toute transition de status est tracée via ActivityLog (TCK-018).
- Notification (TCK-022) envoyée à l'agent lors de approve / reject.

## Delta à produire

- [ ] Migration : `add_moderation_fields_to_properties` (si non couverts
      par TCK-034) + `add_moderation_required_to_agency_settings`.
- [ ] FormRequest : `RejectPropertyRequest` (validation `rejection_reason`).
- [ ] Policy : `PropertyModerationPolicy` (approve / reject).
- [ ] Service : `App\Services\Property\PropertyModerationService`.
- [ ] Controller : `Admin\PropertyModerationController` (index, approve,
      reject, resubmit).
- [ ] Routes : `routes/api/admin.php` namespace `admin/properties`.
- [ ] Hook sur `Property::saving` ou `PropertyCreated` event pour appliquer
      `pending_review` selon flag agence.
- [ ] Notifications : `PropertyApprovedNotification`,
      `PropertyRejectedNotification`.
- [ ] Page admin `/admin/moderation/properties` (queue + preview panel).
- [ ] Bandeau d'état sur la fiche d'édition agent.
- [ ] Toggle `moderation_required` dans la page settings agence (TCK-064).
- [ ] Tests : `PropertyModerationTest` (5 scénarios — submit, approve,
      reject, resubmit, flag-off bypass).

## Critères d'acceptation

- [ ] AC1 — agence avec `moderation_required=true` : nouveau bien créé →
      status `pending_review`, non visible publiquement.
- [ ] AC2 — agence avec `moderation_required=false` : comportement
      inchangé, bien créé en `active`.
- [ ] AC3 — `POST /approve` par un admin → status `active`,
      `PropertyApprovedNotification` reçue par l'agent.
- [ ] AC4 — `POST /reject` sans `rejection_reason` (ou < 20 chars) → 422.
- [ ] AC5 — `POST /reject` valide → status `rejected`, notification envoyée
      avec raison, bien retiré des résultats publics.
- [ ] AC6 — agent peut corriger un bien `rejected` et le resoumettre →
      status `pending_review`.
- [ ] AC7 — un agent d'une autre agence ne peut pas approuver / rejeter
      (403 + Policy).
- [ ] AC8 — chaque transition génère une entrée ActivityLog (TCK-018).

## Hors périmètre

- Modération automatique par IA / règles (P3).
- File d'attente multi-niveaux (modérateur → admin) — un seul niveau ici.
- Modération des médias séparément du bien (P3).
- Modération côté super-admin global — scope par agence ici.

## Notes d'implémentation

- `moderation_required` est une colonne booléenne directe sur `agencies` (pas dans le JSON `settings`), pour des requêtes propres dans le `PropertyObserver`.
- Le hook de modération est dans `PropertyObserver::creating()` (pas `saving`) pour ne pas intercepter les mises à jour postérieures à la création.
- Les gates de modération (`approve-property`, `reject-property`, `resubmit-property`) sont des gates nommées dans `AppServiceProvider` pour éviter la collision avec le `PropertyPolicy` déjà lié à `Property::class`.
- `PropertyModerationPolicy::canModerate()` vérifie le scope agence pour les `agency_admin` ; les `super_admin` sont exemptés via `Gate::before` global.
- Les champs de modération (`rejection_reason`, `*_at`, `*_by_user_id`) sont systématiquement inclus dans `PropertyResource` pour que le bandeau agent fonctionne sans second round-trip.
