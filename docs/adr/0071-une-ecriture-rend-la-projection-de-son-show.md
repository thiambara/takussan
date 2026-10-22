# ADR-0071 — Une écriture rend la projection de son `show`

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Tickets** : aucun ticket encore — piste P95.03 du fichier de pistes
  (`docs/plans/2026-10-15-pistes-d-amelioration.md`, angle 95) ; précédents : TCK-1047 (P61.01),
  TCK-1127 (P95.02), TCK-1205 (P95.01)
- **Prolonge** : [ADR-0021](0021-sparse-fieldsets-au-niveau-ressource.md) (une ressource n'invente
  pas ce qu'elle n'a pas lu)

## Contexte

Une écriture (`store`, `update`, ou une action d'état comme `confirm` ou `cancel`) rend presque
toujours la ressource du modèle qu'elle vient d'écrire. Le front type cette réponse comme celle du
`show` : `useApiMutation<ApiResponse<Booking>, …>` pour l'annulation, la confirmation et le refus
d'une réservation (`takussan-web/src/lib/queries/bookings.ts:106,118,130`). Côté API, rien ne
l'impose. Le `show` charge ses relations et ajoute ses clés dans le contrôleur. Chaque écriture
décide pour elle-même, et la plupart ne chargent rien. Les ressources rendent leurs relations par
`whenLoaded` (ADR-0021) : une relation non chargée disparaît de la réponse, sans erreur.

Relu sur `pre-dev` fbf2acedf, le 2026-10-22 :

- **Réservation.** `show` charge `property.address`, `customer` et `payments`, puis ajoute
  `can_refund` hors de la ressource (`BookingController.php:65-67`). `confirm`, `cancel` et
  `reject` rendent `BookingResource::make($booking)` sans rien charger (l. 79, 91, 103). Il leur
  manque donc `property`, `customer`, `refund_status`, `booking_payments`
  (`BookingResource.php:40-46`, tous en `whenLoaded`) et `can_refund`, que le type du front
  déclare (`types/booking.ts:99`). `store` charge `agency`, que la ressource ne rend pas (l. 57).
- **Facture.** Seul `show` charge `creditNotes` (`InvoiceController.php:61`). `cancel` crée
  l'avoir (`InvoiceService.php:143-144`) puis rend la facture sans lui (l. 94) : la réponse du
  geste qui produit l'avoir est la seule où il manque.
- **Bail et état des lieux.** `LeaseController::update` rend `$lease->fresh()` sans `property` ni
  `tenant`, que `store` charge pourtant (`LeaseController.php:63,122`). Les clés `can_*` ne sortent
  qu'avec `forViewer()`, appelé par le `show` seul. Cet écart est **voulu, et il est écrit** :
  « Seulement sur le détail » (`LeaseResource.php:18-21`), « `show` seulement »
  (`InventoryResource.php:19-21`).
- **Deux ressources choisissent leur forme d'après la route.** `PropertyResource` pose
  `$isDetail` par `routeIs('properties.show', …)` (l. 48-50) et a déjà dû ajouter une route
  d'écriture à la main (`properties.assigned-agent.update`, l. 61, TCK-603).
  `MaintenanceRequestResource::isDetailRequest()` exige le paramètre de route
  `maintenanceRequest` (l. 95-112), que la route de création n'a pas
  (`routes/api/maintenance-requests.php:9`). Son docblock promet pourtant `media`, `access` et
  `abilities` à « chaque geste qui la renvoie ».

Le relevé de l'explorateur (angle 95) étend le constat à neuf contrôleurs : visites, avis,
modération des biens, abonnement d'agence et demande de passage, en plus de ceux ci-dessus. Ces
cinq-là viennent de sous-agents et n'ont pas été relus. Aucun appelant du front ne lit aujourd'hui
une clé absente : tous invalident et relisent, ou ne gardent que `id` ou `status`. Ce sont des
risques, pas des défauts visibles.

Le risque s'est déjà réalisé une fois. Un fil de groupe a affiché « 0 participant » et perdu ses
gestes d'administration, parce qu'une réponse sans `participants` avait remplacé le détail
(TCK-576). Il a été corrigé localement. Puis TCK-952 a écrit un test qui **assertait l'absence** de
`participants` et `property` dans la réponse du changement de rôle : faute de règle, un test a pris
l'écart pour la forme voulue. TCK-1127 a inversé cette assertion
(`ParticipantRoleResponseShapeTest`, 29684f9d6).

La même décision a donc été prise trois fois, à chaque fois pour un seul modèle :

- TCK-1047 : `store` et `update` d'un collaborateur rendent la projection de la liste (porteur,
  2026-10-20) ;
