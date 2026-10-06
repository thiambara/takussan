---
id: TCK-601
title: "Données personnelles et audit : RIB et pièces en clair, journal d'agence qui montre les actes d'une autre agence et cache ceux des admins, consultations non tracées, aucun registre des demandes de droits"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#27-médias--fichiers
    - docs/features.md#112-agence--équipe
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#34-ownerprofile-
    - docs/models-spec.md#42-kycdossier-
    - docs/models-spec.md#spatielaravel-activitylog
    - docs/models-spec.md#56-accountdeletionrequest-
    - docs/models-spec.md#57-dataexport-
tags: [back, front, sécurité, données-personnelles, audit, kyc, conformité, adr-requise]
---

## Objectif utilisateur

- **Bailleur** : son RIB, son NINEA et son numéro de pièce ne sont lisibles ni en base ni par un agent ;
  seul l'admin de l'agence voit la valeur complète, et ce geste est tracé.
- **Admin d'agence** : son journal d'audit montre tout ce qui s'est passé **dans son agence**, y compris
  les actes des autres admins et du système, et rien de ce qui s'est passé ailleurs. Il filtre par
  membre et il est prévenu quand quelqu'un touche aux rôles ou aux intégrations.
- **Super-admin** : chaque consultation de données personnelles depuis la console laisse une trace. Il
  exporte l'audit et suit chaque demande de droits (accès, rectification, opposition, effacement)
  jusqu'à son échéance. Il sait quand une pièce KYC d'agence expire.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 (rapports propriétaire O4, O19 ; super-admin S10, S13,
S14 ; admin d'agence AD9, AD13). Chaque constat ci-dessous a été **relu dans le code** (arbre
`e3ab4a4e`).

### A. Données sensibles du bailleur (O4)

- `owner_profiles.rib`, `tax_id`, `id_document_number` sont des `string` en clair
  (`database/migrations/2026_05_02_000001_create_owner_profiles_table.php:16-19`). `OwnerProfile` n'a
  ni cast `encrypted` ni `$hidden` (`app/Models/Profiles/OwnerProfile.php:24-37`), expose les trois
  colonnes dans `$queryFields` (`:53-58`) et rend `rib`/`tax_id` recherchables (`:51`).
- `GET /api/owners` renvoie les modèles bruts (`OwnerProfileController.php:56-63`, `$paginator->items()`,
  aucune Resource) à tout **agent** de l'agence (`OwnerProfilePolicy.php:27-35`). Le front ne demande
  pas ces colonnes (`lib/queries/owners.ts:23-30`), mais un appel sans `fields[]` les reçoit toutes.
- **Nuance mesurée** : aucun chemin applicatif n'écrit ces trois colonnes aujourd'hui (création :
  `OwnerInvitationService.php:75-89` → `metadata` seul ; le « RIB » du KYC est un fichier `Document`,
  `UploadKycOwnerProfileRequest.php:48`). Seules la factory et les seeders les remplissent (préprod).
  Le risque est donc dormant en données réelles, et c'est le moment où chiffrer ne coûte presque rien.
  TCK-594 (moyens de versement du bailleur) va créer le premier écrivain.
- **Le chiffrement ne tient pas dans un `varchar(255)`** : mesuré avec l'`Encrypter` AES-256-CBC du
  dépôt, 13 caractères → 200, 26 → 228, 34 → **256**. Les colonnes doivent passer en `text`
  (piège PostgreSQL n° 5 du `CLAUDE.md` : la longueur est appliquée).
- Le masque existe déjà, mais il est `private` : `BankStatementController::maskIban`
  (`app/Http/Controllers/Api/Accounting/BankStatementController.php:86-93`).
- Effet de bord à tenir : l'export du droit d'accès sérialise les profils par `toArray()`
  (`app/Services/Privacy/DataExportBuilder.php:83`). Un `$hidden` y **retirerait** les données du
  titulaire.

### B. Pièces KYC sans liste de types, payload journalisé (O19)

- `UploadKycOwnerProfileRequest.php:57`, `UploadKycAgentProfileRequest.php:57` et
  `UploadKycServiceProviderProfileRequest.php:58` valident `['required','file','max:8192']` sans
  `mimes`. Le fichier est stocké sous `$file->hashName()` (extension devinée du type MIME) : un `.html`
  ou un `.svg` reste ce qu'il est. Côté agence, `UploadKycDocumentRequest.php:19` a des `mimes` mais
  ni `heic` ni taille minimale.
- `PropertyController::store` journalise `'payload' => $request->all()` en cas d'échec
  (`app/Http/Controllers/Api/PropertyController.php:94-101`). **Au-delà du rapport** :
  `'error' => $e->getMessage()` fuit les mêmes valeurs, parce que le message d'une `QueryException`
  porte les bindings (`Illuminate/Database/QueryException.php:87`, `Str::replaceArray('?', $bindings,
  $sql)`) et que le `DETAIL` d'une violation d'unicité PostgreSQL cite la valeur.

