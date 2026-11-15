---
id: TCK-2909
title: "API — le mandat du bailleur (dates, versement, référent, mandat signé) et l'avis de chaque reversement (nature, moyen, PDF)"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2910, TCK-2915, TCK-2916]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#22-document-"
tags: [back, bailleurs, mandat, reversements, documents, audit-ux, app]
---

## Objectif utilisateur

Sur la fiche d'un bailleur, l'agence lit son mandat — signé le 12 mars 2025, jusqu'au 11 mars 2028, versement par virement avant le 10, suivi par Awa Diop — ouvre le mandat signé, et remet au bailleur l'avis de chaque reversement.

## Contrat de données

Constat (vérifié à l'écriture) :

- `owner_profiles` est **par couple (utilisateur, agence)** (`unique(['user_id','agency_id'])`) : il porte déjà le mandat de fait (`works_approval_threshold`, commission lue sur l'agence). Il n'a **aucune** colonne de dates de mandat, de moyen ni de jour de versement, ni de référent (`create_owner_profiles_table.php:11-25`).
- `GET /api/owners/{id}` (`OwnerDirectory.php:459-515`) : `contact` sans adresse ; `figures` du mois sans nombre d'encaissements.
- **Mandat signé** : aucun `DocumentType` « mandat » ; `POST /api/documents` n'accepte pas la cible `owner_profile` (`DocumentController.php:33-39`, alias pourtant prévu par ADR-0099 § 5) — l'agence ne peut déposer aucune pièce du bailleur.
- **Reversements** (`PayoutResource`) : `payment_method` et `payout_method_masked` servis, **aucune nature** (acompte, solde…) et **aucun PDF** d'avis (`routes/api/payouts.php`) ; seul le relevé mensuel a un PDF.

Audit (`audit-f4-patrimoine.md`, app-bailleurs **e1** : « Mandat de gestion signé » et « Ajouter » de la carte Documents, « Versement : virement, avant le 10 », dates du mandat, adresse et référent, « 9 encaissements », nature et moyen de chaque reversement + « Reçu » — fiche `TCK-2641.json` a-1-bureau « à proposer en suite back », aucun ticket) ; app-paiements **e4** (« Avis » téléchargeable d'un versement + moyen ; fiche `TCK-2651.json` a-4).

À servir :

1. `owner_profiles` : `mandate_starts_on`, `mandate_ends_on`, `payout_method` (énumération : virement, mobile money, espèces…), `payout_day` (1-28, « avant le N du mois »), `referent_agent_id` (personnel de l'agence) ; écrits par `PATCH /api/owners/{ownerProfile}` (`OwnerProfileController::update`, `UpdateOwnerProfileRequest` — la route qui écrit déjà `works_approval_threshold`), rendus par le détail.
2. Détail du bailleur : `contact.address` ; `figures.collections_count` (encaissements du mois).
3. `DocumentType::ManagementMandate` ; cible `owner_profile` acceptée par `POST /api/documents` pour le personnel de l'agence qui gère ce bailleur ; le détail du bailleur rend sa pièce « mandat » (nom, date, pages ou taille, lien).
4. `Payout` : `nature` (acompte, solde, reprise…) servie ; `GET /api/payouts/{payout}/notice/pdf` (l'avis de versement : bailleur, période, montant, moyen masqué, date) — lisible du bailleur et du personnel de l'agence.

## Contraintes strictes (métier)

- Migration pensée pour PostgreSQL, `down()` juste ; colonnes nullables (aucune valeur inventée pour l'existant).
- `referent_agent_id` doit être du personnel actif de **la même agence** (422 sinon).
- La cible `owner_profile` suit ADR-0099 : la liste suit la lecture ; le bailleur lit les pièces déposées sur son profil ; aucune autre agence ne les voit (test de parité).
- Écrire le mandat : même capacité que les réglages du mandat d'aujourd'hui (plafond de travaux).
- L'avis de versement : montant décimal en base, XOF sans sous-unité dans le PDF ; autorisation de `PayoutPolicy::view`.

## Delta à produire

- [ ] Migration `add_mandate_terms_to_owner_profiles_table`.
- [ ] `UpdateOwnerProfileRequest` (champs du mandat) ; `OwnerDirectory` (adresse, `collections_count`, mandat, pièce « mandat »).
- [ ] `DocumentType::ManagementMandate` ; cible `owner_profile` dans `DocumentController::store` + `DocumentPolicy`.
- [ ] `Payout.nature` (colonne ou dérivée — à décider dans le ticket, avec la règle écrite) ; `PayoutNoticePdfController` + vue.
- [ ] `docs/models-spec.md` § 34 et § 28 (ou laisser à /sync-specs).
- [ ] Tests : `OwnerMandateTermsTest`, `OwnerDocumentUploadTest` (parité, autre agence), `OwnerDetailCollectionsCountTest`, `PayoutNoticePdfTest`.

## Critères d'acceptation

- [ ] AC1 — `PATCH /api/owners/{id}` avec `mandate_starts_on=2025-03-12`, `mandate_ends_on=2028-03-11`, `payout_method=bank_transfer`, `payout_day=10`, `referent_agent_id` d'un agent de l'agence : 200, et le détail rend ces valeurs ; un `referent_agent_id` d'une autre agence → 422.
- [ ] AC2 — Le personnel de l'agence dépose un PDF de type `management_mandate` sur `owner_profile:{id}` : 201 ; le détail du bailleur rend la pièce ; le bailleur la voit dans son coffre ; un agent d'une autre agence ne la voit pas.
- [ ] AC3 — Le détail d'un bailleur dont le mois compte 9 loyers encaissés rend `figures.collections_count = 9`.
- [ ] AC4 — Un reversement rend `nature` et `payment_method` ; `GET /api/payouts/{id}/notice/pdf` rend un PDF au bailleur concerné et au personnel de l'agence, 403 à un autre bailleur.
- [ ] AC5 — Le `down()` de la migration s'exécute sans erreur sur PostgreSQL.

## Hors périmètre

- Les écrans (TCK-2910, TCK-2916).
- Le statut juridique du mandat (signature électronique du mandat) : la pièce est déposée signée.

## Notes d'implémentation

**2026-11-15 — implémentation (agent, vague 92).** Prémisses re-mesurées : toutes justes (aucune colonne de mandat ; `contact` sans adresse ; `owner_profile` absent de `ALLOWED_DOCUMENTABLE_TYPES` et sans branche dans `DocumentPolicy::reaches()` ; ni nature ni PDF d'avis sur `Payout`). Deux défauts voisins trouvés et corrigés. (1) `DocumentPolicy::share()` ouvrait au personnel de l'agence du porteur un lien de partage PUBLIC vers une pièce KYC d'un profil de bailleur (CNI, RIB, NINEA), qu'aucune autre route ne lui ouvre : refusé désormais (rouge observé avant le correctif). (2) `update()` lisait `works_approval_threshold` sans condition — un `PATCH` du seul mandat aurait retiré le plafond (`null`) ; chaque clé ne s'écrit plus que si elle est envoyée, un corps sans clé connue reste 422.

**Mandat (AC1, AC5)** — migration `2026_11_15_290900_add_mandate_terms_to_owner_profiles_table` : `mandate_starts_on`, `mandate_ends_on` (date), `payout_method` (énumération `PaymentMethod`, celle des reversements : `bank_transfer`, `wave`, `cash`…), `payout_day` (1-28, CHECK en base), `referent_agent_id` (FK `users`, `nullOnDelete`, indexée) ; CHECK fin ≥ début. `UpdateOwnerProfileRequest` : toutes `sometimes|nullable`, une borne seule se juge contre l'autre en base, référent = `PersonnelDeLAgence::estPersonnel` de l'agence du profil (422 `referent_agent_id` sinon, message `owners.mandate.referent_not_staff`). Écriture journalisée `owner_mandate_terms_updated` (avant/après des seules clés changées ; libellé `admin.audit.events.owner_mandate_terms_updated`). Fiche : `mandate` {`starts_on`, `ends_on`, `payout_method`, `payout_day`, `referent` {`id`, `first_name`, `last_name`, `is_active`}}. Le référent actif devient l'interlocuteur du bailleur avant l'invitant (`InterlocuteurDuBailleur`, `source: referent` ; type front élargi). `payout_day` est servi au bailleur par `GET /api/me/payout-methods` → `meta.payout_day` (profil bailleur ACTIF, `null` sinon) et affiché sous le moyen par défaut : « reversements du 5 de chaque mois » (`PayoutMethodsSection`, ce qui livre l'AC5 bis de TCK-2864). Liste du carnet : les deux jours sortent en `Y-m-d` (`OwnerProfileResource`, rouge de `DateInventoryByValueTest` sans cela). AC5 : `down()` puis `up()` des deux migrations exécutés dans le test sur PostgreSQL.

**Fiche (AC3)** — `contact.address` : la dernière adresse du compte (`addresses`, morph) ; rien ne l'écrit aujourd'hui pour un bailleur (aucune saisie d'adresse dans l'invitation ni l'accueil), donc `null` en pratique hors seeders. `figures.collections_count` = lignes `lease_payments` + `booking_payments` du MÊME relevé servi que `collected` (pénalités exclues : portées par une ligne de loyer).

**Mandat signé (AC2 ; ADR-0099, amendement du 2026-11-15)** — `DocumentType::ManagementMandate` ; `owner_profile` accepté au dépôt ; `reaches()` : le personnel de l'agence du profil lit et dépose, le titulaire lit. Les pièces KYC du profil restent fermées au personnel par trois portes : `view` (refus hors téléverseur/super-admin), `listableOn` (retirées pour qui lit par la branche du porteur), dépôt (422 `document.profile_piece_by_kyc`), lien de partage (`share`, 403). Coffre du bailleur : la cible de son profil actif → « mes pièces ». Fiche : `mandate_document` (id, nom, date, taille, type, `download_path`) — la taille, pas les pages (aucun comptage de pages côté serveur). Front : type `management_mandate`, ordre, libellé, vocabulaire du coffre régénéré.

**Reversements (AC4 ; ADR-0039, amendement du 2026-11-15)** — `payouts.nature` en COLONNE, écrite à la création (décision : une nature lue au moment de la lecture basculerait d'acompte en solde au reversement suivant) : `advance` s'il reste au bailleur, après les pièces portées, un encaissement reversable non porté encaissé au plus tard à la fin du mois de `period_end` (`PayoutCalculator`, sous les verrous ; pénalités exclues), `balance` sinon ; `refund`, `deposit_refund`, `provider_bill` posés par le modèle (`creating`) et remplis pour l'existant ; un reversement au bailleur antérieur reste `null`. `PayoutResource.nature` (`whenHas`). `GET /api/payouts/{payout}/notice/pdf` (`PayoutNoticePdfController`, vue `pdf.payouts.notice`, clés `money_out.notice.*`, société en tête comme le relevé) : `PayoutPolicy::view`, puis 422 `payout.notice_unavailable` hors reversement au bailleur terminé.

Tests : `OwnerMandateTermsTest`, `OwnerDocumentUploadTest`, `OwnerDetailCollectionsCountTest`, `PayoutNoticePdfTest` (back), `PayoutMethodsSection.jour.tck-2909` (front). 22 ablations, toutes rouges puis restaurées (md5). Joués aussi : `OwnerWorksThresholdUpdateTest`, `InterlocuteurDuBailleurTest`, `OwnerProfileShowTest`, `OwnerDetailMoneyTest`, `DocumentTest`, `DocumentVaultOwnerTest`, `DocumentVaultPrimedVerdictParityTest`, `PayoutMethodTest`, `ImpersonationPayoutMethodsTest`, `RechercheDuCoffreVocabulaireTest`, `DateInventoryByValueTest`, `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`, les trois gardes d'architecture ; front : `PayoutMethodsSection*`, `constants`, `vocabulaire-du-coffre`, `CarteDeLInterlocuteur`, `AuditTrail -t TCK-2676` ; `tsc`, `check:i18n`, gardes racine et front vertes. `docs/models-spec.md` (§ 34, § 28) laissé à `/sync-specs` (fichier tenu par un autre agent). Base de démo NON migrée (deux migrations à jouer). L'AC5 bis de TCK-2864 est livré par ce ticket (« reversements du N de chaque mois »).
