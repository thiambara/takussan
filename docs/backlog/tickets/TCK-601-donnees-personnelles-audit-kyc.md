---
id: TCK-601
title: "Données personnelles et audit : RIB et pièces en clair, journal d'agence qui montre les actes d'une autre agence et cache ceux des admins, consultations non tracées, aucun registre des demandes de droits"
status: doing
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
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
  membre et il est prévenu quand quelqu'un touche aux rôles ou aux intégrations. Le RIB professionnel
  et le NINEA déposés pour passer en agence `standard` ne sont lisibles ni en base, ni des bailleurs et
  agents de l'agence.
- **Tout utilisateur** : ce qu'il saisit ne se retrouve pas dans les journaux techniques quand une
  écriture échoue.
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
- **Le défaut n'est pas propre à ce `catch`** : le `catch` relance (`PropertyController.php:101`), et
  le rapporteur du framework journalise **toute** `QueryException` non rattrapée par
  `$logger->error($e->getMessage(), ['exception' => $e])` (`Foundation/Exceptions/Handler.php:444-478`,
  laravel/framework v13.25.0). `bootstrap/app.php:72-89` (`withExceptions`) ne déclare qu'un `render` :
  ni `report`, ni `dontReport`, ni contexte. Tout échec SQL de toute route écrit donc ses bindings
  (et le `DETAIL` PostgreSQL) dans le journal.
- Même motif dans des `catch` locaux qui enveloppent des écritures : `FlipAgencyKindOnUpgradeApproved.php:53-63`
  (le `flip` écrit `metadata.legal_info`, RIB compris), `BookingExpirationService.php:133-134` (message
  recopié dans `$errors[]`, lui-même journalisé par `ExpirePendingBookingsJob.php:43`) et
  `ExpirePendingBookingsJob::failed` (`:51-56`, message **et** `getTraceAsString()`).
- `mimes` absents aussi hors KYC : `StoreDocumentRequest.php:39` et `UploadDocumentVersionRequest.php:24`
  valident `['required','file','max:10240']`, alors que le docblock de la seconde (`:10-11`) annonce
  « the same file constraints as the original Document upload (formats + max 10 MB) » et que le front
  croit la liste alignée (`lib/queries/documents.ts:173-189`, `DOCUMENT_MIME_ACCEPT`).

### C. KYC d'agence exploitable (S10, hors ouverture des pièces)

- `KycDossier` ne porte aucune date de validité (`app/Models/KycDossier.php:19-35`). La pièce du
  dirigeant (`director_id`, `KycWorkflowService.php:20`) expire, et un dossier `verified` reste vérifié
  pour toujours (`verify()`, `:101-130`).
- Le NINEA et le RC de la demande de passage en agence `standard` ne sont contrôlés que par
  `'string','max:30'` / `'max:60'` (`app/Http/Requests/Agency/SubmitAgencyUpgradeRequestRequest.php:30-31`).
  **Tranché par le porteur le 2026-10-06 : pour plus tard, consigné en dette (D-68).** Ce ticket
  n'écrit aucun contrôle de forme.
- Aucun contrôle ne signale un NINEA ou un RIB professionnel déjà porté par une autre agence (ils
  vivent dans `agency_upgrade_requests`, migration `2026_05_10_180000:42-43`, recopiés dans
  `agencies.metadata.legal_info` par `AgencyKindFlipService.php:45-51,79-98`).
