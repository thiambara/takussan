# ADR-0070 — La pièce et le revenu du locataire et de la caution sont chiffrés, rendus masqués, et ne se lisent en clair que par une lecture dédiée, sous step-up et journalisée

- **Statut** : Accepté le 2026-10-18 par le porteur (décision de session sur la piste P23.03 : « un
  ADR qui étend ADR-0044 § 1 aux pièces du locataire et de la caution (chiffrement, forme masquée
  par défaut, lecture sous step-up journalisée), puis ses tickets »)
- **Date** : 2026-10-18
- **Tickets** : [TCK-953](../backlog/tickets/TCK-953-piece-du-locataire-chiffree-et-masquee.md),
  [TCK-954](../backlog/tickets/TCK-954-piece-et-revenu-de-la-caution-chiffres-et-masques.md),
  [TCK-955](../backlog/tickets/TCK-955-lectures-claires-de-la-piece-sous-step-up-journalisees.md),
  [TCK-956](../backlog/tickets/TCK-956-revenu-du-bailleur-chiffre-et-fiche-client-au-droit-d-acces.md)
- **Précise** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)
  § 1 et son amendement A du 2026-10-16 (TCK-723), qui ont posé la règle pour ces colonnes sans en
  fixer l'application. ADR-0044 n'est pas remplacé : cet ADR dit comment la règle s'applique ici,
  colonne par colonne et lecteur par lecteur.

## Contexte

L'amendement A d'ADR-0044 a décidé, le 2026-10-16, que le numéro de pièce du locataire et de la
caution, et le revenu mensuel de la caution et du bailleur, suivent le § 1 : chiffrés, masqués par
défaut, lisibles en clair par l'admin d'agence seul, par une lecture dédiée. Il renvoyait
l'application à « un ticket à part ». Ce ticket n'a pas été écrit, et la piste est passée en V8 : le
travail dépasse un ticket de taille M. Il reste à décider ce que l'amendement ne dit pas : qui lit
quoi, à quel endroit, et dans quel ordre on livre sans casser le front.

Relevé sur `feat/pistes-session-2026-10-18` (`ab982dbcc`) le 2026-10-18, en lecture seule :

- **Les colonnes.** `customers.id_number` et `guarantors.id_number` sont des `varchar(255)` en
  clair (`2026_04_17_160006_create_customers_table.php:21`, `2026_04_17_160007_create_guarantors_table.php:18`).
  `guarantors.monthly_income` et `owner_profiles.monthly_income` sont des `decimal(14,2)`
  (`…160007…:21`, `2026_05_02_000001_create_owner_profiles_table.php:20`). Aucun des trois modèles
  ne déclare de cast `encrypted` sur ces colonnes.
- **Qui les rend.** `grep -rn "id_number\|monthly_income" app` trouve exactement deux endroits qui
  les sérialisent :
  - `CustomerResource` (l. 31-32), qui rend `id_number` au lecteur que `CustomerPolicy::view`
    admet (TCK-808). La ressource sert la liste et la fiche du CRM (`CustomerController`), le
    `tenant` d'un bail (`LeaseResource:78`) et le `customer` d'une réservation (`BookingResource:44`).
  - `GuarantorController::format` (l. 93 et 96), qui rend la pièce et le revenu par `index`,
    `show`, `store` et `update`. Pour le super-admin, `index` liste les cautions de **toute** la
    plateforme (l. 20). La liste des cautions d'un bail (`LeaseController::listGuarantors`,
    l. 256-263) ne rend ni l'une ni l'autre.
  - `owner_profiles.monthly_income` sort par `OwnerProfileResource` (`attributesToArray()`) et
    figure dans `OwnerProfile::$queryFields`. **Aucune requête de l'API ne l'écrit** : seuls la
    factory et les seeders le remplissent.
- **Sparse fieldsets.** `id_number` est dans `Customer::$queryFields` (l. 108), donc demandable par
  `fields[customers]=` et, en imbriqué, par `include=tenant` ou `include=customer`. Le front le
  demande pour la fiche (`DASHBOARD_CUSTOMER_DETAIL_FIELDS`, `takussan-web/src/lib/queries/customers.ts:45`).
  `Guarantor` n'a pas de `$queryFields`.
