# ADR-0075 — Une valeur reçue en liste là où l'API attend une valeur unique vaut une valeur absente

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Décision du porteur** : option a de P216.05 du 2026-10-24 (angle 216 du fichier de pistes,
  `docs/plans/2026-10-15-pistes-d-amelioration.md`), précisée le même jour pour les filtres des
  tâches (§ 2)
- **Précédents** : [TCK-1407](../backlog/tickets/TCK-1407-valeur-en-liste-dans-un-filtre.md),
  [TCK-1864](../backlog/tickets/TCK-1864-recherche-paiements-rapprochement-parametres-en-liste.md),
  [TCK-1866](../backlog/tickets/TCK-1866-tableaux-de-bord-et-boosts-valeurs-en-liste.md), et
  P216.01 à P216.04 ([TCK-2120](../backlog/tickets/TCK-2120-consoles-super-admin-valeurs-en-liste.md),
  [TCK-2122](../backlog/tickets/TCK-2122-historique-des-paiements-valeurs-en-liste.md),
  [TCK-2124](../backlog/tickets/TCK-2124-include-en-liste-lu-a-la-main.md),
  [TCK-2126](../backlog/tickets/TCK-2126-tri-en-liste-avis-et-echeancier.md))

## Contexte

Un paramètre de requête peut arriver en liste : `sort[]=x`, `include[]=x`, `filter[status][]=x`.
PHP le range en tableau, et spatie découpe aussi une valeur de filtre sur la virgule. Un contrôleur
qui caste ce paramètre (`(string) $request->input(…)`, `$request->string(…)`) lève alors
« Array to string conversion », et l'API rend **500** pour une requête dont le client est fautif.

Le dépôt a fermé ce défaut route par route, sept fois, et chaque correctif a écrit sa propre garde.
Relevé le 2026-10-24 sur `54f0f14b4` :

- `is_string($include) ? … : []` dans les trois tableaux de bord (`DashboardOwnerController.php:40`,
  `DashboardAgentController.php:57`, `DashboardAgencyController.php:66`) et dans
  `DocumentResource.php:56` ;
- une fermeture `$chaine` (`AdminBoostController.php:26`), un `chaine()` privé dans
  `UserDetailController` et `AgencyModerationController` (TCK-2120) ;
- `is_string($status) && …` (`ReviewController.php:95`), `is_array()` avant chaque cast
  (`PaymentController.php:80`, `:93`, `:134`) ;
- une `FormRequest` (`SearchPaymentsRequest`, TCK-1864).

Aucune de ces gardes n'est partagée. Il reste **72 lignes `(string) $request` dans 45 fichiers** de
`app/`, et 13 `$request->string(` dans 11. Toutes ne lisent pas un paramètre de requête : beaucoup
lisent un corps déjà validé par une `FormRequest`. Aucune garde de `scripts/` ne lit ces motifs, et
une garde de motif ne verrait pas `$request->string(`, qui ne ressemble pas à un cast
(`Stringable.php:33`).

Les précédents ne donnent pas tous la même réponse :

- **la liste vaut absente** : tableaux de bord et boosts (TCK-1866), consoles super-admin
  (TCK-2120), `include` relu à la main (TCK-2124), tri des avis et de l'échéancier (TCK-2126),
  `filter[moderation_status]` des avis (TCK-1407) ;
- **la liste est refusée** :
  - 422 sur `q` et `direction` de la recherche de paiements (TCK-1864, par `FormRequest`) ;
  - 422 `payment.filter_status_invalid` sur `filter[status]` de l'historique (TCK-2122) ;
  - 422 sur une borne de date (`DateBoundaryFilter::exiger`, TCK-1273, TCK-1405 et AC3 de
    TCK-1407) ;
- **la liste vaut une valeur inconnue** : `filter[due]` des tâches ne rend aucune ligne
  (`Task.php:126-133`, TCK-1407).

