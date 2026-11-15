---
id: TCK-2878
title: "Fil commercial, la candidature arrive puis le bail : origine « par le lien envoyé après la visite », réponse attendue sous 48 h, « Le fil de {prénom} », « Passé en Négociation · Annuler », « De la demande au bail », panneau « Nouveau bail · repris de la candidature »"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