- **Recherche.** Aujourd'hui, rien ne cherche, ne filtre ni ne trie sur ces colonnes. `Customer`
  cherche sur `first_name`, `last_name`, `email` et `phone` ; `id_number` n'est ni filtrable ni
  envoyé à Meilisearch (`toSearchableArray`). La détection de doublons compare le téléphone et le
  courriel, jamais la pièce (`CustomerDuplicateDetector`). `Guarantor` ne déclare aucun champ de
  recherche. Aucun `where`, `orderBy` ni `sum` ne porte sur `monthly_income` dans `app/`.
- **Impersonation.** `ImpersonationReadSweepTest::FUITES_TOLEREES` (l. 67-75) déclare six routes
  où le numéro de pièce du client sort en clair sous impersonation : `customers`, `customers/{customer}`,
  `leases`, `leases/{lease}`, `bookings` et `bookings/{booking}`. Le paramètre `guarantor` est dans
  `PARAMETRES_NON_REMPLIS` (l. 94) : les routes des cautions n'y sont pas balayées.
- **Exports.** L'export CSV du CRM n'a jamais contenu la pièce (`ExportDataService::customers`).
  L'export du droit d'accès (`DataExportBuilder::payloads`) rend les profils de bailleur avec
  `makeVisible(OwnerProfile::SENSITIVE)`, mais **aucun fichier n'y porte la fiche client du
  titulaire** : ni sa pièce, ni le reste de sa fiche. Une caution n'a pas de compte, et donc pas
  d'export.
- **Documents de bail.** Le contrat (`resources/views/pdf/leases/contract.blade.php`) cite le nom
  et le courriel du locataire, et le nom, le contact et le rôle de chaque caution. Il ne cite ni la
  pièce ni le revenu. Aucune autre vue ne les cite (`grep` sur `resources/views`).
- **Journaux.** `Customer` exclut `id_number` de son journal d'activité ; `Guarantor` n'est pas
  `Auditable`. `PropertyRedactor` ne reconnaît ni `id_number` ni `income`
  (`IDENTIFIER_SEGMENTS = rib, iban, tax_id, ninea, id_document`, l. 36).
- **Sauvegardes.** `backup:verify-encryption` trouve les colonnes à vérifier par les casts des
  modèles, pas par une liste (`BackupVerifyEncryption.php:105` : `str_starts_with($cast, 'encrypted')`).
  Une colonne castée `encrypted` y entre d'elle-même. Une colonne protégée par une classe de cast
  maison en sortirait sans bruit.
- **Validation.** Les cinq requêtes qui écrivent `id_number` (`Store`/`UpdateCustomerRequest`,
  `Store`/`UpdateGuarantorRequest`, `AttachGuarantorLeaseRequest`) n'acceptent que
  `nullable|string`, sans longueur maximale. Le front borne la valeur à 64 caractères pour le client
  et à 100 pour la caution. `monthly_income` accepte `numeric|min:0`, sans maximum.
- **Front.** Le formulaire client pré-remplit la pièce avec `customer.id_number`
  (`CustomerForm.tsx:87`), et son schéma exige un numéro dès qu'un type est choisi
  (`schemas/customer.ts:126`). Si la valeur claire disparaît de la réponse, **toute modification
  d'une fiche qui porte un type de pièce est refusée par le formulaire**. La section des cautions ne
  fait que créer (`GuarantorSection.tsx`), et aucun écran ne lit la fiche d'une caution.