- **Ces identifiants sont en clair, et le RIB recopié est lisible de tout membre de l'agence.**
  `agency_upgrade_requests.ninea` et `rib_pro` sont des `string` (migration `2026_05_10_180000:42-43`),
  sans cast (`AgencyUpgradeRequest.php:62-67`). Le flip recopie `rib_pro` dans
  `agencies.metadata.legal_info` (`AgencyKindFlipService.php:48`, `:93-98`), et `AgencyResource.php:35`
  rend `metadata` **verbatim** ; `GET /api/agencies/{agency}` y donne accès à tout utilisateur dont
  l'agence est visible, bailleur et agent compris (`AgencyController.php:63-67`, `visibleAgencyIds`
  `:305-310`). Pour une agence `individual`, c'est le RIB d'une personne physique. **Cette copie n'a
  aucun lecteur** : grep `legal_info`/`rib_pro` → seuls le flip, la Resource (via `metadata`) et un type
  front (`takussan-web/src/types/agency.ts:25`).
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
| `agency_upgrade_requests.ninea`, `rib_pro` | `text`, cast `encrypted` ; rendus complets à l'admin de l'agence et au super-admin seulement (`AgencyUpgradeRequestResource`, inchangé) |
| `agencies.metadata.legal_info.rib_pro` | **n'existe plus** (retiré des données, plus jamais recopié) ; `AgencyResource` ne le rend jamais |
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
   jamais tout le `fillable`. Une exception SQL ne se journalise **jamais** par `getMessage()` (bindings
   et `DETAIL` PostgreSQL), ni avec l'objet exception en contexte (sa trace porte les arguments quand
   `zend.exception_ignore_args` est `Off`, ce qui est le cas hors image de production).
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
     le masqueur, chiffre de la même façon tout RIB qu'il stocke, et ajoute ses colonnes légales à la
     liste blanche d'audit d'`Agency`. **Aucune règle de forme NINEA/RCCM n'est écrite** (D-68) : ses
     `ninea`/`rccm` restent `['nullable','string','max:30']`, commentaire `D-68`. Il **journalise** le
     changement de seuil d'approbation ; ce ticket en tire l'alerte. Pas d'alerte de reversement : sa
     double validation en tient lieu. Après sa fusion, la détection NINEA partagé lit `agencies.ninea` ;
     la détection RIB lit toujours `agency_upgrade_requests.rib_pro` (594 ne crée pas de colonne RIB
     d'agence). `AgencyKindFlipService` : 594 réécrit la recopie vers ses colonnes ; **seul le retrait
     de `rib_pro` des champs recopiés est à nous** — le second à fusionner garde `rib_pro` hors de toute
     recopie. Ordre de fusion indifférent.
   - **TCK-588** possède le rappel `render` de `bootstrap/app.php` (« seul ce ticket modifie
     `bootstrap/app.php` », son l.348). Ce ticket y ajoute **un** bloc `$exceptions->report(…)` dans le
     même `withExceptions`, sans toucher au `render`. Conflit de lignes voisines ; ordre indifférent.
   - **TCK-597** modifie `AgencyResource.php:28` (`average_rating`) ; ce ticket ne touche que la l.35
     (`metadata`). Lignes voisines.
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
      **option retenue par défaut**, pour `owner_profiles` comme pour `agency_upgrade_requests` ;
      empreinte HMAC pour la recherche exacte, oui ou non ; (2) la règle de dérivation de
      `activity_log.agency_id` (contrainte 3) ; (3) le modèle `privacy_requests`, le délai de réponse et
      sa source juridique — **option retenue par défaut** : valeur en configuration
      (`privacy.rights_request_deadline_days`), 30 jours, à confirmer par le conseil juridique avant la
      production ; (4) la conservation des journaux `PersonalDataAccess` et `Privacy` — **option
      retenue par défaut** : 5 ans, alignée sur la conservation KYC de la politique.

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
      par `Gate::before` — **option retenue par défaut** : pas de capacité dédiée tant que TCK-587 n'a
      pas branché les capacités de lecture) ; journalisée (F).
- [ ] `DataExportBuilder.php:83` : les profils sont exportés avec `makeVisible(OwnerProfile::SENSITIVE)`.
- [ ] Front : le carnet de propriétaires affiche les valeurs masquées et le geste « Afficher » pour l'admin.
- [ ] Tests : `OwnerProfileSensitiveDataTest`.

### A2. Identifiants légaux de la demande de passage en agence

