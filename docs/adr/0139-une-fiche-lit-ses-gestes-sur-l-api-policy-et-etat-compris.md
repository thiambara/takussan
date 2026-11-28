# ADR-0139 — Une fiche lit ses gestes sur l'API, policy et état compris ; chaque geste s'écrit par un seul chemin

- **Statut** : Accepté le 2026-11-27 (relevé d'architecture du 2026-11-27, recommandations validées par le porteur : « corrige tout de A à Z »)
- **Date** : 2026-11-27
- **Tickets** : TCK-3005 (visite), TCK-3007 (réservation), TCK-3011 (bail, état des lieux, facture)
- **Précise** : [ADR-0128](0128-le-fil-est-l-interface-des-objets.md) § 4 (« une carte affiche les `abilities` que l'objet accorde », « un seul chemin d'écriture »), étendu de la carte du fil à la fiche
- **S'appuie sur** : [ADR-0003](0003-capacites-enum-code-defined.md), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md)

## Contexte

Relevé sur `dev` (4e3a929f7) le 2026-11-27. Deux formes d'`abilities` coexistent :

- **policy seule** : le bail (`LeaseResource::forViewer`, « le statut du bail reste jugé par l'écran et l'API ») et la visite (`PropertyVisitResource`, « le statut n'y entre pas ») ;
- **policy et état** : l'intervention (`MaintenanceRequestResource::abilitiesBlock`) et la carte de réservation du fil (`BookingResource::gestes`, TCK-2958).

Avec la première forme, l'écran refait le statut ; avec aucune, il refait tout. Mesuré :

- `BookingDetail.tsx` recalcule ses gestes par `useCanAll` + statut (26 comparaisons de statut) alors que `show` sert déjà `abilities`. Il cache au Bailleur Accepter, Refuser et Annuler, que `BookingPolicy::validate` et `cancel` lui accordent (`landlordOf`) ; il exige `payments.record` pour encaisser, que l'API ne demande pas ; il affiche les boutons pendant le chargement des capacités, puis les retire.
- Côté visite, les transitions ont deux chemins d'écriture : `confirm` et `cancel` passent par `VisitSchedulingService`, sous verrou ; `complete` et `noShow` écrivent le statut depuis le contrôleur, jugé sur le modèle lié à la route, sans verrou. La précondition « encore à confirmer » est recopiée dans le lien d'action (`GestesParLien`).

## Décision

**Une fiche lit ses gestes dans `abilities`, que l'API calcule avec la policy ET l'état de l'objet. L'écran ne recalcule ni capacité ni statut pour décider d'un geste. Chaque geste s'écrit par un seul module, que le contrôleur, le lien d'action et la ressource appellent.**

1. **`abilities` dit « ce geste est possible maintenant pour ce lecteur »** : capacité, rôle sur l'objet (bailleur, client, personnel) et précondition d'état. Une clé par geste, en snake_case, booléenne.
2. **Le module du domaine porte, pour chaque geste, sa garde et son écriture** : `peut<Geste>(User, Model)` juge (la ressource l'appelle pour `abilities`) ; `<geste>(…)` rejuge sous verrou, écrit, prévient. Il n'y a pas d'autre chemin d'écriture.
3. **Côté front, une fonction pure par fiche** (`gestes(objet)`, patron de `components/leases/fiche/gestes.ts`) choisit l'ordre et la mise en avant des gestes à partir d'`abilities`. Elle ne lit ni `useCan`, ni `user.roles`, ni le statut pour décider qu'un geste est permis ; elle peut lire le statut pour **présenter** (libellé, ordre).
4. **Pas d'`abilities`, pas de geste.** Tant que la fiche n'a pas reçu `abilities`, elle n'affiche aucun bouton d'action (pas d'affichage optimiste).
5. **Les listes ne servent `abilities` que si une ressource le déclare demandable** (constante `FIELDS`, comme `PropertyVisitResource`) ; sinon une liste ne porte pas de geste.

## Conséquences

- Le Bailleur voit sur la fiche les gestes que la policy lui accorde ; un écart entre écran et API devient impossible par construction.
- Les règles de geste se testent en unitaire contre PostgreSQL (le module) et en fonction pure (le front), plus par le rendu.
- Coût : `abilities` grossit (une clé par geste), et chaque nouveau geste demande sa clé côté API avant son bouton côté front.
- Le bail et la visite changent de forme (policy seule → policy et état) : leurs fonctions `gestes` cessent de refaire le statut.

## Application

- API : `PropertyVisitResource`, `BookingResource`, `LeaseResource`, `InventoryResource`, `InvoiceResource` ; modules `app/Services/Visit/GestesDeLaVisite`, `app/Services/Booking/GestesDeLaReservation`.
- Front : `components/*/fiche/gestes.ts` (ou équivalent) par fiche, testés en fonction pure.
- Garde : les tests `*GestesTest` côté API (une clé `abilities` par geste, jugée vraie et fausse), les tests de fonction pure côté front.