- TCK-1127 : `Conversation::loadForDetail()`, appelé par `show` et par les deux écritures
  (`Conversation.php:37-43`, `ConversationController.php:201,235`,
  `ConversationParticipantController.php:84`) ;
- TCK-1205 : un `presenter()` privé, partagé par le `show` et les écritures
  (`PayoutController.php:115-126`, `Admin/PlatformPayoutController.php:95`).

TCK-1205 montre aussi la variante la plus dangereuse. Avant lui, `payout_method_masked` était
**présente des deux côtés** : `•••• 1111` au `show`, `null` sur `approve`
(`PayoutResource.php:47`, `relationLoaded(…) ? … : null`). La réponse disait « aucune
destination » d'un reversement qui en avait une. Comparer les seules clés n'aurait rien vu.

`grep -n "projection\|forme du .show" docs/adr/*.md` ne trouvait aucune règle (délégué, le
2026-10-21). Le porteur a tranché le 2026-10-22, sur P95.03 : une règle écrite en ADR, gardée par
un test de contrat par modèle, plutôt que des mutations du front retypées en `Pick<X, …>`.

## Décision

**Une écriture rend la projection de son `show`, sauf exception écrite dans le docblock de la
ressource. Un test de contrat par modèle compare la forme de la réponse d'écriture à celle du
`show`.**

1. **Portée.** La règle vise toute route d'écriture qui rend en `data` la ressource d'un seul
   enregistrement d'un modèle ayant un `show`. Elle ne vise pas :
   - une réponse `204` ou sans corps ;
   - une écriture qui rend autre chose que la ressource (une liste, `{id, deleted}`) : sa forme se
     tranche à part (P95.04) ;
   - la projection des listes (`index`).
2. **Un seul chemin de présentation.** Le `show` et les écritures appellent la même méthode, qui
   charge les relations **et** pose les clés ajoutées hors de la ressource (`can_refund`,
   `additional`). Le motif dépend du nombre de contrôleurs qui rendent le modèle :
   - un seul : un `presenter()` privé au contrôleur (TCK-1205) ;
   - plusieurs : une méthode `loadForDetail()` sur le modèle (TCK-1127).

   Recopier les chargements du `show` dans chaque écriture ne suffit pas : c'est la copie qui
   diverge au prochain ajout.
3. **Une exception s'écrit dans le docblock de la ressource.** Une clé du `show` peut manquer à une
   écriture, ou une clé d'écriture manquer au `show`, si le docblock dit trois choses : quelle clé,
   pour quelles écritures, et pourquoi (coût d'une batterie de policies, clé jugée pour le seul
   lecteur du détail…). Les `can_*` de `LeaseResource` et `InventoryResource` sont les deux
   exceptions déjà écrites. Elles restent admises.
4. **Le contrat porte sur la forme, pas sur les valeurs.** La forme, c'est l'ensemble des chemins
   de clés de `data`, chacun avec le type JSON de sa valeur (`null`, booléen, nombre, chaîne,
   objet, liste). L'objet se compare récursivement. Une liste se réduit à son premier élément. Le
   type compte : sans lui, le cas de P95.01 (`null` contre une chaîne) passe. Le `show` se lit
   **après** l'écriture, sur le même enregistrement et par le même appelant. La donnée de test doit
   remplir ce que le `show` rend : relations présentes, listes non vides. Le test l'affirme d'abord.
   Sinon, deux formes vides se ressemblent et le test ne mesure rien.
5. **Le front ne se retype pas.** Les mutations restent typées `ApiResponse<X>`, et cette promesse
   devient vraie. L'autre option était `ApiResponse<Pick<X, 'id' | 'status'>>`. Elle **est
   écartée** : elle écrit l'écart dans le type, et le compilateur défend ensuite l'écart au lieu de
   le fermer.

## Conséquences

**Ce que ça rend possible.**

- Le type `ApiResponse<X>` des mutations du front devient vrai. Écrire la réponse d'une écriture
  dans le cache du détail (`setQueryData`) redevient sûr, et cela évite une relecture. Aujourd'hui,
  personne n'ose le faire, et l'absence de règle en est la raison.