- [ ] Migration `encrypt_legal_identifiers_on_agency_upgrade_requests` : `ninea` et `rib_pro` passent en
      `text` puis sont chiffrés par lots (même procédé idempotent qu'en A) ; la même migration retire
      `legal_info.rib_pro` de `agencies.metadata` (`metadata #- '{legal_info,rib_pro}'`). `down()` :
      déchiffre, rend `string`, et recopie `rib_pro` depuis la demande `approved` de chaque agence.
- [ ] `AgencyUpgradeRequest` : casts `encrypted` sur `ninea` et `rib_pro`. `AgencyUpgradeRequestResource`
      inchangée (lecteurs : admin de l'agence et super-admin, déjà autorisés).
- [ ] `AgencyKindFlipService` : `rib_pro` ne fait plus partie des champs recopiés (`LEGAL_FIELDS`
      garde `rc`, `ninea`, `company_legal_name`, `address_fiscale`). La copie n'a aucun lecteur ; la seule
      source du RIB pro reste la demande, chiffrée. *Chiffrer une clé d'un `jsonb` n'est pas le mécanisme
      du cast `encrypted` : la supprimer l'est.*
- [ ] `AgencyResource` : `metadata` rendu sans `legal_info.rib_pro` (`Arr::except`), défense contre une
      donnée antérieure à la migration.
- [ ] Front : le type d'agence ne déclare plus de RIB pro dans ses métadonnées.
- [ ] `Admin\AgencyUpgradeRequestController::show` journalise la consultation (F, surface
      `agency_upgrade_request`).
- [ ] Tests : `AgencyUpgradeRequestEncryptionTest`.

### B. Pièces, documents et journaux

- [ ] `UploadKycOwnerProfileRequest`, `UploadKycAgentProfileRequest`, `UploadKycServiceProviderProfileRequest`
      et `UploadKycDocumentRequest` : `mimes:jpg,jpeg,png,webp,heic,heif,pdf`, `mimetypes:` correspondants,
      `min:1` (Ko) ; la taille maximale reste celle de chaque requête.
- [ ] `StoreDocumentRequest` et `UploadDocumentVersionRequest` : `mimes:pdf,jpg,jpeg,png,webp,heic,heif,doc,docx,xls,xlsx,txt,csv`,
      `mimetypes:` correspondants, `min:1` ; `max:10240` inchangé. La liste est celle que le front
      annonce déjà (`DOCUMENT_MIME_ACCEPT`, plus `heic`/`heif`) ; le docblock de
      `UploadDocumentVersionRequest` dit vrai.
- [ ] `App\Support\Logging\SafeExceptionContext::of(Throwable $e): array` : `exception` (classe),
      `code` ; pour une `QueryException` : `sqlstate`, `sql` (`getSql()`, placeholders seuls),
      `connection`, `bindings_count` ; pour toute autre : **aucun message** — `file:line` du point de
      levée suffit à retrouver la cause. `trace` réduite à `fichier:ligne` par cadre. **Jamais**
      `getMessage()`, d'aucune exception ni de sa `getPrevious()`, jamais l'objet exception : un refus
      SMTP recopie l'adresse du destinataire dans son message, une `ValidationException` la valeur
      refusée — le message d'une exception est une donnée, pas un diagnostic (relevé par la
      consolidation de TCK-599, 2026-10-06). Un appelant qui a besoin d'un texte le compose lui-même
      à partir de codes.
- [ ] `bootstrap/app.php`, dans `withExceptions` (coordination 588) :
      `$exceptions->report(function (QueryException $e) { Log::error('query_exception', SafeExceptionContext::of($e) + ['user_id' => Auth::id()]); })->stop();`
      — remplace le rapport par défaut de **toute** `QueryException`, quelle que soit la route ou le job.
- [ ] `PropertyController::store`, **le `catch` seulement** : `user_id`, `payload_keys`
      (`array_keys($request->all())`) et `SafeExceptionContext::of($e)` — jamais `$request->all()` ni
      `getMessage()`.
- [ ] Mêmes contextes dans `FlipAgencyKindOnUpgradeApproved::handle` (`:53-63`),
      `BookingExpirationService` (`:133-134`, le Log **et** la chaîne poussée dans `$errors[]`, qui porte
      désormais la classe et le SQLSTATE) et `ExpirePendingBookingsJob::failed` (`:51-56`).
- [ ] Tests : `KycUploadMimeTest` (les quatre routes), `DocumentUploadMimeTest` (les deux routes),
      `PropertyStoreFailureLogTest`, `SafeExceptionLoggingTest`.

### C. KYC d'agence

- [x] Migration `add_expires_at_to_kyc_dossiers` (+ index nommé du Contrat de données).
- [x] `UploadKycDocumentRequest` : `expires_at` `required_if:document_type,director_id`, date
      postérieure à aujourd'hui ; stockée en propriété du média par `KycWorkflowService::upload`.
- [x] `KycWorkflowService::verify` : `expires_at` du dossier = plus petite échéance parmi les pièces
      **les plus récentes** de chaque type.
- [x] Commande `kyc:expire-dossiers`, planifiée chaque jour : relance des admins de l'agence à J-30 et
      J-7 (une seule fois chacune, mémorisée dans `metadata`) ; à l'échéance, le dossier repasse
      `pending`, `metadata.expired_at` est posé, l'activité `kyc_expired` écrite, et l'agence perd
      `is_verified` **sans** changer de statut (**option retenue par défaut** : la suspension relève de
      TCK-600 et serait disproportionnée pour une pièce à renouveler).
- [x] **Aucun contrôle de forme du NINEA ni du RCCM, aucune regex** (tranché par le porteur, D-68) :
      `SubmitAgencyUpgradeRequestRequest` garde `'string','max:30'` / `'max:60'`.
- [x] `Agency/KycController` (`upload`, `submit`) : autorisation par
      `canActAt(Capability::AgencyUpdateKyc, $agency)` ; `show` reste à l'admin.
- [x] `App\Services\Kyc\SharedLegalIdentifierDetector` : NINEA et RIB professionnel comparés à ceux
      des **autres** agences sur une forme normalisée qui ne suppose **aucun** format — tout blanc retiré
      (`preg_replace('/\s+/u', '')`), puis `mb_strtoupper`. Comparaison **en PHP** sur les valeurs
      déchiffrées (le chiffrement d'A2 interdit l'égalité SQL ; une demande par agence, le volume le
      permet). Sources : `agency_upgrade_requests` des autres agences (`pending` et `approved`), puis
      `agencies.ninea` après TCK-594. Résultat exposé au seul super-admin dans `KycDossierResource` et la
      demande de passage `standard` (`shared_identifiers` : `ninea` / `rib_pro`, identifiants des
      agences en conflit). Aucun refus automatique : un signal pour la revue.
- [ ] `KycDossierResource` expose `expires_at` et l'échéance de chaque pièce ; le front l'affiche.
- [x] Tests : `KycDossierExpiryTest`, `AgencyKycCapabilityTest`, `SharedLegalIdentifierTest`.

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
- [ ] Tests : `AgencyAuditScopeTest` (AC10 à AC14, AC12b, AC13b), `ActivityLogAgencyBackfillTest`.

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
      (`show`, `agency`), `KycDocumentController` (coordination 546), `OwnerProfileController::sensitive`,
      `Admin\AgencyUpgradeRequestController::show` (RIB et NINEA complets, A2).
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
- [ ] **AC4b** — `AgencyUpgradeRequestEncryptionTest` : en base, `agency_upgrade_requests.rib_pro` et
      `ninea` d'une demande soumise par `POST /api/agencies/{agency}/upgrade-requests` ne contiennent pas
      les valeurs témoins (lecture SQL brute) ; le modèle les relit intactes ; un RIB de 60 caractères
      s'enregistre. Rouge sur le code actuel ; rouge à nouveau si l'on retire le cast.
- [ ] **AC4c** — Après approbation d'une demande dont le RIB pro est un témoin : `agencies.metadata`
      (lecture SQL brute) ne contient pas le témoin, et `GET /api/agencies/{agency}` appelé par un
      bailleur, un agent puis l'admin de l'agence ne le contient nulle part dans le corps. Une agence dont
      `metadata.legal_info.rib_pro` préexiste ne le porte plus après la migration. Rouge sur le code
      actuel ; rouge à nouveau si `rib_pro` revient dans les champs recopiés par le flip.
- [ ] **AC5** — Un `.html`, un `.svg` et un fichier vide sont refusés (422) sur chacune des quatre
      routes d'upload KYC ; un `.heic` et un `.pdf` sont acceptés. Rouge sur le code actuel pour les
      trois routes `me/*`.
- [ ] **AC5b** — `DocumentUploadMimeTest` : un `.html`, un `.svg` et un fichier vide sont refusés (422,
      erreur sur `file`) sur `POST /api/documents` et `POST /api/documents/{document}/versions` ; un `.pdf`,
      un `.docx` et un `.heic` sont acceptés (201). Rouge sur le code actuel pour les deux routes ; rouge à
      nouveau si l'on retire `mimes`.
- [ ] **AC6** — Un échec forcé de `PropertyController::store` (contrainte violée) : **toutes** les entrées
      de log émises pendant la requête (écouteur `MessageLogged` ; message + contexte, chaque `Throwable`
      rendu par `(string) $e`) ne contiennent **aucune** valeur saisie (titre et adresse témoins) ;
      l'entrée du `catch` contient `payload_keys`. Rouge sur le code actuel (payload **et** rapport du
      framework) ; rouge à nouveau si l'on remet `getMessage()` dans le `catch`.
