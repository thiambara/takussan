# ADR-0110 — La candidature et l'offre portent leurs conditions et leur dossier : pièces, garant, revenus, contre-offre, origine, dans des tables filles de `bookings`

- **Statut** : Accepté le 2026-11-15 (décision du porteur sur l'audit des maquettes de `/app` du 2026-11-15 : « écris les tickets pour tous les manques », la candidature comprise — « le porteur veut tout ») — modalités : décisions de la session, à revoir
- **Date** : 2026-11-15
- **Tickets** : TCK-2870 (conditions de la candidature et de l'offre), TCK-2892 (séjour : voyageurs, heures, types de paiement), TCK-2872 (dossier : pièces), TCK-2893 (garants, revenus), TCK-2873 (contre-offre), TCK-2874 (origine, refus transmis, acceptation et étape), TCK-2894 (fil, bail repris) ; les lisent : TCK-2875, TCK-2876, TCK-2877, TCK-2878, TCK-2879
- **Complète** : [ADR-0102](0102-une-reservation-porte-sa-nature.md) § Conséquences (« ce qui reste hors modèle : la contre-offre, les pièces du dossier et le garant […] se décidera par un nouvel ADR ») — **sans remettre en cause la colonne `kind`** ni l'option « une page, un sélecteur de nature »
- **Précise** : [ADR-0103](0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) § 5 (l'étape proposée par une candidature est confirmée par le geste d'acceptation), [ADR-0101](0101-le-fil-commercial-vit-dans-la-fiche-client.md) § 1 (la candidature entre au fil de la fiche)
- **S'appuie sur** : [ADR-0070](0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md) (revenu chiffré, masqué, lu sous step-up), [ADR-0099](0099-le-coffre-de-documents-la-liste-suit-la-lecture.md) (la liste suit la lecture), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (notifications à code)

## Contexte

Relevé sur `dev` (8c60f4c58) le 2026-11-15, en lecture seule, et audit des maquettes de la famille commerciale
(`audit-f5-commercial.md`, 2026-11-15) :

- Les maquettes validées par le porteur (`app-reservations` e0, e1, e3, e4, e5, e9 ; `app-fil-commercial` e6, e7)
  dessinent une candidature qui a **une durée, une caution, un montant à verser à l'entrée, des revenus, un garant
  et un dossier de quatre pièces** (« 3/4 pièces », « Ouvrir », « Demander »), une offre qui a **un financement, un
  délai de signature, des conditions et un geste « Contre-proposer »**, et un séjour qui a **des heures d'arrivée et
  de départ et un nombre de voyageurs**.
- Le produit n'en rend rien : `BookingResource` sert le loyer proposé, l'entrée, l'acompte, l'échéance et la référence
  (`BookingDetail.tsx:382-420`). ADR-0102 § Conséquences a laissé ces objets **hors modèle**, renvoyés à un nouvel ADR.
- Ce qui existe déjà et se réutilise :
  - `properties.deposit_months`, `advance_months`, `agency_fee_months`, `monthly_charges` (les mois de caution, d'avance
    et de frais d'un bien à louer) ;
  - la table `guarantors` (pièce et revenu chiffrés et masqués, ADR-0070), rattachée aux baux par pivot (trois au plus) ;
  - `documents`, polymorphe (`documentable`), et la règle de lecture d'ADR-0099 ;
  - `bookings.metadata.guests`, écrit par le tunnel public d'un séjour et jamais servi ;
  - `CustomerSuggestedStageQuery` (ADR-0103 § 5) : la candidature *propose* « Négociation », personne ne l'écrit ;
  - `CustomerTimeline` (types `note`, `visit`, `contact`, `stage`, `record`, `task`) : aucune réservation n'y entre.
- Le refus garde son motif en `cancellation_reason` ; la notification `booking.rejected` ne le porte pas
  (`BookingNotificationParams::for`).
- Le bail créé depuis une réservation (`?booking_id=`, TCK-2643) reprend le loyer **actuel** du bien, pas le
  montant de la candidature, et aucun garant (`CreateLeaseForm.tsx:208-220`).

## Décision

**Une candidature et une offre portent leurs conditions en colonnes de `bookings`, et leur dossier dans des tables filles
de `bookings`. La page reste une, avec son sélecteur de nature (ADR-0102 § 4) ; l'option « trois pages » n'est pas
retenue.**

1. **Les conditions, en colonnes de `bookings`, toutes nullables** (une nature n'écrit que les siennes) :
   - candidature : `term_months` (durée proposée, défaut 12), `renewable` (booléen, défaut vrai),
     `security_deposit_months` et `security_deposit_amount` — **instantané du bien à la création**, comme
     `list_price_at_booking` (ADR-0102) ; la caution vaut `security_deposit_months` × le montant de la candidature (le loyer du bien à sa création, ADR-0102 § 3, inchangé) ; le bien peut changer, la candidature garde ce qu'on lui a montré ;
   - « À verser à l'entrée » **n'est pas une colonne** : il se calcule (loyer proposé × `advance_months` du bien à la
     création, au moins un mois, + caution + frais d'agence), servi en lecture par la ressource
     (`entry_amount`) ; les mois d'avance et de frais sont pris dans le même instantané
     (`advance_months_at_booking`, `agency_fee_months_at_booking`) ;
   - offre : `financing` (enum PHP `OfferFinancing` : `cash`, `mortgage`, `mixed` — ADR-0007, chaîne en base),
     `signature_within_days` (entier), `conditions` (texte court, 500 caractères au plus) ;
   - séjour : `guests` devient une colonne (rattrapée depuis `metadata.guests`, qui n'est plus lue) ; l'heure d'arrivée
     et l'heure de départ sont **celles du bien** (`properties.check_in_from`, `properties.check_out_before`, heures,
     nullables ; défaut d'affichage 14:00 et 11:00 quand le bien ne les dit pas, posé par le front, jamais écrit en base).
2. **Le dossier, table fille `booking_dossier_items`** (`booking_id`, `piece` enum `DossierPiece`, `required`,
   `document_id` nullable vers `documents`, `requested_at`, `requested_by_id`, `received_at`) :
   - la liste est **fixe par nature**, posée à la création : candidature → `identity`, `payslips`,
     `employment_certificate` ; un garant déclaré ajoute `guarantor_commitment` et `guarantor_identity` ; offre →
     `identity`, `proof_of_funds` ; un séjour n'a pas de dossier ;
   - une pièce reçue est un `Document` (`documentable` = la réservation), déposé par le client ou par le personnel de
     l'agence du bien ; **elle se lit selon ADR-0099** (le client, le personnel de l'agence du bien, le bailleur du bien
     direct), jamais par un autre candidat ;
   - la complétude est **dérivée** (`received` / `required`), servie comme `dossier: { received, required, missing }` ;
   - **« Demander »** une pièce manquante envoie au client la notification à code `booking.dossier_piece_requested`
     (paramètres : référence, bien, pièce ; ADR-0032), au plus une fois par pièce et par 24 h (429 au-delà) ;
   - à l'effacement du compte ou de la fiche du client, les documents du dossier suivent la règle des documents
     (ADR-0099 et son archive) ; un refus ou une expiration ne les efface pas : ils restent lisibles par les mêmes
     lecteurs tant que la réservation existe.
3. **Le garant réutilise `guarantors`**, par un pivot `booking_guarantor` (trois au plus, comme le bail). Ses pièces et
   son revenu suivent ADR-0070 sans changement. À la création du bail depuis la réservation, les garants sont rattachés
   au bail.
4. **Les revenus du candidat** : `bookings.declared_monthly_income`, **chiffré** (cast `encrypted`, ADR-0070), jamais
   servi en clair dans la ressource. Le personnel de l'agence du bien reçoit en clair le **rapport au loyer**
   (`income_to_rent_ratio`, arrondi au dixième) et le revenu **masqué** ; la lecture en clair du montant passe par la
   lecture dédiée d'ADR-0070 (step-up, journalisée). C'est un écart délibéré à la maquette, qui écrit
   « Revenus 950 000 F/mois » en clair : l'exception « contrainte » d'[ADR-0106](0106-la-maquette-retenue-fait-foi-au-pixel.md) § 2.
5. **La contre-offre, table fille `booking_counter_offers`** (`booking_id`, `amount`, `message` nullable,
   `valid_until`, `created_by_id`, `status` enum `CounterOfferStatus` : `pending`, `accepted`, `declined`,
   `superseded`, `expired`, `responded_at`) :
   - seulement sur une offre (`kind = offer`) **en attente** ; une nouvelle contre-offre passe la précédente en
     `superseded` ;
   - le client est prévenu (`booking.counter_offer_received`) ; il **accepte** — le montant de l'offre devient celui de
     la contre-offre et la réservation passe `confirmed`, comme une acceptation de l'agence — ou **décline** — l'offre
     reste en attente, à son montant d'origine ; l'agence est prévenue des deux (`booking.counter_offer_answered`) ;
   - une contre-offre non répondue à `valid_until` passe `expired` par la tâche d'expiration existante ;
   - le statut de la réservation **ne change pas** pendant la contre-offre : « en attente du client » est dérivé
     (`awaiting: customer`) ; ADR-0102 garde ses statuts.
6. **L'origine, colonne `bookings.source`** (enum `BookingSource` : `public`, `invitation`, `staff`) :
   - `staff` quand le personnel la saisit (ADR-0102 § 2) ;
   - `invitation` quand le tunnel public a été ouvert par le lien d'invitation d'ADR-0101 § 4, qui porte désormais
     `?action=reserver&via=invitation` — **indice, pas jeton** : un client qui le retire ou l'ajoute ne gagne aucun droit,
     il ne change que le libellé « par le lien envoyé après la visite » ;
   - `public` sinon ; l'existant est rattrapé en `staff` (auteur du personnel) ou `public`.
7. **Le refus transmis.** La précision saisie au refus part au client avec le motif : `booking.rejected` reçoit
   `reason_code` (le motif en pastille, code) et `message` (la précision, texte du personnel, transmis tel quel). Le
   motif reste écrit en `cancellation_reason`.
8. **L'acceptation confirme l'étape.** Accepter une candidature ou une offre **est** le geste de l'agent qui confirme
   l'étape « Négociation » qu'ADR-0103 § 5 propose déjà pour ce fait : la fiche du client y passe si elle est avant
   (Prospect, Qualifié), journalisée comme tout changement d'étape, avec un retour arrière possible par
   `POST /api/customers/{customer}/pipeline-stage/undo` dans les 24 h. Rien ne change pour les autres faits : ADR-0103
   § 5 reste « jamais automatique », et une fiche en Gagné ou Perdu ne bouge pas.
9. **La réservation entre au fil de la fiche** (ADR-0101 § 1) : `CustomerTimeline` gagne le type `booking` (jalons
   `created`, `confirmed`, `rejected`, `counter_offer`), aux mêmes lecteurs que les visites (personnel de l'agence de la
   fiche).
10. **Le bail repris de la candidature** reprend le montant de la candidature (le loyer du bien à sa création, pas son loyer
    actuel), la durée, la caution, la date d'entrée et les garants ; tout reste modifiable avant l'envoi en signature.

## Conséquences

- Trois migrations neuves (`add_conditions_to_bookings`, `create_booking_dossier_items_table`,
  `create_booking_counter_offers_table`), un pivot (`create_booking_guarantor_table`), deux colonnes d'heures sur
  `properties` ; toutes avec un `down()` réversible.
- **Le dossier ajoute un lecteur de documents** : le candidat lit les pièces de sa réservation. `DocumentPolicy::reaches`
  et la liste d'ADR-0099 gagnent la cible `booking` ; une garde de balayage doit montrer qu'un autre candidat au même
  bien n'y lit rien.
- **Le rapport au loyer n'est pas un masquage au sens d'ADR-0070** : arrondi au dixième et lu avec un loyer connu, il rend le revenu à environ 5 % près (3,2 × 300 000 F ≈ 960 000 F). Il est servi au seul personnel de l'agence du bien, qui décide de la candidature ; c'est une divulgation consentie et bornée, pas une protection. Si le porteur la juge trop précise, il se sert par tranches (« moins de 2 fois », « 2 à 3 fois », « plus de 3 fois ») sans toucher au reste.
- Le revenu du candidat entre dans le périmètre d'ADR-0070 : `backup:verify-encryption` le trouve par son cast,
  `ImpersonationReadSweepTest` doit le voir masqué.
- Une contre-offre acceptée confirme la réservation **par le client** : c'est le seul chemin où le client fait passer
  une réservation à `confirmed`. Il est borné à une contre-offre `pending`, non expirée, de sa propre réservation.
- L'étape écrite à l'acceptation est un changement de règle limité à un fait ; si le porteur préfère la seule
  proposition, § 8 se retire sans toucher au reste.
- Ce qui reste hors modèle : un dossier configurable par agence (la liste des pièces est fixe), la signature
  électronique de l'engagement du garant, la vérification automatique des pièces.

## Options écartées

- **Trois pages, trois tables** (option « trois pages » d'ADR-0102) : la maquette retenue garde une page et un
  sélecteur ; les statuts restent communs.
- **Le dossier en `metadata`** : ni filtrable, ni lisible par une politique, ni rattachable à un document.
- **Une colonne `guarantor_id` sur `bookings`** : le bail en admet trois ; un pivot évite une seconde migration.
- **Le revenu en clair, comme la maquette** : contraire à ADR-0070, qui protège déjà le revenu du garant.
- **Un lien d'invitation à jeton** pour l'origine : ADR-0101 § 4 l'a écarté ; un indice suffit à un libellé.

## Application

- Back : TCK-2870 et TCK-2892 (§ 1), TCK-2872 (§ 2), TCK-2893 (§ 3, 4), TCK-2873 (§ 5), TCK-2874 (§ 6 à 8), TCK-2894 (§ 9, 10).
- Gardes à écrire par ces tickets :
  - un test par nature : les colonnes que la nature n'écrit pas restent nulles ;
  - un test « instantané » : changer `deposit_months` du bien ne change pas la caution d'une candidature existante ;
  - un test « un autre candidat ne lit pas les pièces » (politique et liste) ;
  - un test « revenu chiffré en base, masqué dans la ressource, rapport au loyer servi » ;
  - un test « Demander deux fois en 24 h → 429 » ;
  - un test par issue de contre-offre (acceptée → `confirmed` au nouveau montant ; déclinée → `pending` au montant
    d'origine ; expirée ; remplacée) ;
  - un test « acceptation → Négociation, puis retour arrière » et « fiche en Gagné ne bouge pas » ;
  - un test « `booking.rejected` porte la précision ».
