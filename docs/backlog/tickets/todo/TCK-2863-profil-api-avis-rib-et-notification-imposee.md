---
id: TCK-2863
title: "Profil, côté API : la répartition des notes et le compte des avis en attente, l'avis à laisser après un bail clôturé, l'envoi du RIB d'un compte à confirmer, et la rangée « Vérification d'identité · Toujours envoyée » des préférences"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2864]
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#23-notifications"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#11-review"
    - "docs/models-spec.md#76-payoutmethod-"
tags: [back, profil, avis, versement, notifications, audit-ux, app]
---

## Objectif utilisateur

L'agent lit la répartition de ses notes et ce qui attend validation ; le locataire dont le bail est clos est invité à noter ; le bailleur envoie le RIB qui manque à son compte de versement ; et chacun voit, dans ses préférences, ce qui part toujours.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `GET` des avis reçus (`ReviewController::received`) : `data` + pagination — **ni répartition 5→1, ni compte « en attente de validation »** (TCK-2635 : « à proposer », et la répartition rangée en « donnée »).
- `GET /api/me/review-opportunities` (`ReviewController::opportunities`, `ReviewEligibility`) : **pas d'opportunité « bail clôturé »** (TCK-2635 a-4, carte `CarteAvisEnAttente`).
- `PayoutMethod` / `PayoutMethodVerification` : un compte bancaire « À confirmer » existe ; **aucun envoi de RIB** (TCK-2635 a-6 : « l'API ne connaît ni l'envoi d'un RIB »).
- Préférences de notification : **aucun événement « vérification d'identité »** réglable ni imposé ; tous les événements sont rendus, même ceux qu'une persona ne reçoit jamais (TCK-2636, ticket « — »).

## Contraintes strictes (métier)

- **Avis reçus** : `meta.distribution {5,4,3,2,1}` (avis approuvés seulement) et `meta.pending_count` (avis reçus non encore validés), sur l'ensemble filtré par ce que l'appelant peut voir, indépendamment de la page.
- **Bail clôturé** : `review-opportunities` gagne, pour le locataire, les baux terminés depuis moins de N jours (N en configuration, défaut 90) sans avis de sa part, `{kind: "lease_closed", lease {id, end_date, property_title}, target}` ; même règle d'éligibilité que les autres opportunités (`ReviewEligibility`, sans la recopier).
- **RIB** : `POST /api/me/payout-methods/{payoutMethod}/bank-statement` — un PDF ou une image (bornes de `MediaUploadRequest` pour les documents), privé (ADR-0029), sous step-up 2FA comme les autres écritures des moyens de versement (TCK-589) ; passe la vérification à « en revue ». Seulement pour un compte bancaire du titulaire.
- **Préférences** : le catalogue rend un événement `identity_verification` **imposé** (`locked: true`, canaux fixes) ; et chaque événement porte les personas qui le reçoivent, pour que l'écran masque ceux que la persona active ne reçoit jamais.
- Codes d'erreur neufs dans les langues de l'API (`LangGroupParity`).

## Delta à produire

- [ ] `meta.distribution`, `meta.pending_count` sur les avis reçus.
- [ ] Opportunité `lease_closed`.
- [ ] Envoi du RIB (route, FormRequest, collection privée, transition de vérification).
- [ ] Catalogue des préférences : événement imposé + personas destinataires.
- [ ] Tests `ReceivedReviewsMetaTest`, `LeaseClosedReviewOpportunityTest` (clos depuis 10 j → présent ; avis déjà laissé → absent ; clos depuis 200 j → absent), `PayoutMethodBankStatementTest` (sans 2FA → refus ; compte d'un autre → 403 ; mobile money → 422), `NotificationPreferencesCatalogTest`.

## Critères d'acceptation

- [ ] AC1 — Agent avec 4 avis 5★, 1 avis 3★ approuvés et 1 en attente : `meta.distribution = {5: 4, 4: 0, 3: 1, 2: 0, 1: 0}` (approuvés seulement : un avis en attente ne compte pas dans la répartition) et `meta.pending_count = 1`, à la page 1 comme à la page 2.
- [ ] AC2 — Locataire dont le bail a pris fin le 31 octobre : une opportunité `lease_closed` le nomme ; après son avis, elle disparaît.
- [ ] AC3 — Bailleur, compte bancaire « à confirmer », RIB PDF envoyé sous 2FA : 201 et la vérification passe « en revue » ; sans 2FA : refus du step-up.
- [ ] AC4 — Le catalogue rend `identity_verification` avec `locked = true` ; un agent ne reçoit pas les événements réservés au locataire dans la liste filtrée par persona.

## Hors périmètre

- Les écrans : TCK-2864.
- Le jour des reversements (« reversements du 5 de chaque mois ») : `payout_day` du mandat ou de l'agence, porté par TCK-2909 / TCK-2915 (famille 4).

## Notes d'implémentation

Livré le 2026-11-15 (agent, arbre `takussan-manques`). Chaque règle a un test vérifié rouge sans son correctif (ablation, restauration prouvée par md5).

**Avis reçus (AC1)** — `meta.distribution {5..1}` et `meta.pending_count` sur `GET /api/reviews/received`.
- Prémisse qui différait : `ReceivedReviews::for()` ne rend à un agent (non admin) QUE les avis publiés. Un compte « sur ce que l'appelant voit » donnait 0 en attente, contre l'AC1. Ajout de `ReceivedReviews::pendingFor()` (même `targetsActor`, + l'agence de l'admin) : seul le NOMBRE sort, jamais le contenu.
- « Approuvé » = `is_approved` (comme la note de la fiche publique ; un avis signalé reste publié). Les filtres sujet/réponse valent pour les deux comptes ; `filter[status]` non (il choisit l'onglet).

**Bail clôturé (AC2)** — `ReviewEligibility::closedLeaseOpportunities()`, rendu sous une clé SŒUR `lease_closed` de `GET /api/me/review-opportunities` (et non dans `data`) : chaque ligne de `data` garde sa forme `{type, subject, context}` que lit le front (`ReviewOpportunity`). Forme : `{kind: 'lease_closed', lease {id, end_date, property_title}, target}`, `target` étant l'opportunité « bien » du bail, à poster telle quelle.
- Clos = `terminated` (date `terminated_at`) ou `expired` (date `end_date`) ; fenêtre `config('reviews.lease_closed_window_days')` = 90 (fichier `config/reviews.php`, sans clé d'env). Disparaît dès que le locataire a noté le bien (même règle « déjà noté » que `opportunities()`).
- Écart avec la maquette : la carte `CarteAvisEnAttente` montre « Ousmane Niang, locataire » (le bailleur noterait son locataire) ; le ticket dit « pour le locataire », suivi tel quel — aucun avis sur un locataire n'existe (ADR-0043).

**RIB (AC3)** — `POST /api/me/payout-methods/{payoutMethod}/bank-statement` (`StorePayoutMethodBankStatementRequest`, titulaire seul ; pdf/jpg/jpeg/png/webp ≤ `MediaUploadRequest::MAX_DOCUMENT_KB`), sous step-up (`ProtectedActions::STEP_UP`). Compte mobile money → 422 `payout.bank_statement_bank_only`.
- « En revue » n'est PAS une ligne de `payout_method_verifications` (dont l'existence vaut « vérifiée » et autorise le versement) : colonne `payout_methods.bank_statement_submitted_at` (migration `2026_11_15_286300`), informative. `PayoutMethodResource` gagne `verification_status` (`verified` | `in_review` | `to_confirm`), `bank_statement_submitted_at`, `bank_statement_media_id`. Aucun ADR : rien ne change de ce que vérifie `isVerifiedFor` (ADR-0039 §6).
- `PayoutMethod` porte la collection privée `bank_statement` (ligne ajoutée à `MediaDiskCollectionsTest::EXPECTED`). Changer nature/numéro/titulaire retire le RIB et la date (le RIB était celui de l'ancien compte).
- Défaut voisin corrigé : le personnel qui vérifie ne pouvait pas lire la pièce (`MediaPolicy::sign` ne connaissait que `user_id`/`agency_id`). `sign` accepte désormais, pour la seule collection `bank_statement`, qui détient `PayoutMethodPolicy::verify` ; `delete` reste au titulaire.

**Préférences (AC4)** — `catalog` dans `GET /api/me/notification-preferences` (`App\Domain\Notifications\PreferenceCatalog`), `?persona=` (FormRequest `ShowNotificationPreferencesRequest`) le filtre. `events` et la matrice sont INCHANGÉS (des tests figent `events === EVENTS`, et tout `EVENTS` devient réglable par `updateMany()`).
- `identity_verification` = le verdict KYC `kyc_status_changed`, déjà CRITIQUE (in-app + e-mail toujours) : `locked: true`, `channels: [inapp, email]`, `reason: always_sent`. Un test prouve qu'une préférence coupée n'arrête pas l'envoi.
- Personas : table DÉCLARÉE (noms de `takussan-web/src/lib/navigation/personas.ts`), recensée par test contre `PreferenceResolver::EVENTS`. Aucune source n'existait (`NotificationClassification` ne porte pas de destinataire).

**Avatar (ajout de périmètre, trouvé par TCK-2862)** — `PublicAgentController::show()` servait `$agent->avatar_url` (inexistant → toujours null) : sert `avatarUrl()` (miniature), `media` préchargé. Même défaut corrigé dans l'équipe de `PublicAgencyController` (ligne 422). Test `PublicAvatarDeLaFicheTest`, rouge avant le correctif sur les deux.

**Hors ticket, constaté** : `scripts/check-models-spec.mjs` rouge sur `ConversationReport` (TCK-2859, déjà commité) — spec, à reporter par `/sync-specs`.
