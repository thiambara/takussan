# ADR-0099 — Le coffre de documents : la liste suit la lecture, et les documents générés sont listés depuis leur source, jamais copiés

- **Statut** : Accepté le 2026-11-10 (recommandation de la famille 4 validée par le porteur, « je valide tes recommandations ») — modalités : décisions de la session, à revoir ; **amendé le 2026-11-12** (cf. § *Amendement du 2026-11-12 — le document interne de la fiche client*), **validé par le porteur le 2026-11-12** pour l'export des métadonnées, le défaut « interne » au téléversement du personnel et l'existant non migré ; **amendé le 2026-11-13** (cf. § *Amendement du 2026-11-13 — le nom des auteurs d'un document, selon le lecteur*), décisions de la session appliquées par défaut, sur la liste du porteur ; **amendé le 2026-11-14** (cf. § *Amendement du 2026-11-14 — l'archive préparée d'un dossier du coffre*), décisions de la session appliquées par défaut ; **amendé le 2026-11-14** (cf. § *Amendement du 2026-11-14 — un bien et ses baux, en une lecture*), décision de la session appliquée par défaut ; **amendé le 2026-11-15** (cf. § *Amendement du 2026-11-15 — le coffre de l'agence*), demandé par le porteur (« implémente tout », audit des maquettes, app-documents e4/e5), modalités : décisions de la session, à revoir ; **amendé le 2026-11-15** (cf. § *Amendement du 2026-11-15 — toutes les quittances en une archive*, TCK-2915)
- **Date** : 2026-11-10
- **Tickets** : TCK-2655 (API), TCK-2656 (coffre par dossier) ; la partie « Documents » de TCK-2639 (fiche bien) et de TCK-2641 (fiche bailleur) ; TCK-2759 (document interne, amendement du 2026-11-12) ; TCK-2773 (noms des auteurs, amendement du 2026-11-13) ; TCK-2812 (archive préparée, amendement du 2026-11-14) ; TCK-2841 (un bien et ses baux, amendement du 2026-11-14) ; TCK-2895 (le coffre de l'agence, amendement du 2026-11-15)
- **Amende** : la règle posée par TCK-820 (liste restreinte aux téléversements de l'appelant), **sans la révoquer**
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (cloisonnement des bailleurs), [ADR-0055](0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md) (impersonation)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `GET /api/documents` ne liste **que ce que l'appelant a téléversé** (`DocumentPolicy::restreindreAuTeleverseur`, `where('uploaded_by', …)`). TCK-820 l'a posé au motif qu'aucun écran ne lisait cette liste, et qu'une liste large exposait des pièces.
- Effets :
  - le locataire ne voit pas un document que l'agence a rattaché à son bail ;
  - l'agence ne voit pas, depuis un bien, ce qu'un collègue y a déposé.
- **La lecture unitaire est plus large** (`DocumentPolicy::view` / `reaches`) :
  - un document de bail se lit par le bailleur, le personnel de l'agence et le locataire ;
  - un document de bien se lit par le bailleur et le personnel.

  La liste et la lecture ne disent donc pas la même chose.
- **Les PDF que la plateforme produit ne sont pas des `Document`.** Six endpoints les rendent à la volée : contrat, quittance, état des lieux, facture, relevé du bailleur, devis d'intervention. Le contrat signé est un média du bail (`signed_contract`, [ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md)). `DocumentPdfService::store()` n'a aucun appelant.
- **Le locataire n'a aucun endroit où retrouver « mon contrat ».**

## Décision

**Une liste ne montre que ce qu'un `show` ouvrirait, par un seul prédicat. Les documents que la plateforme génère se listent depuis leur source et se téléchargent par leur endpoint, sans copie.**

1. **Avec une cible, la liste suit la lecture.**
   - Une cible est un bien, un bail, une fiche client, un profil bailleur ou un état des lieux. La liste rend **tout** ce que l'appelant peut `view` sur cette cible, quel qu'en soit l'auteur.
   - Le prédicat est **unique** : la règle de `view` / `reaches`, traduite en SQL pour la liste. Elle n'est pas écrite deux fois.
   - **Sans cible, la règle de TCK-820 reste** : on ne liste que ses propres téléversements.
2. **Le coffre.** `GET /api/me/document-vault` range par dossier ce que l'appelant peut lire, selon son **profil actif** :
   - **locataire** : un dossier par bail, ses quittances par année, ses pièces ;
   - **bailleur** : un dossier par bien, ses relevés et attestations, ses pièces ;
   - **prestataire** : ses factures, ses pièces.

   Chaque entrée dit si elle est `uploaded` ou `generated`, et donne son chemin de téléchargement existant.
3. **Les documents générés sont listés depuis leur source, jamais matérialisés en `Document`.**
   - Les sources sont : le contrat, les quittances (une par échéance **payée**, aucune pour une échéance remboursée, TCK-2505), les états des lieux signés, les relevés et les factures.
   - Ils se téléchargent **par leur endpoint actuel, sous sa propre autorisation**. Le coffre ne leur donne aucun droit de plus.
   - Ils n'ont ni versions, ni vérification, ni partage par lien.
4. **Règles conservées** :
   - sous impersonation, les pièces de profil ne se listent pas (TCK-697) ;
   - l'agent suspendu ou retiré ne liste plus ce qu'il a téléversé dans l'agence (TCK-2295) ;
   - le super-admin n'a pas de coffre de plateforme, et ouvre un document par son identifiant, journalisé (TCK-820).
5. **Les cibles se nomment par des alias courts** (`property`, `lease`, `customer`, `owner_profile`, `inventory`) et non par le nom de classe complet. Le rattachement à l'écran se fait par une liste nommée de cibles (`attachable_targets`), jamais par un identifiant numérique saisi.

## Conséquences

- **Une liste plus large qu'aujourd'hui, mais jamais plus large que la lecture.** Le risque que TCK-820 fermait, une liste qui expose, ne revient pas : toute entrée listée s'ouvrait déjà par son identifiant.
- **Un test de parité garde la règle** : toute entrée listée s'ouvre (200), et toute entrée qu'un `show` refuse n'est pas listée. Il se vérifie par ablation, en retirant une condition du SQL.
- **Le coffre se calcule à la lecture**, à partir de plusieurs sources : un nombre de requêtes **constant**, et non une requête par échéance. Un locataire de 36 échéances se lit comme un locataire de 3.
- **Aucune croissance de stockage par quittance.** Le PDF se rend à la demande, comme aujourd'hui.
- **Le partage par lien d'un document généré** (le locataire qui envoie son contrat à une banque) est hors périmètre. S'il est voulu, ce sera un lien signé vers l'endpoint de génération, sur le modèle du lien porteur d'[ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md), jamais une copie.

## Options écartées

- **Matérialiser chaque PDF généré en `Document`** : deux sources du même PDF, une copie qui dérive quand le bail change (renouvellement, avenant), et un stockage qui croît à chaque quittance.
- **Révoquer TCK-820 et lister tout ce que l'on peut lire, sans cible** : une liste globale sans écran pour la lire, ce que TCK-820 refusait à raison. La cible borne la liste à ce qu'un écran montre.
- **Une seconde règle de lecture pour la liste**, plus étroite que `view` : c'est le défaut d'aujourd'hui, une liste et une lecture qui ne disent pas la même chose.

## Application

- `DocumentPolicy` : le prédicat de `view` traduit en portée SQL, partagée par `index` avec cible. `DocumentVaultController`. `GET /api/documents/generated?target=`.
- Gardes (TCK-2655) :
  - le test de parité entre la liste et le `show`, par profil ;
  - le test des quittances (payée seulement) ;
  - le test d'impersonation ;
  - le test de l'agent retiré ;
  - le compte de requêtes constant du coffre.

## Amendement du 2026-11-12 — le document interne de la fiche client (TCK-2759)

- **Décidé par le porteur le 2026-11-12** (décision 9 (b), contre la recommandation de la session, qui proposait de garder la règle et d'écrire « visible par le client » au téléversement).
- **Validé par le porteur le 2026-11-12** (nuit, points 1 et 2 de ses huit validations) :
  - l'export d'un dossier garde les **métadonnées** d'un document interne (nom, date, type), jamais son contenu (§ 8) ;
  - un document déposé par le personnel sur une fiche client est **interne par défaut** (§ 5) ;
  - l'existant **n'est pas migré** (§ 6).
- Les autres modalités (l'endpoint de bascule, les codes de refus, l'évènement de journal, la révocation des liens du sujet) restent des décisions de la session, à revoir.

### Contexte

Relevé sur `feat/audit-ux-app-lot-2` (0bec981e2) le 2026-11-12, en lecture seule :

- Un document rattaché à une fiche client (`documentable_type = Customer`) se lit par **le sujet de la fiche** : la branche `Customer` de `DocumentPolicy::reaches` admet `$documentable->user_id === $user->id`. C'est la règle du § 1 : la liste suit la lecture, et `features.md` § 1.10 dit « ceux rattachés à ses baux, biens ou fiche ».
- Le personnel range donc sous les yeux du client tout ce qu'il dépose sur sa fiche : une copie de pièce reçue d'un tiers, une note sur sa solvabilité, un échange avec un garant. Il n'a aucun moyen de le garder pour l'agence.
- La table `documents` n'a **aucune** colonne de visibilité (`2026_04_17_160020_create_documents_table.php` : `is_verified`, `metadata`, rien d'autre). `metadata` (jsonb) ne convient pas : la règle doit se traduire en SQL pour la liste (§ 1), et une clé de jsonb n'a ni défaut ni contrainte.
- Cinq lecteurs rendent aujourd'hui au client les documents de sa fiche :
  1. `view` : `GET /api/documents/{id}`, les versions et leur téléchargement (`DocumentVersionController`) ;
  2. `DocumentPolicy::listableOn` : la liste avec cible `customer` ;
  3. `DocumentVault::uploadedDocuments` : le coffre ;
  4. `DashboardTenantService` : les cinq documents récents de l'accueil du locataire ;
  5. `DataExportBuilder::documents` : l'export de ses données, métadonnées seules quand un autre a déposé la pièce.
- Le **partage par lien** (`DocumentPolicy::share`) admet le titulaire du porteur, `$porteur->user_id` : pour une fiche client, c'est le client. Il peut donc publier un lien vers une pièce de sa fiche qu'un autre y a déposée.
- `CustomerResource.documents` n'est servi qu'à qui lit la fiche (`CustomerPolicy::view`) : le personnel seul. Ce n'est pas un lecteur du client.
- La recherche de documents (`DocumentSearchService`) ne rend que les téléversements de l'appelant : le client n'y voit rien qu'il n'ait déposé lui-même.

### Décision

**Un document de fiche client peut être *interne* : il se lit par le personnel de l'agence de la fiche et par le super-admin, et par personne d'autre — jamais par le sujet de la fiche.**

1. **Une colonne booléenne `documents.is_internal`**, `NOT NULL DEFAULT false`, et non une énumération de visibilité.
   - Il n'y a qu'une audience à retirer, le sujet de la fiche. Une énumération (`shared`, `internal`, …) annoncerait des niveaux que rien ne lit.
   - Si un deuxième public doit un jour être écarté, l'énumération remplacera la colonne : c'est une migration de données simple, que rien n'empêche.
2. **Le drapeau ne vaut que sur une fiche client.** Sur un bien, un bail, une réservation, un état des lieux, un profil ou l'agence, `is_internal = true` est refusé en 422 (`document.internal_customer_only`).
   - Chaque autre porteur a son propre « public extérieur » (le locataire d'un bail, le bailleur d'un bien, le client d'une réservation) : chacun demanderait sa propre définition.
   - Un drapeau accepté sans effet mentirait à celui qui le pose.
3. **Lecture d'un document interne** :
   - **lisent** : le super-admin, et le personnel **actif** de l'agence de la fiche (`isStaffOf`), y compris le téléverseur tant qu'il en est membre (règle d'auteur, ADR-0031, amendement du 2026-10-25) ;
   - **ne lit jamais** : le sujet de la fiche (`customers.user_id`). Cela vaut même s'il en est l'auteur (`added_by_id`) ou s'il est par ailleurs du personnel de l'agence. Un document interne parle de lui, et c'est la règle de TCK-2757 : l'auteur d'une fiche n'en est jamais le sujet.
   - La règle est **positive** : on énumère qui lit, on ne retire pas seulement la branche du client. `reaches` garde aujourd'hui, pour une fiche, la branche de l'auteur encore membre **sans** la condition « l'auteur n'est pas le sujet ». La retirer seule laisserait passer le bailleur auteur de sa propre fiche.
4. **Qui pose le drapeau** : le personnel actif de l'agence de la fiche, au téléversement (`is_internal` dans `POST /api/documents`), et ensuite par `PATCH /api/documents/{document}/visibility`.
   - Le client ne le pose jamais : 403 s'il l'envoie à `true` sur sa propre fiche.
   - Un document **téléversé par le sujet de la fiche** n'est jamais interne : 422 `document.internal_own_upload`. Il l'a déjà, et le lui cacher lui retirerait sa propre pièce.
   - Le basculement est permis à **tout** membre actif du personnel de l'agence, pas seulement au téléverseur. `update` (le téléverseur seul) protège le fichier et ses versions. La visibilité est une décision de l'agence envers son client : un collègue doit pouvoir réparer un oubli.
   - Chaque bascule s'écrit au journal d'activité (`document_visibility_changed`, avec l'ancienne et la nouvelle valeur).
5. **Les défauts sont deux, et ils ne se confondent pas.**
   - **La colonne** vaut `false` : les lignes existantes, les téléversements du client, et tout écrivain hors de `POST /api/documents` (`AgencyUpgradeRequestService`, les assistants de pièces de profil) gardent la règle d'aujourd'hui.
   - **Le téléversement par le personnel sur une fiche client** vaut **`true`** quand la requête ne dit rien. Le formulaire présente « Visible par le client », décoché par défaut.
   - *Pourquoi* : les deux erreurs ne coûtent pas la même chose. Un document laissé interne par oubli se répare d'un clic, et le client ne l'a jamais vu. Un document montré par oubli ne se répare pas : le client l'a lu, peut-être téléchargé. Le défaut doit tomber du côté de l'erreur réparable.
6. **Les documents existants ne migrent pas** : ils restent `is_internal = false`.
   - Ils ont été déposés sous la règle « le client les lit ». Les cacher après coup ne retirerait rien de ce qu'il a déjà vu, et changerait sous les yeux du personnel ce qu'il a cru partager.
   - Il n'y a pas de production ([CLAUDE.md](../../CLAUDE.md), § Workflow git) : la question ne porte que sur la démo et la préproduction. Le personnel bascule à la main ce qu'il veut cacher.
7. **Quatre des cinq lecteurs du contexte appliquent la règle** : `view`, la liste, le coffre et l'accueil. Le **partage par lien** l'applique aussi : la branche « titulaire du porteur » de `share` ne vaut pas pour un document interne. Le cinquième lecteur, l'export, garde les métadonnées (§ 8).
   - Le lien public d'un document interne reste possible pour le **personnel**. C'est sa décision de le montrer à un tiers, comme pour tout document de l'agence.
   - **À la bascule vers « interne », les liens que le sujet avait publiés vers ce document sont révoqués** (`document_share_links.created_by_id`), par `revoked_at`, comme une révocation d'aujourd'hui. Il ne pourrait plus les publier, et un lien sert la version active, donc toute version déposée ensuite. Le laisser vivre ferait du document interne une pièce que le client continue de diffuser.
   - Les liens publiés par le personnel restent : c'est une décision de l'agence, déjà prise.
8. **L'export des données personnelles garde les métadonnées** (type, nom, date) d'un document interne de la fiche du titulaire, sans le fichier, comme aujourd'hui pour toute pièce qu'un autre a déposée (ADR-0070, amendement du 2026-10-25).
   - « Interne » est une décision d'écran : le droit d'accès aux données (loi n° 2008-12) ne la connaît pas.
   - **Validé par le porteur le 2026-11-12** (nuit, point 1) : l'export garde les métadonnées (nom, date, type) du document interne, **jamais son contenu**.
   - *Pourquoi* : la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel donne au client un droit d'accès aux données qui le concernent. Un document interne de sa fiche le concerne. L'export dit donc qu'il existe, sans livrer le fichier.

### Ce que le § 1 devient

La phrase « sur une cible fixe, `reaches` est une constante » reste vraie pour **l'accès à la cible**. Elle ne suffit plus pour **la liste de ses documents** : sur une fiche client, ce que l'appelant voit dépend aussi de la ligne (`is_internal`).

`listableOn` ajoute donc, pour le **sujet** de la fiche, la condition `is_internal = false`, et pour lui seul. Le prédicat reste unique : `view` et `listableOn` lisent la même définition du lecteur d'un document interne, écrite une fois (§ 3). Le test de parité « listé ⇔ ouvrable » du § 1 gagne la ligne interne.

### Conséquences

- **Une colonne et un endpoint de plus**, et six chemins à tenir alignés : cinq qui se ferment au sujet (`view`, liste, coffre, accueil, partage) et un qui garde les métadonnées (l'export). Le test de parité ne voit que la liste et le `show`. Les quatre autres ont chacun leur test.
- **Le personnel doit cocher pour montrer.** Une pièce qu'il voulait partager (un justificatif demandé au client, par exemple) reste interne s'il ne coche pas. C'est le prix du défaut réparable (§ 5).
- **Le sujet qui est aussi du personnel** ne lit pas les documents internes de sa propre fiche, alors qu'il lit ceux des autres fiches. C'est voulu (§ 3).
- **La notion ne s'étend pas d'elle-même** aux autres porteurs (§ 2). Un document interne au bail, caché au locataire, serait un autre amendement.

### Options écartées

- **Garder la règle et l'écrire au téléversement** (« visible par le client ») : c'était la recommandation de la session, que le porteur n'a pas retenue. Le personnel n'aurait aucun endroit où ranger une pièce interne au dossier.
- **Une énumération de visibilité** : plusieurs niveaux pour un seul public à écarter (§ 1).
- **Le drapeau sur tous les porteurs** : un drapeau sans effet sur cinq porteurs sur six (§ 2).
- **Défaut « visible » au téléversement du personnel** : l'oubli devient une fuite irréparable (§ 5).
- **Exclure le document interne de l'export des données personnelles** : le client ne saurait pas qu'une pièce de sa fiche existe, alors que le droit d'accès porte sur les données qui le concernent (§ 8).
- **Livrer le fichier d'un document interne dans l'export** : l'export rouvrirait au sujet ce que l'écran lui ferme (§ 8).
- **Migrer l'existant vers « interne »** : rien de ce que le client a vu ne se reprend, et le personnel perdrait ce qu'il croyait avoir partagé (§ 6).
- **Un second modèle (« pièce interne de la fiche »)** : une deuxième famille de fichiers, sans versions, sans coffre, sans partage, pour une différence d'audience.

### Application

- Migration : `add_is_internal_to_documents_table` (`boolean`, `NOT NULL DEFAULT false`).
- `DocumentPolicy` : la définition du lecteur d'un document interne, lue par `view`, `listableOn` et `share` ; une ability `setVisibility`.
- `StoreDocumentRequest`, `DocumentController::store`, `PATCH /api/documents/{document}/visibility`.
- `DocumentVault::uploadedDocuments`, `DashboardTenantService`, `DocumentResource` (`is_internal` rendu au personnel).
- Gardes (TCK-2759) : le test de parité étendu ; un test par lecteur ; le test du sujet auteur de sa fiche ; le test du défaut au téléversement ; chacun vérifié par ablation.

## Amendement du 2026-11-13 — le nom des auteurs d'un document, selon le lecteur (TCK-2773)

- **Décisions de la session, recommandées par l'implémenteur et appliquées par défaut le 2026-11-13** (1b, 2a, 3a), portées sur la liste du porteur, qui peut les renverser.

### Contexte

Relevé sur `feat/audit-ux-app-lot-2` (7641542ea) le 2026-11-13, en lecture seule :

- La fiche d'un document (`/app/documents/{id}`) n'écrit pas qui a ajouté la pièce, qui l'a vérifiée, qui a déposé chaque version ni qui a créé chaque lien : l'API ne sert que des identifiants (`DocumentResource.uploaded_by`, `.verified_by`, `DocumentVersionResource.uploaded_by_id`), et rien pour un lien. TCK-2656 n'a rendu que « vous » quand l'identifiant est celui de l'appelant.
- **La colonne du créateur d'un lien existe déjà** : `document_share_links.created_by_id` (migration `2026_04_17_160026`), écrite par `DocumentShareLinkService::create`, relation `DocumentShareLink::creator()`.
- **Le vérificateur d'un document est toujours un opérateur de la plateforme** : `DocumentController::verify` est réservé au super-admin, et c'est le seul écrivain de `documents.verified_by` (les versions et les pièces de profil le remettent à `null`, le KYC vérifie l'agence, pas le document). « Vérifié par l'agence » serait faux.
- Une fiche de document s'ouvre à des lecteurs que rien d'autre ne réunit (`DocumentPolicy::view`) : le personnel de l'agence, le bailleur du bien, le locataire du bail, le client d'une réservation, le sujet d'une fiche client, le téléverseur parti de l'agence, le super-admin. La liste des liens (`DocumentPolicy::share`) s'ouvre aussi au titulaire du porteur : le bailleur d'un bien, le sujet d'une fiche client pour un document qui n'est pas interne.

### Décision

**Le nom d'un auteur (téléverseur, vérificateur, auteur d'une version, créateur d'un lien) se juge par un seul juge, selon le couple (lecteur, auteur) : l'API sert le nom, un rôle, ou rien.** Le juge est `App\Services\Documents\AuteurDuDocument`. Il sert `{name: string, role: null}`, `{name: null, role: <code>}` ou `null` ; le libellé du rôle appartient au front (principe 5).

1. **Le nom** passe par `User::nameWithoutContact()` (TCK-815) : prénom et nom, jamais un numéro ni une adresse. Sans nom (« — »), l'auteur est traité comme absent du nom : le rôle, ou rien.
2. **Un opérateur de la plateforme** (super-admin) auteur ou vérificateur est servi **`platform`** à tout lecteur hors de la plateforme, le personnel de l'agence compris (décisions 1b et 2a). Le nom d'un opérateur reste dans la console `/super-admin`.
3. **Le nom est servi** :
   - à l'auteur lui-même ;
   - au super-admin ;
   - au personnel **actif** de l'agence du document (`staffAgencyId`, la règle d'`isStaffOf`), sauf s'il est le **sujet** de la fiche client qui porte le document : il lit alors comme le sujet (la règle de `readsInternalOf`, § 3 de l'amendement du 2026-11-12).
4. **À tout autre lecteur**, un **rôle**, jamais un nom (décision 3a : entre bailleur et locataire aussi) :
   - `landlord` : l'auteur est le bailleur du porteur (`BailleurDuBien::est` sur `properties.user_id` ou `leases.landlord_id`, par le bien pour une réservation ou un état des lieux) ;
   - `tenant` : l'auteur est le locataire du bail porteur ;
   - `customer` : l'auteur est le sujet de la fiche client, ou le client de la réservation ;
   - `agency` : l'auteur détient, ou a détenu (profil supprimé compris), un profil d'agent ou d'administrateur dans l'agence du document ;
   - sinon **rien** (`null`) : un auteur que la règle ne situe pas n'est pas nommé, même par un rôle.
5. **Où le juge s'applique** : la fiche (`GET /api/documents/{id}`, et les réponses à un document seul de `store`, `verify`, `visibility`), les versions (`GET /api/documents/{id}/versions` et les réponses de `store`/`restore` d'une version), la liste des liens d'un document et la réponse de leur création. **Les listes de documents (`index`, la recherche) ne portent pas ces champs** : aucun écran de liste ne les lit, et chaque ligne coûterait son jugement. Le lien public (`/api/share/{token}`) ne porte aucun auteur.
6. **Les identifiants restent servis** (`uploaded_by`, `verified_by`, `uploaded_by_id`) : ils n'apprennent rien d'un nom, et le front s'en sert pour « vous ».

### Conséquences

- La fiche du personnel écrit « Ajouté par Ousmane Niang » ; celle du locataire écrit « Ajouté par l'agence » ; la vérification s'écrit « Vérifié par Takussan » partout hors de la console.
- Le bailleur ne lit pas le nom de son locataire sur un document, alors qu'il peut le lire ailleurs : la règle est la plus étroite, et s'ouvrira sans rien casser si le porteur le décide.
- Un écrivain neuf d'un auteur de document (une autre colonne `*_by`) passe par le juge, ou ne sert que l'identifiant.

### Options écartées

- **Servir le nom de l'opérateur au personnel de l'agence** (1a) : le nom d'un membre de l'équipe Takussan sortirait vers chaque agence dont il vérifie une pièce.
- **« Vérifié par l'agence »** au bailleur et au locataire (2b) : faux, la vérification est celle de la plateforme.
- **Le nom entre bailleur et locataire** (3b) : ils se connaissent par le bail, mais rien ne l'exige pour lire une fiche de document ; la décision reste ouverte.
- **Le jugement dans chaque ressource** : trois endroits pour une règle, et la première divergence serait une fuite.
- **Les champs sur les listes** : un coût par ligne pour un champ qu'aucun écran de liste ne lit.

### Application

- `App\Services\Documents\AuteurDuDocument` : le juge, mémoïsé par auteur pour une fiche.
- `DocumentResource` (`uploaded_by_person`, `verified_by_person`, sur un document seul), `DocumentVersionResource` (`uploaded_by_person`), `DocumentShareLinkController::format` (`created_by_person`).
- Le front de la fiche (`DocumentDetailClient`, `VersionsDuDocument`, `LiensDePartage`) : « Ajouté par », « Vérifié par », l'auteur de chaque version et de chaque lien, le rôle traduit.
- Gardes (TCK-2773) : un test par lecteur, sur le corps brut de la réponse, chacun apparié au cas du personnel qui lit le nom ; le lien public sans auteur ; vérifiées par ablation du juge.

## Amendement du 2026-11-14 — l'archive préparée d'un dossier du coffre (TCK-2812)

- **Décisions de la session, recommandées par l'implémenteur et appliquées par défaut le 2026-11-14** (file `media` et plafond, table d'état, lien de 24 h), portées sur la liste du porteur, qui peut les renverser.

### Contexte

TCK-2770 a bâti « Tout télécharger » pendant la requête, borné à 40 entrées (`ArchiveDuCoffre::MAX_FICHIERS`) et 100 Mo de pièces : 40 quittances se rendent en 12,8 à 14,4 s sous `dompdf`, contre `max_execution_time = 60`. Au-delà, 422 `document.archive_too_large`. La préproduction rend par `dompdf` (relevé du 2026-11-14, `docs/infra/prod-drivers.json`). Sous `cloudflare`, onze rendus d'affilée dépassent la limite de débit du pilote (TCK-2811).

La file `media` est servie par la connexion `database`, dont le délai de reprise vaut 90 s (`config/queue.php`, ADR-0078) : un travail de cette file ne dépasse pas 85 s (`scripts/check-queues.mjs`).

### Décision

1. **Le seuil reste celui de TCK-2770** : jusqu'à 40 entrées, l'archive se bâtit pendant la requête (`GET /api/me/document-vault/archive`), inchangée. Au-delà, le front passe par la **préparation** : `POST /api/me/document-vault/archives` (`folder`) rend 202 et l'état de la préparation.
2. **Le travail `BatirLArchiveDuCoffreJob` tourne sur la file `media`**, `$timeout` 85 s, échec au dépassement. Il réutilise `ArchiveDuCoffre::construire()` avec un plafond de **150 entrées** (`MAX_FICHIERS_PREPAREE`), soit environ 50 s au rythme mesuré par TCK-2770. Au-delà, la demande rend 422 `document.archive_too_large`, comme aujourd'hui au-delà de 40. Le plafond des octets de pièces ne change pas (100 Mo).
3. **Le jugement se fait à la construction.** La demande vérifie seulement que le dossier est dans le coffre de l'appelant, sans garder ses entrées. Le travail rejuge le coffre par `DocumentVault::for()`, sous le **profil actif de la demande** (rangé avec elle, réinstallé dans le travail puis retiré), et dans la langue de la demande. Une entrée devenue illisible entre-temps n'y entre pas.
4. **Une limite de débit du pilote** (`EchecDuPilotePdf::estUneLimiteDeDebit`) relâche le travail pour un nouvel essai 60 s plus tard. Le travail a quatre essais. Chaque essai rebâtit l'archive depuis le début : aucun rendu n'est gardé d'un essai à l'autre (sous `cloudflare`, un dossier de plus de onze entrées peut donc échouer ; écart assumé, la préproduction rend par `dompdf`). Tout autre échec termine la préparation en échec. Un échec notifie l'appelant et ne laisse aucun fichier.
5. **L'état vit dans `document_vault_archives`**, une ligne par préparation : demandeur, profil, dossier, langue, statut (`pending`, `ready`, `failed`), code d'échec, disque, chemin, taille, expiration. Un index unique partiel sur les préparations **en cours** (demandeur, profil, dossier ; `NULLS NOT DISTINCT`) fait qu'une demande identique en cours ne lance pas un second travail. Une nouvelle demande remplace les préparations terminées du même dossier, fichiers compris.
6. **Le fichier vit sur le disque des médias privés** (`config('media-library.disk_name')`, `r2-private` en production, ADR-0029), sous un nom opaque (`archives-du-coffre/{user}/{uuid}.zip`), écrit seulement quand l'archive est entière. Jamais de `getPath()`.
7. **Le lien est une route signée relative, valable 24 h, derrière l'authentification** : `GET /api/me/document-vault/archives/{uuid}/download`. Il ne s'ouvre qu'au compte qui l'a demandé (403 sinon) et ne porte ni identifiant de document ni chemin. Après l'expiration, il rend 403 (signature) ou 410. Le lien n'est jamais rangé dans une notification : l'état (`GET /api/me/document-vault/archives`) le rend au demandeur.
8. **La purge** (`PurgerLesArchivesDuCoffre`, toutes les heures) efface les archives expirées et leurs fichiers, ainsi que les préparations échouées ou restées en cours depuis plus de 24 h. Un compte effacé n'est qu'anonymisé et *soft-deleted* (`AccountDeletionService::anonymize()`) : la cascade de `user_id` ne joue pas, ses jetons sont révoqués (le lien, réservé au demandeur authentifié, ne s'ouvre donc plus), et c'est cette purge qui efface ses archives, au plus 24 h après. Un travail encore en file échoue sans notifier (le compte n'est plus résolu).
9. **Sous impersonation, refusé** (ADR-0055 §3) : la demande est une écriture, et l'état comme le téléchargement entrent dans `REFUSED_READS`.
10. **L'appelant est notifié** quand l'archive est prête (`document.archive_ready`) et quand elle échoue (`document.archive_failed`). La cible `document_archive` ouvre le coffre (`/app/documents`), hors agence. Il n'y a pas d'interrupteur de préférence, car la notification répond au geste de la personne : la cloche, et le courriel quand le compte en a un.

### Conséquences

- Le bailleur qui a plus de 40 quittances dans l'année les reçoit en un geste, sans rester sur la page.
- Au-delà de 150 entrées, il les télécharge encore un par un. Dépasser ce plafond demande la file `long` (ADR-0078) ou un travail découpé.
- Une table de plus (`DocumentVaultArchive`, `docs/models-spec.md`).

### Options écartées

- **La file `long`** (1900 s) : sans plafond pratique, mais le ticket nomme `media`, et le volume mesuré n'en a pas besoin.
- **`ShouldBeUnique` et le cache** : ils dédoublonnent, mais ne donnent au front aucun état durable à montrer.
- **Garder les rendus d'un essai à l'autre** : utile seulement sous `cloudflare`, qui ne sert aucun environnement.
- **L'URL signée dans la notification** : elle survivrait dans `app_notifications` et dans le courriel, hors de l'authentification.

### Application

- `App\Jobs\Documents\BatirLArchiveDuCoffreJob`, `App\Jobs\Documents\PurgerLesArchivesDuCoffre`, `App\Models\DocumentVaultArchive`, `DocumentVaultArchiveController`.
- `ArchiveDuCoffre::construire()` reçoit son plafond. `verifierLaDemande()` juge la demande sans en garder les entrées.
- Front : `CoffreDeDocuments` (« Tout télécharger » au-delà de 40 entrées : préparation, prête, échec avec « Réessayer »), `lib/queries/coffre.ts`.
- Gardes : `ArchiveAsynchroneDuCoffreTest`, vérifiées par ablation du jugement à l'exécution, de la vérification du demandeur, de la signature et du refus sous impersonation.

## Amendement du 2026-11-14 — un bien et ses baux, en une lecture (TCK-2841)

- **Décision de la session, recommandée par l'implémenteur et validée par team-lead le 2026-11-14** (la forme du paramètre), portée sur la liste du porteur, qui peut la renverser.

### Contexte

Le § 1 prend **une** cible. L'onglet Documents de la fiche d'un bien lisait donc le bien et le bail en cours, et renvoyait à la fiche de chaque bail clos pour ses pièces (TCK-2639, AC3). Le coffre du bailleur range pourtant déjà les baux hors brouillon sous le dossier du bien (`DocumentVault`).

### Décision

1. **`GET /api/documents?filter[property_with_leases]=<id>`** rend les documents déposés sur le bien **et** sur ses baux hors brouillon (passés compris), paginés, avec les autres filtres, tris et `fields[documents]` de la liste. Une clé dédiée, et non `filter[with_leases]=1` à côté de `documentable_type`/`documentable_id` : ces deux filtres retireraient les lignes de bail après la garde ; ils gardent leur sens (et peuvent se combiner : `documentable_type=lease` n'y rend que les pièces des baux).
2. **La garde est celle du § 1, appliquée à CHAQUE cible de l'arbre** : le bien d'abord, puis chaque bail. Une cible lisible (`readsTarget`) rend tous ses documents ; une cible illisible rend ceux que la règle d'auteur ouvre (`restreindreAuTeleverseur`). Le locataire d'un bail ne lit donc ni les pièces du bien ni celles d'un autre bail du même bien ; l'ancien bailleur d'un bail clos (`leases.landlord_id`) ne lit que ce bail. Le super-admin reste sur ses téléversements (TCK-820).
3. **Un bail en brouillon n'y range rien**, comme au coffre.
4. **Un identifiant mal formé ou inconnu ne rend rien** — ni 403, ni 404, ni repli sur la liste sans cible (TCK-732). Un bien qui existe mais que l'appelant ne lit pas suit le point 2 : la règle d'auteur, dans l'arbre.
5. **Chaque ligne dont le porteur est un bail porte `lease`** (`id`, `reference_number`, `status`), lu sur le porteur que la page charge déjà : l'écran nomme la pièce avec son bail.
6. **Un nombre de requêtes constant** de 1 à 9 baux : les baux sont lus une fois avec leur locataire, et les capacités jugées sous `MembershipCapabilityResolver::primed`.

### Conséquences

- L'onglet Documents du bien rend toutes ses pièces, rangées par bail ; la ligne « Pièces des baux précédents : sur chaque bail » disparaît.
- Le § 1 garde sa forme à une cible. L'arbre bien → baux est la seule cible composée ; un autre arbre (une fiche client et ses réservations) demanderait un amendement.

### Options écartées

- **`filter[with_leases]=1` à côté de la cible** : oblige à neutraliser deux filtres existants quand le drapeau est présent, une exception que rien ne voit.
- **Une lecture par bail côté front** : une requête par bail clos, et un compteur qui ne se ferme qu'à la dernière.

### Application

- `DocumentPolicy::listableOnPropertyAndLeases()`, appelée par `DocumentController::index` ; `filter[property_with_leases]` déclaré dans `Document::customQueryFilters()` (la borne vit dans la politique) ; `DocumentResource` (`lease`).
- Front : `useDocumentsDuBien` (`OngletDocuments.tsx`), une lecture au lieu de deux, rangée par bail.
- Gardes : `DocumentsDuBienEtDeSesBauxTest`, vérifiées par ablation du filtre d'agence, du `view` appliqué au bail et de l'exclusion des brouillons.

## Amendement du 2026-11-15 — le coffre de l'agence (TCK-2895)

- **Demandé par le porteur** (« implémente tout », sur l'audit des maquettes du 2026-11-15 : app-documents **e4** et **e5**). Les modalités ci-dessous sont des décisions de la session, à revoir.
- **Revient sur une option écartée** : « une liste globale sans écran pour la lire ». L'écran existe désormais (« Documents » de l'agence, TCK-2896). Ce qui ne revient pas : une liste **sans cible**. L'agence devient une cible nommée, bornée à son personnel actif.

### Contexte

Relevé sur `feat/audit-manques-2026-11-15` le 2026-11-15 :

- `GET /api/documents` sans cible ne rend que les téléversements de l'appelant (§ 1, TCK-820) ; avec une cible, un bien, un bail, une fiche… une à la fois, ou un bien et ses baux (TCK-2841).
- Le coffre (§ 2) range par dossier pour le locataire, le bailleur et le prestataire. **Le personnel de l'agence n'en a pas** : rien ne rend l'arbre « bien › bail › dossier » de toute l'agence, ni ses comptes.
- La fiche d'un document ne dit pas à quel bien ni à quel bail il est rattaché : le fil « Bien › Bail › dossier » de la maquette e5 ne peut pas s'écrire.

### Décision

1. **Le coffre de l'agence : `GET /api/agency/document-vault`**, pour le personnel **actif** de l'agence du profil actif (`staffAgencyId()`), et pour lui seul.
   - Le locataire, le bailleur, le prestataire, l'agent suspendu ou retiré, et le super-admin (qui n'a pas de coffre de plateforme, § 4) reçoivent **403**.
   - L'agence est celle du **profil actif**, jamais un identifiant passé dans l'URL : le membre de deux agences lit celle où il agit.
2. **L'arbre rendu, compté, sans les entrées** (les entrées se lisent par la liste, point 4, ou par `documents/generated`) :
   - par bien de l'agence : son nom, son quartier, son nombre de documents, ses alertes ;
   - sous le bien, **Pièces du bien** (téléversées sur le bien), puis un nœud par **bail hors brouillon** dont l'agence est celle de l'appelant (locataire, référence, date de début), découpé en **Contrat**, **États des lieux**, **Quittances** (générés, comptés depuis leur source, § 3, sous la règle de leur endpoint) et **Pièces du locataire** (téléversées sur le bail) ;
   - le dossier **de l'agence** (téléversés sur l'agence elle-même : NINEA, RC, modèles) ;
   - les **totaux** de l'en-tête : documents, expirent bientôt, à vérifier — la somme des dossiers.
   - Chaque dossier compte `documents`, `expiring_soon` (60 jours, comme la liste), `unverified`, et donne `next_expiry_date` : la date la plus proche parmi ce qui expire bientôt. **Le texte (« 1 expire dans 42 jours ») est écrit par le front** (principe 5).
   - Un généré n'a ni vérification ni expiration (§ 3) : il compte dans `documents`, jamais dans les alertes.
3. **Ce que l'arbre ne range pas**, et pourquoi : les pièces d'une fiche client, d'une réservation, d'un état des lieux (ses pièces jointes, pas son PDF) et d'un bail en brouillon. Elles vivent sur leur fiche, qui les liste par sa cible (§ 1). L'arbre range ce que la maquette nomme, rien de plus : un dossier « autres » mélangerait des lecteurs différents (le sujet d'une fiche ne lit pas ses documents internes).
4. **La cible `agency` de la liste : `GET /api/documents?filter[agency]=current`**.
   - Elle rend **exactement** les téléversés que l'arbre compte : ceux des biens de l'agence, de ses baux hors brouillon (`leases.agency_id`, la colonne que lit `view`) et de l'agence elle-même. Un seul prédicat, `DocumentPolicy::listableOnAgency()`, sert l'arbre et la liste.
   - Seule la valeur `current` est acceptée. Toute autre valeur, ou un appelant qui n'est pas du personnel actif, ne rend **rien** — ni 403 ni 404 (TCK-732).
   - Elle **se distingue** de `filter[documentable_type]=agency`, qui désigne le seul dossier de l'agence. Elle **se combine** avec `documentable_type` / `documentable_id` pour ne garder qu'un dossier, et avec les filtres existants (`expiring_within_days`, `is_verified`, `type`…).
   - **La parité du § 1 s'étend** : tout ce que la cible agence liste s'ouvre en `show`, et rien de ce qu'un `show` refuse n'y figure.
5. **`filter[generated]=1`** (avec la cible agence seulement) rend les **générés** de l'agence — contrats, états des lieux signés, quittances — dans la forme d'une entrée du coffre (`kind`, `category`, `title`, `date`, `download_path`…) et non un `DocumentResource` : un généré n'est pas un `Document` (§ 3). Chaque entrée porte son `context` (bien, bail, locataire), et la page est paginée par le serveur dans l'enveloppe habituelle. Sans la cible agence, `filter[generated]=1` ne rend rien. La liste des téléversés de l'agence porte en méta le compte `generated` (la pastille « Générés »).
6. **La recherche** (« un document, un locataire, un bien ») : l'index des documents recopie, pour un document de bail, le nom du locataire et le titre du bien, et pour un document de bien, son titre (`carrier_tenant_name`, `carrier_property_title`, cherchables après `title` et `description`). `filter[search]` reste **le seul chemin** de recherche (Meilisearch, puis l'intersection avec la portée de la liste). Il vaut pour toute liste, pas seulement pour la cible agence : il ne rend jamais rien hors de la portée, qui reste la seule garde. Ces faits se réindexent quand le nom du locataire, le titre du bien ou le bien d'un bail changent (`DocumentsDuPorteurObserver`, comme TCK-2781).
   - Les générés se cherchent sur leur titre, le nom du bien et celui du locataire, dans la page déjà jugée.
7. **Le contexte d'un document** (`DocumentResource.context`, sur la fiche seule) : le bien (`id`, `title`, `neighborhood`) et, pour un document de bail ou d'état des lieux, le bail (`id`, `reference_number`, `tenant_name`). Il ne se rend que si l'appelant **lit la cible** (`readsTarget`) : le téléverseur gardé qui ne lit plus le porteur n'en apprend pas plus que la pièce.
8. **Règles conservées** (§ 4) : sous impersonation, les pièces de profil ne se listent pas (aucune n'est dans la portée de l'agence, la condition reste posée) ; l'agent suspendu ou retiré n'a ni arbre ni liste d'agence ; le nombre de requêtes de l'arbre ne dépend ni du nombre de biens ni du nombre de baux.

### Conséquences

- Le personnel lit, en une page, ce que ses collègues ont déposé sur tous les biens et baux de l'agence : c'est ce que `view` lui ouvre déjà document par document.
- Deux formes de ligne pour une même route (`DocumentResource`, entrée générée), choisies par `filter[generated]`. Le front les sépare par la pastille.
- L'index des documents porte deux champs de plus, et se réimporte une fois sur chaque environnement déployé (`scout:sync-index-settings`, puis `scout:import "App\Models\Document"`).
- Une recherche sur le nom d'un locataire trouve désormais, pour le bailleur ou le locataire aussi, les pièces de ce bail qu'ils lisent : c'est la même portée, mieux trouvée.

### Options écartées

- **Un identifiant d'agence dans l'URL** (`filter[agency]=12`) : il faudrait le comparer au profil actif, et une agence d'un autre profil de l'appelant deviendrait lisible sans en changer.
- **Ranger aussi les fiches client et les réservations** : leurs lecteurs ne sont pas ceux d'un bien (le document interne, amendement du 2026-11-12) ; un dossier « autres » ne dirait pas qui le lit.
- **Une seconde recherche, en SQL, sur le locataire et le bien** : un deuxième chemin de recherche (`check-filtering-single-mechanism`, D), qui perdrait la tolérance aux fautes et le classement.
- **Matérialiser les générés pour les lister avec les téléversés** : écarté par le § 3.

### Application

- `DocumentPolicy::listableOnAgency()` ; `App\Services\Documents\AgencyDocumentVault` ; `DocumentVaultController::agency` (`GET /api/agency/document-vault`) ; `DocumentController::index` (`filter[agency]`, `filter[generated]`) ; `Document::toSearchableArray()` et `config/scout.php` ; `DocumentsDuPorteurObserver` ; `DocumentResource` (`context`).
- Gardes : `AgencyDocumentVaultTest` (arbre, comptes, alertes, dossier de l'agence, autre agence, agent retiré, impersonation, double appartenance, requêtes constantes, parité liste ↔ `show`, totaux ↔ méta de la liste), vérifiées par ablation de la condition d'agence ; `DocumentContexteTest`.

## Amendement du 2026-11-15 — le profil du bailleur, cible d'un dépôt de l'agence (TCK-2909)

### Contexte

Le § 5 nommait l'alias `owner_profile`, mais `POST /api/documents` ne l'acceptait pas et `DocumentPolicy::reaches()` n'avait aucune branche pour un profil : l'agence ne pouvait déposer aucune pièce du bailleur, dont le mandat de gestion signé que sa fiche montre.

### Décision

1. **`owner_profile` est une cible de dépôt.** Le personnel actif de l'agence du profil (`isStaffOf`) y dépose et y lit ; le **titulaire** du profil y lit (jamais il n'y dépose par cette route : ses pièces passent par son parcours de pièces). Aucune autre agence, aucun autre bailleur : 404 au dépôt, 403 à la fiche, rien à la liste.
2. **Les pièces KYC d'un profil (CNI, RIB, NINEA, `Document::PIECE_TYPES`) restent fermées à la branche du porteur** : `view` les refuse à qui n'en est pas le téléverseur (le titulaire) ou le super-admin, `listableOn` les retire de la liste d'un lecteur qui lit la cible par cette branche, le dépôt d'un de ces types sur un profil par `POST /api/documents` est refusé (422 `document.profile_piece_by_kyc`), et `share` ne les ouvre plus au personnel de l'agence du profil — sa branche « personnel de l'agence du porteur » publiait, AVANT ce ticket, un lien public vers la CNI d'un bailleur. Ouvrir le profil au personnel n'ouvre donc rien de ce que seul le super-admin lisait.
3. **Un type neuf, `management_mandate`** (le mandat de gestion signé). La fiche du bailleur (`GET /api/owners/{id}`) rend la dernière pièce de ce type (`mandate_document` : nom, date, taille, type, chemin de sa fiche) ; le coffre du bailleur la range dans « mes pièces », sous son profil bailleur actif.

### Conséquences

- Le compte par type de la liste porte une clé de plus (`management_mandate`) ; le vocabulaire du coffre aussi.
- Les documents d'un profil de bailleur vivent sur la fiche du bailleur : la liste de l'agence (`filter[agency]=current`, § 4 de l'amendement du 2026-11-15) ne les range pas, comme les pièces d'une fiche client.

### Application

`DocumentController` (`ALLOWED_DOCUMENTABLE_TYPES`, refus des pièces), `DocumentPolicy::reaches()` / `view()` / `listableOn()`, `DocumentVault` (cible du profil actif), `OwnerDirectory::detail()`. Gardes : `OwnerDocumentUploadTest` (dépôt, lecture de la fiche, du coffre, parité avec une autre agence, les quatre portes des pièces KYC), vérifiées par ablation.

## Amendement du 2026-11-15 — toutes les quittances en une archive (TCK-2915)

**Constat.** L'archive (TCK-2770) et l'archive préparée (TCK-2812) prennent **un** dossier du coffre, et les quittances y sont rangées par année (`receipts:{année}`). L'historique des paiements du locataire propose « Tout télécharger » (audit des maquettes, app-paiements e0 et e2) : il fallait autant d'archives que d'années.

**Décision.** Deux clés de dossier **virtuelles**, acceptées par `GET /api/me/document-vault/archive` et `POST /api/me/document-vault/archives`, et **jamais listées** par le coffre (une quittance n'apparaît toujours que dans son dossier d'année, ni la liste, ni la recherche, ni les compteurs ne changent) :

- `receipts:all` : l'union des dossiers `receipts:{année}` de l'appelant ;
- `receipts:lease:{id}` : les quittances d'un de ses baux, prises dans ces mêmes dossiers.

Les entrées sont celles que le coffre a **déjà jugées** : la règle « la liste suit la lecture » vaut telle quelle, l'archive ne contient que les quittances que l'appelant peut ouvrir. Sans quittance, le dossier virtuel est vide : 422 `document.archive_empty`, comme un dossier vide, et le bail d'un autre ne se distingue pas d'un bail sans quittance. Les bornes (40 en direct, 150 préparées) restent celles des amendements précédents.

**Précision du 2026-11-15 (TCK-2916) — où mène l'avis de l'archive préparée.** Le coffre ne listant pas ces dossiers virtuels, l'avis « archive prête » (ou « échouée ») d'un `receipts:all` ou `receipts:lease:{id}` ne mène pas au coffre, où rien ne la montrerait, mais à la page des paiements (cible `receipts_archive` → `/app/payments`), où « Tout télécharger » de l'historique remet l'archive prête ou en redemande une. Les autres dossiers gardent la cible `document_archive` (le coffre). Le texte de l'avis ne nomme plus l'un ou l'autre lieu (« Ouvrez cet avis pour la télécharger »).

## Amendement du 2026-11-15 — le dossier d'un bail sous son bien, les devis et rapports du prestataire, le PDF d'une facture (TCK-2897)

**Constat** (audit des maquettes, app-documents e8 et e9). Le coffre du bailleur rangeait les documents d'un bail **à plat** dans le dossier du bien. Le prestataire n'avait que « Mes factures », dont chaque entrée menait à une fiche JSON : aucun PDF, ni de ses devis, ni de ses rapports de fin d'intervention.

**Décision** (décisions de l'agent, sur délégation du porteur, à revoir) :

1. **Un sous-dossier par bail hors brouillon dans le dossier d'un bien** (bailleur). Clé `lease:{id}`, genre `lease`, nom = le nom du locataire, `reference` = la référence du bail, `parent` = la clé du dossier du bien. Il reçoit le contrat, les états des lieux signés et les pièces du bail et de ses états des lieux ; le dossier du bien garde les pièces du bien. La liste reste **plate** : chaque dossier porte `parent` (nul hors de ce cas) et `reference` (la référence d'un dossier de bail, nulle sinon), une seule forme, que la recherche, l'archive et le front parcourent sans changement. Un bail brouillon n'a pas de dossier (il n'en avait pas d'entrée). Le sous-dossier d'un bien en lecture seule (bailleur bloqué) l'est aussi.
2. **« Devis et rapports »** (genre `quotes_reports`, prestataire au profil prestataire actif, existe même vide) : ses devis soumis (`maintenance_quote`, servis par `GET maintenance-requests/{id}/quote/pdf`) et un rapport de fin d'intervention (`maintenance_completion_report`) par intervention au travail rendu (`completed` ou `closed`, `ServiceProviderBill::BILLABLE_REQUEST_STATUSES`) qui lui est assignée. Listés depuis la demande (§ 3), sous la règle de leur endpoint : le prestataire **assigné et encore assignable** (`ProviderEligibility`, jugée une fois par la liste des agences où il l'est).
3. **`GET maintenance-requests/{id}/completion-report/pdf`** — le rapport, généré depuis la demande (bien, dates, travaux, notes de résolution, photos avant / après). Lecteurs : le prestataire assigné (même règle qu'`actAsProvider`) et le personnel de l'agence du bien. 404 tant que le travail n'est pas rendu. Un lecteur hors de l'agence du bien reçoit **404** ; un membre de son cercle (le demandeur, le bailleur, un autre prestataire de l'agence) **403**.
4. **`GET service-provider-bills/{bill}/pdf`** — le PDF d'une facture, que l'entrée de « Mes factures » sert désormais comme `download_path`. Lecteurs : ceux de la fiche (le prestataire de la facture, brouillon compris ; le personnel de l'agence, hors brouillon) et le **bailleur du bien** pour une facture qui lui est refacturée (`rechargeable_to_landlord`, validée ou payée : `scopeChargedToLandlord`). Hors de ce cercle : 404 ; un autre prestataire de l'agence ou le bailleur du bien d'une facture qui ne lui est pas imputée : 403. Montants en XOF sans sous-unité (`@currency`).

**Conséquences.** L'archive d'un dossier de bien ne contient plus les pièces de ses baux : chaque bail s'archive par sa clé `lease:{id}`, déjà acceptée. « Mes factures » et « Devis et rapports » ne s'archivent pas (422). La cible d'un bail offerte au dépôt (`attachable_targets[].folder`) devient son sous-dossier.

**Application.** `DocumentVault` (sous-dossiers, `addQuotesAndReports`), `MaintenanceCompletionReportController`, `ServiceProviderBillPdfController`, `MaintenanceRequestPolicy::viewCompletionReport`, `ServiceProviderBillPolicy::downloadPdf`. Gardes : `DocumentVaultOwnerLeaseSubfolderTest`, `DocumentVaultProviderQuotesReportsTest`, `ServiceProviderBillPdfTest`, `MaintenanceCompletionReportPdfTest`.