### C. KYC d'agence exploitable (S10, hors ouverture des pièces)

- `KycDossier` ne porte aucune date de validité (`app/Models/KycDossier.php:19-35`). La pièce du
  dirigeant (`director_id`, `KycWorkflowService.php:20`) expire, et un dossier `verified` reste vérifié
  pour toujours (`verify()`, `:101-130`).
- Le NINEA et le RC de la demande de passage en agence `standard` ne sont contrôlés que par
  `'string','max:30'` / `'max:60'` (`app/Http/Requests/Agency/SubmitAgencyUpgradeRequestRequest.php:30-31`).
- Aucun contrôle ne signale un NINEA ou un RIB professionnel déjà porté par une autre agence (ils
  vivent dans `agency_upgrade_requests`, migration `2026_05_10_180000:42-43`, recopiés dans
  `agencies.metadata.legal_info` par `AgencyKindFlipService.php:45-51`).
- La capacité `agency.update_kyc` existe (`app/Models/Enums/Capability.php:18`) et n'est lue nulle
  part : `Agency/KycController` n'autorise que par `isAgencyAdminAt` (`:53-61`). TCK-587 l'inscrit à
  l'inventaire des capacités sans lecteur, au nom de ce ticket.
- Ouvrir un dossier ou une pièce n'est pas journalisé (voir F).

### D. L'audit d'agence ne montre pas ce qu'il prétend (AD9)

`AuditLogController::index` filtre un admin d'agence **sur l'acteur**
(`app/Http/Controllers/Api/AuditLogController.php:84-97`) : `causer_type = User` et `causer_id` parmi
les utilisateurs qui ont un `agentProfiles` **ou** un `ownerProfiles` dans l'agence. D'où :

- (a) les actes d'un admin qui n'a qu'un `AgencyAdminProfile` sont **invisibles** ;
- (b) **fuite inter-agences** : un bailleur présent chez A et chez B passe le filtre de A pour **toute**
  activité qu'il cause, y compris chez B, puisque le sujet n'est jamais regardé. Le rapport la marquait
  « inféré » ; elle se lit sans ambiguïté dans la condition. Une sonde jetable est prête (notes de
  rédaction), mais elle n'a pas pu tourner (port PostgreSQL local figé) : **AC12 l'établit par un test**
  qui doit rougir sur le code actuel ;
- (c) les actes système et les webhooks (`causer` nul) sont exclus.

**Trouvé en plus, plus grave** : `indexByEntity` (`AuditLogController.php:21-59`, routes
`audit-log/{entity}/{id}` et `activity-log/{entity}/{id}`, `routes/api/audit-log.php:10,15`) autorise
tout admin d'agence et lit `subject_type LIKE '%<Entity>' AND subject_id = ?` **sans aucun filtre
d'agence** : l'historique d'un `Payout`, d'un `Lease` ou d'un `User` de n'importe quelle agence est
lisible en changeant l'identifiant. Le `LIKE '%Payout'` attrape aussi `PlatformPayout`. Les tests
existants (`AuditLogTest.php:66`, `ActivityLogEndpointTest.php:191,208`) ne jouent que le super-admin.

Et autour :

- `activity_log` n'a ni `agency_id` ni index sur `created_at`
  (`database/migrations/2026_04_17_154616_create_activity_log_table.php:11-19`).
- L'export asynchrone reprend le même filtre (`app/Services/Audit/ActivityLogExporter.php:67-100`) et
  tourne dans un job, où `request()?->activeProfile()` est nul : l'accesseur de repli
  `User::getAgencyIdAttribute` (`app/Models/User.php:228-251`) rend `null` pour un admin multi-agences,
  et l'export sort **vide**.
- L'audit d'agence rend `properties` sans expurgation (`AuditLogController.php:174`) ; seule la console
  plateforme expurge (`CrossTenantAuditController.php:21-35`), et sa liste ignore `rib`, `iban`,
  `tax_id` et les numéros de pièce.
- Front : `AuditTrail.tsx:133-141` ne filtre pas par membre, alors que l'API accepte
  `filter[causer_id]` (`AuditLogController.php:140`) et que `lib/queries/audit-logs.ts:35` sait déjà
  l'envoyer. `KNOWN_EVENTS` (`AuditTrail.tsx:50`) ignore les événements métier (`agent_suspended`,
  `agent_removed`… émis par `AgentInvitationService.php:151,180`).

### E. Les actes de gouvernance ne laissent pas de trace (AD13)

