---
id: TCK-2589
title: "Fiche client : un résumé qui se lit (prochaine action, ce qu'il cherche, origine) puis un fil unique ; l'édition passe en feuille"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2582, TCK-2583, TCK-2588, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#33-customernote-"
tags: [front, crm, customers, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent qui ouvre la fiche pendant que le client parle sait sans toucher qui il est, ce qu'il cherche, d'où il vient et ce qui est prévu — et retrouve toute son histoire dans un seul fil.

## Contrat de données

- `GET /api/customers/{id}` avec `next_action`, `follow_up`, `last_contacted_at`, `referent`, `origin`, `interested_property`, `upcomingVisits` (TCK-2582, TCK-2588), `fields[…]`.
- Fil : `GET /api/customers/{id}/activity` (existant, enrichi des comptes rendus TCK-2578 et des gestes TCK-2583), notes (`GET|POST …/notes`), visites, réservations, baux, documents, relations (endpoints actuels des onglets).
- Gestes : `POST /api/customers/{id}/contacts` au toucher d'Appeler / WhatsApp (TCK-2583) ; étape, référent, étiquettes, invitation, documents, biens correspondants : routes existantes.
- « Écrire » : la messagerie existante, seulement si la fiche a un compte (`user_id`) — les conversations relient des utilisateurs.

## Direction UX / Artistique

- Maquettes de référence : `/fr/playground/maquettes?p=app-clients&a=a` — écrans « Fiche » et « Modifier » ; `?p=app-fil-commercial&a=a` — écran « La fiche, la veille » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- De haut en bas : nom et menu `⋯` ; « Prospect ▾ · référent Khady D. » ; Appeler · WhatsApp · Écrire (48 px) ; **PROCHAINE ACTION** (visite avec « Confirmer » si elle est à confirmer, relance due) ; **CHERCHE** (Location · studio, F2 · Mermoz, Ouakam · ≤ 250 000 F, « 3 biens correspondent ▸ ») ; **ORIGINE** (« Demande du 3 nov. sur « Studio Mermoz » » et le message cité) ; **FIL** (notes, visites, comptes rendus, appels, changements d'étape, mêlés dans le temps, filtre Tout · Notes · Visites · Appels · Étapes, « Ajouter une note » en tête).
- Sections repliées en fin de fiche, avec leur compte, présentes seulement si non vides : Réservations, Baux, Documents, Relations ; Étiquettes en ligne dans le résumé.
- « Modifier » (menu `⋯`) ouvre le formulaire complet en feuille, par sections repliables (Identité, Contact, Ce qu'il cherche, Pièce d'identité), bouton collant « Enregistrer ».
- Barre collante du téléphone : + Note · + Tâche · Visite.
- **Téléphone (360-390 px)** : une colonne, le premier écran dit qui, l'étape, les gestes et la prochaine action (l'audit mesure 680 px avant le premier onglet aujourd'hui). **Bureau (≥ 1280 px)** : deux colonnes dès `lg` — résumé de 380 px à gauche, fil à droite ; « Modifier » en panneau latéral de 480 px.
- Vocabulaire : « Clients », « Étape », « Étiquettes », « Compte rendu » (décision 11a ; les libellés d'étape viennent de TCK-2592).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md).

**Pas de régression** (`customers/[id]/page.tsx`, `CustomerDetailTabs.tsx`, `components/crm/*`, audit § 2) :
- en-tête : « Client · #35 », nom, e-mail, téléphone, étape, statut ; Planifier une visite (client prérempli) ; Ajouter un document — **qui rafraîchit désormais la section Documents** (`onUploaded`, l'audit le relève absent) ; Inviter à créer son compte (fiche sans compte ; agent, admin d'agence, super-admin) ;
- Appeler / WhatsApp 44 px avec « pas de téléphone » / « numéro injoignable » ; sélecteur d'étape — **un seul** sur l'écran (l'audit en compte deux) —, Converti / Perdu exigent un motif devenu note épinglée ;
- Référent : « Me désigner », ou désigner un agent (capacité `crm.assign`) ;
- Étiquettes : ajout (Entrée, virgule), suggestions, retrait, 10 au plus, clic → liste filtrée ;
- Notes (5 000 car., épinglées en tête, sans modification ni suppression) ; Tâches (titre, échéance, cocher) ; Activité (« Voir plus ») ; Visites ; Réservations ; Baux ; **Biens correspondants** (cases à cocher, « Partager (n) par WhatsApp ») ; Documents (ajout, ouvrir) ; Relations (lecture) — chacun garde sa place, dans le fil ou dans une section ;
- l'édition garde **tous** les champs du formulaire actuel (`CustomerForm.tsx`) : prénom, nom, e-mail ou téléphone E.164, profession, langue des messages, étape, critères de recherche complets (16 types, villes, quartiers, chambres, budget), pièce d'identité ; erreurs 422 sur les champs, garde de sortie si modifié ;
- numéro de pièce masqué, révélé à l'admin seul après double facteur ;
- 404 vrai pour un identifiant invalide, « Fiche indisponible » pour un refus ;
- le bailleur lit les fiches qu'il a ajoutées, sans les gestes réservés au personnel.
- La section ouverte et le filtre du fil vivent dans l'URL (l'onglet actif est perdu au retour aujourd'hui).
- Téléphones formatés (« +221 70 648 20 56 ») ; i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Fiche en résumé + fil (téléphone et bureau), sections repliées, barre collante.
- [ ] Édition en feuille / panneau.
- [ ] « Écrire » pour une fiche à compte ; gestes de contact enregistrés.
- [ ] Tests : résumé (prochaine action, cherche, origine) rendu depuis la réponse ; un seul sélecteur d'étape ; motif exigé pour Converti / Perdu ; sections vides absentes ; `?section=` restauré au retour ; édition qui envoie les mêmes champs que le formulaire actuel ; pièce masquée hors admin ; bailleur sans gestes du personnel.

## Critères d'acceptation

- [ ] AC1 — À 390 px, la fiche de Mariama Fall montre sans défiler son étape, son référent, les trois gestes et « Visite jeu. 12 nov. 10:00 » en prochaine action.
- [ ] AC2 — Le fil de Mouhamed Dieng montre, dans l'ordre, « Demande reçue » (avec le message), « Réponse WhatsApp (Sokhna) », « Visite confirmée », « Compte rendu : Intéressé ».
- [ ] AC3 — Le DOM de la fiche contient exactement **un** contrôle de changement d'étape.
- [ ] AC4 — « Ajouter un document » depuis l'en-tête fait paraître le document dans la section Documents sans recharger.
- [ ] AC5 — Une fiche sans réservation, bail ni relation n'affiche aucune de ces trois sections ; « Biens correspondants » reste atteignable depuis CHERCHE.
- [ ] AC6 — À 1280 px, résumé et fil sont côte à côte ; à 1024 px dans la coque à colonne, rien ne défile horizontalement.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2589.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La liste et la création (TCK-2590).
- La suite d'une visite (TCK-2581) et la saisie d'une candidature (TCK-2580), atteintes depuis la fiche.
- La fiche par biens (approche C) et les onglets allégés (approche B).

## Notes d'implémentation

_(à remplir par implementing-specs)_
