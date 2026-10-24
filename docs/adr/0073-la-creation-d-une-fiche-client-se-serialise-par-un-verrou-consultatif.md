# ADR-0073 — La création d'une fiche client se sérialise par un verrou consultatif, pas par une contrainte d'unicité

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tickets** : aucun ticket encore. Piste P158.02 du fichier de pistes
  (`docs/plans/2026-10-15-pistes-d-amelioration.md`, angle 158). Décision du porteur du 2026-10-23.
  Précédents : TCK-591 (détecteur de doublon), TCK-1343 (P125.02, la conversion consulte le
  détecteur), TCK-1710 (P158.01, rattachement dans `findOrCreateFromUser`), TCK-1492 (P92.07,
  verrou des intégrations).
- **Codifie** : les deux verrous consultatifs déjà présents sans ADR
  (`SuperAdminCooptationService`, `IntegrationController::store`).

## Contexte

Une agence ne doit pas avoir deux fiches du même client. TCK-591 a posé la règle :
`CustomerDuplicateDetector::find()` cherche, dans l'agence, une fiche au même téléphone normalisé
(`CustomerPhoneNormalizer::normalize()`, E.164) ou au même e-mail replié
(`CaseInsensitive::fold()`). Une fiche trouvée rend 409 `customer.duplicate`, sauf si l'appelant
envoie `allow_duplicate`.

Relu sur `pre-dev` 4a12ba515, le 2026-10-23, il y a trois chemins qui créent une fiche client
(relevé : `grep -rnE "Customer::(create|forceCreate|insert|firstOrCreate|updateOrCreate|firstOrNew)|new Customer\(" app`) :

1. **`CustomerController::store`** (`CustomerController.php:47-73`) : appelle `refuseDuplicate()`
   puis `Customer::create`. Il n'y a ni transaction ni verrou.
2. **`ContactLeadService::convert`** (`ContactLeadService.php:247-288`) : tourne dans une
   transaction et verrouille la ligne de la demande (`lockForUpdate`, l. 250). Il appelle ensuite
   `refuseDuplicate()`, puis `CustomerService::create`. Ce verrou empêche de convertir deux fois la
   même demande. Il ne protège pas contre deux demandes **différentes** du même visiteur, converties
   en même temps par deux agents.
3. **`CustomerService::findOrCreateFromUser`** (`CustomerService.php:37-62`) : appelé par la
   candidature publique (`PublicPropertyController.php:991`) et par `BookingService::create`
   (l. 102), hors de leurs transactions. Il cherche une fiche par `user_id`. Sinon, depuis
   TCK-1710, il rattache la plus ancienne fiche de l'agence sans compte qui porte une coordonnée
   vérifiée du compte (`ficheARattacher`, l. 74). Sinon, il crée. Rien de tout cela n'est
   verrouillé.

Dans les trois cas, la course est la même : deux requêtes lisent « aucune fiche », puis toutes deux
écrivent. Aucune contrainte ne la rattrape :

- `customers_agency_phone_idx` est un index simple. Il est voulu non unique, puisque
  `allow_duplicate` rend des doublons légitimes.
- `customers.user_id` n'a qu'un index (`2026_10_18_050000_index_customers_on_user_id.php`).

Le mesureur a rejoué l'entrelacement dans un test, le 2026-10-22 : deux lectures par `user_id`
rendent `null`, puis les deux écritures passent. On obtient deux fiches au même `user_id`. La course
entre deux processus réels n'a pas été reproduite. Côté front, les boutons sont désactivés pendant
l'envoi (`CustomerForm.tsx`, `ContactLeadsInbox.tsx`). Cela couvre le double clic sur un même
écran. Cela ne couvre ni deux écrans ni deux agents.

**Le dépôt emploie déjà deux verrous consultatifs, sans ADR :**

- `SuperAdminCooptationService::lockCooptationSlot()` (l. 401-406), appelé par `invite` (l. 65) et
  `resendInvitation` (l. 155) : `pg_advisory_xact_lock(crc32('super_admin_cooptation:' + e-mail replié))`.
  Son docblock dit pourquoi un verrou de ligne ne suffit pas : aucune ligne parent n'existe, et
  aucun verrou de ligne ne bloque un `INSERT` concurrent.
- `IntegrationController::store` (l. 93-97) : `pg_advisory_xact_lock(crc32('integration_platform:' + fournisseur))`
  pour une intégration de plateforme, qui n'a pas de ligne d'agence à verrouiller.

`grep -n advisory docs/adr` ne rendait rien avant cet ADR.

## Décision

**La détection d'un doublon de client et la création de la fiche se font dans une même
transaction, sous un verrou consultatif transactionnel PostgreSQL (`pg_advisory_xact_lock`). Sa
clé est `(agency_id, téléphone canonique)`, ou `(agency_id, e-mail replié)` quand le téléphone
manque. `findOrCreateFromUser` verrouille aussi la ligne `users` du compte (`lockForUpdate`). Il
n'y a pas de contrainte d'unicité.**

