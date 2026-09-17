---
id: TCK-535
title: "La demande de réservation de la fiche du bien calcule son total autrement que le tunnel"
status: done
phase: P1
family: bug
estimate: S
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: [TCK-530]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
tags: [front, back, bookings, montants]
---

## Objectif utilisateur

Qu'une demande de réservation envoyée depuis la fiche du bien porte le même montant que le
tunnel `/bookings` pour le même bien et les mêmes dates.

## Contrat de données

Relevé le 2026-09-16 pendant TCK-530, qui n'a corrigé que le tunnel et `POST /api/bookings` :

- `PropertyReservationDialog.tsx` (fiche publique, `ReservationForm`) affiche encore
  `property.price * nights` dès que `contract_type === 'rent'`, sans lire `rent_period` — le
  défaut exact de TCK-530.
- `PublicPropertyController::bookingRequest()` (`POST /api/public/properties/{slug}/booking-request`)
  enregistre un total **différent des deux** : `prix × nuits` pour `daily`, **le prix seul** pour
  `weekly`, `monthly` et `yearly` (un séjour de 10 nuits dans un bien hebdomadaire vaut une
  semaine), calculé en flottant, sans acompte, et accepte les biens au mois ou à l'année.

La règle retenue par TCK-530 vit dans `App\Services\Booking\BookingQuote` (serveur) et
`takussan-web/src/lib/booking-quote.ts` (affichage).

## Delta à produire

- [x] Back : la branche location de `bookingRequest()` passe par `BookingQuote` pour `daily` /
      `weekly` ; `monthly` / `yearly` → un loyer (cf. AC2 amendé).
- [x] Front : la boîte de dialogue dérive son total de `quoteBooking()` et rend l'état décidé pour
      un bien au mois ou à l'année.

## Critères d'acceptation

- [x] AC1 — Même bien, mêmes dates : le montant enregistré par la fiche égale celui du tunnel
      (`daily`, `weekly`), épinglé par un test.
- [x] AC2 — **amendé le 2026-09-16** (session). Énoncé d'origine : « un bien `monthly` ne
      produit ni `prix × nuits` à l'écran, ni une réservation par cet endpoint ». Raison mesurée :
      sur un loyer `monthly` / `yearly`, le bouton principal de la fiche est « Postuler »
      (`getPrimaryCtaForProperty()` → `apply`, TCK-165), et il poste sur CET endpoint — refuser
      la réservation fermait un parcours vivant. **Nouvel énoncé : un bien `monthly` / `yearly`
      ne produit ni `prix × nuits` à l'écran, ni un total `prix × nuits` en base ; la candidature
      reste possible au montant d'un loyer.**

## Hors périmètre

