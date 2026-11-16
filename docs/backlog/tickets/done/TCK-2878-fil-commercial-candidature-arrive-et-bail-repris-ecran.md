---
id: TCK-2878
title: "Fil commercial, la candidature arrive puis le bail : origine « par le lien envoyé après la visite », réponse attendue sous 48 h, « Le fil de {prénom} », « Passé en Négociation · Annuler », « De la demande au bail », panneau « Nouveau bail · repris de la candidature »"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2870, TCK-2872, TCK-2874, TCK-2893, TCK-2894]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#14-lease-"
tags: [front, bookings, crm, leases, fil-commercial, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent qui ouvre une candidature voit d'où elle vient et tout le chemin du client depuis sa demande ; une fois acceptée, il crée le bail sans quitter la candidature, avec ce qu'elle disait déjà, et voit la fiche du client passer en Négociation.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-fil-commercial e6 et e7 ; point 2 de la synthèse « Fil commercial non bouclé »). Ces deux écrans n'avaient jamais été relevés. Données : TCK-2870, TCK-2872, TCK-2874, TCK-2893, TCK-2894 ([ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 6 à 10).

## Contrat de données

- `GET /api/bookings/{booking}` : `source`, `response_deadline`, `visits_on_property` (date, verdict), `dossier`, garants, `stage_change`, conditions (TCK-2870, TCK-2872, TCK-2874, TCK-2893).
- `GET /api/customers/{customer}/timeline` (types `note`, `contact`, `visit`, `booking`, TCK-2894) pour « Le fil de {prénom} » et « De la demande au bail ».
- `POST /api/customers/{customer}/pipeline-stage/undo` (TCK-2874).
- `POST /api/leases` avec `booking_id` (garants et caution repris, TCK-2894).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-fil-commercial`, approche **a** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-fil-commercial-a-suite.tsx` ; écrans **e6 La candidature arrive** (l. 474-517 téléphone, 609-680 bureau) et **e7 Acceptée : le bail** (l. 520-607 téléphone, 680-715 bureau).

- **Téléphone (390)** — manque :
  - e6 : bandeau « {prénom} a déposé sa candidature · {date} · par le lien envoyé après la visite » (l. 480) ; « reçue il y a N h · réponse attendue sous 48 h » (l. 507) au lieu de la ligne « Expire le » ; « A visité ce bien : {date} · {verdict} » ; pièces du dossier « 3/4 » ; Quoi avec Caution et Durée ;
  - e7 : « {prénom} est prévenu par SMS et e-mail » (l. 558) ; encart **« Passé en Négociation · Annuler »** avec « Qualifié → Négociation, proposé par la candidature » (l. 569-573) ; carte **« De la demande au bail · N jours »** (fil complet, l. 600) ; Caution et Garant dans le bail prêt.
- **Bureau (1440)** — manque, en plus :
  - e6 : carte « Décision » d'une candidature avec sa synthèse (« Dossier presque complet : il manque la pièce d'identité du garant… », l. 665) ; carte **« Le fil de {prénom} »** (demande reçue → visite confirmée → compte rendu → lien envoyé → candidature déposée, lien « Fiche client ») ; sous-titre « Déposée … par le lien envoyé après la visite · réponse attendue sous 48 h » (l. 629) ;
  - e7 : **panneau droit « Nouveau bail · repris de la candidature »** (l. 684-713) : Locataire, Début, Durée, Loyer, Caution, Garant (« Pièce d'identité à recevoir avant la signature »), « Ouvrir le formulaire complet », « Créer le bail », mention « Six champs repris de la candidature. À la signature, {prénom} passe en Gagné et le bien en « Loué » ».
- « 48 h » est l'échéance réelle (`response_deadline`) dite en heures restantes, pas une constante.

## Contraintes strictes (métier)

- Le loyer du bail repris est **le montant de la candidature** (le loyer du bien à sa création, ADR-0102 § 3), pas le loyer actuel du bien (correction de `valeursDeLaReservation`). La caution est celle de la candidature (`security_deposit_amount`).
- « Annuler » de l'encart n'existe que tant que `stage_change.undoable_until` n'est pas passé ; après l'undo, l'encart dit « Étape remise en {étape} ».
- « Le fil » et « De la demande au bail » lisent la timeline : une seule requête, types filtrés, paginée.
- « par le lien envoyé après la visite » seulement pour `source = invitation`.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] e6 : bandeau d'origine, réponse attendue, visite datée avec verdict, dossier, conditions.
- [ ] e6 bureau : carte Décision (partagée avec TCK-2875) et carte « Le fil de {prénom} ».
- [ ] e7 : prévenu par SMS et e-mail, encart Négociation + Annuler, « De la demande au bail · N jours ».
- [ ] e7 bureau : panneau « Nouveau bail » (création directe, ou formulaire complet prérempli).
- [ ] Préremplissage du formulaire complet du bail : loyer de la candidature, durée, caution, garants.
- [ ] Tests de composant : libellé d'origine selon `source` ; Annuler appelle l'undo puis disparaît ; panneau crée le bail avec le loyer proposé ; « N jours » = premier fait du fil → acceptation.

