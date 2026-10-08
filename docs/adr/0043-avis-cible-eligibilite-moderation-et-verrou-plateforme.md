# ADR-0043 — Un avis a une cible, une preuve et un modérateur ; une annonce masquée par la plateforme tient à un verrou que seule la plateforme lève

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-597](../backlog/tickets/TCK-597-avis-signalements-et-moderation.md)
- **Précise** : le principe non négociable n° 2 (« l'agence est la frontière d'isolation ») et
  [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (le personnel de
  l'agence).

## Contexte

Mesuré sur `dev` (`6dc81542`, re-mesure de l'analyse du 2026-10-06) :

- **La modération des avis n'a pas de périmètre.** `ReviewController::index`, `approve`, `reject`,
  `reports` et `ModerateReviewRequest::authorize()` ouvrent le geste à « un admin de **sa** propre
  agence » (`isAgencyAdminAt($user->agency_id)`) sans jamais comparer cette agence à celle de
  l'avis : un admin de l'agence A approuve, masque ou supprime les avis de l'agence B, et lit
  l'e-mail de leurs signalants. `pending_count` compte toute la plateforme. Répondre est ouvert à
  tout membre dont le profil actif est dans l'agence du bien, bailleur compris.
- **Un avis ne sait pas à quelle agence il appartient.** `reviews` n'a qu'un `morphTo`. Pour un avis
  sur un agent (`User`), aucune colonne ne dit quelle agence le modère ; pour un avis sur une agence,
  l'agence jugée serait aussi celle qui modère.
- **On ne peut noter ni un agent ni un prestataire.** Aucune route ne crée un avis sur un `User`, et
  `ServiceProviderProfile` n'est pas une cible du `morphTo`. Noter le prestataire comme `User`
  mélangerait sa note avec celle de sa fiche d'agent, s'il en a une.
- **Un signalement tranché n'agit pas sur l'annonce.** `resolveReport` pose `resolved_at` et rien
  d'autre ; `hide` et `remove` laissent le bien publié et indexé. Masquer « par le statut » ne
  tiendrait pas : `publish`, `PUT …/status` et `PUT …/{id}` réécrivent le statut, et l'admin
  d'agence approuve lui-même les biens de son agence.
- **La modération d'agence ne tient qu'à la création.** `agencies.moderation_required` n'a qu'un
  lecteur, `PropertyObserver::creating` : un brouillon publié par `publish`, `PUT …/status` ou
  `PUT …/{id}` passe en ligne sans la file — et un bien **refusé** par l'admin aussi.
- **La file unifiée se décide deux fois.** `UnifiedModerationService::decide` ne verrouille rien et
  ne vérifie pas que l'élément est encore ouvert.
- **Le seuil de signalement est un réglage fantôme** (`config('takussan.reviews.report_threshold')`
  lit un fichier qui n'existe pas), et le recompte stocké des moyennes inclut les avis en attente
  et refusés : `GET /api/agencies/{id}` publie une moyenne d'avis non publiés.

## Décision

**Un avis porte sa cible, la preuve qui l'a rendu éligible et l'agence qui le modère, figée à la
création ; l'admin d'agence ne modère que les avis des biens et des agents de son agence ; une
annonce que la plateforme masque est verrouillée par trois colonnes qu'un seul point du code
défend, et que seule l'approbation d'un super-admin lève ; la modération d'agence tient au même
point ; et aucune décision de la file ne se joue deux fois.**

### 1. Qui modère quoi

`reviews.agency_id` est le **périmètre de modération** de l'avis, posé à la création depuis le
contexte et jamais réécrit ensuite :

| Cible | `agency_id` | Modère |
|---|---|---|
| Bien | l'agence du bien | l'admin de cette agence, et la plateforme |
| Agent (`User`) | l'agence du contexte (visite, bail, réservation) | l'admin de cette agence, et la plateforme |
| Agence | l'agence notée | **la plateforme seule** — une agence ne juge pas les avis qui la jugent |
| Prestataire (`ServiceProviderProfile`) | l'agence du bien de l'intervention | **la plateforme seule** |
| Tout avis d'une agence `individual`, ou sans `agency_id` | — | **la plateforme seule** |

« Admin de l'agence » se juge sur l'agence du **profil actif** (`User::$agency_id`) et sur un
`AgencyAdminProfile` **actif** dans cette agence (`isAgencyAdminAt`), jamais sur l'accesseur seul :
un admin suspendu ne modère plus rien. La règle vit dans `App\Policies\ReviewPolicy`
(`moderate`, `viewReports`) ; `index`, `pending_count`, `reports`, `approve`, `reject` et `moderate`
la lisent, et la liste de l'admin d'agence est **filtrée côté serveur** sur `reviews.agency_id`.

**L'admin d'agence ne tranche que l'avis avant sa publication** (verif-597 M3, décision de
session). Sur un avis `pending` de son périmètre, il peut seulement **approuver** ou **masquer**.
Dès qu'un avis est publié (`approved` ou `reported`), seule la plateforme le retire, et l'agence ne
fait plus qu'y répondre ou le signaler. Retirer, ignorer des signalements et supprimer sont réservés
à la plateforme, même pour un avis en attente.

Le motif est celui qui écarte déjà les avis sur l'agence : **juge et partie**. Un avis sur le bien
ou sur l'agent d'une agence la juge tout autant. Dans la version précédente, l'admin d'agence
pouvait masquer un 1★ publié sur son propre bien, sans aucun signalement, et faire passer sa
moyenne publique de 3 à 5.

En conséquence :

- `ReviewModerationScope::canModerate` exige `status = pending` et une décision prise parmi
  `AGENCY_DECISIONS` ;
- `pending_count` ne compte plus les avis `reported` pour l'agence ;
- `viewReports` reste ouvert sur tout le périmètre (`inAgencyScope`).

La décision est réversible.

**Répondre** (`reply`, `deleteReply`) appartient : au publieur du bien (`properties.user_id`), s'il
est encore bailleur actif ou personnel de l'agence ; au personnel de l'agence de l'avis
([ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md), `isStaffAt`) ; à l'agent
visé, tant qu'il est personnel de cette agence ; au prestataire visé. Jamais à un bailleur ou à un
client qui ne serait que membre.

### 2. La cible d'un avis sur un prestataire est son `ServiceProviderProfile`

Pas son `User`. La fiche publique d'un agent lit `User::receivedReviews()` : un prestataire noté
comme `User` y verrait ses notes d'intervention mêlées à celles de son activité d'agent.
`ServiceProviderProfile::reviews()` est un `morphMany` ; sa moyenne est lue **à la demande**
(`withAvg`, avis approuvés seulement) dans le carnet de prestataires de l'agence, sans colonne
stockée.

### 3. La preuve d'éligibilité est vérifiée par le serveur, et elle est stockée

`reviews.context_type` / `context_id` désignent ce qui a rendu l'avis possible : une visite
`completed`, un bail ou une réservation honorés, une intervention `completed` ou `closed`.
L'éligibilité se juge dans le `authorize()` du FormRequest, donc **avant** la validation (403 avant
422, TCK-305) :

- **bien** : une réservation `confirmed`/`completed` ou un bail `active`/`terminated`/`expired`
  dont l'auteur est le client (règle existante, inchangée) ;
- **agent** : une visite `completed` dont il est `agent_id`, ou un bail ou une réservation honorés
  sur un bien dont il est le publieur (`properties.user_id`) ; **on ne se note jamais soi-même** ;
- **agence** : un bail dont l'auteur est le locataire (règle existante) ;
- **prestataire** : une intervention `completed` ou `closed` dont il est `assigned_to`, notée par
  son demandeur (`requester_id`) ou par le personnel de l'agence du bien.

**Unicité** : une fois par auteur et par sujet pour un bien, un agent ou une agence (vérifiée par le
contrôleur, 422, **sous le verrou de la ligne parent** — le bien, l'agent, l'agence — autour du
contrôle et de l'écriture : verif-597 M4 a posé quatre avis par quatre envois simultanés sur un bien) ; une fois par auteur et par **intervention** pour un prestataire. La base la
garde par l'index unique partiel `reviews_author_context_uniq (author_id, reviewable_type,
context_type, context_id) WHERE context_id IS NOT NULL`. `reviewable_type` y figure — le ticket
nommait l'index sans lui — parce qu'un même bail rend éligible à noter le bien, l'agent **et**
l'agence : sans la cible dans la clé, le formulaire commun « bien + agent » se refuserait à
lui-même.

**Un avis retiré compte** (verif-597 M2). Un avis supprimé en douceur par la plateforme
(`remove`) interdit d'en déposer un autre sur le même sujet. Les quatre contrôles d'unicité et la
liste des invitations (`ReviewEligibility::opportunities`) le lisent `withTrashed()`, et le refus
est un 422 `review.*_already_reviewed`. L'index, de son côté, compte déjà les lignes supprimées.
La règle inverse (pouvoir noter de nouveau) aurait demandé `AND deleted_at IS NULL` dans l'index.
Elle est écartée : un retrait sanctionne l'avis, et le redéposer le contournerait.

Avant ce correctif, le contrôleur ignorait les avis supprimés alors que l'index les comptait.
L'invitation revenait donc après un retrait, et la cliquer rendait 500.

### 4. Le levier du masquage : statut, visibilité et verrou plateforme

Masquer une annonce (`hide`) écrit `status = rejected`, `visibility = private`,
`published_at = null`, **et** pose `platform_hold_at`, `platform_hold_by_id`,
`platform_hold_reason`. Supprimer (`remove`) pose le même verrou puis supprime doucement le bien.

Le verrou tient en **un point** : `PropertyObserver::updating`. Tant que `platform_hold_at` est
posé, toute sauvegarde qui rendrait le bien public — `status` vers un statut affichable
(`available`, `published`, `pending`), `visibility = public`, ou `published_at` non nul — est
refusée en 422 (`moderation.platform_hold`), **quel que soit le chemin** : `publish`,
`PUT …/status`, `PUT …/visibility`, `PUT …/{id}`, un lot, un `fill()`, un `update()` direct. Effacer
le verrou est lui-même refusé hors du contournement décrit au § 5. Les colonnes du verrou ne sont
pas `$fillable`.

Seule `PropertyModerationService::approve` **par un super-admin** lève le verrou. Un admin d'agence
qui approuve un bien verrouillé reçoit 403 (`PropertyModerationPolicy::approve`, doublé dans le
service). Pour que le super-admin puisse le lever, le bien repasse par la file : son agence le
resoumet (`rejected → pending_review`, qui n'est pas un statut affichable), il apparaît dans la
file unifiée, et l'approbation le rend `available` — publiable, pas encore public.

Le statut seul ne suffisait pas (contexte) ; la visibilité seule non plus (`publish` la réécrit).
Le verrou n'est pas un statut de plus : un statut neuf aurait dû être exclu de `scopePublic()` et de
`shouldBeSearchable()` (territoire de TCK-600), alors que `rejected` + `private` y sont déjà exclus.

### 5. La modération d'agence tient au même point

Dans la même méthode, **après** le verrou, l'activation se juge sur la **destination** et sur
l'**histoire** du bien, jamais sur le seul statut d'origine. Une **activation**, c'est un `status` qui
passe d'un statut non affichable à un statut affichable (`available`, `published`, `pending`). Elle
compte quand l'agence du bien est `moderation_required` et que le bien ne porte pas d'**approbation
debout** : `approved_at` non nul et postérieur à `rejected_at`. Dans ce cas, la sauvegarde est
réécrite en `status = pending_review` et `submitted_at = now()`. `submitted_at` est conservé s'il
était déjà posé et que le bien était déjà en attente. Le reste de la sauvegarde passe tel quel :
`pending_review` est exclu du catalogue.

Un retour en `draft`, `pending_review` ou `rejected` **annule** l'approbation : `approved_at` et
`approved_by_user_id` sont effacés. Un bien dépublié repasse donc par la file. La copie d'un bien
(`PropertyDuplicationService`) n'hérite pas de son approbation. En revanche, elle hérite
**délibérément** de son verrou plateforme : copier une annonce masquée ne la remet pas en ligne sous
un autre identifiant.

> **Corrigé après verif-597 (B1).** La première version jugeait le statut **d'origine** (`draft`,
> `pending_review`, `rejected` → `available` ou `published`). Un détour par `archived`,
> `unavailable`, `under_maintenance` ou `pending` blanchissait donc un brouillon, un bien refusé ou
> un bien en file en deux appels. Le témoin `test_unarchiving_is_not_an_activation` affirmait ce
> contournement.

Seule `PropertyModerationService::approve` passe outre, par `Property::withoutModerationGate()` :
un drapeau **statique**, posé pour la durée de l'appel et remis à zéro dans un `finally`, jamais un
attribut de requête ni un rôle. **Pas d'exemption par rôle** : l'admin d'agence qui publie lui-même
passe par sa file, comme à la création. Un retour `archived` ou `unavailable` → `available` n'est
pas une activation **seulement** pour un bien qui porte une approbation debout.

`AgencyUpdateRequest` accepte `moderation_required` (booléen) : la case de configuration était
jetée sans erreur.

### 6. Un signalement range, il ne masque jamais

- Un avis signalé passe `reported` (seuil `ReviewReportService::REPORTED_THRESHOLD = 1`, constante
  et non réglage) : il entre dans la file **sans** quitter l'affichage public (`is_approved` reste
  vrai). Aucun nombre de signalements ne masque un avis ni une annonce : les signalements sont
  anonymes et contournables, un concurrent retirerait n'importe quelle annonce.
- **La moyenne publiée ne compte que `is_approved = true`**, le critère des lectures publiques —
  pas `status = approved`, qu'un visiteur ferait bouger en signalant. Le recompte stocké
  (`reviews_count`, `average_rating`) se refait à chaque changement de `is_approved` ou de `status`.
- **Signaler sans compte** : le dédoublonnage se fait par compte si l'auteur est connecté, sinon par
  **empreinte visiteur** — `HMAC-SHA256(IP, clé applicative)`, jamais l'IP en clair dans
  `reviews.metadata` ni dans un signalement d'annonce neuf. Un champ piège rempli rend 204 sans rien
  enregistrer. Le limiteur `public-report` reste.

### 7. Aucune décision de la file ne se joue deux fois

`decide` verrouille la ligne source (`lockForUpdate`, piège PostgreSQL n° 2 : la ligne, jamais un
agrégat), vérifie qu'elle est encore ouverte et qu'aucun autre modérateur ne la tient, sinon **409**.
Prendre en charge un élément (`POST …/claim`) le réserve **10 minutes** (`moderation_claims`,
`item_key` unique) ; une prise expirée ne protège plus rien. Les décisions valides dépendent du type
d'élément — `property` : `approve`|`reject` ; `property_report` : `hide`|`remove`|`reject` ;
`review` : `approve`|`hide`|`remove` ; `suspected_duplicate` : `hide`|`reject` — tout autre couple
rend 422. Le motif est un **code** (`ModerationReasonCode`), traduit par le front ; le texte libre
n'est requis que pour `other`.

## Conséquences

- Un avis existant sur un `User` reçoit `agency_id = null` à la reprise : il relève de la plateforme
  seule, faute de contexte pour le rattacher.
- L'admin d'agence voit dans sa file les avis sur son agence, mais ne peut pas les trancher ;
  l'écran le dit.
- La modération d'agence s'applique à l'admin qui publie lui-même. C'est voulu, et c'est un
  changement visible pour les agences qui l'ont activée — la case n'était jamais enregistrée, donc
  aucune ne l'avait activée par l'interface.
- Lever un verrou demande deux gestes (resoumission par l'agence, approbation par la plateforme) :
  le prix d'un point unique.
- Une prise de 10 minutes peut bloquer un élément le temps qu'un modérateur parte sans relâcher ;
  elle expire seule.

## Alternatives écartées

- **Laisser l'admin d'agence modérer les avis sur son agence** : il serait juge et partie.
- **Noter le prestataire comme `User`** : mélange des réputations (§ 2).
- **Masquer par le seul statut, ou par la seule visibilité** : chaque chemin d'écriture les réécrit.
- **Un statut `held`** : il aurait fallu l'exclure de `scopePublic()` et `shouldBeSearchable()`, et
  chaque `match` sur `PropertyStatus`.
- **Garder la règle dans les contrôleurs** (`publish`, `updateStatus`, `update`, lots) : cinq copies,
  et la sixième — un lot, un `fill()` — l'oublie. L'observateur voit toute sauvegarde Eloquent.
- **Exempter l'admin d'agence de sa propre modération** : un rôle n'est pas une validation.
- **Auto-masquer après N signalements** : contournable, et une arme contre un concurrent.
- **Créer `config/takussan.php` pour le seuil** : une seule valeur, que personne n'a jamais réglée.
- **Un verrou pessimiste seul, sans prise en charge** : deux modérateurs liraient le même élément
  et l'un perdrait son travail au moment de décider ; la prise le dit avant.

## Application

- `App\Policies\ReviewPolicy` (liée dans `AppServiceProvider::bootGatesAndPolicies`) ;
  `tests/Feature/Api/ReviewModerationScopeTest.php`.
- `PropertyObserver::updating`, `Property::withoutModerationGate()` ;
  `tests/Feature/Api/Admin/PropertyReportDecisionTest.php`, `tests/Feature/Api/PropertyModerationGateTest.php`.
- `ReviewReportService`, `ReviewObserver::updated` ; `tests/Feature/Api/PublicReportTest.php`,
  `tests/Feature/Api/ReviewAggregateTest.php`.
- `UnifiedModerationService::decide`, `moderation_claims` ;
  `tests/Feature/Api/Admin/ModerationQueueConcurrencyTest.php`.
- `scripts/check-agency-scope-clause.mjs` ne tolère plus `ReviewController` ni `ReplyReviewRequest`.
