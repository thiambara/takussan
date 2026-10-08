# ADR-0044 — Données personnelles : chiffrement applicatif, périmètre d'agence du journal, registre des droits

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-601](../backlog/tickets/TCK-601-donnees-personnelles-audit-kyc.md)

## Contexte

Relevé sur `dev` (`f1220c3c`) le 2026-10-08, avant tout code :

- `owner_profiles.rib`, `tax_id`, `id_document_number` sont des `varchar(255)` en clair
  (`2026_05_02_000001_create_owner_profiles_table.php:16-19`), rendus bruts par `GET /api/owners`
  (`OwnerProfileController::index`, `$paginator->items()`) et par tout `toArray()` d'un profil —
  dont `/api/users?include=ownerProfiles`. `agency_upgrade_requests.ninea` et `rib_pro` sont en clair
  aussi, et le RIB professionnel est **recopié** dans `agencies.metadata.legal_info.rib_pro`
  (`AgencyKindFlipService::LEGAL_FIELDS`), que `AgencyResource` rend verbatim à tout membre.
- Le chiffrement du dépôt (`Crypt`, AES-256-CBC, `APP_KEY`) produit 200 caractères pour 13 en
  entrée, 256 pour 34 : il ne tient pas dans un `varchar(255)`. Quatre colonnes sont déjà chiffrées
  par cast (`users.two_factor_secret`, `two_factor_recovery_codes`, `integrations.credentials`,
  `data_exports.archive_path`) ; **aucun document ne dit ce que devient la donnée si `APP_KEY` est
  perdue ou changée.**
- Le journal d'agence (`AuditLogController::index`) filtre sur l'**acteur** : les actes d'un admin
  qui n'a qu'un `AgencyAdminProfile` sont invisibles, ceux d'un bailleur présent chez A et chez B
  sont visibles de A même quand ils portent sur B, et les actes système sont exclus.
  `indexByEntity` n'a **aucun** filtre d'agence. `activity_log` n'a pas de colonne d'agence.
- Toute `QueryException` non rattrapée est journalisée par le rapporteur du framework avec son
  message, qui porte les valeurs liées et le `DETAIL` PostgreSQL ; `failed_jobs.exception` reçoit
  `(string) $e`, message **et** trace.
- Aucune trace ne reste d'une consultation de données personnelles depuis la console, et l'annulation
  d'une demande d'effacement **supprime** sa seule trace (`AccountDeletionService::cancelDeletion`).

## Décision

**Une donnée personnelle sensible est chiffrée par le cast `encrypted` de Laravel sous `APP_KEY`,
ne sort jamais en clair ni dans une réponse par défaut, ni dans un journal ; le journal d'audit est
cloisonné par l'agence de son SUJET ; chaque consultation et chaque demande de droits laisse une
trace conservée cinq ans.**

### 1. Chiffrement applicatif, et la clé qui le porte

- **Mécanisme** : cast `encrypted` sur des colonnes `text`. Retenu pour `owner_profiles.rib`,
  `tax_id`, `id_document_number` et `agency_upgrade_requests.ninea`, `rib_pro` ; tout RIB stocké
  ailleurs (moyens de versement de TCK-594) suit la même forme. Les migrations chiffrent l'existant
  par lots, de façon idempotente (une valeur déjà déchiffrable est laissée telle quelle), et leur
  `down()` **déchiffre** — l'aller-retour est testé.
- **`APP_KEY` devient une donnée de production à part entière.** Elle chiffre désormais des données
  qu'aucune autre source ne détient : la perdre rend ces colonnes **définitivement illisibles**.
  Elle se sauvegarde hors de l'hébergeur (coffre du porteur), au même titre qu'une sauvegarde de base,
  et une restauration de base sans la clé de la même époque est une restauration ratée.
- **Rotation** : la nouvelle clé va dans `APP_KEY`, l'ancienne dans `APP_PREVIOUS_KEYS` (liste
  séparée par des virgules, lue par `config('app.previous_keys')`) ; Laravel déchiffre avec la
  courante puis les précédentes. Une clé ne quitte `APP_PREVIOUS_KEYS` qu'après un ré-chiffrement
  complet (relire puis réécrire chaque valeur à travers le cast) — commande à écrire par le ticket qui
  fera la première rotation ; aucune rotation n'est prévue avant.