- **Le modèle à suivre existe déjà, pour le bailleur** (TCK-601). Les colonnes sont listées dans
  `OwnerProfile::SENSITIVE`, castées `encrypted` et mises dans `$hidden`. `OwnerProfileResource`
  rend les `*_masked`, et `OwnerProfileController::index` recharge les colonnes sensibles pour
  calculer le masque (l. 66). La valeur claire ne sort que par `GET /api/owners/{id}/sensitive`,
  qui demande `viewSensitive` (admin de l'agence du profil), est inscrite dans
  `ProtectedActions::STEP_UP` et est journalisée (`PersonalDataAccessLogger`, surface
  `owner_sensitive`).

## Décision

**Le numéro de pièce du locataire et de la caution, et le revenu mensuel de la caution et du
bailleur, sont chiffrés en base par le cast `encrypted`. Ils ne sortent par défaut que sous une forme
masquée, et en clair seulement par une lecture dédiée : réservée à l'admin de l'agence, sous step-up,
refusée sous impersonation, et journalisée.**

Les points 1, 3, 4, 5 et 6 appliquent ce que le porteur a tranché (amendement A d'ADR-0044, puis la
décision du 2026-10-18). Les points 2, 7, 8 et 9 sont des choix d'application pris par cet ADR. Ils
se révisent par un amendement d'ADR, pas dans un ticket.

### 1. Le périmètre : quatre colonnes, pas une de plus

| Colonne | Aujourd'hui | Devient | Forme par défaut | Lecture claire |
|---|---|---|---|---|
| `customers.id_number` | `varchar(255)` | `text`, cast `encrypted` | `id_number_masked` | `GET /api/customers/{customer}/sensitive` |
| `guarantors.id_number` | `varchar(255)` | `text`, cast `encrypted` | `id_number_masked` | `GET /api/guarantors/{guarantor}/sensitive` |
| `guarantors.monthly_income` | `decimal(14,2)` | `text`, cast `encrypted` | `monthly_income_masked` | même route |
| `owner_profiles.monthly_income` | `decimal(14,2)` | `text`, cast `encrypted` | `monthly_income_masked` | `GET /api/owners/{ownerProfile}/sensitive` (existante) |

Chaque modèle déclare ses colonnes dans une constante `SENSITIVE`, qui sert à la fois `$hidden`,
le rechargement du masque et `makeVisible()`. `OwnerProfile::SENSITIVE` existe déjà et reçoit
`monthly_income`. `Customer::SENSITIVE = ['id_number']` et
`Guarantor::SENSITIVE = ['id_number', 'monthly_income']` sont créées.

**Hors du périmètre**, délibérément :

- `id_type` dit quelle sorte de pièce a été présentée, pas laquelle. Il reste rendu, au lecteur de
  la fiche seulement (TCK-808).
- `emergency_contact_*`, `notes` et `metadata` restent régis par TCK-808, sans chiffrement.
- Le téléphone et le courriel restent en clair : ils sont cherchés, et servent à détecter les
  doublons.

### 2. Trois migrations réversibles, une par table

Chaque migration suit la forme de `encrypt_sensitive_columns_on_owner_profiles` :

- La colonne passe d'abord en `text`, puis l'existant est chiffré par lots de 500 (`chunkById`),
  avec `Crypt::encryptString`, ce que relit le cast. Le chiffrement ne tient pas dans un
  `varchar(255)`.
- La migration est **idempotente** : une valeur déjà déchiffrable est laissée telle quelle. `null`
  et `''` ne sont pas touchés.
- Pour un montant, `up()` chiffre la forme texte de la valeur décimale (`800000.00`).

**Ce que rend `down()`** : il déchiffre chaque valeur, puis rend le type d'origine, `varchar(255)`
ou `numeric(14,2)`. La valeur relue est identique à celle d'avant `up()` : même chaîne pour une
pièce, même montant au centime pour un revenu. Une valeur que la clé ne déchiffre pas est laissée
telle quelle. Une clé tournée entre-temps n'empêche rien : `Crypt` essaie aussi `APP_PREVIOUS_KEYS`.

Deux conditions rendent ce `down()` sûr. Elles font partie de la décision :

- **Le retour de `text` vers `numeric` demande un `USING`.** PostgreSQL refuse de convertir `text`
  en `numeric` sans clause explicite (42804). Le `down()` des deux revenus écrit donc
  `ALTER TABLE … ALTER COLUMN monthly_income TYPE numeric(14,2) USING monthly_income::numeric(14,2)`,
  à moins que l'aller-retour testé ne montre que `->change()` produit cette clause.
- **Toute valeur écrite après `up()` doit tenir dans le type d'origine.** `id_number` reçoit `max:100`
  dans les cinq requêtes (la plus grande des deux bornes du front, sous les 255 du `varchar`).
  `monthly_income` reçoit `max:999999999999.99` dans les trois requêtes qui l'écrivent, soit la
  borne de `numeric(14,2)`. Sans ces bornes, `text` accepterait une valeur que `down()` ne pourrait
  plus réécrire.

Chaque migration a son test d'aller-retour : une valeur en clair, puis `up()` qui la chiffre, un
second `up()` qui ne la change pas, et `down()` qui rend la même valeur et le type d'origine.

### 3. Le masque est la seule forme par défaut, partout

- **Le cast est `encrypted` simple, jamais une classe de cast maison**, sans quoi
  `backup:verify-encryption` ne verrait plus la colonne (§ 9). Un revenu se relit donc comme une
  chaîne, et chaque lecteur le convertit lui-même, comme le fait déjà `(float)` dans
  `GuarantorController::format`.
- **`$hidden = self::SENSITIVE`** sur les trois modèles. Aucun `toArray()`, aucune ressource, aucune
  forme imbriquée ne porte la clé `id_number` ou `monthly_income`.
- **La forme masquée vient de `App\Support\Masking`**, qui reste le seul masqueur (ADR-0044 § 1) :
  - `id_number_masked` = `Masking::tail()` : `•••• 8877` ;
  - `monthly_income_masked` = `Masking::presence()`, une fonction nouvelle qui rend `••••` si un
    montant est saisi, et `null` sinon. Elle ne garde aucun chiffre : les derniers chiffres d'un
    montant ne servent à rien et en laissent deviner l'ordre de grandeur.
- **Où le masque est rendu :**
  - `CustomerResource` rend `id_number_masked` à la place d'`id_number`, sous la même condition
    (`readsCustomer`, TCK-808). Le bailleur ne reçoit ni la valeur ni le masque.
  - `GuarantorController::format` rend les deux masques, réponses de `store` et `update`
    comprises : l'agent qui vient de saisir la valeur ne la relit pas en clair (point 7 de
    l'amendement A).
  - `OwnerProfileResource` ajoute `monthly_income_masked` à ses trois masques.
- **Quand la colonne est lue pour calculer le masque** :
  - La fiche client (`CustomerController` : `show`, `store`, `update`) charge toujours `id_number`,
    y compris quand la requête porte un `fields[customers]`.
  - Les listes et les formes imbriquées (`include=tenant`, `include=customer`) ne rendent le masque
    que si elles lisent toutes les colonnes, sans `fields[customers]`. La liste du CRM ne déchiffre
    donc aucune ligne pour rien, comme TCK-808 l'a voulu pour sa relecture.
  - `GET /api/owners` garde son `addSelect` d'`OwnerProfile::SENSITIVE`, qui inclura désormais
    `monthly_income`.

### 4. Hors des sparse fieldsets, des filtres et de la recherche

- `id_number` quitte `Customer::$queryFields`, ce qui retire du même coup `customers.id_number` des
  champs imbriqués. `monthly_income` quitte `OwnerProfile::$queryFields`. Une requête qui les
  demande reçoit 400 (`InvalidFieldQuery`), comme `fields[owner_profiles]=rib` aujourd'hui.
- `Guarantor` n'a pas de `$queryFields`, et n'en reçoit pas qui contiendrait ces colonnes.
- **Aucune recherche n'est perdue**, puisqu'aucune ne porte sur ces colonnes aujourd'hui (voir
  Contexte). Le chiffrement non déterministe interdit pourtant même l'égalité stricte, et il faut
  l'écrire : **on ne pourra pas retrouver un client ou une caution par son numéro de pièce, ni
  détecter deux fiches qui portent la même pièce.** Si ce besoin apparaît, la seule forme admise
  est celle d'ADR-0044 § 1 : une colonne `id_number_hmac`, calculée sous une clé distincte
  d'`APP_KEY`, et décidée par un ADR. Pour un revenu, on renonce aussi au tri, au filtre et à la
  somme côté base. L'amendement A (point 6) a accepté ce prix, et aucun code ne le paie aujourd'hui.