- [ ] **AC6b** — `SafeExceptionLoggingTest::test_le_rapporteur_ne_journalise_aucun_binding` : une
      insertion qui viole une contrainte d'unicité avec une valeur témoin (dans un point de sauvegarde),
      puis `report($e)` : aucune entrée de log ne contient le témoin (ni le `DETAIL` PostgreSQL) ; une
      entrée `query_exception` porte `sqlstate = 23505` et un `sql` à placeholders `?`. Rouge sur le code
      actuel ; rouge à nouveau si l'on retire le `->stop()` (le rapport par défaut réécrit le message).
- [ ] **AC6b-bis** — `SafeExceptionLoggingTest::test_aucun_message_hors_sql` : `SafeExceptionContext::of()`
      d'une `Symfony\Component\Mailer\Exception\TransportException` dont le message porte une adresse
      témoin rend un tableau sans clé `message` et dont aucune valeur ne contient le témoin. Rouge si
      l'on remet la branche `message` pour les exceptions non SQL.
- [ ] **AC6c** — Même assertion (aucun témoin dans aucune entrée de log ni dans `errors`) pour une
      `QueryException` témoin levée dans `AgencyKindFlipService::flip` (via
      `FlipAgencyKindOnUpgradeApproved`), à l'expiration d'une réservation (`BookingExpirationService`,
      écrivain d'événement `updating` qui lève) et passée à `ExpirePendingBookingsJob::failed`. Rouge sur
      le code actuel pour les trois.
- [x] **AC7** — Un upload `director_id` sans `expires_at` ou avec une date passée → 422. Après
      vérification, `expires_at` du dossier vaut l'échéance de la pièce la plus récente.
- [x] **AC8** — `kyc:expire-dossiers` (horloge figée) : à J-30 puis J-7, une notification par admin,
      jamais deux fois ; le jour d'échéance, dossier `pending`, `is_verified = false`, statut de l'agence
      inchangé, activité `kyc_expired`.
- [x] **AC9** — `SharedLegalIdentifierTest` : l'agence A a une demande `approved` de NINEA `00123452g3`
      et de RIB `SN0123456789` ; l'agence B soumet `0012345 2G3` et `sn 0123 4567 89`. La demande de B,
      lue par le super-admin, porte `shared_identifiers.ninea = [A]` et `shared_identifiers.rib_pro = [A]` ;
      lue par l'admin de B, elle ne porte pas la clé. Une agence C au NINEA différent d'un caractère ne
      porte aucun signal. Un NINEA `ABC` est **accepté** (201) : aucun contrôle de forme (D-68). Rouge
      sur le code actuel (clé absente).
- [x] **AC9b** — Un membre de l'agence à qui un rôle personnalisé donne `agency.update_kyc` dépose une
      pièce (201) ; un admin dont le rôle la retire reçoit 403. Ablation : revenir à `isAgencyAdminAt`
      → rouge.
- [ ] **AC10** — L'admin 1 de l'agence A voit l'activité causée par l'admin 2 de A (qui n'a **que** un
      `AgencyAdminProfile`, créé sans le pont `agency_id`). Rouge sur le code actuel.
- [ ] **AC11** — L'admin de A voit une activité système (`causer` nul) sur un sujet de A.
- [ ] **AC12** — Un bailleur présent chez A et B cause une activité sur un sujet de B : l'admin de A ne
      la voit **ni** dans la liste, **ni** dans l'export ; l'admin de B la voit. Rouge sur le code
      actuel ; rouge à nouveau si le filtre revient sur l'acteur.
- [ ] **AC12b** — Un admin de A **et** de B (deux `AgencyAdminProfile`), profil actif A, lance l'export
      de l'audit : le fichier produit par le job contient les entrées de A (au moins une, valeur témoin
      attendue) et aucune de B. Rouge sur le code actuel (fichier vide : `request()` nul dans le job).