- **Recherche** : une colonne chiffrée n'est plus cherchable (l'IV aléatoire interdit même
  l'égalité). **Pas d'empreinte HMAC** : aucun écran ne cherche un RIB, et une empreinte est une
  seconde copie dérivée à gouverner. Si le besoin naît, ce sera une colonne `<col>_hmac`
  (HMAC-SHA256 sous une clé **distincte** d'`APP_KEY`), par ADR.
- **Masquage** : une seule fonction, `App\Support\Masking` — `iban()` (forme `SN•• •••• ••34`) et
  `tail()` (quatre derniers caractères). Les autres masqueurs s'y ramènent.
- **Écarté** : chiffrement au niveau de PostgreSQL (`pgcrypto`) — la clé voyagerait dans chaque
  requête SQL, donc dans ses journaux et dans les `QueryException` ; chiffrement d'une clé d'un
  `jsonb` — la copie `metadata.legal_info.rib_pro` n'a aucun lecteur : elle est **supprimée**, pas
  chiffrée.

### 2. Rien de sensible dans un journal

- `App\Support\Logging\SafeExceptionContext::of()` est la forme d'une exception dans les journaux
  que ce ticket écrit ou reprend : classe, code, et pour une `QueryException` le SQLSTATE, le SQL à
  placeholders, la connexion et le **nombre** de valeurs liées ; une trace réduite à `fichier:ligne`.
  Jamais `getMessage()` (le message d'une exception est une donnée : bindings, adresse refusée par
  un serveur SMTP, valeur refusée par une validation), jamais l'objet exception.
- `bootstrap/app.php` déclare `report(QueryException)->stop()` : le rapport par défaut de toute
  `QueryException`, quelle que soit la route ou le job, est remplacé par `query_exception` +
  `SafeExceptionContext`.
- **Ce qui est garanti, exactement** (corrigé après verif-601, m4) : **toute `QueryException`**
  rapportée par le framework, les `catch` repris par ce ticket (`PropertyController::store`,
  `FlipAgencyKindOnUpgradeApproved`, `ExpirePendingBookingsJob::failed`) et `failed_jobs.exception`.
  Une version antérieure de ce paragraphe disait « la **seule** forme d'une exception dans un
  journal » : c'était faux.
- **Limites connues, hors de cette décision** (ticket de suite) : toute AUTRE exception rapportée par
  le framework (requête HTTP qui lève, job en échec) passe encore par le rapport par défaut, qui écrit
  `getMessage()` — un refus SMTP y recopie l'adresse refusée ; les pilotes SMS et WhatsApp
  (`OrangeSmsDriver`, `MtargetSmsDriver`, `LAfricaMobileSmsDriver`, `CloudApiWhatsappDriver`) et deux
  commandes (`SendSavedSearchAlerts`, renvoyé à TCK-599 ; `SendProspectMatchDigest`) journalisent
  `getMessage()`. Élargir le rapporteur global touche tout le dépôt (`dontReport`, rapporteurs
  tiers) : c'est une décision à part, pas un correctif de ce ticket.
- **`failed_jobs.exception`** : le fournisseur de jobs échoués (`queue.failer`) est **décoré** pour
  écrire `SafeExceptionContext` (JSON) au lieu de `(string) $e`. Écarté : une purge périodique (la
  donnée vit jusqu'au passage) et `zend.exception_ignore_args` seul (il ne retire pas les valeurs du
  message). Le `payload` reste intact : il est nécessaire au rejeu.
- Un modèle `Auditable` journalise une **liste blanche** (`logOnly`), jamais tout son `fillable`.
  Une donnée chiffrée n'y figure jamais ; une `Integration` journalise `credentials_changed: true`,
  sans valeur.
- Les lectures du journal (audit d'agence, audit plateforme et leurs exports) passent `properties`
  par `App\Support\Audit\PropertyRedactor` : toute clé dont le nom évoque un secret ou un
  identifiant (`password`, `token`, `rib`, `iban`, `tax_id`, `ninea`, `id_document`…) rend
  `[REDACTED]`. C'est une défense en profondeur, pas le mécanisme principal.

### 3. Le journal est cloisonné par l'agence de son SUJET

`activity_log.agency_id` (nullable, FK `nullOnDelete`) est résolu **à l'écriture** par
`App\Services\Audit\AuditAgencyResolver`, dans cet ordre :

1. `agency_id` passé explicitement à l'écriture (`withProperties`/attribut) ;
2. `auditAgencyId()` du sujet s'il implémente `App\Models\Contracts\HasAuditAgency` (modèles enfants :
   `LeasePayment` → bail, `BookingPayment` → réservation, `BankStatementLine` → relevé, `KycDossier`
   → agence sujet) ;
3. la colonne **réelle** `agency_id` du sujet, lue dans `getAttributes()` — **jamais** l'accesseur
   pont `User::getAgencyIdAttribute()`, qui dérive de l'acteur ;
4. sujet `Agency` → son identifiant ;
5. **sans sujet seulement** : l'agence du profil actif de la requête HTTP ;
6. sinon `null` — visible du seul super-admin.

**L'acteur n'entre jamais dans la résolution.** Un admin d'agence voit `agency_id = <agence de son
profil actif>`, et rien d'autre — actes d'autres admins et actes système compris. `indexByEntity`
résout le type en classe exacte (plus de `LIKE`) et applique le même filtre. L'export asynchrone
reçoit l'`agency_id` à la répartition : un job n'a pas de requête. Le rattrapage des lignes
existantes se fait par migration, une jointure par type de sujet.

### 4. Les consultations et les demandes de droits laissent une trace

- `App\Services\Privacy\PersonalDataAccessLogger::record(viewer, subject, surface)` écrit une
  activité `personal_data_viewed` dans le journal `PersonalDataAccess`, au plus une par (lecteur,
  sujet, surface) par fenêtre de **15 minutes** — un rafraîchissement n'est pas une seconde
  consultation. Surfaces : détail, sessions et activité d'un utilisateur, dossier et pièce KYC,
  valeurs complètes d'un bailleur, demande de passage en agence ; `global_search` est réservée à
  TCK-600.
- **Registre des demandes de droits** : table `privacy_requests` (demandeur — `user_id` nullable,
  nom, contact —, `type`, `channel`, `received_at`, `due_at`, `status`, `answered_at`,
  `response_summary`, `handled_by`, liens nullables vers `data_exports` et
  `account_deletion_requests`, preuve de réponse en média privé). Types : `access`,
  `rectification`, `opposition`, `erasure`, `portability`. Statuts : `received`, `in_progress`,
  `answered`, `rejected`, `withdrawn`. Une demande d'export crée une entrée `portability`, une
  demande d'effacement une entrée `erasure` ; l'annulation de l'effacement passe l'entrée à
  `withdrawn` **sans l'effacer**. Une demande reçue par courriel se saisit à la main. Super-admin
  seul.
- **Délai de réponse** : `config('privacy.rights_request_deadline_days')`, **30 jours** par défaut —
  valeur de travail, à confirmer par le conseil juridique avant la production (loi n° 2008-12 ;
  la déclaration à la CDP est un geste du porteur, hors code). `due_at = received_at + délai`.
- **Conservation** : les journaux `PersonalDataAccess` et `Privacy` se conservent **5 ans**, alignés
  sur la conservation KYC. La purge du journal (`activitylog:clean`, 365 jours) n'est pas planifiée
  aujourd'hui ; TCK-537, qui la planifiera, doit **exempter** ces deux journaux.

### 5. Le KYC d'agence a une échéance

`kyc_dossiers.expires_at` = la plus petite échéance parmi les pièces **les plus récentes** de chaque
type (seule la pièce du dirigeant en porte une). À l'échéance, le dossier repasse `pending` et
l'agence perd `is_verified` **sans changer de statut** : la suspension relève de TCK-600 et serait
disproportionnée pour une pièce à renouveler. Le NINEA et le RIB professionnel d'une demande de
passage sont comparés à ceux des autres agences (forme normalisée sans aucun format supposé,
comparaison en PHP sur les valeurs déchiffrées) : un signal pour le super-admin, jamais un refus.
Aucun contrôle de forme du NINEA ni du RCCM (dette D-68).

## Conséquences

- **Perdre `APP_KEY`, c'est perdre des données**, et non plus seulement des sessions. La
  sauvegarde de la clé devient une obligation d'exploitation (`docs/infra/hebergement.md`, à porter
  par la session).
- Une colonne chiffrée ne se trie, ne se filtre ni ne se cherche plus : `requestSearchFields`
  d'`OwnerProfile` devient `['employer']`. Une écriture brute (`DB::table()->update`) sur ces colonnes
  doit poser une valeur chiffrée ou `null`, sinon la lecture lève `DecryptException` — TCK-537
  (anonymisation) écrit à travers le cast.
- Le droit d'accès reste entier : l'export `DataExportBuilder` rend les valeurs complètes au
  titulaire (`makeVisible`).
- Une ligne de journal sans agence résolue n'est visible que du super-admin : c'est le prix de
  « jamais l'acteur ».
- Le diagnostic d'une erreur SQL se fait par SQLSTATE, SQL à placeholders et `fichier:ligne` ; la
  valeur fautive ne se lit plus dans les journaux, par construction.

## Application

- Chiffrement : `OwnerProfile`, `AgencyUpgradeRequest` (casts, `$hidden`, `SENSITIVE`) ; migrations
  `encrypt_sensitive_columns_on_owner_profiles`, `encrypt_legal_identifiers_on_agency_upgrade_requests`
  ; `OwnerProfileSensitiveDataTest`, `AgencyUpgradeRequestEncryptionTest` (aller-retour du `down()`).
- Journaux : `SafeExceptionContext`, `bootstrap/app.php`, décorateur de `queue.failer` ;
  `SafeExceptionLoggingTest`, `PropertyStoreFailureLogTest`.
- Journal d'agence : `App\Models\Activity` (déclaré dans `config/activitylog.php`),
  `AuditAgencyResolver`, `PropertyRedactor` ; `AgencyAuditScopeTest`, `ActivityLogAgencyBackfillTest`.
- Consultations et registre : `PersonalDataAccessLogger`, `PrivacyRequest` ;
  `PersonalDataAccessLogTest`, `PrivacyRequestRegistryTest`, `CrossTenantAuditExportTest`.
