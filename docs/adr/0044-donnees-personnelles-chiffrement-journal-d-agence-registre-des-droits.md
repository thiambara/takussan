# ADR-0044 — Données personnelles : chiffrement applicatif, périmètre d'agence du journal, registre des droits

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-601](../backlog/tickets/TCK-601-donnees-personnelles-audit-kyc.md)
- **Amendement du 2026-10-16 ([TCK-723](../backlog/tickets/TCK-723-adr-0044-etendu-et-erratum-adr-0055.md))** : la règle du §1 s'étend au numéro de pièce du locataire et de la caution (`customers.id_number`, `guarantors.id_number`) ; les jobs échoués sont purgés à **30 jours**. le revenu mensuel de la caution et du bailleur suit la même règle, et seul l'admin d'agence lit la valeur claire. Voir [§ Amendement du 2026-10-16](#amendement-du-2026-10-16--la-pièce-du-locataire-et-de-la-caution-et-la-purge-des-jobs-échoués-tck-723).

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
  ailleurs (moyens de versement de TCK-594) suit la même forme. **Étendu le 2026-10-16** à
  `customers.id_number` et `guarantors.id_number` ([§ Amendement](#amendement-du-2026-10-16--la-pièce-du-locataire-et-de-la-caution-et-la-purge-des-jobs-échoués-tck-723)). Les migrations chiffrent l'existant
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
  message). Le `payload` reste intact : il est nécessaire au rejeu. **Depuis le 2026-10-16**, sa
  durée de vie est bornée à 30 jours par `queue:prune-failed` ([§ Amendement](#amendement-du-2026-10-16--la-pièce-du-locataire-et-de-la-caution-et-la-purge-des-jobs-échoués-tck-723)) :
  l'écart de la purge vaut pour l'exception, pas pour le `payload`.
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
  aujourd'hui ; TCK-537, qui la planifiera, doit **exempter** ces deux journaux. Les jobs échoués
  (`failed_jobs`, `payload` compris) se conservent **30 jours** ([§ Amendement](#amendement-du-2026-10-16--la-pièce-du-locataire-et-de-la-caution-et-la-purge-des-jobs-échoués-tck-723)).

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

## Amendement du 2026-10-16 — la pièce du locataire et de la caution, et la purge des jobs échoués (TCK-723)

Deux décisions du porteur (2026-10-15 et 2026-10-16), issues des pistes P23.03 et P19.07 du
[fichier de pistes](../plans/2026-10-15-pistes-d-amelioration.md). **Cet amendement ne change aucun
code** : A s'applique dans un ticket à part, B est planifié par l'implémenteur des pistes.

### A. La règle du §1 s'étend à `customers.id_number` et `guarantors.id_number`

#### Pourquoi

Relu le 2026-10-16 sur `pre-dev` (`2bbc9956`) :

- Le numéro de pièce du **bailleur** suit le §1 : `owner_profiles.id_document_number` est chiffré,
  `$hidden`, rendu masqué (`id_document_number_masked`, `Masking::tail()`), et sa valeur claire ne
  sort que par `GET /api/owners/{ownerProfile}/sensitive`, sous step-up
  (`ProtectedActions::STEP_UP`) et journalisée (`PersonalDataAccessLogger`, surface
  `owner_sensitive`).
- Le numéro de pièce du **locataire** et de la **caution** est un `varchar` en clair
  (`2026_04_17_160006_create_customers_table.php:21`, `2026_04_17_160007_create_guarantors_table.php:18`),
  sans cast (`Customer`, `Guarantor`). Il est rendu en clair à tout lecteur de la fiche :
  `CustomerResource` (l. 20) — y compris imbriqué dans un bail ou une réservation —, et
  `GuarantorController::format` (l. 93). `fields[customers]=id,id_number` le demande
  (`Customer::$queryFields`). Aucune lecture n'exige de step-up ni ne laisse de ligne
  `PersonalDataAccess`.
- Le dépôt le traitait déjà en donnée sensible partout ailleurs : hors du journal d'activité
  (`Customer::getActivitylogOptions`), hors de Meilisearch (`Customer::toSearchableArray`), hors de
  l'export CSV (`ExportDataService::customers`). La même donnée était protégée chez le bailleur et
  livrée chez son locataire.

#### Décision

**Le numéro de pièce d'identité du locataire et de la caution suit la règle du §1 sans exception :
chiffré par le cast `encrypted`, jamais en clair dans une réponse par défaut, lisible en clair par
une lecture dédiée seulement, sous step-up et journalisée.**

1. **Chiffrement** : cast `encrypted` sur `customers.id_number` et `guarantors.id_number`, passées
   en `text`. La migration chiffre l'existant par lots, de façon idempotente (une valeur déjà
   déchiffrable est laissée telle quelle), et son `down()` **déchiffre** puis rend le `varchar` —
   l'aller-retour est testé, comme `encrypt_sensitive_columns_on_owner_profiles`.
2. **Jamais en clair par défaut** : `id_number` entre dans `$hidden` des deux modèles. Les fiches,
   les listes et les formes imbriquées (`include=tenant`, `include=customer`) rendent
   `id_number_masked` (`Masking::tail()`), jamais `id_number`. Qui reçoit le masque reste réglé par
   P23.02 (le lecteur qu'admet `CustomerPolicy::view`).
3. **Hors des sparse fieldsets et de la recherche** : `id_number` quitte `Customer::$queryFields` ;
   le contrôleur ajoute la colonne au `select` pour calculer le masque, comme
   `OwnerProfileController::index`. `Guarantor` n'a pas de `$queryFields` (`fields[guarantors]` n'est
   pas ouvert) et n'en reçoit pas qui le contienne. Aucune des deux colonnes n'entre dans
   `$requestSearchFields` : une colonne chiffrée ne se cherche pas (§1, pas d'empreinte HMAC).
4. **Lecture claire dédiée**, sur le modèle d'`OwnerProfileController::sensitive` : une route `GET
   …/{id}/sensitive` par modèle, autorisée par une capacité `viewSensitive` de sa policy, inscrite
   dans `ProtectedActions::STEP_UP` — donc refusée sous impersonation par
   `EnforceImpersonationReadOnly` (ADR-0055 §3) —, et une ligne `PersonalDataAccessLogger::record()`
   par consultation, sous une surface propre à chaque modèle.
5. **Écriture inchangée pour le client de l'API** : `id_number` reste accepté en entrée
   (`Store`/`UpdateCustomerRequest`, `Store`/`UpdateGuarantorRequest`, `AttachGuarantorLeaseRequest`)
   et s'écrit à travers le cast ; une écriture brute pose une valeur chiffrée ou `null` (voir
   Conséquences).

#### Deux questions tranchées par le porteur le 2026-10-16

6. **Le revenu mensuel suit la même règle, chez la caution comme chez le bailleur.**
   `guarantors.monthly_income` et `owner_profiles.monthly_income` sont chiffrés, masqués par
   défaut et lisibles en clair par la même lecture dédiée que la pièce. Pour le bailleur, la colonne
   entre dans `OwnerProfile::SENSITIVE`. Le prix est accepté : un montant chiffré ne se trie, ne se
   filtre ni ne se somme plus côté base.
7. **Seul l'admin de l'agence lit la valeur claire**, comme pour le bailleur
   (`OwnerProfilePolicy::viewSensitive`). L'agent qui saisit le locataire ou la caution écrit la
   valeur, et ne la relit ensuite que masquée.

#### Application

Un ticket à part, écrit par l'implémenteur des pistes (P23.03, validée le 2026-10-16) : TCK-723 ne
fait que cet amendement. Gardes attendues : aller-retour
de la migration ; aucune réponse par défaut (fiche et liste de clients, `include=tenant`, fiche de caution) ne porte la
clé `id_number` ; `fields[customers]=id_number` refusé ; une lecture claire exige le step-up,
laisse une ligne `PersonalDataAccess`, et rend 403 sous impersonation. Le contrat change pour le
front, qui lit `id_number` aujourd'hui (types, formulaire client, section des cautions).

### B. Les jobs échoués sont purgés à 30 jours

#### Pourquoi

Le §2 rend `failed_jobs.exception` sûr dès l'écriture et garde le `payload` **intact**, pour le
rejeu (`SanitizingFailedJobProvider`). Le `payload` porte le job sérialisé, donc ses propriétés :
une donnée personnelle qui y entre y vit aussi longtemps que la ligne. Or rien ne purge la table :
`queue:prune-failed` n'est pas planifiée (`routes/console.php`, relu le 2026-10-16), et la file est
`database` en préproduction (`docs/infra/prod-drivers.json`). L'écart d'une purge, au §2, visait
l'exception, que le décorateur rend sûre ; le `payload` ne peut pas l'être sans perdre le rejeu —
sa durée de vie est le seul levier.

#### Décision

**Un job échoué se conserve 30 jours, `payload` compris : `queue:prune-failed --hours=720` est
planifiée chaque jour, et `queue:prune-batches` l'est aussi.** Un job échoué se rejoue dans les
30 jours, ou ne se rejoue plus. La purge ne remplace pas le décorateur du §2 : l'exception reste
sûre dès l'écriture, la purge borne le `payload`. `queue:prune-batches` garde la durée par défaut du
framework ; aucun code ne crée de lot aujourd'hui (`Bus::batch` absent d'`app/`), la planification
borne `job_batches` le jour où il en naîtra.

#### Application

La planification est faite par l'implémenteur des pistes (P19.07), hors de TCK-723. Le docblock de
`SanitizingFailedJobProvider` (« Écarté (ADR-0044) : une purge périodique ») est à reprendre avec
elle. La politique de confidentialité (`privacy.ts` §6) ne cite pas les jobs échoués : qu'elle doive
le faire relève de TCK-537.