- [ ] **AC13** — `GET /api/activity-log/payout/{id}` et `/api/audit-log/payout/{id}` d'un reversement de
      B, appelé par l'admin de A → aucune entrée ; le même appel par l'admin de B rend les entrées du
      reversement, et aucune d'un `PlatformPayout` de même identifiant. Rouge sur le code actuel.
- [ ] **AC13b** — Une activité sur un sujet de A dont `properties` porte `rib`, `iban`, `tax_id` et
      `ninea` témoins : ni la liste de l'audit d'agence (admin de A), ni l'audit plateforme, ni leurs
      exports ne contiennent un témoin ; les clés restent, valeur `[REDACTED]`. Rouge sur le code actuel
      (audit d'agence non expurgé, liste plateforme sans ces clés).
- [ ] **AC14** — Après la migration de rattrapage, une activité préexistante sur un `LeasePayment` de A
      porte `agency_id = A` ; une activité sur un `User` porte `null`.
- [ ] **AC15** — Remplacer les capacités d'un rôle crée `role_capabilities_changed` avec `added` et
      `removed` exacts, et notifie les autres admins de l'agence (pas l'auteur) ; une entrée
      `data_exported` d'entité `customers` notifie de même. Modifier le RIB d'un
      bailleur ne laisse aucune valeur de RIB dans `activity_log` (recherche de la valeur témoin dans
      toute la ligne). Changer le `commission_rate` de l'agence écrit une entrée `updated` avec l'ancienne
      et la nouvelle valeur ; changer les `credentials` d'une `Integration` écrit `credentials_changed:
      true` et aucune valeur de secret. Rouge sur le code actuel (aucune entrée).
- [ ] **AC16** — Ouvrir le détail d'un utilisateur, ses sessions, un dossier KYC et une pièce KYC depuis
      la console écrit chacun une entrée `personal_data_viewed` ; deux ouvertures en 15 min, une seule.
- [ ] **AC17** — `GET /api/admin/audit/export` rend un lien signé ; le fichier respecte les filtres et
      `filter[sensitive]=1` ; aucune valeur expurgée n'y figure ; l'export est journalisé. 403 pour un
      admin d'agence.
- [ ] **AC18** — Une demande d'export ou de suppression par un utilisateur crée une entrée du registre
      avec `due_at` attendu ; annuler la suppression passe l'entrée à `withdrawn` sans la supprimer ; une
      demande saisie à la main, puis répondue avec preuve, apparaît dans l'export CSV. 403 pour tout
      non-super-admin.
- [ ] **AC18b** — Front : le journal d'audit de l'agence propose un choix de membre qui envoie
      `filter[causer_id]` ; une ligne sans acteur se lit « Système » dans les trois langues (test de
      composant). Rouge sur le code actuel.
- [ ] **AC19** — `./vendor/bin/pint` propre ; `npm run lint` et `npx tsc --noEmit` propres ; tests des
      classes touchées verts ; `php artisan migrate:fresh --seed` passe.

## Hors périmètre

- **TCK-546** : rendre une pièce KYC ouvrable depuis le navigateur (lien signé, BFF, gardes du
  `KycDocumentController`). Ce ticket n'y ajoute qu'une ligne de journalisation.
- **TCK-537** : planifier `activitylog:clean`, purger les pièces KYC et les contacts anonymes,
  anonymiser les profils à la suppression du compte, preuve du consentement. Ce ticket **demande** à 537
  d'exempter les journaux `PersonalDataAccess` et `Privacy` de la purge à 365 jours (**option retenue
  par défaut** : 5 ans, voir ADR) ; il ne planifie aucune purge. Ces journaux n'existent pas avant ce
  ticket : rien n'est purgé à tort aujourd'hui.
- La déclaration du traitement à la CDP (loi n° 2008-12) et le délai juridique exact : gestes du porteur,
  hors code ; le registre ne fait que le rendre exportable.
- Expiration des pièces KYC des profils (bailleur, agent, prestataire) : ce sont des `Document`, pas un
  `KycDossier` ; ticket à part si besoin.
- Un index d'unicité sur `agencies.ninea` (colonne de TCK-594) ; la détection de doublons
  d'annonces (TCK-597) ; la recherche du RIB chiffré d'un bailleur (empreinte HMAC, si l'ADR la retient).
- Alerte sur un reversement au-delà d'un seuil : la double validation de TCK-594 en tient lieu.
- **Contrôle de forme du NINEA et du RCCM** : tranché par le porteur le 2026-10-06, pour plus tard,
  consigné en dette **D-68**. La détection de doublons (C) n'en dépend pas.
- `SubmitQuoteRequest` (`attachments.*` sans `mimes`, `SubmitQuoteRequest.php:29`) : porté par
  **TCK-592** (son Delta E, `mimes:pdf,jpg,jpeg,png,webp`, et son AC qui rougit sur un `.html`).
- Les `catch` qui journalisent `getMessage()` (ou la ligne brute) dans les fichiers d'autres tickets,
  **à porter par ces tickets** (la session les y ajoute) : `ParseBankStatementJob.php:107-111`
  (bindings de 500 lignes de relevé) et `CsvDriver.php:50-54` (`record`, libellés bancaires) → TCK-593,
  qui réécrit ces deux blocs ; `SendSavedSearchAlerts.php:101-106` → TCK-599, qui le réécrit en entier.
  Le rapporteur global de B couvre leur relance quand il y en a une ; `SafeExceptionContext` est l'outil
  à réutiliser.
- Un motif de consultation obligatoire avant d'ouvrir une donnée personnelle.

## Notes d'implémentation

### Re-mesure sur `dev` (`f1220c3c`, 2026-10-08)

- A : les prémisses tiennent (colonnes `varchar` en clair, `$queryFields`/`requestSearchFields`,
  `GET /api/owners` brut). `OwnerProfilePolicy::viewAny` lit toujours `isAgencyAdminAt || isAgentAt`.
  Le masqueur `BankStatementController::maskIban` existe (format `SN12 **** **34`). `/api/users?include=ownerProfiles`
  et tout `toArray()` d'un profil (`MeProfiles`, `Admin/UserDetail`, `AgencyDetail`) sont fermés par le
  même `$hidden`, pas un par un.
- 594 (non fusionné) garde `rib_pro` dans `LEGAL_FIELDS` et déplace `rc`/`ninea`/`company_legal_name`/
  `address_fiscale` vers des colonnes ; son `PayoutMethod::mask()` = `'•••• '.tail(4)` après retrait
  des blancs, soit exactement `Masking::tail()`.

### A — données sensibles du bailleur (commit `feat(api): chiffrer le RIB…`)

- `Masking::iban()` garde le code pays et les 2 derniers caractères (`SN•• •••• ••89`) : le relevé
  bancaire, qui gardait 4 caractères en tête (`SN12 ****`), en montre désormais moins — écart voulu.
- `GET /api/owners` : les colonnes sensibles ne sont plus demandables (`fields[]` → 400) mais le
  contrôleur les ajoute au `select` pour que la Resource calcule leurs masques ; sans `fields[]`,
  `select *` les charge déjà.
- `viewSensitive` exige que le profil actif soit dans l'agence du profil (principe n° 2), pas
  seulement un `AgencyAdminProfile` quelque part.
- Tests : `OwnerProfileSensitiveDataTest` 7/7 (+ `OwnerProfileListingTest` 5/5, comptabilité et export
  74/74). Ablations (`scratchpad/t601/ablations.log`) : `$hidden` retiré → 2 rouges ; Resource
  retirée → rouge ; policy à `true` → rouge ; cast retiré → 2 rouges ; `makeVisible` retiré → rouge.

### A2 — identifiants légaux de la demande de passage

- Migration `2026_10_08_601200` : `ninea`/`rib_pro` en `text` chiffré, puis `metadata #- '{legal_info,rib_pro}'`
  (le `?` jsonb est évité : PDO le prend pour un paramètre). `down()` : déchiffre, `string`, recopie
  `rib_pro` de la dernière demande `approved` (aller-retour testé).
