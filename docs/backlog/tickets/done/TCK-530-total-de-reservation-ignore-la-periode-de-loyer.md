---
id: TCK-530
title: "Le tunnel de réservation multiplie le loyer par le nombre de nuits, quelle que soit la période du loyer"
status: done
phase: P1
family: bug
estimate: S
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: [TCK-535]
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#5-booking
tags: [front, back, bookings, montants, décision-produit]
---

## Objectif utilisateur

Que le total et l'acompte affichés dans le tunnel de réservation correspondent au prix réel du
séjour, quelle que soit la période à laquelle le loyer du bien est exprimé.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupe E), relu par la session :

- `takussan-web/src/components/bookings/BookingTunnel.tsx` (bloc `totalAmount`) calcule
  `property.price * nights` dès que `contract_type === 'rent'`, **sans lire `property.rent_period`**
  (`daily | weekly | monthly | yearly`, `types/property.ts`). Un bien à 250 000 F / mois réservé
  10 nuits affiche **2 500 000 F**, et l'acompte de 30 % qui en dérive (750 000 F) est faux dans
  la même proportion.
- Ce total est **envoyé tel quel** : `StoreBookingRequest` accepte `total_amount` et
  `deposit_amount` du client (`required|numeric|min:0`) — le serveur ne recalcule rien.
- Exposition actuelle : **aucune page ne lie le tunnel** (`/bookings?property=<slug>`) ; il ne
  s'atteint qu'en tapant l'URL. Le défaut est latent, pas encore vécu.

## Contraintes strictes (métier)

1. **Décision à prendre avant de coder** : le tunnel de réservation courte durée
   (features §1.3) doit-il seulement accepter des biens à loyer `daily` (et `weekly`) ? Un bien
   mensuel ou annuel relève du bail (§1.4), pas de la réservation. Proposition à valider :
   refuser le tunnel (état vide explicite, lien vers le contact de l'agent) pour `monthly` et
   `yearly`, et proratiser `weekly` par 7.
2. Montant décimal en base, jamais recalculé en flottant côté front pour être cru par le serveur
   (principe non négociable n° 3).
3. La règle d'acompte reste 30 % (features §1.3), inchangée.

## Delta à produire

- [x] Front : `totalAmount` dérive de `rent_period` selon la décision de la contrainte 1 ; le cas
      refusé rend un état explicite au lieu d'un montant.
- [x] Back : `StoreBookingRequest` / service de réservation recalcule (ou refuse) `total_amount`
      et `deposit_amount` au lieu de les accepter du client — ou le ticket consigne pourquoi c'est
      voulu.
- [x] Tests : un test front par période ; un test back qui poste un `total_amount` incohérent.

## Critères d'acceptation

- [x] AC1 — Un bien `daily` à 20 000 F, 3 nuits → total 60 000 F, acompte 18 000 F (inchangé).
- [x] AC2 — Un bien `monthly` ne produit **jamais** `prix × nuits` : il rend le comportement
      décidé (refus explicite ou proratisation), épinglé par un test qui rougit si le calcul
      actuel revient.
- [x] AC3 — `POST /api/bookings` avec un `total_amount` qui ne correspond pas au bien et aux dates
      ne crée pas une réservation à ce montant (ablation notée).

## Hors périmètre

- Relier le tunnel depuis la fiche du bien (décision produit distincte).
- L'endpoint `GET /api/bookings/quote` évoqué par features §1.3, sauf si la décision le rend
  nécessaire.

## Notes d'implémentation

**Décision produit (contrainte 1, validée par la session le 2026-09-16)** : le tunnel n'accepte que
`daily` (prix × nuits) et `weekly` (prix × nuits / 7). `monthly`, `yearly` et une période absente
(que le modèle ramène à `monthly`) rendent un état vide explicite, **avant** l'invitation à se
connecter, avec un lien vers le profil de l'agent (ou la fiche s'il n'en a pas). Une vente garde
ce que le tunnel affichait : le prix, acompte 30 %.

**Ce que la re-mesure a trouvé de plus que le ticket** — le tunnel ne pouvait créer AUCUNE
réservation, montant juste ou faux :

- il n'envoie ni `total_amount` ni `deposit_amount` (payload : dates, voyageurs, notes), alors que
  `StoreBookingRequest` exigeait `total_amount` → 422 systématique. Le « total envoyé tel quel »
  du ticket n'existait pas ; le trou existait quand même pour tout autre appelant de l'API ;
- il n'envoie pas de `customer_id`, et `BookingService::create()` rendait 403 à tout non-membre
  sans lui. Le service résout désormais le client de l'appelant (`findOrCreateFromUser`, comme
  `PublicPropertyController::bookingRequest()`).

Le tunnel est le **seul** appelant de `POST /api/bookings` (front, tests, services relus) :
aucune visite ni écran de back-office n'y passe.

**Serveur** : `App\Services\Booking\BookingQuote` calcule les deux montants en entiers
(centimes), arrondi au demi supérieur à l'unité mineure de la devise (`Currency::decimalPlaces()` :
le franc pour XOF/XAF, le centime pour EUR/USD). `takussan-web/src/lib/booking-quote.ts` applique
la même règle pour l'affichage, pour que le montant vu soit le montant enregistré.

