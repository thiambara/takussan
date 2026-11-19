---
id: TCK-2972
title: "L'engagement dans le fil, à l'écran : noter d'un geste sur un message, la carte de chaque lecteur, ses gestes, et les engagements du fil"
status: todo
phase: P2
family: front
estimate: L
wave: 96
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2969, TCK-2970]
blocks: [TCK-2973, TCK-2978]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, engagements, cartes, i18n, adr-0130]
---

## Objectif utilisateur

- **Le personnel de l'agence** transforme d'un geste la phrase d'un participant (« je repasse jeudi à
  10 h ») en engagement suivi, sans quitter le fil. Il en voit tous les engagements du fil d'un coup
  d'œil et tranche quand il le faut.
- **Le porteur** lit « Votre engagement » dans son fil. Il le confirme, propose une autre date, ou le
  déclare tenu.
- **Celui à qui la promesse est faite** la déclare tenue lui aussi (« C'est fait »).
- **L'autre partie** (celle qui n'a pas déclaré tenu) peut dire une fois, avec un motif, que
  l'engagement ne l'est pas (décision 2 « a + b », ADR-0130 § 3).

## Contrat de données

Les endpoints sont ceux de TCK-2969 et TCK-2970 :

- `POST /api/conversations/{id}/commitments` et `GET /api/conversations/{id}/commitments` ;
- `POST /api/commitments/{id}/confirm|cancel|kept|reopen|not-yet|remind` et `PUT /api/commitments/{id}` ;
- la carte se lit dans le fil : un message `card` ou `event` dont `metadata.object.type = 'commitment'`.
  Sa projection porte `etat` et `abilities` pour le lecteur ;
- les codes à composer en texte, selon le principe n° 5 : les onze codes `commitment.*` de
  [ADR-0130](../../../adr/0130-l-engagement-est-un-objet-du-fil.md) § 2.

Les gestes se montrent selon les seules `abilities` rendues : le front ne recalcule aucun droit.

## Direction UX / Artistique

- **Référence de fidélité** : la maquette locale (hors git) `fil-engagements`, approche **A**, écrans
  « Noter d'un geste » (`creer`), « La carte : le porteur confirme » (`carte`) et « En retard »
  (`retard`), au téléphone et au bureau.
- **Noter naît du message** :
  - au bureau, « Noter un engagement » dans la barre du survol d'un message, à côté de Répondre et
    Réagir ;
  - au téléphone, dans les gestes d'un message (appui long) ;
  - le formulaire est prérempli : le porteur est l'auteur du message, l'objet celui du fil (affiché, non
    modifiable), et le message source est cité en tête ;
  - l'échéance se saisit en date, avec une heure facultative. En date seule, elle vaut la fin du jour,
    heure de Dakar ;
  - « Envers » est facultatif : un participant, ou l'agence.

  Le formulaire s'ouvre dans une feuille au téléphone et dans la colonne de droite au bureau, sans
  rétrécir le fil.