- `Auditable` est absent de `AgencyRole`, `Agency`, `Integration`, `AgentProfile`,
  `AgencyAdminProfile` et `OwnerProfile` (grep = 0 sur chacun).
- `AgencyRoleService::replaceCapabilities` (`app/Services/Membership/AgencyRoleService.php:104-140`)
  supprime puis insère les lignes de capacités **sans événement de modèle** : un `Auditable` sur
  `AgencyRole` ne verrait pas ce changement. Le service n'écrit aucun `activity()`.
- `Auditable` (`app/Models/Bases/Auditable.php:17-24`) journalise tout le `fillable` modifié : posé
  tel quel sur `OwnerProfile`, il écrirait le RIB **en clair** dans `attribute_changes` ; posé sur
  `Agency`, il écrirait `metadata.legal_info` (dont `rib_pro`, `AgencyKindFlipService.php:45-51`).
- Aucune notification n'avertit les admins d'un acte sensible (l'export CRM sera journalisé par
  TCK-587, événement `data_exported`).

### F. Consultations non tracées, audit plateforme sans export (S13, hors purge)

- Aucun `activity()` dans `Admin/UserDetailController` (`show`, `sessions`, `activity` — la seule
  occurrence est le **nom** de la méthode, l.134), `Admin/KycController` ni `KycDocumentController`.
  Seul `DataExportDownloadController.php:32-36` trace.
- `CrossTenantAuditController::index` (`:45-82`) n'a pas d'export ni de préréglage « gestes sensibles ».

### G. Aucun registre des demandes de droits (S14)

- Le super-admin peut **déclencher** un export (`routes/api/admin.php:128`, `store` seul), sans vue sur
  les exports ni sur les suppressions en délai de grâce (aucune route admin sur `DataExport` ni sur
  `AccountDeletionRequest`).
- `AccountDeletionService::cancelDeletion()` **supprime** la demande (`AccountDeletionService.php:32`) :
  la seule trace d'une demande d'effacement disparaît quand on l'annule.
- Une demande reçue par courriel n'a aucun endroit où être enregistrée.

## Contrat de données

| Élément | Forme |
|---|---|
| `owner_profiles.rib`, `tax_id`, `id_document_number` | `text`, cast `encrypted`, dans `$hidden`, hors `$queryFields` et hors recherche |
| `OwnerProfileResource` | `rib_masked`, `tax_id_masked`, `id_document_number_masked` (jamais la valeur complète) |
| `GET /api/owners/{owner_profile}/sensitive` | valeurs complètes, admin de l'agence du profil ou super-admin ; journalisé |
| `kyc_dossiers.expires_at` | `timestamp` nullable, index `kyc_dossiers_status_expires_idx (status, expires_at)` |
| Pièce `director_id` | propriété `expires_at` (date) sur le média |
| `activity_log.agency_id` | `foreignId` nullable → `agencies`, `nullOnDelete`, FK `activity_log_agency_fk` ; index `activity_log_agency_created_idx (agency_id, created_at)` et `activity_log_created_idx (created_at)` |
| `GET /api/admin/audit/export` | mêmes filtres que `GET /api/admin/audit` + `filter[sensitive]=1` ; CSV par lien signé |
| `privacy_requests` (nouveau, ADR) | demandeur (`user_id` nullable, nom, contact), `type`, `channel`, `received_at`, `due_at`, `status`, `answered_at`, `response_summary`, `handled_by`, `data_export_id` et `account_deletion_request_id` nullables (`nullOnDelete`), média `proof` |
| `GET/POST /api/admin/privacy-requests`, `PATCH /api/admin/privacy-requests/{privacyRequest}`, `GET /api/admin/privacy-requests/export` | super-admin seul |

## Direction UX / Artistique

- **Journal d'audit de l'agence** : un choix de membre s'ajoute aux filtres existants ; les événements
  métier et les nouveaux types d'objet (rôle, agence, intégration, profils) ont un libellé dans les
  trois langues. Une ligne sans acteur se lit « Système », jamais comme une ligne vide.
- **Carnet de propriétaires** : le RIB et le NINEA apparaissent masqués (`SN•• •••• ••34`). L'admin
  dispose d'un geste explicite « Afficher » qui dit que la consultation est enregistrée ; l'agent n'a
  pas ce geste.
- **File KYC (super-admin et agence)** : la date d'expiration de la pièce du dirigeant est visible ;
  une pièce qui expire dans moins de 30 jours se signale sans alarmer, une pièce expirée se lit comme
  un état à traiter.
- **Console plateforme, « Demandes de droits »** : une vue de suivi sobre, d'abord par échéance — type,
  demandeur, reçue le, échéance, statut, preuve de réponse. Une demande en retard se voit
  immédiatement. L'export du registre est un geste secondaire.