## Critères d'acceptation

- [ ] AC1 — À 390, une candidature `source = invitation` montre « … par le lien envoyé après la visite » ; une `source = public` ne le montre pas.
- [ ] AC2 — Une candidature reçue il y a 13 h dont l'échéance est à +35 h montre « reçue il y a 13 h · réponse attendue sous 35 h ».
- [ ] AC3 — Après Accepter d'un client en Qualifié, l'encart « Passé en Négociation » apparaît ; « Annuler » remet la fiche en Qualifié (vérifié par la fiche client).
- [ ] AC4 — À 1440, une candidature créée quand le bien était à 300 000 F, le bien passé depuis à 320 000 F : accepter puis « Créer le bail » depuis le panneau crée un bail à 300 000 F, avec le garant et la caution de la candidature.
- [ ] AC5 — À 1440, la carte « Le fil de {prénom} » liste dans l'ordre la demande, la visite, le compte rendu, l'invitation et la candidature, et « Fiche client » mène à `/app/customers/{id}`.
- [ ] AC6 — Vérifier au navigateur que l'onglet actif de la barre du bas est « Clients » sur ces écrans au téléphone (maquette) ; corriger si non.
- [ ] AC7 — Vérifier au navigateur, sur un bail créé depuis la candidature puis signé, que la fiche du client passe en Gagné et le bien en « Loué », comme le panneau l'annonce ; corriger si non.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2878.json` : écrans e6 et e7 de `app-fil-commercial` (a), téléphone et bureau, état reproduit (candidature par invitation, dossier 3/4 avec garant, client en Qualifié).
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.
- [ ] AC-F3 — Aucun libellé ni icône des deux écrans absent sans motif.

## Hors périmètre

- Le passage en Gagné et du bien en « Loué » à la signature : mécanique existante du bail, vérifiée par AC7.

## Notes d'implémentation

**2026-11-15 — implémentation (agent délégué, vague 92).**