- `AgencyKindFlipService::LEGAL_FIELDS` perd `rib_pro` ; `AgencyResource` rend `metadata` sans
  `legal_info.rib_pro` (`Arr::except`). 594 garde `rib_pro` dans sa liste : le second à fusionner le retire.
- Tests : `AgencyUpgradeRequestEncryptionTest` 5/5 (+ `AgencyKindFlip`/`Submission`/`UpgradeRequest` 29/29).
  Ablations : cast retiré → 2 rouges ; `rib_pro` remis au flip → rouge ; `Arr::except` retiré → rouge ;
  journalisation du `show` retirée → rouge.

### B — pièces, documents et journaux

- Les listes vivent dans `App\Support\Uploads\AcceptedUploads` (`kyc()`, `document()`), lues par les six
  requêtes. `min:1` (Ko) refuse le fichier vide, mais aussi une image factice 10×10 : trois tests
  d'onboarding passent désormais `->size(200)` à `UploadedFile::fake()->image()`.
- `failed_jobs.exception` (contrainte 2, fuite relevée par la vague) : tranché par l'ADR-0044 §2 —
  décorateur `SanitizingFailedJobProvider` de `queue.failer`, qui écrit la forme sûre ; le `payload`
  reste (rejeu).
- Raccords de 593 faits (`ParseBankStatementJob`, `CsvDriver`) ; `test_le_journal_ne_porte_aucune_valeur_du_releve`
  rejoué, vert ; case de TCK-593 cochée.
