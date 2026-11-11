---
id: TCK-2669
title: "Identité de l'agence, côté API : numéros des pièces, pièce qui expire remplaçable, demande refusée reprise, prix et usage de l'offre"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2670, TCK-2671, TCK-2681]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#42-kycdossier-"
    - "docs/models-spec.md#49-agencyupgraderequest-"
    - "docs/models-spec.md#43-plan-"
tags: [back, agency, kyc, upgrade, billing, audit-ux, app]
---

## Objectif utilisateur

L'agence ne saisit son identité légale qu'une fois, renouvelle une pièce avant qu'elle n'expire, renvoie une demande refusée sans tout retaper, et lit le prix de l'offre avant de décider.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- Identité légale de l'agence : `agencies.legal_name`, `ninea`, `rccm`, `legal_address` (`PATCH /api/agencies/{agency}`, interdits pour une agence `individual`), rendus en clair par `AgencyResource`.
- KYC (`kyc_dossiers`) : **fichiers seulement**, aucun numéro (types `rccm`, `ninea`, `director_id` ; `expires_at` exigé pour `director_id`). Statuts `pending`, `submitted`, `verified`, `rejected`. `KycWorkflowService::upload` refuse tout envoi sur un dossier `verified` (`kyc.locked`, 422) : pendant les relances J-30 / J-7, **le renouvellement est impossible** jusqu'à l'échéance, où `kyc:expire-dossiers` repasse le dossier en `pending`.
- Demande de passage en pro (`agency_upgrade_requests`) : `rc`, `ninea` et `rib_pro` **masqués** à la lecture (TCK-601), `review_comment` pour le refus ; `GET` (tri `-submitted_at`), `POST` (multipart, `statuts_doc`), `DELETE` (révoquer). Aucune reprise d'une demande refusée.
- Offre : `GET /api/me/subscription` rend `plan.monthly_price_xof` (Pro : 50 000) ; le catalogue des plans n'est lisible que par le super-admin (`/api/admin/plans`). `GET /api/me/quota` ne rend que les biens (`{limit, used, can_create}`) ; le nombre d'agents est contrôlé (`assertCanAddAgent`) mais **pas exposé** ; les succursales ne sont comptées nulle part.
- **L'approbation d'une demande de passage ne pose aucun abonnement** (`AgencyUpgradeReviewService`, `FlipAgencyKindOnUpgradeApproved` : rien sur le plan).

## Contraintes strictes (métier)

- **Une seule source de l'identité légale** : les colonnes `agencies.*`. Le KYC et la demande de passage la **reprennent** ; rien ne l'écrit en double sans geste explicite. Décision structurelle : [ADR-0104](../../../adr/0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md) « L'identité légale de l'agence n'a qu'une source ».
- Le numéro porté par une pièce KYC n'écrase jamais `agencies.*` ; la reprise vers les mentions légales est un geste de l'admin (front, TCK-2670). Aucun contrôle de forme du NINEA ou du RCCM (différé, D-68).
- Renouvellement : sur un dossier `verified`, seule la pièce du dirigeant **expirée ou expirant sous 30 jours** peut être remplacée ; le dossier passe `submitted` ; `agencies.is_verified` reste vrai jusqu'à l'échéance de l'ancienne pièce ; à l'échéance, `kyc:expire-dossiers` ne repasse pas en `pending` un dossier déjà `submitted` avec une pièce valide, mais retire `is_verified` comme aujourd'hui. Règle neuve : `spec-delta.md`.
- Reprise d'une demande refusée : seulement la dernière demande `rejected` de la même agence ; les champs absents (dont `ninea` et `rib_pro`, masqués) sont repris côté serveur ; les statuts sont toujours fournis à nouveau.
- Le prix affiché à l'hôte est celui du plan que l'approbation donnera ; tant que l'approbation n'en pose aucun, ce plan est désigné par configuration (`billing.upgrade_plan_code`, défaut `pro`) — l'approbation **pose l'abonnement** à ce plan (décidé par le porteur le 2026-11-10, ADR-0104 § 6), par [TCK-2681](TCK-2681-approbation-pro-pose-l-abonnement.md).