Livré :
- **Formulaire complet du bail** (`CreateLeaseForm`, `valeursDeLaReservation`) : une CANDIDATURE donne au bail son loyer (`total_amount`, le prix du bien à sa création — plus le prix courant), sa caution (`security_deposit_amount`) et la fin de son terme (début + `term_months`, veille comprise, sans débordement : `finDuTerme`, convention de `LeaseService`). La caution reprise ne suit plus les mois du bien × le loyer (l'effet des défauts l'écrasait). Règle pure partagée avec le panneau : `termesDuBailRepris` (`lib/reservations/candidature.ts`).
- **e6** : bandeau du dépôt au téléphone (« {prénom} a déposé sa candidature · jour · heure · par le lien envoyé après la visite », lien seulement pour `source = invitation`, rien pour `staff`) ; « reçue il y a N h · réponse attendue sous N h » (heures restantes de `response_deadline`, en jours au-delà de 72 h, « délai de réponse dépassé » après) à la place de « Expire le » d'une candidature ; sous-titre du bureau « Déposée … à … par le lien envoyé après la visite · réponse attendue sous N h » ; garant NOMMÉ dans le Qui (« Garant : Ibrahima Dieng, frère », +N).
- **« Le fil de {prénom} »** (bureau, e6 et e7, lien « Fiche client » → `/app/customers/{id}`) et **« De la demande au bail · N jours »** (téléphone, e7) : UNE lecture du fil pour toute la fiche (`useVisitesDuClient`, `filter[type]=note,visit,contact,booking`, `per_page=100`), partagée avec l'historique. N = premier fait du fil → acceptation, en jours de Dakar ; tu si le fil lu n'est pas entier (`last_page > 1`).
- **e7** : bandeau « Candidature acceptée · jour · heure · {prénom} est prévenu » (sans canal ; tu sans compte) ; encart « Passé en Négociation » ✓ « Qualifié → Négociation, proposé par la candidature » + « Annuler » tant que `undoable_until` n'est pas passé (`POST /api/customers/{id}/pipeline-stage/undo`, relit réservation, fiches, fil, pipeline, sur erreur aussi ; le refus 409/422 se lit sous l'encart), puis « Étape remise en Qualifié » ; carte « Bail prêt à créer » (Début · durée, Caution, Garant ; « Repris de la candidature. Tout reste modifiable… »).
- **Panneau « Nouveau bail · repris de la candidature »** (bureau ; feuille du bas sous `xl`) : Locataire, Début, Durée, Loyer, Caution (n mois), Garant (« Pièce d'identité à recevoir avant la signature » si `guarantor_identity` manque), « N champs repris… », Annuler / Ouvrir le formulaire complet / Créer le bail. POST `/api/leases` avec le loyer et la caution AFFICHÉS, `type` lu des défauts du bien, jamais `guarantor_id` (l'API rattache les garants). Au téléphone, « Créer le bail » reste le lien du formulaire prérempli.
- **Fil de la fiche client** (`FilDuClient`) : les jalons `booking` (déposée, acceptée, refusée, contre-offre), servis depuis TCK-2894 et tus jusqu'ici ; « Demande reçue sur {bien} ».
- **Geste garant** (hors maquette, fiche `ecarts_acceptes`) : liste « Garants » sous les pièces du dossier, « Ajouter un garant » (feuille : prénom, nom, téléphone, lien) et « Retirer » ; les codes `booking.guarantor_not_for_kind`, `guarantor_already_attached`, `guarantor_not_attached`, `max_guarantors`, `dossier_closed` traduits par le front (`bookings.fiche.garants.codes`).
- **API (TCK-2875 AC6)** : `customer_notes.contact_lead_id` (migration `2026_11_15_287800`, FK `nullOnDelete`, index ; rattrapage quand UNE seule demande de la fiche a le même instant ; `down()` joué) posé par `ContactLeadService::linkLead` ; le fil sert `property {id, title}` sur la seule note `lead_message`, au personnel. L'historique d'une candidature ou d'une offre dit « Demande de contact reçue » bornée au bien, et le fil s'y lit même sans visite (la condition `last_visit_on_property` est levée). Base de démo : 0 note `lead_message`, rien à rattraper.

