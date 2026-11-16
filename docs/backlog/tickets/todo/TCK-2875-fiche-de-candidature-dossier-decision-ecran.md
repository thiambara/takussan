---
id: TCK-2875
title: "Réservations, candidature : durée, caution et à verser, revenus et garant, le dossier « 3/4 pièces » (Ouvrir, Demander), la carte « Décision » au bureau, la colonne « Dossier » et « Expire demain » dans la liste"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2870, TCK-2872, TCK-2893, TCK-2894]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [front, bookings, candidature, dossier, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Devant une candidature, l'agent sait en un regard ce que le candidat propose (loyer, entrée, durée, caution, à verser), ce qu'il vaut (revenus, garant, visite déjà faite) et ce qui manque à son dossier ; il réclame la pièce manquante en un geste et décide, avec une synthèse au bureau.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`~/takussan-maquettes-sauvegarde/audit-2026-11-15/audit-f5-commercial.md`, app-reservations e0, e1, e3 ; point 1 de la synthèse). Ces écrans n'avaient jamais été relevés ; TCK-2594 avait classé leurs manques en « donnée » à tort. Les données arrivent par TCK-2870, TCK-2872, TCK-2893 et TCK-2894 ([ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md)).

## Contrat de données

- `GET /api/bookings` / `/{booking}` : `term_months`, `renewable`, `security_deposit_months`, `security_deposit_amount`, `entry_amount`, `other_pending_on_property`, `visits_on_property` (date et verdict), `dossier`, `has_guarantor`, `income_to_rent_ratio`, `declared_monthly_income_masked`, `response_deadline`, `expires_at` (TCK-2870, TCK-2872, TCK-2893).
- `GET /api/bookings/{booking}/dossier`, `POST …/dossier/{piece}/request` (TCK-2872) ; ouverture d'une pièce par la route de document existante.
- « Comparer » : `GET /api/bookings?filter[property_id]=…&filter[kind]=application&filter[status]=pending`.

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-reservations`, approche **a** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-reservations-a.tsx` (+ `app-reservations-pieces.tsx` : `Completude`, `PiecesDossier`) ; écrans **e0 Liste**, **e1 Candidature**, **e3 Acceptée — créer le bail**, **e8 Saisir une offre** (une phrase) ; téléphone et bureau.

- **Téléphone (390)** — manque aujourd'hui :
  - e1, bloc Quoi : « Durée » (« 12 mois, renouvelable »), « Caution » (« 2 mois · 600 000 F »), « À verser à l'entrée » (`QuoiCandidature`, l. 62-77) ;
  - e1, bloc Qui : pastilles « Revenus … » et « Garant : oui » ; « A déjà visité ce bien » avec la date et le verdict (« Sam. 7 nov., avec vous : « Intéressé… » ») au lieu de « N visites enregistrées » (l. 477) ;
  - e1, section « Dossier » avec `Completude` « 3/4 pièces » et la liste des pièces : « Ouvrir » sur une pièce reçue, « Demander » sur une pièce manquante (l. 485-486) ;
  - e3 : « Caution » dans la suite du bail (`SuiteBail`, l. 97), Durée/Caution dans Quoi, carte Dossier.
- **Bureau (1280 / 1440)** — manque aujourd'hui, en plus des mêmes blocs :
  - e0 : colonne « Dossier » (`Completude` court « 3/4 », l. 772, 802) ; alerte « Expire demain » dans la colonne « Reçue » ;
  - e1 : carte **« Décision »** à droite pour une **candidature** (aujourd'hui construite pour une offre seule, `BookingDetail.tsx:638-666`) : synthèse (« Revenus de 3,2 fois le loyer, garant déclaré. Il manque l'engagement du garant. », l. 939), « 1 autre candidature sur ce bien · Comparer » (l. 944-946), Refuser / Accepter.
- Les revenus se montrent par leur **rapport au loyer** (« Revenus 3,2 × le loyer ») : le montant en clair n'est pas servi (ADR-0110 § 4, exception « contrainte » d'ADR-0106 § 2) — écart à écrire dans la fiche de fidélité.

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md), [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) (une page, un sélecteur), [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md).
- « Demander » est désactivé avec son motif pendant 24 h après une demande (« Demandée il y a 3 h ») ; l'erreur 429 se lit.
- « Expire demain » = `response_deadline` (ou `expires_at`) dans moins de 48 h et après maintenant, sur une demande `pending` seulement.
- Sparse fieldsets : la liste ne demande que `dossier` (pas les pièces) ; une seule requête pour la page.
- i18n `fr`/`en`/`wo` (`wo` = texte français, pause du wolof).
- Non-régression : tout ce que TCK-2594 garde (Qui · Quoi · Suite, feuilles, historique).

## Delta à produire