- La question n'est plus tranchée modèle par modèle. TCK-1047, TCK-1127 et TCK-1205 deviennent des
  applications d'une règle, et non trois précédents à retrouver.

**Ce que ça coûte.**

- **Chaque écriture paie les chargements du `show`.** Pour une réservation, cela fait trois
  relations et le jugement de `can_refund` de plus par geste. Le coût est borné : un seul
  enregistrement, quelques requêtes. Quand le détail coûte vraiment cher, la voie est l'exception
  écrite, pas un `show` allégé.
- **Une écriture montre ce que montre le `show` : la règle suppose que qui peut écrire peut lire.**
  Les gestes d'une réservation et d'une facture s'autorisent par leur propre capacité (`validate`,
  `cancel`, `markPaid`), pas par `view`. Avant d'appliquer la règle à un modèle, son ticket vérifie
  que chaque écriture n'est permise qu'à un appelant du `show`. Si ce n'est pas le cas, l'écart
  s'écrit dans le docblock (point 3) et ne s'élargit pas.
- **La facture touche le domaine de l'argent.** Le correctif ne calcule aucun montant : il charge
  `creditNotes` sur les écritures, comme le `show`. Mais la réponse d'annulation portera désormais
  le montant de l'avoir. Le ticket de la facture vérifie la condition précédente avant tout.
- **Deux ressources ne peuvent pas suivre la règle sans changer de mécanisme** : `PropertyResource`
  et `MaintenanceRequestResource` déduisent la forme détail de la route. Ajouter chaque route
  d'écriture à la liste, comme TCK-603 l'a fait une fois, reproduit le défaut que cet ADR ferme :
  une route oubliée suffit. **La forme détail se demande explicitement**, par le chemin de
  présentation du point 2. Elle ne se déduit pas du nom de la route. Le ticket de chacun de ces
  modèles fait ce changement.
- **La liste des écarts admis d'un test est une tolérance.** Pour qu'elle ne serve pas de cliquet
  à sens unique, l'assertion **échoue aussi quand un écart admis n'en est plus un**. Quand le code
  ferme l'écart, il faut retirer l'entrée. La liste ne peut alors que rapetisser, au rythme du
  code. Chaque entrée renvoie au docblock qui la justifie.
- **Le chantier est long, et la règle est d'abord partielle.** Neuf contrôleurs sont relevés.
  Seuls les modèles dotés de leur test sont gardés. Aucune garde n'énumère encore les routes
  d'écriture restées hors règle. Un inventaire dérivé des routes, sur le modèle de
  `tests/Support/ResourceInventory.php`, pourra venir ensuite, par un ticket à part.

## Application

**Une assertion partagée**, dans `takussan-api/tests/Support/` : elle prend la réponse d'écriture,
la réponse du `show` et la liste des écarts admis. Elle compare les formes (point 4), échoue sur
tout écart non admis, et échoue aussi sur tout écart admis qui ne diverge plus.

**Un test de contrat par modèle**, au nom de ceux qui existent déjà
(`tests/Feature/Api/ConversationWriteMatchesShowTest.php`,
`tests/Feature/Api/PayoutWriteResponseTest.php`, à faire passer par l'assertion partagée). Chaque
test joue toutes les écritures du modèle qui rendent la ressource, puis le `show` du même
enregistrement. Il se vérifie **par ablation** : retirer un chargement du chemin de présentation
doit faire rougir le test.

**Ordre d'application** — un ticket par modèle, chacun avec son test :

1. **Réservation** (`BookingController`) : `store`, `confirm`, `cancel` et `reject` passent par le
   chemin du `show` (`property.address`, `customer`, `payments`, `can_refund`).
2. **Facture** (`InvoiceController`) : `store`, `send`, `markPaid` et `cancel` chargent
   `creditNotes`.
3. Puis, dans l'ordre que fixera le porteur : bail (`update`, avec l'exception `can_*` déjà
   écrite) et état des lieux, demande d'intervention et bien (avec le changement de mécanisme
   ci-dessus), visites, avis, modération, abonnement d'agence, demande de passage. Les entrées non
   relues de P95.03 se re-mesurent avant leur ticket.

**Les versements et la conversation** appliquent déjà la règle (TCK-1205, TCK-1127). Leur test
passe à l'assertion partagée quand elle existe.
