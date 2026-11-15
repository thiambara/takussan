# ADR-0102 — Une réservation porte sa nature : séjour, candidature ou offre ; même table, trois objets à l'écran

- **Statut** : Accepté le 2026-11-10 (décision 2 (a) de la famille 5 : *une page, un sélecteur de nature* ; décision n° 9 (c) : *saisie par l'agent possible*) — modalités : décisions de la session, à revoir
- **Date** : 2026-11-10
- **Tickets** : TCK-2579 (API : nature, saisie par le personnel), TCK-2580 (saisir une candidature ou une offre), TCK-2593 (recherche, compteurs), TCK-2594 (un écran, trois natures) ; les lisent : TCK-2581, TCK-2591
- **Va avec** : [ADR-0101](0101-le-fil-commercial-vit-dans-la-fiche-client.md)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- Sous `bookings` vivent **trois engagements** qui partagent un nom, une ligne et des onglets :
  - un séjour payé à la nuit ;
  - une candidature à une location au mois ;
  - une offre d'achat.

  Leur nature n'est écrite nulle part de façon fiable. Seule l'offre du tunnel public pose `metadata.kind = 'offer'`, et cette valeur n'est pas servie.
- **La voie du personnel ne sait créer qu'un séjour.**
  - `BookingQuote::for` refuse les locations au mois (422 `period_not_bookable`).
  - Le total d'une vente est forcé au prix affiché (`BookingService.php:167-189`).
  - Un membre du personnel sans `customer_id` crée une réservation **sans client** (`:102`).
  - Le client n'est pas prévenu (`NotifyOnBookingRequested.php:28`).
- La décision 9 (c) du porteur veut le lien envoyé d'abord, **et** la saisie par l'agent possible. Aujourd'hui, cette seconde voie n'existe pas.

## Décision

**`bookings.kind` dit la nature : `stay`, `application` ou `offer`. Même modèle, même table, mêmes statuts. L'écran sépare les trois objets ; la base ne les sépare pas.**

1. **La colonne `bookings.kind`.**
   - Chaîne et enum PHP ([ADR-0007](0007-pas-d-enum-sql.md)), non nulle.
   - Posée **à la création**, d'après le bien et son contrat : nuitée → `stay`, location au mois → `application`, vente → `offer`.
   - Rattrapée pour l'existant par la migration, d'après le bien et `metadata.kind`.
   - `metadata.kind` devient historique. Il n'est plus lu.
2. **Le personnel de l'agence du bien crée les trois natures, pour un client de l'agence.**
   - Une réservation saisie par le personnel a **toujours** un client : 422 sans `customer_id`.
   - Le client **en est prévenu**, par une notification à code ([ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md)).
3. **Une candidature ou une offre ne bloque aucune nuit.**
   - Seul le séjour passe par le devis et la disponibilité (`BookingQuote`).
   - Le montant d'une offre est celui que le client propose, et non le prix affiché.
   - Le montant d'une candidature est le loyer du bien.
4. **L'interface sépare les trois objets** : un vocabulaire (« séjour », « candidature », « offre »), un montant et une suite propres, et des filtres et compteurs par `kind`. Il y a une page et un sélecteur de nature (décision 2 (a)).

## Conséquences

- **Les filtres, compteurs et écrans se découpent par `kind`** (`filter[kind]`, TCK-2593).
- **Ce qui reste hors modèle** : la contre-offre, les pièces du dossier et le garant.
  - Si la candidature devient un vrai dossier, ce sera une **table fille de `bookings`**, et l'option « trois pages » de la décision 2.
  - Cela se décidera par un nouvel ADR, qui ne remet pas en cause la colonne.
- Le bail se crée toujours depuis une réservation par `?booking_id=` (TCK-2643). Il lit la nature pour préremplir.
- La migration de rattrapage doit trancher les réservations dont le bien a changé de contrat depuis. **Elle prend le contrat du bien au moment de la réservation** quand il est connu, sinon le contrat actuel, et elle compte les cas ambigus dans sa sortie.

## Options écartées

- **Trois tables** (`stays`, `applications`, `offers`) : trois cycles de vie à tenir alors que les statuts sont les mêmes. Les liens existants (paiements, bail depuis réservation, notifications) seraient à tripler.
- **Garder `metadata.kind`** : une valeur hors schéma, que le tunnel public seul pose, ne se filtre ni ne s'indexe proprement.
- **Déduire la nature du bien à chaque lecture** : le contrat du bien change (vente retirée, mise en location). Une réservation garde la nature qu'elle avait à sa création.

## Application

- Migration `add_kind_to_bookings` (colonne, rattrapage, index avec `agency_id` et le statut ; `down()` réversible). `BookingKind`. `BookingService` : création par nature, client obligatoire pour le personnel. Notification au client.
- Gardes (TCK-2579) :
  - un test par nature, créée par le personnel ;
  - un test « sans client, 422 » ;
  - un test « le client est prévenu » ;
  - un test « une candidature ne bloque pas les nuits du séjour d'à côté » ;
  - un test de rattrapage.
