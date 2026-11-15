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

_(à remplir par implementing-specs)_