## Delta à produire

- [x] `UploadKycDocumentRequest` : `document_number` (≤ 50) pour `rccm` et `ninea`, gardé sur la pièce ; la ressource du dossier le rend par pièce.
- [x] `KycWorkflowService::upload` : exception au verrou pour la pièce du dirigeant expirée ou expirant sous 30 jours ; `KycExpiryService` adapté (dossier `submitted` avec pièce valide).
- [x] `AgencyUpgradeRequestController::store` : `resubmit_of` (id d'une demande `rejected` de l'agence) ; `StoreAgencyUpgradeRequest` rend les champs facultatifs dans ce cas ; la ressource ajoute `resubmit_of_id`.
- [x] `GET /api/me/upgrade-offer` → `{code, label, monthly_price_xof, platform_fee_pct, limits}` du plan désigné, pour l'admin d'une agence `individual`.
- [x] `GET /api/me/quota` : `agents {limit, used}` à côté des biens.
- [x] Tests : `KycDocumentNumberTest`, `KycRenewalWhileVerifiedTest`, `UpgradeRequestResubmitTest`, `UpgradeOfferTest`, `QuotaAgentsUsageTest`.

## Critères d'acceptation

- [x] AC1 — Envoyer la pièce RCCM avec `document_number=SN-DKR-2017-B-8841` puis relire le dossier rend ce numéro sur la pièce ; `agencies.rccm` est inchangé.
- [x] AC2 — Dossier `verified`, pièce du dirigeant expirant dans 20 jours : l'envoi d'une nouvelle pièce rend 200, le dossier passe `submitted`, `agencies.is_verified` reste vrai. Pièce expirant dans 90 jours : 422 `kyc.locked`.
- [x] AC3 — Le jour de l'échéance de l'ancienne pièce, le dossier `submitted` reste `submitted` et `is_verified` passe à faux.
- [x] AC4 — `POST upgrade-requests {resubmit_of: 12, statuts_doc}` sans `ninea` ni `rib_pro` crée une demande dont ces valeurs, déchiffrées en base, égalent celles de la demande 12 ; `resubmit_of` d'une autre agence → 422.
- [x] AC5 — `GET /api/me/upgrade-offer` rend `monthly_price_xof: 50000` sur la base de démo ; changer le prix du plan en base change la réponse.
- [x] AC6 — `GET /api/me/quota` rend `agents.used` égal au nombre de profils agents actifs de l'agence.

## Hors périmètre

- Poser un abonnement à l'approbation du passage en pro (décision produit à prendre ; cf. RAPPORT).
- Le compte des succursales (aucun modèle ne les porte).
- Le contrôle de forme du NINEA et du RCCM (D-68).
- Les écrans (TCK-2670, TCK-2671).

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-agence, lot audit UX /app).

**KYC (ADR-0104 § 2 et § 7)**
- `document_number` (≤ 50, `prohibited_if:document_type,director_id`) est une propriété personnalisée du média de la pièce, rendue par pièce par `KycDossierResource` (`null` si absente). Rien n'écrit `agencies.*`.
- `KycWorkflowService::upload` aiguille un dossier `verified` vers `renew()` : sous verrou de ligne, seule la pièce `director_id` dont `expires_at <= début du jour + 30 j` passe (`RENEWAL_WINDOW_DAYS`, `RENEWABLE_DOCUMENT`) ; le dossier passe `submitted` (`submitted_at` = maintenant, `rejection_reason` vidé), `expires_at` reste celui de l'ancienne pièce jusqu'à la vérification, l'activité `kyc_submitted` porte `{renewal: true, previous_expires_at}` et l'acteur, les super-admins sont prévenus comme à une soumission. Un dossier verified sans échéance reste verrouillé.
- `KycExpiryService` : second passage sur les dossiers d'agence `submitted` **ou `rejected`** échus dont l'agence est encore `is_verified` → `is_verified` faux, `metadata.expired_at`, activité `kyc_expired`, **statut conservé**. Idempotent (le filtre `is_verified` ferme le second passage). Restreint aux dossiers sans `metadata.expired_at` (que `verify()` efface) : un dossier déjà passé par une échéance puis renvoyé garde une `expires_at` révolue, et la vérification posée à la main par la modération (`AgencyModerationController`) ne doit pas être retirée chaque nuit. Le cas `rejected` est un ajout : un renouvellement refusé ne doit pas laisser l'agence vérifiée au-delà de l'échéance de l'ancienne pièce.
- Un envoi qui croise une révocation de la vérification (verrou pris, dossier plus `verified`) attache la pièce avec son numéro, sans transition.
- ⚠ AC2 dit « 200 » : l'envoi d'une pièce rend **201**, comme tout envoi de pièce sur cette route ; le test asserte 201.