### 1. Les trois chemins

| Chemin | Transaction | Verrous, dans cet ordre |
|---|---|---|
| `CustomerController::store` | neuve : couvre `refuseDuplicate()` et `Customer::create` | verrou consultatif de la clé |
| `ContactLeadService::convert` | celle qui existe déjà | ligne de la demande (déjà en place), puis verrou consultatif de la clé |
| `CustomerService::findOrCreateFromUser` | neuve : couvre la recherche par `user_id`, le rattachement et la création | ligne `users` du compte, puis verrou consultatif de la clé si le compte a une agence |

- **La clé se calcule sur ce qui sera écrit.** Pour `store`, ce sont les champs validés. Pour
  `convert`, c'est le téléphone et l'e-mail de la demande. Pour `findOrCreateFromUser`, c'est le
  téléphone et l'e-mail du compte, qui sont recopiés dans la fiche créée.
- **La relecture se fait sous le verrou.** `findOrCreateFromUser` refait sa recherche par
  `user_id` **après** avoir verrouillé la ligne `users`. Sinon, la seconde requête attend le verrou
  puis crée quand même.
- **Sans agence, pas de verrou consultatif.** Le détecteur ne cherche rien sans agence
  (`CustomerDuplicateDetector::find`, `agencyId === null` → `[]`). C'est le cas du super-admin hors
  agence dans `store`, et du visiteur sans profil d'agence dans `findOrCreateFromUser`. Pour ce
  dernier, le verrou de la ligne `users` suffit à empêcher deux fiches au même `user_id`.
- **`allow_duplicate` prend le verrou lui aussi.** La sonde est sautée, pas le verrou. Il n'y a
  ainsi qu'un seul chemin d'écriture, et la création voulue en double s'ordonne après la création
  concurrente.

### 2. La clé

La clé est une chaîne avec un **espace de nom**, ramenée à un entier de 64 bits.

- **Chaîne** : `crm.customer:<agency_id>:tel:<téléphone canonique>`, ou
  `crm.customer:<agency_id>:email:<e-mail replié>`.
  - Le téléphone canonique est la sortie de `CustomerPhoneNormalizer::normalize()`. Cette fonction
    rend l'E.164 d'un numéro valide, et sinon la saisie sans espaces de bord. C'est la valeur que
    `Customer::setPhoneAttribute` écrit et que le détecteur compare.
  - L'e-mail replié est `CaseInsensitive::fold(trim($email))` : c'est ce que le détecteur compare
    (ADR-0025).
  - Quand une création porte les deux, le téléphone fait la clé.
- **Entier** : les 8 premiers octets du SHA-256 de la chaîne, lus comme un entier signé de 64 bits.
  C'est le `bigint` qu'attend `pg_advisory_xact_lock(bigint)`.
- **Un seul point de calcul** : un utilitaire de `app/Support/` (à créer) prend l'espace de nom et
  les parties, calcule l'entier et pose le verrou. Les trois chemins l'appellent. Aucun ne réécrit
  le calcul.

**Pourquoi 64 bits et pas `crc32`.** Les deux verrous existants hachent en 32 bits. Une collision
ne rend jamais un résultat faux : elle fait seulement attendre une création qui n'avait pas à
attendre. Mais en 32 bits, la probabilité qu'au moins deux clés distinctes partagent un entier
passe 50 % vers 77 000 clés. Cela se produit sur un parc de fiches, et entre espaces de nom aussi,
car tous les verrous consultatifs de la base partagent le même espace d'entiers. En 64 bits, ce
risque devient négligeable.

**Pourquoi pas `hashtextextended()` de PostgreSQL.** C'est une fonction interne, non documentée.
Sa stabilité d'une version majeure à l'autre n'est pas promise. Une clé calculée en PHP se teste
sans base.

### 3. Les règles communes à tout verrou consultatif

Ces règles valent pour les trois chemins ci-dessus et pour tout verrou consultatif à venir :

1. **Toujours la forme transactionnelle** (`pg_advisory_xact_lock`), jamais `pg_advisory_lock`. Le
   verrou se libère au `COMMIT` ou au `ROLLBACK` : aucun verrou ne survit à une exception, et il n'y
   a rien à libérer à la main. La forme de session resterait attachée à une connexion réutilisée.
   Elle tiendrait mal derrière un pooler en mode transaction.
2. **Toujours dans une transaction ouverte.** Hors transaction, l'instruction se valide seule et le
   verrou tombe aussitôt : il ne protège rien. La transaction couvre la lecture qui décide **et**
   l'écriture.
3. **Un verrou consultatif seulement quand aucune ligne parent ne convient.** Le dépôt verrouille
   d'abord la ligne parent : le bail pour les reversements (ADR-0039 § 3), l'agence pour une
   intégration d'agence, le bien pour l'agent principal (ADR-0053). Le verrou consultatif sert quand
   la course porte sur un `INSERT` sans parent commun. C'est le cas ici : deux fiches au même
   numéro n'ont pas de ligne commune à verrouiller.
