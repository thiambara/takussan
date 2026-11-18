---
id: TCK-2968
title: "La boîte de pilotage et la note d'équipe à l'écran : filtres de pilotage, Traité, Rappelez-le-moi, fil confié, pastille des gestes, interrupteur Équipe et @mention"
status: todo
phase: P2
family: front
estimate: L
wave: 95
created: 2026-11-18
updated: 2026-11-18
depends_on: [TCK-2965, TCK-2966, TCK-2967]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, boite, note-d-equipe, mentions, i18n, adr-0128]
---

## Objectif utilisateur

- **Tout lecteur de la messagerie** : la liste lui dit d'abord ce qu'on attend de lui. Il range un fil
  d'un geste (« Traité », « Rappelez-le-moi »), et la pastille de l'onglet Messages compte ce qui
  l'attend, pas ce qu'il n'a pas lu.
- **Le personnel de l'agence** : dans le fil d'un client, il bascule sur « Équipe » pour écrire une
  note que seuls ses collègues liront, sans jamais se tromper de destinataire. Il appelle un collègue
  par `@`, et confie une salle ou un groupe à une personne de l'équipe.

## Contrat de données

Endpoints existants, enrichis par les tickets amont :
- `GET /api/conversations` : `filter[file]`, puis par fil `file`, `attend_depuis`, `en_attente_de`,
  `snoozed_until`, `handled_at` et `assigned_to` ; dans la réponse, `meta.counts.{vous,attente,rappel}`
  et `meta.gestes` (TCK-2967) ;
- `PUT|DELETE …/snooze`, `PUT|DELETE …/handled` et `PUT …/assignee` (TCK-2967) ;
- `POST …/messages` avec `visibility` et `mentions[]` ; `visibility` et `metadata.mentions` à la
  lecture (TCK-2965, TCK-2966).

Sparse fieldsets : les champs ajoutés entrent dans la constante `*_FIELDS` de la liste.

## Direction UX / Artistique

- **Référence de fidélité** (maquettes locales, hors git) :
  - `fil-boite`, approche **D** : une rangée unique de filtres Tous · Non lus · À vous · En attente ·
    Rappels, qui défile à l'horizontale au bureau comme au téléphone. **« Retard » n'apparaît pas
    avant le lot 3**, et ses écrans (`a-vous`, `traite`, `non-lus`, `rappels`, `vide`, `recherche`)
    se relèvent sans lui ;
  - `fil-cartes`, approche **D**, écran « Note d'équipe et @mention » : l'interrupteur « Équipe »
    est discret.
- **On ne se trompe jamais de destination.** Quand « Équipe » est actif, quatre signes l'affichent
  sans bordure :
  - la teinte ocre du champ ;
  - le texte d'attente (« Note d'équipe · invisible pour … ») ;
  - le libellé du bouton (« Noter ») ;
  - la ligne « Lu par… ».

  Une note envoyée se lit au premier regard (aplat ocre, cadenas, « Note d'équipe »).
- **La file se lit sans légende** : délai « depuis 25 min » sur un fil « À vous », dépassé au-delà
  de **4 h** (une constante nommée du front ; décision du porteur du 2026-11-18, 2a) ; motif court sur un fil « En attente » (« Bineta Sarr
  doit signer », « confié à Ibrahima Fall »), composé depuis `en_attente_de` et les participants.
- **« Traité »** : un geste au survol au bureau et au glissement au téléphone, suivi d'un toast avec
  « Annuler ». **« Rappelez-le-moi »** propose des choix courts (dans 1 h, ce soir, demain matin,
  lundi), dans une feuille au téléphone.
- **La pastille** de l'onglet Messages (barre du téléphone et colonne du bureau) lit `meta.gestes`.
  « Non lus » garde son sens : un fil lu peut rester « À vous ».
- **@mention** : `@` ouvre une liste des seuls participants qui liront ce message (le personnel pour
  une note). La mention s'affiche en nom, jamais en identifiant.
- **Confier** : depuis l'en-tête ou le dossier d'une salle ou d'un groupe, pour le seul personnel. Le
  fil d'un prospect n'offre pas ce geste.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (wolof en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Un client ne voit jamais l'interrupteur « Équipe »**, ni aucun texte qui parle de notes
  d'équipe. Le front le cache, et l'API le refuse de toute façon (TCK-2965).
- **Écrire une note n'émet pas « en train d'écrire »** : aucun message éphémère sur le canal de
  présence du fil (ADR-0129 § 2, `src/lib/temps-reel/ecriture.ts`) tant que « Équipe » est actif.
  *Ablation : laisser passer le message éphémère en mode « Équipe » rend un test rouge.*
- **L'interrupteur revient à « Fil » après chaque envoi**, et ne se retient pas d'un fil à l'autre :
  aucun brouillon ne garde la destination « Équipe » à l'insu de l'auteur.
- **Le filtre de file part au serveur** (`filter[file]`), jamais sur la page déjà reçue. Les comptes
  des puces lisent `meta.counts`, et non la page.
- **Sous impersonation** : gestes absents (lecture seule).

## Delta à produire

- [ ] La rangée de filtres de pilotage de la liste et ses états vides par filtre.
- [ ] Sur chaque ligne : délai, motif d'attente, « confié à », et les gestes « Traité » et
  « Rappelez-le-moi » avec leur annulation.
- [ ] La pastille des gestes dans la barre du téléphone et la colonne du bureau.
- [ ] Le composeur : interrupteur « Équipe » pour le personnel, saisie `@` et liste des mentionnables,
  aucun message éphémère en mode « Équipe ».
- [ ] La bulle de note d'équipe et l'affichage d'une mention.
- [ ] Le geste « Confier » pour les salles et les groupes.
- [ ] Clés i18n `fr`, `en` et `wo` (texte français).
- [ ] Tests :
  - les filtres envoient `filter[file]` ;
  - la pastille lit `meta.gestes` ;
  - « Traité » puis « Annuler » ;
  - le client n'a pas l'interrupteur ;
  - aucun message éphémère en mode « Équipe » ;
  - retour à « Fil » après l'envoi ;
  - les mentionnables d'une note ne comptent que le personnel.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px : chaque écran de `fil-boite`
  D (sans « Retard ») et l'écran « Note d'équipe et @mention » de `fil-cartes` D est fidèle à sa
  maquette. Chaque écart est nommé dans le ticket.
- [ ] **AC2** — Un locataire connecté ne voit ni l'interrupteur, ni une note, ni le mot « équipe » dans
  son fil. Relevé au navigateur, avec un agent qui écrit une note dans la même salle.
- [ ] **AC3** — Écrire en mode « Équipe » n'affiche pas « en train d'écrire » chez le locataire
  abonné au même fil. Relevé au navigateur, deux sessions.
- [ ] **AC4** — « Traité » fait sortir le fil de « À vous » et baisser la pastille d'une unité ;
  « Annuler » rétablit les deux.
- [ ] **AC5** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests des
  fichiers touchés verts.

## Hors périmètre

- La puce « Retard », la file des engagements et leur part de la pastille : lot 3.
- Le copilote et le pont WhatsApp ou SMS.
- Un délai dépassé réglable par agence.

## Notes d'implémentation

_(à remplir par implementing-specs)_