- La branche vente (offre d'achat, TCK-176), qui porte son propre montant.

## Notes d'implémentation

**Décision (session, 2026-09-16) — option B.** Ce qui déclenche l'AC2 amendé : le bouton
« Postuler » (`apply`, TCK-165) d'un loyer `monthly` / `yearly` ouvre CETTE boîte et poste sur CET
endpoint (mesuré sur :3000, `appartement-lumineux-f3-a-almadies-Bt2PTs`). Le tunnel `/bookings`
garde son refus (TCK-530) : **aucune page ne le lie** (recherche de `/bookings` dans `src/`, hors
tests : seules ses propres redirections de connexion), et la fiche mensuelle n'en porte aucun
lien (relevé dans le DOM, connecté).

- `daily` / `weekly` : `BookingQuote` (total, acompte 30 %, en entiers), comme le tunnel.
- `monthly` / `yearly` (et toute autre location non courte) : total = UN loyer, recopié de la
  chaîne `decimal:2` sans flottant ; **aucun acompte**, comme avant (`deposit_amount` n'était pas
  écrit, la colonne est nullable sans défaut). La boîte affiche « Loyer : X / mois » et une ligne
  sur le bail, jamais de nuits.
- Le calcul se fait avant `findOrCreateFromUser()`.

**Ablations** (copie, mutation, `cp` de restauration, `md5` identique) :
- serveur, total long terme = `prix × nuits` → 2 rouges (monthly, yearly) ;
- serveur, un acompte inventé sur le long terme → les 2 mêmes rouges ;
- serveur, `weekly` renvoyé au prix seul → 1 rouge (weekly) ;
- boîte, `prix × nuits` pour toute location → 4 rouges sur 4 ; monthly et yearly rougissent sur
  l'assertion « ne contient pas prix × nuits », placée en tête pour que ce soit elle qui parle.

**Vérifié à :3000**, connecté (compte de seed local), sans envoyer la demande : « Postuler » ouvre
la boîte « Postuler à ce bien », qui affiche « Loyer 6 880 000 F CFA / mois », aucune ligne de
nuits, aucun débordement horizontal.

### Corrigé après vérification adverse

Relevé le 16 et le 17 septembre 2026. Chaque défaut a été reproduit, puis corrigé. Retirer la
correction fait rougir son test : fichier copié, muté, restauré par `cp`, `md5` identique.

- **Le propriétaire réservait son propre bien** par cet endpoint (201), alors que
  `POST /api/bookings` le refuse (403). La même règle s'applique désormais ici, avant tout calcul
  et toute écriture, et vaut aussi pour une offre d'achat. Test :
  `test_the_owner_cannot_request_their_own_property`, qui vérifie aussi qu'aucune fiche client
  n'est créée.
- **Réponses en anglais sur une fiche en français** : `apiRequest` ne lit la langue que dans le
  cookie du navigateur, si bien qu'aucune action serveur de `app/actions/property.ts` n'envoyait
  `Accept-Language`. Laravel répondait donc en `APP_LOCALE=en`. Relevé au navigateur : « The end
  date field is required. » Ces actions passent maintenant par `requeteApi()`, qui ajoute
  `getLocale()`. Test : `app/actions/__tests__/property.langue.test.ts`. Au navigateur, après
  correction : « Le champ end date est obligatoire. »
- **Refus de dates en anglais** : même dans la bonne langue, `after_or_equal` et `after` n'ont pas
  de traduction. `BookingRequestPublicPropertyRequest::messages()` rend désormais
  `bookings.start_in_past` et `bookings.end_before_start`. Test :
  `test_date_refusals_are_in_the_caller_language`.

Les points suivants ont été **éprouvés et tiennent** :

- **Aucune fiche client orpheline** quand le calcul refuse : `BookingQuote` s'exécute avant
  `findOrCreateFromUser()`. `test_a_refused_quote_leaves_no_orphan_customer` rougit si l'ordre
  s'inverse.
- **Pas d'IDOR** : un `customer_id` ou un `total_amount` injectés sont ignorés.
- **Aucun bien non réservable n'est atteignable** : un bien loué, vendu, archivé, indisponible ou
  en maintenance rend 404.
- **Même montant sur la fiche et dans le tunnel**, appelés réellement tous les deux :
  `test_the_property_page_and_the_tunnel_store_the_same_amounts` (19,99 € la semaine, 3 nuits →
  8,57 / 2,57 EUR). Au navigateur, la fiche affiche 8,57 € et 2,57 €, et la base enregistre
  `8.57 / 2.57 / EUR`.
- **Le lien de consentement de TCK-531 est intact** : l'offre d'achat pointe vers
  `/fr/legal/terms` (`target=_blank`), qui répond 200.

**Non corrigés, signalés** : ces deux défauts touchent tout le dépôt, pas ce ticket.

- Les 19 autres modules `app/actions/*` n'envoient pas la langue non plus.
- `SetLocaleMiddleware` ignore `preferred_language` pour un jeton Bearer : l'utilisateur n'y est
  pas encore résolu.

Les noms d'attributs (« end date ») ne sont pas traduits non plus.
