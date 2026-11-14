---
id: TCK-2624
title: "Accueil de l'admin d'agence et du bailleur : « À faire maintenant » avec son geste, l'équipe aujourd'hui, les loyers du mois"
status: todo
phase: P1
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2622, TCK-2623, TCK-2660, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2628]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#18-maintenance--interventions"
  models: []
tags: [front, accueil, dashboard, mobile, audit-ux, app]
---

## Objectif utilisateur

- **L'admin d'agence** voit, dès l'arrivée, ce qui attend sa décision : un bien à valider, des demandes à attribuer, des visites à confirmer, des avis à modérer, les impayés. Il agit depuis l'accueil, puis il voit qui de son équipe travaille aujourd'hui.
- **Le bailleur** voit les visites à confirmer sur ses biens, les devis à valider, ses loyers en retard, et « Loyers de novembre : 8 reçus sur 14 ».

## Contrat de données

- **Lectures existantes**, les mêmes que les compteurs de la colonne (« Aujourd'hui », ADR-0089 §5) :
  - biens en attente de modération ;
  - demandes de contact non traitées (`useUnhandledLeadsCount`) ;
  - visites à confirmer (`usePendingVisitsCount`) ;
  - avis à modérer (file de modération).

  Les listes viennent des mêmes routes, avec `per_page` court et les `fields[…]` de la vue.
- **Gestes existants** :
  - valider un bien (`approve` de la modération) ;
  - confirmer une visite, ou proposer un autre créneau (confirmation qui accepte `scheduled_at`) ;
  - attribuer une demande ;
  - valider un devis (`quote/approve`, maintenance à l'état `quote_submitted` ou `awaiting_owner`).
- **Impayés** : `overdue_count` et `overdue_amount` (`dashboard/me`), tranches de `GET /api/agencies/{agency}/finance/aging`.
- **Ajouts de TCK-2623** :
  - `agencies/{agency}/team-today` ;
  - `finance.rent_month {received_count, expected_count, received_amount}` du bailleur.
- **« Demandes à attribuer »** : aucune demande n'est aujourd'hui « sans destinataire » en base (`recipient_user_id` est toujours posé). Le bloc lit le filtre « non attribuées » de la famille 5 (demande sans destinataire, ou destinataire hors du personnel actif). Tant que ce filtre n'est pas livré, le bloc s'appelle « Demandes non traitées » et lit `handled=0`.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-accueil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Admin d'agence », « Bailleur », « Rien à faire (bailleur) ».
- **Admin, « À faire maintenant »** :
  - **Téléphone** : une carte par file, avec son compte, son détail et son verbe :
    - « 1 bien à valider » → Valider ;
    - « 3 demandes à attribuer » → Attribuer ;
    - « 12 visites à confirmer » → Voir ;
    - « 5 avis à modérer » → Modérer ;
    - « Impayés · 16 échéances · 33 715 000 F » → Relancer.
  - **Bureau** : des groupes de rangées denses (« À valider », « Demandes non attribuées », « Visites à confirmer », « Impayés »), chacune avec son geste, et « Voir les N autres » en pied.
  - **Impayés** : une ligne de tranches, « 9 de moins de 30 jours · 4 entre 31 et 60 · 3 de plus de 90 ».
- **Admin, « Équipe aujourd'hui »** (colonne droite au bureau, sous « À faire » au téléphone) : une ligne par agent, avec initiales, nom, « 2 visites · 4 demandes » et son état (« Première visite à 09:30 », « En congé jusqu'au 13 »).
- **Bailleur** :
  - « Visites à confirmer » ;
  - « Devis à valider » (montant, intervention, prestataire ; Valider / Voir) ;
  - « Loyers en retard » (locataire, bien, montant, jours) ;
  - « En cours sur vos biens » (interventions ouvertes) ;
  - « Ce mois » : « Encaissé 11,4 M F sur 18,7 M F attendus », et « Loyers de novembre : 8 reçus sur 14 ».
- **Hôte** (bailleur sans agence, ou en agence individuelle) : le même accueil que le bailleur, plus « Réservations à traiter » et « Avis sans réponse », lus comme la vue bailleur les lit déjà pour l'hôte.
- **Agir sans quitter l'accueil** : confirmer, valider ou attribuer s'ouvre en feuille du bas au téléphone et en dialogue au bureau. La ligne quitte la liste au succès, et le compte baisse.
- **Téléphone (360–390)** : cartes pleine largeur, deux boutons de 44 px. **Bureau (≥ 1280)** : deux colonnes dès `lg`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md), [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md).
- **« À faire » ne liste que l'inachevé.** Une file vide n'a pas de ligne. Le dossier KYC « vérifié » n'y paraît jamais (constat de l'audit sur « À traiter »).
- **« Relancer »** ouvre le geste de relance de la famille 6 (décision 13 a : WhatsApp depuis le téléphone de l'admin, relance notée par l'API). Jamais un envoi par Takussan.
- **Chaque geste n'apparaît que s'il est permis** : la capacité du profil actif et la réponse de l'API (403 → geste retiré, et la ligne mène à l'objet). Un bailleur qui ne peut pas confirmer une visite voit « Voir », pas « Confirmer ».
- **Pas de régression** : tout ce que montre aujourd'hui « À traiter » de la Vue agence a une ligne ici :
  - KYC de l'agence s'il est à compléter ;
  - biens à modérer ;
  - invitations sans réponse ;
  - échéances impayées.

  La « Vue bailleur » garde aussi sa ligne : réservations à traiter, devis à valider, visites à confirmer, avis sans réponse.