4. **Le verrou consultatif se prend en dernier**, après les verrous de ligne de la transaction, et
   un seul par transaction. Aucun chemin ne prend un verrou consultatif puis attend une ligne : deux
   transactions ne peuvent donc pas s'attendre en cycle.
5. **Une clé porte un espace de nom.** C'est le préfixe de la chaîne hachée, propre au domaine
   (`crm.customer`, `super_admin_cooptation`, `integration_platform`).

### 4. Les deux verrous existants

`SuperAdminCooptationService::lockCooptationSlot` et le verrou de plateforme
d'`IntegrationController::store` appliquent déjà les règles 1 à 5. Ils sont reconnus tels quels.
Leur clé reste un `crc32` sur 32 bits tant qu'on ne les touche pas.

Les faire passer par l'utilitaire du § 2 change la valeur de leur clé. Pendant un déploiement où
l'ancienne et la nouvelle image tournent ensemble, deux requêtes pourraient alors prendre deux clés
différentes et ne plus s'exclure. Ce passage se fait donc quand un ticket touche ces chemins, pas
en même temps que celui-ci.

### 5. Pas de contrainte d'unicité

**Elle est écartée**, pour deux raisons :

- `allow_duplicate` rend des doublons **légitimes** : un homonyme au même e-mail familial, un
  numéro partagé, une fiche créée « quand même » après le 409. Un index unique sur
  `(agency_id, phone)` ou sur l'e-mail interdirait ce que le produit permet.
- Une unicité sur `customers.user_id` échouerait dès la migration sur les fiches déjà doublées. On
  ne peut pas l'ajouter sans d'abord fusionner des fiches, ce qui est un autre chantier.

## Conséquences

**Ce que ça rend possible.**

- Deux créations concurrentes au même numéro dans la même agence s'ordonnent. La seconde voit la
  première et rend 409 `customer.duplicate`, comme si elle était arrivée après.
- Deux candidatures simultanées du même compte ne créent qu'une fiche.
- La concurrence sur un `INSERT` sans parent a enfin une règle écrite. Le prochain cas la suit au
  lieu de la redécouvrir.

**Ce que ça coûte.**

- Une transaction de plus sur `CustomerController::store` et sur `findOrCreateFromUser`, et une
  requête `select pg_advisory_xact_lock(?)` par création. L'attente ne touche que deux créations de
  même clé, dans la même agence.
- La candidature publique et la réservation verrouillent la ligne `users` du candidat le temps de
  créer sa fiche. Une écriture concurrente sur ce compte (profil, préférences) attend quelques
  millisecondes.

**Ce qui n'est pas couvert, et le reste.**

- **Une seule coordonnée fait la clé.** Le détecteur, lui, compare téléphone **ou** e-mail. Deux
  créations simultanées au même e-mail mais à deux téléphones différents, ou l'une avec téléphone
  et l'autre sans, prennent deux clés différentes : elles passent toutes deux. Prendre deux verrous
  (téléphone et e-mail) dans un ordre fixe fermerait ce cas. Ce n'est pas retenu : le cas est rare,
  et le seul effet est une fiche en double que l'agence fusionne ou supprime.
- **La modification d'une fiche** (`CustomerController::update`, qui consulte aussi le détecteur
  quand le téléphone ou l'e-mail change) n'est pas couverte. Ce n'est pas une création.
- **Une agence différente ne bloque rien** : la clé porte l'agence. C'est voulu, puisque le
  doublon se juge dans l'agence.
- **La fiche que l'agence a déjà, et que le candidat ne rattache pas** parce qu'il n'a pas vérifié
  sa coordonnée, reste traitée comme TCK-1710 l'a décidé. Le verrou ne change pas ce qui se
  rattache. Il change seulement ce qui se crée en même temps.
- **Les fiches déjà doublées restent.** Cet ADR ferme la course pour l'avenir. Il ne fusionne rien.

## Application

À faire, par un ticket, en TDD :

- **L'utilitaire de clé et de verrou**, dans `app/Support/`, avec un test unitaire : même entrée,
  même entier ; deux espaces de nom, deux entiers ; résultat dans l'intervalle d'un `bigint` signé.
- **Les trois chemins** : `CustomerController::store`, `ContactLeadService::convert` et
  `CustomerService::findOrCreateFromUser`, selon le tableau du § 1.
- **Un test par chemin qui prouve que le verrou est tenu.** Pendant la transaction de création,
  une seconde connexion PostgreSQL appelle `pg_try_advisory_xact_lock` sur la même clé et reçoit
  `false`. Pour `findOrCreateFromUser`, un test d'entrelacement : une fiche créée pour le compte
  entre la première lecture et l'écriture donne une seule fiche, pas deux. Chaque test se vérifie
  **par ablation** : retirer le verrou doit faire rougir le test.
- **L'index** de [`README.md`](README.md) porte la ligne de cet ADR.