- Tests : `KycUploadMimeTest` 8/8, `DocumentUploadMimeTest` 2/2, `PropertyStoreFailureLogTest` 1/1
  (contrainte `CHECK` posée dans la transaction du test : le `DETAIL` cite la ligne entière),
  `SafeExceptionLoggingTest` 5/5 ; 15 classes d'upload existantes 230/230 ; réservations, flip,
  comptabilité, prose 70/70. Ablations : `mimes` retirés (bailleur, dépôt, version) → rouges ;
  `->stop()` retiré → 3 rouges ; `getMessage()` remis au `catch` → rouge ; branche `message` remise
  hors SQL → 5 rouges ; décorateur retiré → rouge.


### D — audit d'agence (back)

- `App\Models\Activity` (déclaré dans `config/activitylog.php`) résout `agency_id` à la création par
  `AuditAgencyResolver` ; `HasAuditAgency` posé sur `LeasePayment`, `BookingPayment`,
  `BankStatementLine`, `KycDossier`, et aussi `MaintenanceRequest` (→ bien) et `CustomerNote` (→ fiche
  client), deux enfants sans colonne `agency_id` relevés à la re-mesure. L'écouteur `DispatchAlerts`
  passe sur la nouvelle classe (un événement de modèle se nomme par classe).
- `AuditScope` est le seul périmètre de lecture (liste, historique d'un objet, export synchrone et job).
  `indexByEntity` : classe exacte (`App\Models\<Studly>`, slug `[a-z0-9_-]`, classe non abstraite),
  sinon 404. L'export reçoit l'agence du profil actif à la répartition.
- `PropertyRedactor` : secrets par sous-chaîne (liste de TCK-144), identifiants par **segment**
  (`rib`, `rib_pro`, mais ni `attributes` ni `distribution`).
- Tests : `AgencyAuditScopeTest` 9/9, `ActivityLogAgencyBackfillTest` 2/2 ; classes d'audit existantes
  (`ActivityLogEndpoint`, `ActivityLogExporter`, `AuditLog`, `ExportActivityLogPolicy`, `CrossTenantAudit`,
  `AgencyModeration`, `SuperAdminInvitationLifecycle`) : 70/70 au total. Ablations : filtre remis sur
  l'acteur → 7 rouges ; `LIKE` remis → rouge ; filtre d'agence retiré d'`indexByEntity` → rouge ;
  `request()` relu dans le job → rouge ; agence non transmise au job → rouge ; expurgation retirée de
  la liste → rouge, de l'export → rouge ; segments d'identifiants vidés → rouge ; enfant retiré du
  rattrapage → rouge.

### F — consultations et audit plateforme (back)

- Appels `PersonalDataAccessLogger::record()` posés après les gardes : `Admin/UserDetailController`
  (`show`, `sessions`, `activity` — ce dernier **après** la lecture, sinon la page montrait sa propre
  trace et `UserDetailTest` comptait trois lignes au lieu de deux), `Admin/KycController` (`show`,
  `agency`), `KycDocumentController` (un appel, coordination 546 ; sujet = le dossier, pour que la
  trace porte l'agence ; deux pièces du même dossier dans la fenêtre comptent pour une).
- **Step-up (raccord 589)** : `OwnerProfileController@sensitive` rejoint `ProtectedActions::STEP_UP`,
  au même titre que la lecture des codes de secours — c'est une lecture de secret. Les autres routes
  de 601 suivent le classement de 589 sans ajout : console (`/api/admin/*`) déjà sous 2FA, KYC
  d'agence hors des familles protégées.
- `GET /api/admin/audit/export` : mêmes filtres que l'index (QueryBuilder partagé), CSV écrit sur le
  disque, lien signé d'une heure (route de téléchargement de l'export d'agence), plafond 50 000
  lignes (`activity_log.export_too_large`), journalisé `export`/`audit_exported`.
  `filter[sensitive]=1` lit `CrossTenantAuditController::SENSITIVE_LOG_NAMES`.
- Tests : `PersonalDataAccessLogTest` 3/3, `CrossTenantAuditExportTest` 4/4, `OwnerProfileSensitiveDataTest`
  7/7 (AC3 joué avec step-up : sans TOTP récent 403 `two_factor_step_up_required` et aucune trace ;
  refus de policy `http.forbidden` pour l'agent et l'admin d'ailleurs, step-up fait), `Api/Admin/*`
  et `KycDocumentAccessTest` 191/191. Ablations : trace du détail retirée → rouge ; du dossier (show)
  → rouge ; du dossier (agence) → rouge ; de la pièce → rouge ; fenêtre de 15 min neutralisée →
  rouge ; préréglage sensible vidé → 2 rouges ; expurgation de l'export retirée → rouge ; journal de
  l'export retiré → rouge ; step-up retiré → rouge ; policy à `true` (step-up fait) → rouge.

### C — KYC d'agence (back)

- `kyc_dossiers.expires_at` (migration `2026_10_08_601500`, index `kyc_dossiers_status_expires_idx`).
  L'échéance d'une pièce est une propriété du média, exigée pour `director_id` et postérieure à
  aujourd'hui. `KycWorkflowService::expiryOf` prend la pièce **la plus récente** de chaque type, puis
  la plus proche des échéances ; `verify` la pose et efface `expiry_reminders` / `expired_at`.
- `kyc:expire-dossiers` (`KycExpiryService`, chaque jour à 06:00) : un passage relance au **jalon le
  plus proche atteint** et le mémorise — un passage manqué à J-30 relance une fois à J-29, jamais deux
  fois d'un coup ; seuls les admins **actifs** sont relancés (`kyc.expiring_soon`, préférence
  `kyc_status_changed`). À l'échéance : `pending`, `metadata.expired_at`, activité `kyc_expired`
  (rattachée à l'agence par D), `is_verified = false`, statut de l'agence inchangé.
- `Agency/KycController::upload|submit` : `canActAt(Capability::AgencyUpdateKyc)` **sur l'agence du
  profil actif** (comme l'ancienne garde) ; `show` reste à l'admin. `agency.update_kyc` quitte
  `CapabilityEnforcementInventory::AWAITING`, `CLIQUET` 14 → 13 (raccord 594, qui l'abaisse aussi).
- `SharedLegalIdentifierDetector` : forme normalisée sans format (blancs retirés, `mb_strtoupper`),
  comparée en PHP aux demandes `pending`/`approved` des **autres** agences, mémorisée par requête
  HTTP (une liste ne déchiffre qu'une fois). Exposé au seul super-admin sur la demande de passage et
  sur le dossier KYC d'une agence. Aucun refus ; aucun contrôle de forme (`ABC` → 201).
- Trouvé en passant par `DateInventoryByValueTest` : `OwnerProfileResource` (A) rendait ses instants
  en `…000000Z` (ADR-0018) — réécrits par `iso()` ; inscrite au registre (`MODELES_EXPLICITES`), et
  les deux `shared_identifiers` en `CLES_JAMAIS_ATTEINTES` (listes d'agences, aucune date).
- Les six codes de notification de C et E (`kyc.expiring_soon`, `governance.*`) : textes API et front
  (`check-notification-codes` vert, 50 codes).
- Tests : `KycDossierExpiryTest` 3/3, `AgencyKycCapabilityTest` 5/5, `SharedLegalIdentifierTest` 2/2 ;
  KYC, demandes de passage, onboarding, notifications, `Privacy/*`, ressources : verts (287 puis 66).
  Ablations : capacité retirée → rouge ; agence du profil actif à `true` → **vert** au premier jet
  (le cas « autre agence » est fermé par `canActAt` seul) → test ajouté (admin de B agissant comme
  agent de A) → rouge ; `required_if` retiré → rouge ; `after:today` retiré → rouge ; « pièce la plus
  récente » retirée → rouge ; mémoire des relances retirée → rouge (deux fois) ; admins actifs non
  filtrés → rouge ; `is_verified` conservé → rouge ; normalisation retirée → rouge ; exclusion de sa
  propre agence retirée → rouge ; `when(super-admin)` à `true` → rouge ; signal du dossier coupé →
  rouge. Le marquage des jalons plus lointains (« rattraper sans doubler ») était un **mutant
  équivalent** (vert) : le jalon le plus proche seul suffit, le code a été simplifié.

### G — registre des demandes de droits (back)

- `privacy_requests` (migration `2026_10_08_601400`), `PrivacyRequest` (journal `Privacy`, liste
  blanche sans nom, contact ni résumé), trois enums, `config/privacy.php` (30 jours, variable
  `PRIVACY_RIGHTS_REQUEST_DEADLINE_DAYS`). `due_at` est **dérivé** à l'enregistrement, jamais saisi.
- `PrivacyRegistryObserver` : export demandé **par son titulaire** → `portability` (un export lancé
  par la plateforme répond à une demande déjà inscrite, il n'en ouvre pas une seconde) ; export prêt
  → `answered`. Effacement → `erasure` ; exécution → `answered` ; annulation → `withdrawn`, saisi
  sur `deleting` parce que la FK `nullOnDelete` efface le lien avant tout `deleted`.
- `Admin\PrivacyRequestController` (`index` par échéance, `filter[overdue]`, `store`, `update` —
  multipart par `_method=PATCH` pour la preuve —, `export` CSV journalisé). Une demande close ne se
  rouvre pas (`privacy.request_closed`). `PrivacyRequestPolicy` refuse tout le monde hors
  `Gate::before` (super-admin), en plus du middleware `super-admin`.
- Tests : `PrivacyRequestRegistryTest` 6/6 ; suppression de compte, exports, `Privacy/*`, seeders 82/82.
  Ablations : `deleting` retiré → rouge ; `created` d'effacement retiré → rouge ; `created` d'export
  retiré → rouge ; filtre « lancé par la plateforme » neutralisé → rouge ; garde de réouverture
  retirée → rouge ; `mimes` de la preuve retirés → rouge ; `logOnly` remplacé par `logFillable` →
  rouge (nom du demandeur dans le journal) ; `due_at` non dérivé → rouge.