### 5. La valeur claire : une route par modèle, pour l'admin de l'agence seulement

| Route | Rend | Autorisée par | Surface du journal |
|---|---|---|---|
| `GET /api/customers/{customer}/sensitive` | `id`, `id_type`, `id_number` | `CustomerPolicy::viewSensitive` | `customer_sensitive` |
| `GET /api/guarantors/{guarantor}/sensitive` | `id`, `id_type`, `id_number`, `monthly_income` | `GuarantorPolicy::viewSensitive` | `guarantor_sensitive` |
| `GET /api/owners/{ownerProfile}/sensitive` | s'y ajoute `monthly_income` | `OwnerProfilePolicy::viewSensitive` (inchangée) | `owner_sensitive` (inchangée) |

Chaque route vit dans le fichier de routes de son modèle (`routes/api/customers.php`,
`routes/api/guarantors.php`), avec `whereNumber`, comme `owners.sensitive`. Chaque action entre dans
`ProtectedActions::STEP_UP`, à côté de `OwnerProfileController@sensitive`.

**Qui y a droit.** Le droit ne passe pas par une capacité : il est donné par un profil
`AgencyAdminProfile` actif dans l'agence du sujet.

| Lecteur | Valeur claire | Pourquoi |
|---|---|---|
| Admin de l'agence du client (`customers.agency_id`) | oui | amendement A, point 7 |
| Admin de l'agence que `GuarantorPolicy::view` lit déjà pour la caution (`addedBy->agency_id`) | oui | la caution n'a pas de colonne d'agence : on reprend la règle qui décide déjà qui la lit |
| Agent, y compris celui qui a saisi la valeur | non, masque seulement | amendement A, point 7 |
| Bailleur | ni valeur, ni masque | TCK-587, TCK-808 |
| Super-admin | non, par ces routes | même règle que `OwnerProfilePolicy::viewSensitive`. La plateforme a sa console et ses voies KYC journalisées |
| Toute session d'impersonation | non (403 `impersonation.read_only`) | § 6 |