`ExactIdentifierFilter` (TCK-576, TCK-1273) répond 400 `filter.identifier_invalid`. Il ne refuse pas
une liste : une liste d'identifiants est une valeur légitime d'un filtre exact, et chacun est jugé
(`(array) $value`, `ExactIdentifierFilter.php:40`). Il refuse un identifiant mal formé.

## Décision

**Un paramètre de requête qui attend une valeur unique et la reçoit en liste vaut absent : la route
le traite comme s'il manquait. Les refus déjà en place restent : 400, 422, et « aucune ligne » des
deux filtres des tâches. Un seul lecteur l'écrit, et un test qui parcourt les routes `GET` refuse
tout 500.**

### 1. Le lecteur

`App\Support\Http\ParametreUnique` porte la règle. Ni contrôleur ni ressource ne la réécrivent :

- `ParametreUnique::chaine(Request $request, string $cle): ?string` lit la clé dans la requête, en
  notation pointée (`filter.status`). Il rend la chaîne, ou `null` si la valeur est absente ou en
  liste ;
- `ParametreUnique::valeur(mixed $valeur): ?string` applique la même règle à une valeur déjà
  extraite : le `$value` d'un filtre `AllowedFilter::callback`, ou un élément de
  `$request->input('filter', [])`.

Le lecteur ne fait rien d'autre. Le défaut, le `trim()` et le découpage sur la virgule restent à
l'appelant, tels qu'il les fait déjà. Une chaîne vide arrive `null`, à cause de
`ConvertEmptyStringsToNull` (TCK-1864), et le lecteur ne change rien à ce comportement.

### 2. Les refus qui restent, et pourquoi

Un paramètre qui **refuse déjà** une valeur inconnue ou illisible garde son refus pour une liste.
Pour lui, la liste n'est qu'une valeur illisible de plus. Un appelant qui reçoit déjà ce refus pour
une valeur fautive ne gagnerait rien à un silence sur une autre. Cinq cas sont en place :

| Paramètre | Réponse | Pourquoi elle reste |
|---|---|---|
| filtre exact d'identifiant (`ExactIdentifierFilter`) | 400 `filter.identifier_invalid` | Il ne juge pas la forme liste, qui est permise, mais chaque identifiant. Hors du champ de la règle. |
| borne de date (`DateBoundaryFilter::exiger`) | 422, règle `string` + `date` | Une date illisible rend déjà 422 (TCK-1273). |
| `q`, `direction` de la recherche de paiements (`SearchPaymentsRequest`) | 422, règle `nullable` + `string` | La route déclare ses paramètres dans une `FormRequest`, et la règle de validation est son contrat. |
| `filter[status]` de l'historique des paiements | 422 `payment.filter_status_invalid` | Un statut inconnu rend déjà 422 (TCK-2122). |
| `filter[due]` et `filter[assigned_to]` des tâches | 200, **aucune ligne** (`whereRaw('1 = 0')`) | Une valeur inconnue rend déjà aucune ligne (`Task.php:126-133` et `:138-146`, AC1 de TCK-1407). Décision du porteur du 2026-10-24 : c'est un refus au sens de ce paragraphe. Un client qui a mal formé un filtre ne reçoit pas toute la liste. |

Ailleurs, quand un paramètre **ignore** une valeur inconnue (tri par défaut, filtre sans effet,
`include` sans chargement), la liste vaut absente.

Le dernier cas ne se lit pas comme les autres. Il rend 200, mais sans aucune ligne, alors qu'un
filtre ignoré rendrait la liste entière. Sans cette exception, `filter[due][]=today` passerait
d'« aucune tâche » à « toutes les tâches ».

Une `FormRequest` qui déclare `string` pour un paramètre de requête rend 422 sur une liste. C'est la
même règle que le tableau ci-dessus : la route a déclaré son contrat, et le lecteur ne la contourne
pas.

### 3. Le parcours des routes `GET`

Un test de la suite de l'API parcourt les routes `GET` du routeur et non une liste écrite à la
main. Pour chacune, il envoie `sort[]`, `include[]` et `filter[<nom>][]`, et il échoue sur toute
réponse 5xx. Il ne juge pas la réponse précise : 200, 400 et 422 passent. Il est donc indépendant
de la migration des sites, et peut partir avant elle.

