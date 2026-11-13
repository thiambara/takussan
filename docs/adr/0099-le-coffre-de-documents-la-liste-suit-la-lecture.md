# ADR-0099 — Le coffre de documents : la liste suit la lecture, et les documents générés sont listés depuis leur source, jamais copiés

- **Statut** : Accepté le 2026-11-10 (recommandation de la famille 4 validée par le porteur, « je valide tes recommandations ») — modalités : décisions de la session, à revoir ; **amendé le 2026-11-12** (cf. § *Amendement du 2026-11-12 — le document interne de la fiche client*), **validé par le porteur le 2026-11-12** pour l'export des métadonnées, le défaut « interne » au téléversement du personnel et l'existant non migré ; **amendé le 2026-11-13** (cf. § *Amendement du 2026-11-13 — le nom des auteurs d'un document, selon le lecteur*), décisions de la session appliquées par défaut, sur la liste du porteur
- **Date** : 2026-11-10
- **Tickets** : TCK-2655 (API), TCK-2656 (coffre par dossier) ; la partie « Documents » de TCK-2639 (fiche bien) et de TCK-2641 (fiche bailleur) ; TCK-2759 (document interne, amendement du 2026-11-12) ; TCK-2773 (noms des auteurs, amendement du 2026-11-13)
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