**Pourquoi pas une capacité.** Les capacités se délèguent par les rôles d'agence personnalisés
(TCK-279). Une capacité `crm.view_identity` laisserait un admin la confier à un agent, ce que le
point 7 de l'amendement A exclut. Le droit reste attaché au profil d'admin, comme pour le bailleur.

**Les cas sans agence.** Un client dont `agency_id` est `null`, ou une caution dont l'auteur n'a pas
d'agence résolue (l'accesseur pont rend `null` pour un auteur présent dans plusieurs agences), n'a
**aucun lecteur en clair** : sa valeur ne se lit plus que masquée. On choisit le refus plutôt qu'une
règle de repli inventée. TCK-955 mesure combien de lignes sont dans ce cas.

**Le journal.** Chaque lecture appelle `PersonalDataAccessLogger::record()` après l'autorisation, au
plus une fois par lecteur, sujet et surface toutes les 15 minutes (ADR-0044 § 4). La ligne est
rattachée à l'agence de son sujet (ADR-0044 § 3) :

- pour un client, c'est la colonne `agency_id` (étape 3 du résolveur) ;
- pour une caution, qui n'a pas cette colonne, `record()` reçoit un argument `?int $agencyId`
  facultatif, rempli avec l'agence que la policy vient de valider (étape 1). Sans lui, la ligne ne
  serait visible que du super-admin, et l'admin ne verrait pas ses propres consultations.

**Ce que le front en fait.** Comme `fetchOwnerSensitive`, la réponse n'entre jamais dans un cache
React Query : elle ne vit que le temps de l'affichage.

### 6. Impersonation

Une session d'impersonation ne lit que les masques. Les trois routes `…/sensitive` lui sont
refusées par `EnforceImpersonationReadOnly`, parce qu'elles sont dans `STEP_UP` (ADR-0055 § 3) : il
n'y a rien à ajouter à `REFUSED_READS`.

La garde `ImpersonationReadSweepTest` en tire deux changements :

- les six entrées P23.03 sortent de `FUITES_TOLEREES`. La garde rougit tant qu'une fuite déclarée
  fuit encore, et rougit aussi quand une fuite qu'on dit tolérée ne fuit plus ;