Deux conditions empêchent qu'il soit vert sans rien prouver :

- **Le nom de filtre est un nom que la route lit.** Spatie refuse en 400 un filtre qu'il n'autorise
  pas (`InvalidFilterQuery`), avant que le code de la route ne s'exécute. Un `filter[x][]` générique
  serait vert partout. Les noms viennent de la déclaration de la route : les filtres autorisés de son
  modèle quand elle passe par spatie, et les clés qu'elle lit à la main sinon.
- **La route est atteinte.** Une réponse 401, 403 ou 404 ne dit rien de la lecture du paramètre. Le
  test compte les routes atteintes et le dit. Une route à paramètre d'URL entre dans le parcours quand
  le test lui fournit un modèle. Celles qui n'y sont pas encore sont nommées dans le test, chacune
  avec sa raison.

### Ce qui est écarté

- **(b) La liste refusée partout**, en 422 ou en 400 comme `ExactIdentifierFilter`. Cela aurait fait
  rendre 4xx à des routes que TCK-1866, TCK-2120, TCK-2124 et TCK-2126 servent en 200, et cela aurait
  changé leur contrat une seconde fois.
- **(c) Pas de convention**, seulement le parcours. Le 500 disparaît, mais chaque correctif choisit
  encore sa réponse. Les sept gardes ci-dessus montrent que les choix divergent quand rien ne les
  fixe.
- **Une garde de motif** sur `(string) $request` : elle ne voit pas `$request->string(`, et elle
  confond la lecture d'un corps validé avec celle d'un paramètre de requête.

## Conséquences

- **Plus de 500 sur une valeur en liste**, pour toute route `GET` que le parcours atteint. Les routes
  qu'il n'atteint pas encore sont nommées, au lieu d'être couvertes en apparence.
- **Aucune réponse ne change** pour les sites déjà corrigés : ils passent d'une garde locale au
  lecteur, à comportement égal. Le ticket de migration le prouve par leurs tests existants
  (`ValeursEnListe*Test`), qui restent verts sans modification.
- **Une lecture neuve d'un paramètre de requête passe par le lecteur.** La revue le vérifie, et le
  parcours rattrape un oubli sur toute route qu'il atteint.
- **Le lecteur n'écrit aucun contrat.** Une route qui doit refuser une liste le déclare dans une
  `FormRequest`, ce qui la fait entrer dans le § 2.

## Application

- `takussan-api/app/Support/Http/ParametreUnique.php` (neuf), avec son test unitaire : chaîne,
  `null`, liste, liste vide, notation pointée.
- Les sites à migrer vers le lecteur, à comportement égal :
  - `DashboardOwnerController`, `DashboardAgentController` et `DashboardAgencyController` (`include`) ;
  - `AdminBoostController::index` ;
  - `UserDetailController`, `AgencyModerationController`, `PropertyModerationController::index` et
    `AdminCreditWalletController::index` ;
  - `PaymentController::history` (`filter[entity_type]`, `sort`). `filter[status]` garde son 422 ;
  - `MaintenanceRequestController` (`index`, `show`), `DocumentResource::toArray` et
    `AgencyDetailController::properties` ;
  - `ReviewController::index` et `LeasePaymentController::index` ;
  - `Task` (`filter[due]`, `filter[assigned_to]`), qui garde « aucune ligne ». Le lecteur rend
    `null` pour une liste, et les deux filtres la refusent comme aujourd'hui : par le `default` du
    `match` pour `due`, et par la comparaison à `'me'` pour `assigned_to`. AC1 de TCK-1407 reste le
    témoin.
- Le parcours : `tests/Feature/Api/ValeursEnListeParcoursDesRoutesTest.php` (neuf), selon le § 3.
- Les lectures `(string) $request` et `$request->string(` d'un paramètre de requête que le parcours
  fait tomber en 500 passent au lecteur dans le même ticket. Les autres sont migrées quand un ticket
  les touche.