**Montant client : refusé (422) s'il diffère, jamais remplacé en silence.** Les deux champs
deviennent facultatifs (`decimal:0,2`). Motif : qui envoie un montant croit réserver à ce prix ;
l'enregistrer à un autre serait un engagement qu'il n'a pas vu. Le tunnel n'envoie rien, il
n'est donc jamais touché par ce refus.

**Ablations** (fichier copié, muté, restauré par `cp`, `md5` identique avant/après) :
- retirer l'appel au calcul dans `BookingService::create()` → 11 rouges sur 12 dans
  `BookingPricingTest` ;
- garder le calcul mais faire confiance au montant client quand il est fourni → exactement
  2 rouges, les deux tests AC3 (total et acompte incohérents) ;
- côté front, remettre `prix × nuits` dans le tunnel → 4 rouges sur 5 (weekly, monthly, yearly,
  refus avant connexion) ; seul `daily` reste vert, ce qui est attendu (AC1 inchangé).

**Au passage** : le tunnel et `BookingSummary` formataient tout montant en XOF, quelle que soit la
devise du bien ; ils passent désormais `property.currency`.

### Corrigé après vérification adverse

Relevé les 16 et 17 septembre 2026. Chaque défaut a été reproduit avant d'être corrigé. Pour
chacun, retirer la correction fait rougir son test (fichier copié, muté, puis restauré par `cp`,
`md5` identique avant et après).


- **Devise** : `BookingService::create()` enregistrait `$data['currency'] ?? 'XOF'`. Un bien à
  99,99 € réservé par le tunnel donnait `299.97 XOF`, et un client pouvait envoyer `USD` sur un bien
  en XOF (201). La devise vient maintenant du bien (`BookingQuote` la rend), et une autre devise
  envoyée est refusée (422 sur `currency`), même règle que les montants.
- **Débordement** : `end_date` n'a pas de plafond. Un séjour jusqu'en 9999 au prix maximal faisait
  déborder l'entier à l'acompte : **500** (`intdiv(): … float given`). `BookingQuote` refuse (422 sur
  `end_date`, `stay_too_long`) tout séjour dont le total dépasse `decimal(14,2)` ; le plafond exact
  (1000 nuits à 999 999 999 F) reste accepté.
- **Refus muet dans le tunnel** : une erreur 422 sur `property_id` (bien passé au mois après le
  chargement de la page) se posait sur un champ sans saisie. **Relevé au navigateur** : aucun message,
  le bouton restait sans effet. Elle s'affiche maintenant en erreur globale.
- **Retour à l'étape fautive, jamais exécuté** : le code lisait `form.formState.errors`, que le proxy
  rend vide hors rendu. Un refus sur `end_date` laissait l'utilisateur sur l'étape des conditions,
  sans rien afficher. Le code lit maintenant les clés de la réponse.

- **Arrivée passée acceptée** : `POST /api/bookings` créait une réservation commençant en 2020
  (201) ; seul le sélecteur de dates l'empêchait. `start_date` porte désormais
  `after_or_equal:today`, la règle de l'endpoint public, jugée dans le fuseau de l'appli (UTC,
  soit l'heure de Dakar, sans heure d'été). Test : `test_a_stay_starting_in_the_past_is_refused`,
  plus le cas limite du jour même. Aucun test existant n'utilisait de date passée.
- **IDOR d'un membre d'agence** : `$isStaff` laissait un agent de l'agence A réserver au nom d'un
  client de l'agence B (201). Désormais, le `customer_id` envoyé doit être l'émetteur lui-même, ou
  un client que `CustomerPolicy::view` lui ouvre (agence active, client qu'il a ajouté,
  super-admin). Tests : `BookingCustomerScopeTest` (le cas refusé, et les deux cas autorisés).
- **Refus de dates en anglais** : `lang/*/validation.php` ne porte ni `after` ni `after_or_equal`.
  `StoreBookingRequest::messages()` rend donc `bookings.start_in_past` et
  `bookings.end_before_start`.
- **Vente XOF à prix non entier** : le total gardait ses centimes (12 345,67) alors que l'acompte
  était arrondi au franc (3 704). Le total s'arrondit maintenant à l'unité mineure, dans
  `BookingQuote` comme dans `booking-quote.ts`, et la fixture partagée porte les nouvelles valeurs
  (12 346, 33 333, 3). Test : `test_a_sale_total_is_rounded_to_the_franc_like_its_deposit`. Retirer
  l'arrondi d'un seul côté rougit la concordance de ce côté.
- **Écran de succès** : il affichait l'estimation du front, que l'API ne reçoit jamais. Il affiche
  maintenant le `total_amount` et la `currency` renvoyés par l'API. Test :
  `BookingTunnel.succes.test.tsx` (montant différent de l'estimation, et devise EUR).

**Concordance front/back** : `takussan-api/tests/fixtures/booking-quote.json` (29 cas : prix non
entiers, reste de la division par 7, demi exact, EUR/USD, prix maximal, et deux prix dont le flottant
JS tombe juste sous la valeur) est lu par `BookingQuoteConcordanceTest` (API) et par
`booking-quote.concordance.test.ts` (front). Hors dépôt, un balayage de 4036 cas n'a trouvé aucun
écart. Tests ajoutés : `BookingTunnel.refus-serveur.test.tsx`, et quatre tests dans
`BookingPricingTest`.

**Laissé à TCK-535** : `PropertyReservationDialog.tsx` (fiche publique) calcule encore
`prix × nuits`, et `PublicPropertyController::bookingRequest()` enregistre un troisième calcul.