- **La carte se lit pour son lecteur** :
  - « Votre engagement » et ses gestes pour le porteur (Je confirme, Proposer une autre date, C'est
    fait) ;
  - « Engagement de … » pour les autres ;
  - les gestes du personnel : Modifier, Relancer maintenant, Accorder une nouvelle date, Marquer comme
    tenu, Annuler ;
  - pour le bénéficiaire d'un engagement ouvert : « C'est fait » ;
  - **« Tenu ? »** : une heure après l'échéance, le bénéficiaire lit « Une question pour vous :
    <porteur> est-il passé … ? », avec « Oui, c'est fait » (`kept`) et « Pas encore » (`not-yet`).
    Sa réponse s'affiche dans le fil ;
  - pour l'autre partie d'un engagement tenu (porteur ou bénéficiaire, celui qui ne l'a pas déclaré) :
    « Ce n'est pas fait », avec un motif, une fois. La carte dit qui l'a déclaré tenu ;
  - un engagement en retard dit son retard en jours (« En retard de 5 jours »), dans l'encre d'alerte ;
  - un engagement clos se replie en une ligne, comme le devis de la maquette.
- **Les événements d'un engagement** (confirmé, rappel, relance, reporté, tenu, rouvert, annulé, y
  compris « annulé : l'intervention est close », « Tenu ? » demandé et « pas encore ») se lisent repliés, en une ligne, avec l'icône de la
  poignée de main ou de la cloche.
- **Les engagements de ce fil** : une section « Ouverts · Tenus · Annulés », dans la colonne de droite
  au bureau, et depuis le dossier du fil au téléphone.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (le wolof est en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Aucun texte n'est lu de l'API** : le libellé se compose depuis le code et la projection. Le titre
  d'un engagement est la seule saisie libre affichée.
- **On ne note pas depuis une note d'équipe** : le geste est absent d'une bulle de note, et l'API le
  refuse de toute façon (TCK-2969).
- **Un client ne note que sa propre promesse** : pour lui, le formulaire n'offre pas d'autre porteur.
- **Sous impersonation**, aucun geste ne s'affiche (lecture seule).
- **Sparse fieldsets** sur `GET …/commitments` ; le préfixe `/api` se règle selon le client HTTP (voir
  `CLAUDE.md`).
- Une carte d'engagement se relit quand un `event` ou une `card` plus récent arrive : c'est le
  mécanisme existant (`useCartesEnDirect`), sans recharger l'écran.

## Delta à produire

- [ ] Le geste « Noter un engagement » sur un message, au survol (bureau) et à l'appui long
  (téléphone), et son formulaire.
- [ ] La carte d'engagement, ajoutée au rendu des cartes par type (`metadata.object.type`), et ses
  gestes.
- [ ] Le texte des onze codes et leur ligne repliée.
- [ ] La section « Engagements de ce fil ».
- [ ] Clés i18n `fr`, `en`, `wo` (wo = texte français).
- [ ] Tests :
  - le formulaire prérempli depuis un message ;
  - le client sans choix de porteur ;
  - pas de geste sur une note d'équipe ;
  - chaque geste appelle sa route, et n'apparaît qu'avec son `ability` ;
  - la réouverture exige un motif ;
  - le texte de chaque code ;
  - aucun geste sous impersonation.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px, des écrans `creer`, `carte`,
  `echeance` (« Tenu ? », téléphone ; carte de l'agent, bureau) et `retard` de `fil-engagements` A. Chaque écart est nommé dans le ticket. Écarts attendus, à ne pas
  combler :
  - pas de rappels réglables dans le formulaire (« La veille, 18:00 », « 1 h avant ») ;
  - pas de « Sans réponse, la question vous revient » chez le personnel (ADR-0130, « ce que ça ne
    règle pas ») ;
  - pas de « Payer par Wave » dans la carte d'engagement : le paiement reste dans la carte de
    l'échéance ;
  - pas d'interrupteur « Rappels automatiques » ;
  - pas de colonne « Vie de l'engagement » ;
  - pas de proposition de l'assistant (lot 4).
- [ ] **AC2** — Relevé à deux sessions : l'agent note un engagement pour le prestataire, et la carte
  apparaît chez le prestataire avec « Je confirme ». Confirmé, la carte change chez l'agent sans
  recharger l'écran.
- [ ] **AC3** — Le prestataire porteur déclare tenu. Le locataire bénéficiaire rouvre avec un motif,
  puis ne voit plus « Ce n'est pas fait », et le porteur ne le voit pas non plus (le droit est
  partagé). Dans l'autre sens, le bénéficiaire déclare « C'est fait » et c'est le porteur qui voit
  « Ce n'est pas fait ». *Ablation : afficher le geste sans lire `abilities.reopen` fait rougir un
  test.*
- [ ] **AC4** — `npm run lint`, `npx tsc --noEmit`, `check:i18n` et `check:vouvoiement` sont verts, et
  les tests des fichiers touchés aussi.

## Hors périmètre

- La puce « Retard » de la boîte, la ligne d'engagement sur une rangée, la pastille, l'onglet
  « Engagements » et la fiabilité : TCK-2973.
- Les propositions de l'assistant (lot 4).

## Notes d'implémentation

_(à remplir par implementing-specs)_