**Reprise d'une demande refusée (ADR-0104 § 5)**
- Colonne `agency_upgrade_requests.resubmit_of_id` (FK `nullOnDelete`, index nommé), `down()` éprouvé sur une base jetable (migrate → rollback → migrate).
- `SubmitAgencyUpgradeRequestRequest::resubmitted()` n'accepte que la DERNIÈRE demande `rejected` de l'agence de la route (tri `submitted_at` desc, puis `id` desc) — sinon 422 sur `resubmit_of` (`agency_upgrade.submit.errors.resubmit_not_allowed`). Les champs deviennent facultatifs ; `statuts_doc` reste exigé.
- Les champs absents (`rc`, `ninea`, `rib_pro`, `company_legal_name`, `address_fiscale`, `planned_agents_count`) sont repris côté serveur ; ninea et RIB ne transitent jamais en clair vers le navigateur. L'activité `agency_upgrade_requested` porte `resubmit_of_id`, aucun numéro.

**Offre (ADR-0104 § 6)**
- `GET /api/me/upgrade-offer` (`me.upgrade-offer.show`) → `{code, label, monthly_price_xof, platform_fee_pct, limits}` (flottants, comme `PlanResource`). Plan résolu par `App\Services\Billing\UpgradeOffer::plan()` — plan **actif** de code `config('billing.upgrade_plan_code')` (nouveau `config/billing.php`, défaut `pro`, sans variable d'environnement). À réutiliser par TCK-2681 pour que l'offre affichée et l'abonnement posé ne divergent pas.
- Autorisé par `AgencyUpgradeRequestPolicy::create` (admin d'une agence `individual`) → 403 sinon ; sans espace actif 404 `agency.active_profile_missing` ; plan absent ou retiré 404 `plan.upgrade_offer_missing`. Base de démo : `pro`, 50 000, 3 %, limites 15/3/100 (relevé par le service).

**Quota d'agents (AC6)**
- `GET /api/me/quota` ajoute `agents {limit, used}` à côté des clés plates des annonces (inchangées) ; `used` = profils agents `active` de l'agence. `QuotaResolver::agentUsage()` porte ce compte, et `assertCanAddAgent()` le lit désormais (il comptait tous les profils non supprimés, brouillons d'invitation compris).
- ⚠ **Prémisse qui différait** : le ticket dit « le nombre d'agents est contrôlé (`assertCanAddAgent`) ». Mesuré le 2026-11-11 : `assertCanAddAgent` n'a **aucun appelant** dans `app/` — et `max_agents` n'apparaît ailleurs que dans la validation des plans et des surcharges : le plafond n'est appliqué nulle part. Brancher le contrôle (invitation, activation) est hors de ce ticket ; à écrire en ticket à part.

**Hors de ce ticket, relevé pour la suite**
- ADR-0104 § Application cite « `AgencyKindFlipService` sans recopie implicite » : laissé à TCK-2681 (l'approbation), question posée à la session qui délègue le lot.
- `/sync-specs` : `docs/models-spec.md` ne dit ni le numéro des pièces KYC, ni `resubmit_of_id`, ni la conservation du statut à l'échéance ; `docs/features.md` ne dit ni l'offre lue de l'API ni `agents` dans le quota.