- `guarantor` sort de `PARAMETRES_NON_REMPLIS`, et la cible reçoit une caution avec un numéro et un
  revenu connus. Les routes des cautions entrent ainsi dans le balayage.

### 7. Les exports

- **L'export CSV du CRM** ne contient pas la pièce et ne la contiendra pas. Le test
  d'`ExportDataService::customers` le vérifie.
- **Le droit d'accès reste entier** (ADR-0044, Conséquences) :
  - le revenu du bailleur entre dans l'export avec `OwnerProfile::SENSITIVE`, par le
    `makeVisible()` qui existe déjà ;
  - l'export reçoit un fichier **`customers.json`** : les fiches client du titulaire
    (`customers.user_id = titulaire`), avec sa pièce **en clair** (`makeVisible(Customer::SENSITIVE)`).
    Le fichier se limite à l'identité : `id`, `agency_id`, nom, prénom, courriel, téléphone,
    `id_type`, `id_number`, profession, contact d'urgence, `locale` et dates. Les `notes`, les
    `metadata` et les critères de recherche de l'agence n'y entrent pas. C'est à TCK-537 et au
    conseil juridique de dire s'ils relèvent du droit d'accès. Aujourd'hui, la fiche du titulaire
    manque entièrement à son export.
- **Une caution n'a pas de compte.** Sa demande de droits passe par le registre
  (`privacy_requests`, saisie à la main), et l'admin y répond par la lecture dédiée, qui laisse sa
  trace.

### 8. Le contrat du front

| Ce qui change | Comment le front s'adapte |
|---|---|
| `id_number` quitte les réponses et `fields[customers]` | `DASHBOARD_CUSTOMER_DETAIL_FIELDS` retire `id_number` **dans la même PR que l'API** : avant, la fiche rend 400, après, elle rendrait encore le champ en clair. Les types lisent `id_number_masked: string \| null` |
| Le formulaire client ne reçoit plus la valeur | Le champ s'écrit sans se relire : vide par défaut, avec le masque en indication. Vide veut dire « inchangé », ce que fait déjà `blank()` → `undefined`. La règle « type choisi ⇒ numéro exigé » ne s'applique que si la fiche n'a pas encore de numéro (`id_number_masked` nul) |
| Une valeur claire existe pour l'admin | Un bouton « Afficher » sur la fiche client, pour l'admin seulement. Il appelle `/sensitive` hors de React Query et passe par la garde de step-up de TCK-589, comme `OwnerIdentifiersCell` |
| Caution | Les types `Guarantor` lisent `id_number_masked` et `monthly_income_masked`. Aucun écran ne lit la fiche d'une caution : il n'y a pas d'interface de révélation à créer, la route sert l'API seule |
| Revenu du bailleur | Le type lit `monthly_income_masked`. Aucun écran ne lit le revenu aujourd'hui |

Les textes passent par next-intl : `fr`, `en`, et en `wo` le texte français tel quel, le wolof
étant en pause.

### 9. Les journaux et la vérification des sauvegardes

- `PropertyRedactor` reconnaît `id_number` et `income`, en défense en profondeur. Aucun journal ne
  les écrit aujourd'hui.
- `backup:verify-encryption` n'a rien à changer : les quatre colonnes y entrent dès leur cast
  `encrypted`. `BackupVerifyEncryptionTest` le vérifie colonne par colonne, et c'est ce test qui
  rougit si un cast passe un jour à une classe maison. Les comptes du relevé de `hebergement.md`
  (« 39 valeurs dans 20 colonnes ») changeront à la prochaine restauration à blanc : c'est attendu,
  pas une anomalie.

## Conséquences

- **L'agent ne relit plus ce qu'il a saisi.** Pour corriger une erreur de frappe, il ressaisit le
  numéro, ou demande à l'admin. C'est le prix du point 7 de l'amendement A.
- **Un client sans agence, ou une caution dont l'auteur n'a pas d'agence résolue, n'a plus de
  lecteur en clair.** Le défaut est fermé, et il est assumé.