- **Cloisonnement** : l'admin ne voit que son agence active, le bailleur que ses biens (principe 2), comme les lectures d'aujourd'hui.
- **Le prochain reversement** n'apparaît que si l'API rend sa date (absente aujourd'hui, cf. TCK-2623). Pas de date inventée par le front.
- Montants en F CFA sans décimales, comptes avec leur unité ; libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [ ] Blocs de l'admin : « À faire maintenant » (cinq files, chacune avec son geste) et « Équipe aujourd'hui ».
- [ ] Blocs du bailleur et de l'hôte : visites à confirmer, devis à valider, loyers en retard, en cours sur ses biens, loyers du mois.
- [ ] Gestes en feuille (téléphone) et en dialogue (bureau), avec mise à jour de la liste et des compteurs de la coque (même cache).
- [ ] Tests :
  - une file vide ne rend aucune ligne ;
  - « Confirmer » envoie la confirmation et retire la ligne ;
  - un geste refusé par l'API (403) devient « Voir » ;
  - « Loyers de novembre : 8 reçus sur 14 » lu depuis `rent_month` ;
  - « Équipe aujourd'hui » rend l'absence et son terme.

## Critères d'acceptation

- [ ] AC1 — Admin avec un bien en attente : à 390, la carte « 1 bien à valider » porte « Valider ». Le geste envoie l'approbation (vérifié au réseau), la carte disparaît, et le compteur « Biens à valider » de la colonne passe à 0 sans rechargement.
- [ ] AC2 — Admin d'une agence dont le KYC est vérifié : aucune ligne « Dossier KYC » sur l'accueil.
- [ ] AC3 — À 1280, « Équipe aujourd'hui » liste les agents actifs de l'agence, dans le même ordre et le même nombre que `team-today`. Un agent absent porte « En congé jusqu'au … ».
- [ ] AC4 — Bailleur à 14 échéances de loyer en novembre dont 8 soldées : l'accueil dit « 8 reçus sur 14 ». Le lien mène à ses paiements, filtrés sur le mois.
- [x] AC5 — Bailleur avec un devis `quote_submitted` : « Valider » envoie `quote/approve`, et la ligne disparaît. Un devis d'un bien d'un autre bailleur n'apparaît jamais (fixture à deux bailleurs).
  - Preuve (2026-11-14, HEAD 19167d93a) : approbation et disparition — `AFaireBailleur.tck-2624.test.tsx:216` ; cloisonnement — `takussan-api/tests/Feature/Maintenance/DevisDuBailleurCloisonneTest.php`, deux bailleurs dans la MÊME agence plus un d'une autre, la requête exacte du front (`PARAMETRES_DES_DEVIS_DU_BAILLEUR`, `PARAMETRES_DES_EN_COURS_DU_BAILLEUR`) : `meta.total` 1 et le seul devis du bailleur, témoin inverse pour le second. Ablation de `BailleurDuBien::restreindre` réduit à l'agence dans `MaintenanceRequest::scopeVisibleTo` : rouge (`meta.total` 2) ; restauré, md5 vérifié.
- [x] AC6 — « Relancer » sur les impayés ouvre le geste de la famille 6. Aucun appel d'envoi de message ne part de Takussan (réseau).
  - Preuve (2026-11-14, HEAD 19167d93a) : depuis TCK-2775 (7ed7f3073), « Relancer » est un lien vers l'écran Impayés (`AFaireAdmin.tck-2624.test.tsx:387` : href `relance=file` / `relance=77&bail=31`, aucun appel non-GET depuis l'accueil), qui ouvre le geste de TCK-2660 (`relance-de-l-adresse.tck-2775.test.tsx:314` : `wa.me` au numéro du locataire ; seuls `POST …/payment-link` et `POST …/reminders {channel: whatsapp}` partent). `LeasePaymentReminderController::store` ne fait que NOTER la relance (aucun SMS, WhatsApp, courriel ni notification). TCK-2660 reste `todo` pour ses seuls AC de fidélité.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2624.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La page « Aujourd'hui » de l'agent (famille 5) et l'accueil du locataire, du client et du prestataire (TCK-2625).
- La page des impayés et la relance elle-même (famille 6).
- La dernière relance d'une échéance lue par le bailleur : la lecture des relances de la famille 6 est réservée à l'agence.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