- [ ] Bloc Quoi d'une candidature : Durée, Caution, À verser à l'entrée.
- [ ] Bloc Qui : pastilles Revenus (rapport) et Garant ; « A déjà visité ce bien » daté avec verdict.
- [ ] Section/carte « Dossier » : complétude, pièces, Ouvrir, Demander (état demandé).
- [ ] Bureau : carte Décision d'une candidature (synthèse dérivée, Comparer → liste filtrée des candidatures en attente du bien, Refuser / Accepter).
- [ ] Liste bureau : colonne Dossier ; alerte « Expire demain ».
- [ ] e3 : Caution dans la suite du bail.
- [ ] Historique de la réservation : les faits du client sur ce bien qui la précèdent (« Demande de contact reçue », « Visite effectuée avec {agent} — « {verdict, note} » ») mêlés aux événements de la réservation (maquette l. 38-55), lus dans le fil de la fiche (`GET /api/customers/{id}/timeline`, types `note`, `visit`, `booking`, TCK-2894) et bornés au bien.
- [ ] e8 « Saisir une offre » : rétablir « Le client sera prévenu et pourra compléter son dossier. » (`app-reservations-a.tsx:390`), retiré faute de dossier (`SaisirUneDemande.tsx:405-410`).
- [ ] Tests de composant : les trois lignes du Quoi ; Demander appelle la route et se désactive ; synthèse « Il manque … » nomme la première pièce manquante ; Comparer filtre par bien et nature ; « Expire demain » présent à H−20, absent à H−60 et sur une confirmée.

## Critères d'acceptation