- **Une écriture brute** (`DB::table()->update`) sur ces colonnes doit poser une valeur chiffrée ou
  `null`. Sinon, la lecture lève `DecryptException`. Les seeders écrivent par les modèles (relu :
  `GuarantorSeeder`), et TCK-537 écrit à travers le cast.
- **Perdre `APP_KEY`, c'est aussi perdre ces quatre colonnes** (ADR-0044, amendement C).
- **L'ordre de livraison est imposé.** La première étape doit livrer l'API et la liste de champs du
  front ensemble (voir § 8).
- Chaque fiche déchiffre une valeur par lecture, chaque page de cautions une par ligne et par
  colonne. Les listes sous sparse fieldsets ne déchiffrent rien.
- La garde d'impersonation perd six fuites tolérées et gagne les routes des cautions.

## Alternatives écartées

| Option | Pourquoi non |
|---|---|
| Masquer dans les listes et sous impersonation seulement, sans chiffrer (repli proposé par la piste) | Le porteur a demandé l'application entière d'ADR-0044 § 1 : la valeur claire resterait dans la base et dans les sauvegardes. |
| Une empreinte HMAC pour garder la recherche | Personne ne cherche sur ces colonnes. Une empreinte est une seconde copie à gouverner (ADR-0044 § 1). |
| Une classe de cast `EncryptedDecimal` pour garder `decimal:2` | `backup:verify-encryption` ne reconnaît que les casts nommés `encrypted*` : la colonne sortirait de la vérification des restaurations sans aucun signal. |
| Une capacité délégable (`crm.view_identity`) | Un rôle personnalisé la donnerait à un agent, contre le point 7 de l'amendement A. |
| Ouvrir la lecture claire au super-admin | La console a ses voies, déjà journalisées, et aucun écran de la console ne lit une fiche client. Cela suit `OwnerProfilePolicy::viewSensitive`. |
| Une seule migration pour les trois tables | Chaque table a son modèle, son ticket et son aller-retour. Une migration commune ne pourrait pas être annulée table par table. |
| Mettre la fiche entière dans `customers.json` | Les notes et les métadonnées de l'agence posent une question juridique (TCK-537) qui n'est pas celle de cet ADR. |

## Application

Dans cet ordre. Chaque ticket est de taille M au plus et dépend du précédent :

1. [TCK-953](../backlog/tickets/TCK-953-piece-du-locataire-chiffree-et-masquee.md) :
   `customers.id_number` chiffré, masqué et retiré des champs demandables, avec le contrat minimal
   du front (liste des champs, types, formulaire). Les six fuites tolérées sortent de la garde.
2. [TCK-954](../backlog/tickets/TCK-954-piece-et-revenu-de-la-caution-chiffres-et-masques.md) :
   `guarantors.id_number` et `guarantors.monthly_income` chiffrés et masqués, avec
   `Masking::presence()`. La garde d'impersonation balaie les cautions.
3. [TCK-955](../backlog/tickets/TCK-955-lectures-claires-de-la-piece-sous-step-up-journalisees.md) :
   les deux lectures claires sous step-up et journalisées, et le bouton « Afficher » de la fiche
   client.
4. [TCK-956](../backlog/tickets/TCK-956-revenu-du-bailleur-chiffre-et-fiche-client-au-droit-d-acces.md) :
   `owner_profiles.monthly_income` chiffré, masqué et rendu par `owners/{id}/sensitive`, et
   `customers.json` dans l'export du droit d'accès.

**Les gardes qui empêchent la régression :**

- l'aller-retour de chaque migration ;
- `ImpersonationReadSweepTest`, dont la liste ne peut plus vieillir en silence ;
- `BackupVerifyEncryptionTest`, colonne par colonne ;
- les tests de forme : aucune réponse par défaut ne porte `id_number` ni `monthly_income`, et
  `fields[…]` les refuse ;
- le test de chaque lecture claire : step-up exigé, ligne `PersonalDataAccess` écrite, 403 sous
  impersonation, 403 pour un agent.

Après la fusion de TCK-956, `/sync-specs` met à jour `docs/models-spec.md` (§ 7 Customer,
§ 27 Guarantor, § 34 OwnerProfile).