- **Audit plateforme** : un préréglage « Gestes sensibles » et un bouton d'export, à la manière de
  l'export de l'audit d'agence.

## Contraintes strictes (métier)

1. **ADR avant le code** (voir Delta, premier point). Il fixe la gestion de `APP_KEY` : les colonnes
   chiffrées (comme déjà `integrations.credentials`) deviennent **illisibles** si la clé est perdue ou
   changée sans `APP_PREVIOUS_KEYS`.
2. **Jamais de valeur sensible dans un journal** : ni dans `activity_log` (`attribute_changes`,
   `properties`), ni dans `Log::*`. Les modèles rendus `Auditable` journalisent une **liste blanche**,
   jamais tout le `fillable`.
3. **`agency_id` du journal vient du SUJET, jamais de l'acteur.** Ordre de résolution : `agency_id`
   explicitement passé à l'écriture → méthode `auditAgencyId()` du sujet (modèles enfants :
   `LeasePayment` → bail, `BookingPayment` → réservation, `BankStatementLine` → relevé, `KycDossier` →
   agence sujet) → colonne **réelle** `agency_id` du sujet (lue dans `getAttributes()`, **jamais**
   l'accesseur pont `User::getAgencyIdAttribute`) → sujet `Agency` → son id → sans sujet seulement :
   agence du profil actif de la requête HTTP → sinon `null` (visible du seul super-admin).
4. **La recherche ne porte plus sur une colonne chiffrée.** L'IV aléatoire rend même l'égalité stricte
   impossible : `requestSearchFields` d'`OwnerProfile` perd `rib` et `tax_id` et devient `['employer']`
   (aucun consommateur front de `filter[search]` sur `/api/owners`, mesuré). Pas de second mécanisme
   de recherche (`scripts/check-filtering-single-mechanism.mjs`, contrôle D). Une recherche exacte sur le RIB
   **chiffré** d'un bailleur passerait par une empreinte HMAC : l'ADR dit oui ou non, ce ticket ne la
   construit pas.
5. **Le droit d'accès reste entier** : l'export de `DataExportBuilder` continue de contenir les
   valeurs complètes du titulaire.
6. **Aucun littéral de prose** dans les notifications et erreurs ajoutées : clés `__('…', $p, $locale)`
   dans un bloc `privacy.*` / `governance.*` / `kyc.*` propre au ticket (règle commune n° 1 de la vague).
7. **Migrations** datées du jour d'implémentation, index et FK nommés (< 63 caractères), `down()`
   écrit et juste (le `down()` du chiffrement déchiffre).
8. **Coordination de vague** (ce ticket ne s'empare d'aucun de ces fichiers ; il y ajoute des lignes
   voisines) :
   - **TCK-587** possède l'autorisation de `PropertyController::store` : ce ticket ne touche que le
     `catch`. Il possède `ExportController` et y **écrit** le journal `data_exported` ; ce ticket ne
     touche pas ce fichier, il affiche l'entrée et en tire l'alerte. Il retire la ligne
     `agency.update_kyc` de `CapabilityEnforcementInventory::AWAITING` dans le commit qui la branche.
   - **TCK-546** réécrit l'accès de `KycDocumentController` : ce ticket y ajoute **un** appel de
     journalisation après les gardes ; le second à fusionner le replace dans le nouveau chemin.
   - **TCK-594** possède les colonnes légales d'`agencies` et les moyens de versement : il **réutilise**
     `NineaRule`/`RccmRule` et le masqueur, chiffre de la même façon tout RIB qu'il stocke, et ajoute ses
     colonnes légales à la liste blanche d'audit d'`Agency`. Il **journalise** le changement de seuil
     d'approbation ; ce ticket en tire l'alerte. Pas d'alerte de reversement : sa double validation en
     tient lieu. Après sa fusion, la détection NINEA/RIB partagés lit `agencies.ninea`.
   - **TCK-597** renvoie ici la détection « NINEA et RIB partagés entre agences » (C).
   - **TCK-592** ajoute une colonne à `OwnerProfile` (fillable + cast) : lignes voisines.
   - **TCK-586** possède `DataExportBuilder:85` (ligne courtier) : ce ticket ne modifie que la l.83.
   - **TCK-537** planifie `activitylog:clean` et anonymise les profils à la suppression : l'anonymisation
     écrit à travers le cast (une écriture brute doit poser `null`, sinon le cast lève
     `DecryptException` à la lecture) ; la purge doit **exempter** les journaux `PersonalDataAccess`
     et `Privacy` (à porter dans 537, voir Hors périmètre).
   - **TCK-600** ajoute des routes `/api/admin/users/*` : ajouts voisins dans `routes/api/admin.php`.
     Sa recherche globale renvoie ici la trace des consultations « y compris par la recherche » : ce
     ticket livre `PersonalDataAccessLogger` (surface `global_search` réservée) ; l'appel vit dans le
     code de 600, celui des deux qui fusionne en second l'ajoute.
   - `AppServiceProvider` (enregistrement d'observers) et `routes/console.php` (planification) sont
     partagés : ajouts seulement.

## Delta à produire

### 0. Décision

- [ ] **ADR à écrire et accepter avant le code** — « Données personnelles : chiffrement applicatif,
      périmètre d'agence du journal, registre des droits ». Il tranche : (1) chiffrement par cast
      `encrypted` et gestion de `APP_KEY` / `APP_PREVIOUS_KEYS` (sauvegarde, rotation, ré-chiffrement),
      **option recommandée** ; empreinte HMAC pour la recherche exacte, oui ou non ; (2) la règle de
      dérivation de `activity_log.agency_id` (contrainte 3) ; (3) le modèle `privacy_requests`, le délai
      de réponse retenu et sa source juridique.

### A. Données sensibles du bailleur

- [ ] Migration `encrypt_sensitive_columns_on_owner_profiles` : les trois colonnes passent en `text`,
      puis chaque ligne existante est chiffrée par lots (lecture brute, `Crypt::encryptString`,
      écriture brute — idempotente : une valeur déjà déchiffrable est laissée telle quelle) ; `down()`
      déchiffre puis rend `string`.
- [ ] `OwnerProfile` : casts `encrypted`, `public const SENSITIVE = ['rib','tax_id','id_document_number']`,
      `$hidden = self::SENSITIVE`, retrait de `$queryFields`, `requestSearchFields = ['employer']`.
- [ ] `App\Support\Masking` : `iban()` (extrait de `BankStatementController::maskIban`, qui l'appelle
      désormais) et `tail(string, int $visible = 4)`.
- [ ] `App\Http\Resources\OwnerProfileResource` ; `OwnerProfileController::index` l'utilise.
- [ ] `GET /api/owners/{owner_profile}/sensitive` → `OwnerProfileController::sensitive`, nouvelle
      méthode de policy `OwnerProfilePolicy::viewSensitive` (admin de l'agence du profil ; super-admin
      par `Gate::before`) ; journalisée (F).
- [ ] `DataExportBuilder.php:83` : les profils sont exportés avec `makeVisible(OwnerProfile::SENSITIVE)`.
- [ ] Front : le carnet de propriétaires affiche les valeurs masquées et le geste « Afficher » pour l'admin.
- [ ] Tests : `OwnerProfileSensitiveDataTest`.

### B. Pièces KYC et journal de création de bien

- [ ] `UploadKycOwnerProfileRequest`, `UploadKycAgentProfileRequest`, `UploadKycServiceProviderProfileRequest`
      et `UploadKycDocumentRequest` : `mimes:jpg,jpeg,png,webp,heic,heif,pdf`, `mimetypes:` correspondants,
      `min:1` (Ko) ; la taille maximale reste celle de chaque requête.
- [ ] `PropertyController::store`, **le `catch` seulement** : journaliser `user_id`, `payload_keys`
      (`array_keys($request->all())`), la classe de l'exception, et pour une `QueryException` son
      SQLSTATE et `getSql()` (sans bindings) — jamais `$request->all()` ni `getMessage()`.
- [ ] Tests : `KycUploadMimeTest` (les quatre routes), `PropertyStoreFailureLogTest`.

### C. KYC d'agence

- [ ] Migration `add_expires_at_to_kyc_dossiers` (+ index nommé du Contrat de données).
- [ ] `UploadKycDocumentRequest` : `expires_at` `required_if:document_type,director_id`, date
      postérieure à aujourd'hui ; stockée en propriété du média par `KycWorkflowService::upload`.
- [ ] `KycWorkflowService::verify` : `expires_at` du dossier = plus petite échéance parmi les pièces
      **les plus récentes** de chaque type.
- [ ] Commande `kyc:expire-dossiers`, planifiée chaque jour : relance des admins de l'agence à J-30 et
      J-7 (une seule fois chacune, mémorisée dans `metadata`) ; à l'échéance, le dossier repasse
      `pending`, `metadata.expired_at` est posé, l'activité `kyc_expired` écrite, et l'agence perd
      `is_verified` **sans** changer de statut (option recommandée, voir notes).
- [ ] `App\Rules\NineaRule` et `App\Rules\RccmRule` (nommées pour TCK-594) : normalisation des
      séparateurs puis contrôle de forme — hypothèse à confirmer sur pièces réelles : NINEA = 7 ou
      9 chiffres suivis ou non du COFI (chiffre, lettre, chiffre) ; RCCM = `SN` + code de greffe
      (3 lettres) + année + lettre de forme + numéro (ex. `SN-DKR-2019-B-12345`). Appliquées à
      `SubmitAgencyUpgradeRequestRequest` (`rc`, `ninea`).
- [ ] `Agency/KycController` (`upload`, `submit`) : autorisation par
      `canActAt(Capability::AgencyUpdateKyc, $agency)` ; `show` reste à l'admin.
- [ ] `App\Services\Kyc\SharedLegalIdentifierDetector` : NINEA (normalisé par `NineaRule`) et RIB
      professionnel (espaces retirés, majuscules) comparés à ceux des **autres** agences ; résultat exposé
      au seul super-admin dans `KycDossierResource` et la demande de passage `standard`
      (`shared_identifiers`). Aucun refus automatique : un signal pour la revue.
- [ ] `KycDossierResource` expose `expires_at` et l'échéance de chaque pièce ; le front l'affiche.
- [ ] Tests : `KycDossierExpiryTest`, `NineaRuleTest`, `RccmRuleTest`, `AgencyKycCapabilityTest`,
      `SharedLegalIdentifierTest`.

### D. Audit d'agence

- [ ] `App\Models\Activity` (étend le modèle spatie, déclaré dans `config/activitylog.php`) : à la
      création, `agency_id` résolu par `App\Services\Audit\AuditAgencyResolver` (contrainte 3).
      Interface `App\Models\Contracts\HasAuditAgency` sur les modèles enfants.
- [ ] Migration `add_agency_id_to_activity_log` (colonne, FK, deux index) puis migration
      `backfill_agency_id_on_activity_log` : `UPDATE … FROM` par type de sujet portant `agency_id`,
      par jointure pour les enfants, `subject_id` pour `Agency`.
- [ ] `AuditLogController::index` et `ActivityLogExporter::scopeForUser` : un admin d'agence voit
      `agency_id = <agence active>`, et rien d'autre.
- [ ] `AuditLogController::indexByEntity` : même filtre pour un non-super-admin ; le type est
      résolu en classe exacte (`App\Models\<Studly>` existante), plus de `LIKE`.
- [ ] `ExportActivityLogJob` reçoit l'`agency_id` à la répartition ; l'exporteur ne lit plus
      `request()` dans le job.
- [ ] `App\Support\Audit\PropertyRedactor` (extrait de `CrossTenantAuditController`, liste étendue à
      `rib`, `iban`, `tax_id`, `ninea`, `id_document`) appliqué à `properties` dans l'audit d'agence,
      dans l'audit plateforme et dans les deux exports.
- [ ] Front `AuditTrail` : filtre par membre (liste issue de `GET /api/agencies/{agency}/members`),
      libellés i18n des événements métier et des nouveaux types de sujet, acteur nul rendu « Système ».
- [ ] Tests : `AgencyAuditScopeTest` (AC10 à AC14), `ActivityLogAgencyBackfillTest`.

### E. Actes de gouvernance

- [ ] `Auditable` en liste blanche (`logOnly`) sur : `AgencyRole` (`name`, `description`,
      `base_profile_type`) ; `Agency` (`commission_rate`, `status`, `kind`, `is_verified`,
      `moderation_required`, `bank_csv_mapping`, `primary_admin_id`) ; `Integration` (`provider`,
      `is_active`, plus un drapeau `credentials_changed` sans valeur — jamais `last_used_at`,
      `last_health_check_at`, `health_status`) ; `AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`
      (`status`, `agency_role_id`, `commission_rate` pour l'agent — jamais les colonnes `SENSITIVE`).
- [ ] `AgencyRoleService::replaceCapabilities` : activité `role_capabilities_changed` avec
      `added` / `removed` ; `create` → `role_created` ; `assign` → `role_assigned`.
- [ ] `App\Services\Governance\GovernanceAlertService` : avertit (in-app + e-mail, clés i18n, dans la
      langue de chaque destinataire) les admins actifs de l'agence, sauf l'auteur. Déclenché **par le
      journal lui-même** (`created` du modèle `Activity` de D, sur une table d'événements nommée en
      constante), sans toucher aux fichiers des autres tickets : `role_capabilities_changed` ;
      création d'un `AgencyAdminProfile` ; `data_exported` d'une entité CRM (TCK-587) ; création,
      modification ou suppression d'une `Integration` ; changement de seuil d'approbation (TCK-594, nom
      d'événement aligné à l'implémentation).
- [ ] Tests : `GovernanceAuditTest`, `GovernanceAlertTest`.

### F. Consultations et audit plateforme

- [ ] `App\Services\Privacy\PersonalDataAccessLogger::record(User $viewer, Model $subject, string $surface)` :
      journal `PersonalDataAccess`, événement `personal_data_viewed`, `properties.surface` ; au plus une
      entrée par (lecteur, sujet, surface) par fenêtre de 15 min.
- [ ] Appels : `Admin/UserDetailController` (`show`, `sessions`, `activity`), `Admin/KycController`
      (`show`, `agency`), `KycDocumentController` (coordination 546), `OwnerProfileController::sensitive`.
- [ ] `GET /api/admin/audit/export` → `CrossTenantAuditController::export` (réutilise
      `ActivityLogExporter` en portée plateforme, lien signé) ; `filter[sensitive]=1` sur l'index et
      l'export, sur une liste de `log_name` nommée en constante ; l'export lui-même est journalisé.
- [ ] Front : préréglage « Gestes sensibles » et export sur l'audit de la console.
- [ ] Tests : `PersonalDataAccessLogTest`, `CrossTenantAuditExportTest`.

### G. Registre des demandes de droits

- [ ] Migration `create_privacy_requests_table` (Contrat de données ; index nommés sur
      `(status, due_at)` et `user_id`) ; modèle `PrivacyRequest` (`Auditable`, journal `Privacy`) ;
      enums `PrivacyRequestType` (`access`, `rectification`, `opposition`, `erasure`, `portability`),
      `PrivacyRequestChannel`, `PrivacyRequestStatus` (`received`, `in_progress`, `answered`,
      `rejected`, `withdrawn`) ; `due_at = received_at + config('privacy.rights_request_deadline_days')`.
- [ ] Alimentation automatique par observers : `DataExport` créé → `portability` ; `AccountDeletionRequest`
      créée → `erasure`, et sa **suppression** (annulation) passe l'entrée à `withdrawn` sans l'effacer.
- [ ] `Admin\PrivacyRequestController` (`index`, `store`, `update`, `export` CSV) +
      `StorePrivacyRequestRequest`, `UpdatePrivacyRequestRequest` + `PrivacyRequestPolicy` (super-admin
      seul) ; dépôt de la preuve de réponse par média `proof` (mêmes `mimes` qu'en B).
- [ ] Front : page « Demandes de droits » de la console.
- [ ] `docs/models-spec.md` et `docs/features.md` mis à jour après fusion (`/sync-specs`).
- [ ] Tests : `PrivacyRequestRegistryTest`.

## Critères d'acceptation

- [ ] **AC1** — En base, `owner_profiles.rib` d'un profil créé par la factory ne contient pas la valeur
      saisie (lecture SQL brute) ; le modèle la relit intacte. Une valeur de 34 caractères s'enregistre.
- [ ] **AC2** — `GET /api/owners` (agent, puis admin) ne contient ni `rib`, ni `tax_id`, ni
      `id_document_number` en clair ; `fields[owner_profiles]=rib,tax_id` est refusé (400, champ non
      autorisé) au lieu de les rendre ; la réponse contient `rib_masked` égal au masque attendu pour une
      valeur fixée. Rouge sur le code actuel ; rouge à nouveau si l'on retire la Resource ou le `$hidden`.
- [ ] **AC3** — `GET /api/owners/{id}/sensitive` : 200 pour l'admin de l'agence (valeur complète, une
      entrée `personal_data_viewed` créée) ; 403 pour un agent de la même agence ; 403 pour l'admin d'une
      autre agence. Ablation : retirer la policy → rouge.
- [ ] **AC4** — L'archive produite par `DataExportBuilder` pour un bailleur contient son RIB complet.
- [ ] **AC5** — Un `.html`, un `.svg` et un fichier vide sont refusés (422) sur chacune des quatre
      routes d'upload KYC ; un `.heic` et un `.pdf` sont acceptés. Rouge sur le code actuel pour les
      trois routes `me/*`.
- [ ] **AC6** — Un échec forcé de `PropertyController::store` (contrainte violée) écrit une entrée de
      log qui ne contient **aucune** valeur saisie (titre et adresse témoins absents de tout le contexte,
      `error` compris) et contient `payload_keys`.
- [ ] **AC7** — Un upload `director_id` sans `expires_at` ou avec une date passée → 422. Après
      vérification, `expires_at` du dossier vaut l'échéance de la pièce la plus récente.
- [ ] **AC8** — `kyc:expire-dossiers` (horloge figée) : à J-30 puis J-7, une notification par admin,
      jamais deux fois ; le jour d'échéance, dossier `pending`, `is_verified = false`, statut de l'agence
      inchangé, activité `kyc_expired`.
- [ ] **AC9** — `NineaRule`/`RccmRule` acceptent les échantillons réels retenus par l'ADR et refusent
      `ABC`, `12` et un RCCM sans année ; `SubmitAgencyUpgradeRequestRequest` les applique (422).
- [ ] **AC9b** — Un membre de l'agence à qui un rôle personnalisé donne `agency.update_kyc` dépose une
      pièce (201) ; un admin dont le rôle la retire reçoit 403. Ablation : revenir à `isAgencyAdminAt`
      → rouge. Une agence dont le NINEA normalisé égale celui d'une autre porte `shared_identifiers`
      dans la vue super-admin, jamais dans la vue de l'agence.
- [ ] **AC10** — L'admin 1 de l'agence A voit l'activité causée par l'admin 2 de A (qui n'a **que** un
      `AgencyAdminProfile`, créé sans le pont `agency_id`). Rouge sur le code actuel.
- [ ] **AC11** — L'admin de A voit une activité système (`causer` nul) sur un sujet de A.
- [ ] **AC12** — Un bailleur présent chez A et B cause une activité sur un sujet de B : l'admin de A ne
      la voit **ni** dans la liste, **ni** dans l'export ; l'admin de B la voit. Rouge sur le code
      actuel ; rouge à nouveau si le filtre revient sur l'acteur.
- [ ] **AC13** — `GET /api/activity-log/payout/{id}` et `/api/audit-log/payout/{id}` d'un reversement de
      B, appelé par l'admin de A → aucune entrée ; le même appel par l'admin de B rend les entrées du
      reversement, et aucune d'un `PlatformPayout` de même identifiant. Rouge sur le code actuel.
- [ ] **AC14** — Après la migration de rattrapage, une activité préexistante sur un `LeasePayment` de A
      porte `agency_id = A` ; une activité sur un `User` porte `null`.
- [ ] **AC15** — Remplacer les capacités d'un rôle crée `role_capabilities_changed` avec `added` et
      `removed` exacts, et notifie les autres admins de l'agence (pas l'auteur) ; une entrée
      `data_exported` d'entité `customers` notifie de même. Modifier le RIB d'un
      bailleur ne laisse aucune valeur de RIB dans `activity_log` (recherche de la valeur témoin dans
      toute la ligne).
- [ ] **AC16** — Ouvrir le détail d'un utilisateur, ses sessions, un dossier KYC et une pièce KYC depuis
      la console écrit chacun une entrée `personal_data_viewed` ; deux ouvertures en 15 min, une seule.
- [ ] **AC17** — `GET /api/admin/audit/export` rend un lien signé ; le fichier respecte les filtres et
      `filter[sensitive]=1` ; aucune valeur expurgée n'y figure ; l'export est journalisé. 403 pour un
      admin d'agence.
- [ ] **AC18** — Une demande d'export ou de suppression par un utilisateur crée une entrée du registre
      avec `due_at` attendu ; annuler la suppression passe l'entrée à `withdrawn` sans la supprimer ; une
      demande saisie à la main, puis répondue avec preuve, apparaît dans l'export CSV. 403 pour tout
      non-super-admin.
- [ ] **AC19** — `./vendor/bin/pint` propre ; `npm run lint` et `npx tsc --noEmit` propres ; tests des
      classes touchées verts ; `php artisan migrate:fresh --seed` passe.

## Hors périmètre

- **TCK-546** : rendre une pièce KYC ouvrable depuis le navigateur (lien signé, BFF, gardes du
  `KycDocumentController`). Ce ticket n'y ajoute qu'une ligne de journalisation.
- **TCK-537** : planifier `activitylog:clean`, purger les pièces KYC et les contacts anonymes,
  anonymiser les profils à la suppression du compte, preuve du consentement. Ce ticket **demande** à 537
  d'exempter les journaux `PersonalDataAccess` et `Privacy` de la purge à 365 jours (durée à trancher
  par le porteur) ; il ne planifie aucune purge.
- La déclaration du traitement à la CDP (loi n° 2008-12) et le délai juridique exact : gestes du porteur,
  hors code ; le registre ne fait que le rendre exportable.
- Expiration des pièces KYC des profils (bailleur, agent, prestataire) : ce sont des `Document`, pas un
  `KycDossier` ; ticket à part si besoin.
- Un index d'unicité sur `agencies.ninea` (colonne de TCK-594) ; la détection de doublons
  d'annonces (TCK-597) ; la recherche du RIB chiffré d'un bailleur (empreinte HMAC, si l'ADR la retient).
- Alerte sur un reversement au-delà d'un seuil : la double validation de TCK-594 en tient lieu.
- Chiffrement de `agency_upgrade_requests.rib_pro` et de `agencies.metadata.legal_info` (question au
  porteur).
- Les bindings de requête écrits dans les journaux par le rapporteur d'exceptions du framework, pour
  toute `QueryException` hors de ce `catch` (question au porteur).
- Les `mimes` des uploads non KYC (`StoreDocumentRequest`, `UploadDocumentVersionRequest`,
  `SubmitQuoteRequest`).
- Un motif de consultation obligatoire avant d'ouvrir une donnée personnelle.

## Notes d'implémentation

_(à remplir par implementing-specs)_
