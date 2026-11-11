---
id: TCK-2592
title: "Pipeline : la liste des relances triée par retard au téléphone, le kanban à quatre colonnes vivantes au bureau, et le vocabulaire en français"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2588, TCK-2591, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [front, crm, pipeline, mobile, i18n, audit-ux, app]
---

## Objectif utilisateur

L'agent ouvre le pipeline et sait qui relancer, le plus en retard d'abord ; l'admin voit l'agence d'un coup, sur des chiffres justes, et isole un agent.

## Contrat de données

- Colonnes et liste : `GET /api/customers` avec `filter[pipeline_stage]`, `filter[stage_group]`, `filter[referent]`, `filter[tags]`, `filter[search]`, `filter[follow_up]`, tri `-follow_up_days`, `fields[customers]` avec `next_action`, `follow_up`, `last_contacted_at`, `referent`, `suggested_stage` et les critères (TCK-2588, TCK-2591).
- Indicateurs : `GET /api/customers/pipeline-stats?scope=mine|agency&…` (TCK-2591).
- Gestes : `PATCH …/pipeline-stage` (existant, motif pour Gagné / Perdu), `POST …/suggested-stage/dismiss` (TCK-2591), `POST …/contacts` (TCK-2583).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-pipeline&a=a` — écrans « Liste », « Kanban », « Motif de perte » ; téléphone redessiné le 2026-11-10 (`app-pipeline-telephone.tsx`) ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- **Portée** : l'agent ouvre sur « Moi », l'admin sur « Agence » ; le sélecteur reste visible (« Moi ▾ » / « Agence ▾ ») et la portée vit dans l'URL.
- **Téléphone (360-390 px)** : en-tête « Mes prospects » + Moi + bascule Liste | Étapes (44 px) ; carte de portefeuille (« 38 prospects actifs · 6 gagnés · 4 perdus », puis les quatre étapes vivantes avec une jauge à échelle commune, une case touchée filtre) ; **À RELANCER triée par retard** — tuile de retard en tête de ligne (jours ; rouge à partir de 7, ambre en dessous), nom et étape, ce qu'il y a à faire en une ligne (« Relancer son offre », « Écrire le compte rendu »), l'objet, puis deux ronds de 44 px (Appeler / WhatsApp, ou Compte rendu quand c'est lui qui manque) ; balayer une ligne : Étape suivante / Reporter (annoncé par une phrase sous la liste) ; **À JOUR** repliée en carte (trois initiales, « et 44 autres »). Vue Étapes : cartes avec dernier contact, encart prochaine action (rouge si en retard), « Changer d'étape » qui déplie les six étapes dans la carte (« Gagné et Perdu demandent un motif. »).
- **Bureau (≥ 1280 px)** : quatre tuiles d'indicateurs **cliquables** (Prospects actifs, Passages d'étape 30 j, Conversion sur les sorties, Durée médiane par étape — les quatre valeurs) ; filtres Référent, Étiquette, Recherche, « À relancer seulement » ; quatre colonnes vivantes Nouveau → Négociation pleine hauteur et deux bandeaux verticaux repliés « Gagné 9 » / « Perdu 7 » qui se déplient ; glisser vers un bandeau ouvre le motif ; vue Liste triée par urgence (Client · Étape · Cherche · Dernier contact · Prochaine action · Référent) — **triée par retard comme au téléphone** (le rapport de maquette signale que la liste du bureau ne l'était pas).
- Carte enrichie : nom, ce qu'il cherche (une ligne), référent (avatar), dernière interaction (« appel il y a 3 j »), prochaine action datée ; une `suggested_stage` s'affiche en bandeau « Bineta a visité : la passer en Qualifié ? [Oui] [Plus tard] ».
- Motif : feuille basse au téléphone (Prix, A trouvé ailleurs, Financement, Ne répond plus, Autre + précision), dialogue de 480 px au bureau.
- **Vocabulaire (décision 11a)**, appliqué à la source des libellés d'étape pour que toute la console suive : Nouveau · Prospect · Qualifié · Négociation · Gagné · Perdu (au lieu de Lead · … · Converti) ; « Étapes » (au lieu de Pipeline / Vue pipeline) ; « Étiquettes » (au lieu de Tags) ; « Clients » (au lieu de « Clients (CRM) » / « Mon CRM ») ; « 30 j » avec espace insécable.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md).

**Pas de régression** (`PipelineKanban.tsx`, `PipelineCard.tsx`, `PipelineStatsBar.tsx`, `ReasonDialog.tsx`, `CustomerDetailSheet.tsx`, audit § 3) :
- six étapes et leur compteur ; « Charger plus (x/total) » par 50 ;
- glisser-déposer au pointeur **et au clavier** (Espace, flèches, Échap), annonces pour lecteur d'écran, colonne cible surlignée — vers une colonne vivante comme vers un bandeau replié ;
- changer d'étape sans glisser (sélecteur au doigt et au clavier) ; Gagné / Perdu exigent un motif (5 000 car.) devenu note épinglée ; mise à jour optimiste avec retour arrière ;
- Appeler / WhatsApp sur chaque carte ; pastille des tâches ouvertes (qui dit désormais le retard) ;
- ouvrir une carte mène à **la fiche complète** (la feuille latérale sans lien ni sélecteur d'étape disparaît ; ses contenus — Aperçu, Notes avec ajout, Tâches, Activité — sont dans la fiche, TCK-2589) ;
- états par colonne : squelettes, erreur avec « Réessayer », vide ;
- téléphone : changement d'étape au doigt.
- Les clés i18n renommées gardent leur nom technique (seuls les textes changent) ; `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Liste des relances (téléphone et bureau) et carte de portefeuille ; bascule Liste | Étapes ; portée Moi / Agence.
- [ ] Kanban à quatre colonnes et bandeaux terminaux ; indicateurs cliquables ; filtres.
- [ ] Bandeau d'étape proposée (Oui / Plus tard).
- [ ] Vocabulaire : libellés d'étape et de section dans les trois langues.
- [ ] Tests : agent → `scope=mine`, admin → `scope=agency` ; liste triée par retard (`-follow_up_days`) ; déposer sur « Perdu » ouvre le motif ; déplacement clavier vers un bandeau replié ; tuile cliquée → filtre ; « Plus tard » appelle `dismiss` ; le mot « Lead » n'apparaît plus dans les messages `fr` de la console.

## Critères d'acceptation

- [ ] AC1 — Connecté en agent à 390 px, la page ouvre sur « Moi » et la première ligne d'« À relancer » est celle au plus grand retard (rouge, ≥ 7 j).
- [ ] AC2 — Connecté en admin à 1280 px, la page ouvre sur « Agence » ; les quatre colonnes vivantes et les deux bandeaux tiennent sans défilement horizontal de la page.
- [ ] AC3 — Au clavier seul, une carte de Négociation se dépose sur « Gagné » et le motif est demandé avant tout `PATCH`.
- [ ] AC4 — Toucher la tuile « Conversion » filtre la vue sur les sorties de la période.
- [ ] AC5 — Un test parcourt les textes `fr` des espaces de noms `crm`, `agentCrm`, `contactLeads`, `visits`, `bookings` et de la navigation de `/app`, et échoue sur « Lead », « Converti », « Pipeline », « Tags », « Feedback » ou « (CRM) » ; il est vert, sans liste d'exceptions.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2592.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'entonnoir par agent (approche C) ; le kanban seul (approche B).
- L'entrée « Pipeline / Étapes » au menu et dans « Aller à » (famille 3) : la page reste atteinte par la liste des clients.

## Notes d'implémentation

_(à remplir par implementing-specs)_