Écarts à la prémisse / constats :
- **AC7** (lu dans le code, non mesuré au navigateur) : à la signature, la fiche ne passe PAS seule en Gagné — l'étape lui est proposée (`CustomerSuggestedStageQuery::LEASE_SIGNED`) ; et le bien n'est « loué » qu'à partir du DÉBUT du bail (`Occupation::occupying`), pas du jour de la signature. Le panneau dit donc « Une fois le bail signé, le bien est loué dès le début du bail et la fiche de {prénom} vous propose l'étape Gagné ». **À confirmer par le porteur** : faire avancer la fiche en Gagné à la signature (au lieu de le proposer) est une décision produit — non changé.
- Accepter et Refuser relisent désormais le fil du client (`['customer-timeline']`), et Accepter la fiche, le pipeline et `agent-crm` (`useConfirmBooking`, `useRejectBooking`, blocs TCK-2878) : sans quoi « Le fil de {prénom} » gardait l'état d'avant l'acceptation (5 min de `staleTime`).
- Rattrapage de la migration éprouvé dans une transaction annulée sur la base de démo (une note posée au même instant qu'une demande rattachée : reliée, 1 ligne).
- Le client sans compte n'est pas prévenu de l'acceptation (`BookingService` : `customer?->user` seul) : « {prénom} est prévenu » se tait alors.
- **AC6** (onglet « Clients ») : la maquette `app-reservations` a dessine « Menu » sur ses six écrans de candidature ; la barre allume « Menu » sur `/app/bookings/{id}` (TCK-2801). Non changé (maquettes contradictoires, écart déclaré).
- « prévenu par SMS et e-mail » et « Lien de candidature envoyé » ne sont pas servis tels quels par l'API (TCK-2874, TCK-2894) : formulations neutres, écarts déclarés.
- Défaut voisin corrigé : la note `lead_message` ne nommait pas sa demande (cause du reste de TCK-2875 AC6).
- `src/i18n/namespaces.json` régénéré (`--update`) : la fiche d'une réservation atteint `agentCrm`, `contactLeads`, `crm` (lignes du fil) ; la régénération porte aussi `documents` sous `(dashboard)/app/reports`, écart d'un autre agent en cours.

Tests : `CustomerTimelineLeadPropertyTest` (3) ; `candidature-et-bail.tck-2878` (4, les routes et les relectures réelles) ; `BookingDetail.bail-repris.tck-2878` (15), `CreateLeaseForm.bail-repris.tck-2878` (1) ; tests mis à jour : `BookingDetail.candidature.tck-2875` (garant nommé, fil lu sans visite), `BookingDetail.trois-natures.tck-2594` et `BookingDetail.creer-le-bail.p48-03` (« Créer le bail » est un bouton au bureau ; carte « Bail prêt à créer »), `booking-dossier.tck-2875` (types du fil). Quinze ablations une à une, toutes rouges puis restaurées (md5) : note reliée à sa demande, bien servi, reprise du loyer, caution non écrasée par les mois du bien, lien seulement par invitation, heures restantes, « Annuler » qui disparaît, loyer du panneau, jalon `booking` du fil, « N jours » tu sur un fil partiel, code `max_guarantors`, « Demande de contact reçue », garant nommé, plus de « Expire le », relecture du fil à l'acceptation. Voisins API verts : `ModelsTest`, `ContactLeadConversionCarriesContextTest`, `ContactLeadConvertTest`, `CustomerOriginResourceTest`, les cinq classes `CustomerTimeline*`. 52 fichiers de test du domaine verts (363) ; 3 balayages et 3 gardes d'architecture verts ; `tsc` (hors `documents/__tests__/constants.test.ts`, agent en cours), ESLint, `check:i18n`, `check:i18n-namespaces`, `check:vouvoiement`, `check:classes-emises`, toutes les `scripts/check-*.mjs` (front et racine) vertes.

Fidélité : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2878.json` (écarts motivés) ; AC-F2 non mesuré (pas de navigateur dans ce lot).


**Re-mesure des restes (ECARTS-2, 2026-11-16)** — le reste « le formulaire écrase loyer et caution » est fermé par TCK-2878 (1520bb305) : `CreateLeaseForm.tsx:243` prend `termesDuBailRepris(reservation)` (loyer, caution, début, fin de la candidature) et `:539-563` n'applique ni défaut ni caution recalculée sur une clé reprise (test `CreateLeaseForm.bail-repris.tck-2878`). Clés du fil : `cleDeLEntree` (`fil-du-client.ts:51`, type-id-jalon-contre-offre, TCK-2876) sert de `key` (`FilDuClient.tsx:510`) ; le cas `booking` est rendu (`:278`). Rien à corriger.