- [ ] AC1 — À 390, la candidature d'Ousmane (loyer 300 000 F, caution 2 mois, avance 1 mois) montre « Durée 12 mois, renouvelable », « Caution 2 mois · 600 000 F », « À verser à l'entrée 900 000 F ».
- [ ] AC2 — Son dossier montre « 3/4 pièces » ; « Engagement du garant » porte « Demander » ; le toucher envoie la demande, puis le geste devient « Demandée à l'instant » et reste inactif.
- [ ] AC3 — À 1440, la carte « Décision » d'une candidature existe à droite, avec la synthèse, « 1 autre candidature sur ce bien · Comparer » quand `other_pending_on_property = 1`, et ses boutons Refuser / Accepter ; elle n'affiche pas « Comparer » quand la valeur est 0.
- [ ] AC4 — À 1280, la liste a une colonne « Dossier » qui montre « 3/4 » ; une demande dont l'échéance tombe dans 20 h porte « Expire demain ».
- [ ] AC5 — Aucune page ne rend le revenu en clair ; la pastille dit le rapport au loyer.
- [ ] AC6 — L'historique de la candidature d'Ousmane contient « Visite effectuée avec Sokhna Sène — « Intéressé, veut revoir la cuisine » » et « Demande de contact reçue », datés, avant « Candidature déposée » ; un fait du même client sur un autre bien n'y est pas.
- [ ] AC7 — La feuille « Saisir une offre » (e8) dit « Le client sera prévenu et pourra compléter son dossier. ».

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2875.json` : écrans e0, e1, e3 de `app-reservations` (a), téléphone et bureau, état reproduit (candidature `pending` à garant, dossier 3/4, une autre candidature sur le bien).
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 : aucun écart hors tolérances d'ADR-0106 § 5 sans motif écrit (le revenu en rapport est l'écart motivé).
- [ ] AC-F3 — Aucun libellé ni icône des trois écrans absent sans motif.

## Hors périmètre

- Le dépôt des pièces par le client (TCK-2879) ; l'offre (TCK-2876) ; le séjour et le refus (TCK-2877) ; le fil commercial e6/e7 et le panneau « Nouveau bail » (TCK-2878).

## Notes d'implémentation

**2026-11-15 — implémentation (agent délégué, vague 92).**

Livré (front seul, l'API était commitée) :
- `types/booking.ts` : les clés de TCK-2870, 2872, 2893 (bloc marqué TCK-2875) + `DossierPiece`, `PieceDuDossier`, `DossierDeLaReservation`.
- `lib/reservations/candidature.ts` (pur) : `expireBientot` (pending, `response_deadline ?? expires_at` dans ]0, 48 h[), `syntheseDeLaCandidature` (une clé NON servie ne dit rien), `demandeeRecemment` (24 h), `visitesEffectueesSurLeBien`.
- `lib/queries/booking-dossier.ts` : dossier, « Demander », autres candidatures du bien (2 lignes), visites du client au fil (`filter[type]=note,visit`, `per_page=100`). Hors de `bookings.ts` : les 13 tests de la fiche mockent ce module en entier.
- Fiche : Quoi (Durée, Caution, À verser), Qui (pastilles Revenus en RAPPORT et Garant ; « A déjà visité ce bien. Sam. 7 nov. : « Intéressé ». »), section/carte Dossier (`Completude`, Ouvrir → `/app/documents/{id}` et Demander au seul personnel, geste tu 24 h avec son âge, 429 et 422 lus sous la pièce, « prévenez-le vous-même » quand `customer_notified: false`), carte « Décision » d'une candidature au bureau (synthèse, « N autre(s) candidature(s) · Comparer » → `/app/bookings?kind=application&status=pending&bien={id}`, Refuser / Accepter), Caution dans la suite du bail, historique mêlé des visites effectuées sur CE bien.
- Liste : colonne Dossier (candidatures et offres), « Expire demain » (bureau : en tête de « Reçue » ; téléphone : à la place de l'âge), détail « Entrée 1 déc. · caution 2 mois ». `LIST_FIELDS` gagne `expires_at`, `expired_at` (sans eux `response_deadline` vaut `null` sous sparse fieldset : l'alerte n'aurait jamais paru) et `security_deposit_months`.
- e8 : « Le client sera prévenu et pourra compléter son dossier. » ; `booking.field_not_for_kind` traduit et posé sous « Nature » (`CHAMP_DU_CODE`).

Écarts à la prémisse :
- **« 3/4 pièces » d'Ousmane** : le dénominateur est `dossier.required` ; une candidature attend 3 pièces, un garant en ajoute 2 → 5 pour un candidat à garant. La fiche affiche ce que l'API sert.
- **« Demande de contact reçue » (AC6) non livrée** : la note `lead_message` du fil ne porte pas le bien ; la borner est impossible, la montrer sans borne violerait AC6. Reste API : servir le bien de la demande (`property_id` du lead) sur la note `lead_message`.
- **« avec vous » et la note de la visite** dans le bloc Qui : `last_visit_on_property` ne sert ni l'agent ni la note ; la visite complète (agent, verdict, note) est dans l'historique.
- Le fil n'est lu qu'au personnel, et seulement quand `last_visit_on_property` est non nul (sinon rien à mêler) : une lecture de plus par fiche à visite, aucune autrement. Les visites sont mêlées quelle que soit leur date (le ticket dit « qui la précèdent » ; une visite après le dépôt est aussi un fait de la décision).
- Les jalons `booking` du fil ne sont pas mêlés : ceux de la réservation sont déjà dans l'historique local, et `counter_offer` arrive avec TCK-2873/2876.
- Les codes `booking.guarantor_*` / `booking.max_guarantors` restent sans traduction (aucun geste garant dans cet écran : TCK-2878).
- Après revue : dossier, pastille Garant et colonne Dossier réservés à la CANDIDATURE (la maquette « Offre » n'en montre pas : TCK-2876) ; la carte « Décision » n'est jamais montrée au candidat ; `useDemanderUnePiece` relit aussi sur erreur.
- Corrigé hors zone (consigne du porteur) : `lib/taches/rattachement-de-la-fiche.ts` (TCK-2857) envoyait `fields[...]` à deux `show` — la garde `show-sans-fields.garde.test.ts` était rouge sur l'arbre ; `docs/models-spec.md` gagne `BookingDossierItem` (§ 126, TCK-2872). `BookingCounterOffer` (TCK-2873) et `ConversationReport` (TCK-2859), agents en cours, y manquent encore.

Tests : `BookingDetail.candidature.tck-2875` (14), `booking-dossier.tck-2875` (4, les routes réellement appelées), `BookingsList.dossier.tck-2875` (4), `candidature.tck-2875` (7), `bookings-echeance.tck-2875` (1), +2 dans `SaisirUneDemande.tck-2580`. Dix ablations une à une, toutes rouges puis restaurées (md5) : fenêtre des 48 h, première pièce manquante, geste tu 24 h, borne au bien, garde de « Comparer », pièce envoyée, caution du bail, code `field_not_for_kind`, colonnes de l'échéance, carte « Décision » montrée au candidat. 30 fichiers de test du domaine verts (208). `tsc`, ESLint, `check:i18n`, `check:i18n-namespaces` (ligne `compteRendu` ajoutée seule) verts ; `check-models-spec` rouge sur les deux seuls modèles des agents en cours.

Fidélité : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2875.json` (écarts motivés) ; AC-F2 non mesuré (pas de navigateur dans ce lot).

**Re-mesure des restes (ECARTS-2, 2026-11-16)** — AC6 « Demande de contact reçue » livrée par TCK-2878 : l'API sert le bien de la demande sur la note `lead_message` (`CustomerTimeline.php:333`), l'historique la borne au bien (`bookings/detail/historique.tsx:62`) et le fil dit « Demande reçue sur {bien} » (`FilDuClient.tsx:138`). Rien à corriger.
