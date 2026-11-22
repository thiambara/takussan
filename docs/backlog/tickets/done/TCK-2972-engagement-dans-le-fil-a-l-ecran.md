---
id: TCK-2972
title: "L'engagement dans le fil, à l'écran : noter d'un geste sur un message, la carte de chaque lecteur, ses gestes, et les engagements du fil"
status: done
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

- [x] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px, des écrans `creer`, `carte`,
  `echeance` (« Tenu ? », téléphone ; carte de l'agent, bureau) et `retard` de `fil-engagements` A. Chaque écart est nommé dans le ticket. Écarts attendus, à ne pas
  combler :
  - pas de rappels réglables dans le formulaire (« La veille, 18:00 », « 1 h avant ») ;
  - pas de « Sans réponse, la question vous revient » chez le personnel (ADR-0130, « ce que ça ne
    règle pas ») ;
  - pas de « Payer par Wave » dans la carte d'engagement : le paiement reste dans la carte de
    l'échéance ;
  - pas d'interrupteur « Rappels automatiques » ;
  - pas de colonne « Vie de l'engagement » ;
  - pas de proposition de l'assistant (lot 4). — preuve : relevé 2026-11-19, `echeance` : porteur non agent (propriétaire Mamadou Cissé) à 360 px, carte « Votre engagement · En retard », « C'est fait », « Proposer une autre date », ligne « « Tenu ? » demandé », sans défilement horizontal ; côté bénéficiaire (Fatou Wade) la question « Tenu ? » avec « Oui, c'est fait » et « Pas encore ».
- [x] **AC2** — Relevé à deux sessions : l'agent note un engagement pour le prestataire, et la carte
  apparaît chez le prestataire avec « Je confirme ». Confirmé, la carte change chez l'agent sans
  recharger l'écran. — preuve : relevé 2026-11-19, deux sessions (agent Pape Cissé, porteur), la carte arrive chez le porteur avec « Je confirme » ; confirmée, la carte de l'agent change sans rechargement.
- [x] **AC3** — Le prestataire porteur déclare tenu. Le locataire bénéficiaire rouvre avec un motif,
  puis ne voit plus « Ce n'est pas fait », et le porteur ne le voit pas non plus (le droit est
  partagé). Dans l'autre sens, le bénéficiaire déclare « C'est fait » et c'est le porteur qui voit
  « Ce n'est pas fait ». *Ablation : afficher le geste sans lire `abilities.reopen` fait rougir un
  test.* — preuve : relevé 2026-11-19, porteur Mamadou Cissé déclare tenu, le bénéficiaire Fatou Wade voit « Ce n'est pas fait », rouvre avec le motif « Quittance non reçue » ; ensuite le bouton a disparu chez les deux (droit partagé) et la carte repasse « En retard ». Dans l'autre sens (droit remis à zéro par script) Fatou déclare « C'est fait » et Mamadou voit « Ce n'est pas fait », elle ne le voit pas.
- [x] **AC4** — `npm run lint`, `npx tsc --noEmit`, `check:i18n` et `check:vouvoiement` sont verts, et
  les tests des fichiers touchés aussi. — preuve : CI verte de #1700 sur 2cf49b37f : Web CI 44461750708 (ESLint, tsc, check:i18n, check:vouvoiement, Vitest en 4 shards).

## Hors périmètre

- La puce « Retard » de la boîte, la ligne d'engagement sur une rangée, la pastille, l'onglet
  « Engagements » et la fiabilité : TCK-2973.
- Les propositions de l'assistant (lot 4).

## Notes d'implémentation

Relevé du 2026-11-19, contre l'API de TCK-2969 et TCK-2970 écrite dans le même arbre (non fusionnée).

**Ce qui est fait** (`takussan-web/src/components/messages/engagements/`) :
- `CarteEngagement` : la carte, sur `CadreDeCarte` (aplat sans bordure de TCK-2962, et non la carte
  bordée de la maquette `fil-engagements`) ; branchée dans `CarteDuFil` (`case 'commitment'`). Les gestes
  sortent des seules `abilities` (`gestesPermis`), aucun sous impersonation (`useLectureSeule`, même
  témoin que la boîte) ; le libellé seul dépend du lecteur (porteur, bénéficiaire, personnel). « Tenu ? »
  sur l'événement `commitment.check_requested` avec `not_yet`. Clos : une ligne, qui garde « Ce n'est
  pas fait » sur `abilities.reopen`.
- `NoterUnEngagement` (feuille au téléphone, panneau de droite dès `md` : `FeuilleDuBas`), ouvert par
  `BoutonNoter` (survol, bureau) et `GestesDuMessage` (appui long, téléphone), branchés dans
  `ChatView`/`MessageBubble` (blocs marqués TCK-2972). Échéance : date seule → `T23:59:59+00:00`
  (Dakar, UTC+0), heure → `THH:MM:00+00:00` (`echeanceSaisie`). Envoi avec `Idempotency-Key`.
- `EngagementsDuFil` : « Ouverts · Tenus · Annulés », dans `ColonneDeContexte` (bureau) et
  `DossierDuFil` (colonne et feuille d'une salle).
- Les onze codes dans `useTexteMessageSysteme` (`messaging.evenementsDuFil.commitment.*`, `reason` →
  `motif`), et l'icône (poignée de main, cloche) dans `SystemMessageBubble`.

**Prémisses qui diffèrent** :
- Il n'existe **aucune barre de survol** (« Répondre », « Réagir ») sur un message : « Noter un
  engagement » est seul, à côté de la bulle, au survol et au clavier.
- `GET …/commitments` ne lit aucun `fields[…]` (pas de `spatie/laravel-query-builder` dans `index`) :
  aucun sparse fieldset envoyé.
- La projection ne porte pas `kept_by` : la carte ne peut pas dire **qui** l'a déclaré tenu.
- Le motif de réouverture (`reopen_reason`) n'est pas affiché : seul le titre est une saisie libre
  affichée (contrainte du ticket).
- Le personnel, pour le formulaire, est lu de `can_write_team_note` du contexte (jugé par l'API), pas
  des rôles.
- Les refus `commitment.*` ne sont pas au catalogue `CLE_I18N_ERREUR_API` : la prose localisée de
  l'API s'affiche (testé sur 422 `commitment.due_in_past`), sinon le repli « échec du geste ».
- Écarts AC1 à nommer au relevé : poignée de main dans le sur-titre (contre « sans puce-icône » de
  `CadreDeCarte`) ; « Engagement de Astou Sy » sans élision (la maquette écrit « d'Astou Sy »).

La section est aussi dans `FeuilleDuFil` (« ⋯ » d'un fil direct au téléphone) ; son placement est
testé dans `ColonneDeContexte.tck-2632` et `FeuilleDuFil.tck-2632` (ablation rouge pour la feuille).

`check:classes-emises` reste rouge, mais `--report` situe ses 16 classes toutes sous
`playground/maquettes` (maquettes locales, toléré). Un `'late'` écrit dans `cn()` par
`EngagementsDuFil` y figurait, il est retiré.

L'icône (poignée de main, cloche) est aussi sur une suite repliée et chaque ligne du journal déplié
(`IconeDEvenement`). Le placement dans `DossierDuFil` est testé (`salle.tck-2963`).

« Noter » ne s'offre pas dans un fil sans agence. Le contexte du fil ne rend pas l'agence : elle est
déduite de ce qu'il rend (`filAvecAgence` : le personnel, ou un bien, un bail, une intervention
rattachés). C'est une approximation, et l'API reste juge. Ablations rouges : le geste sur une note
d'équipe, et le geste dans un fil sans agence.

**AC1, AC2, AC3 (relevés au navigateur)** : non mesurés — à faire par la session une fois l'API fusionnée.
AC3, ablation : afficher « Ce n'est pas fait » sans lire `abilities.reopen` fait rougir
`CarteEngagement.tck-2972.test.tsx` (« replié (tenu), le geste n'apparaît qu'avec abilities.reopen »).

## Relevé AC1 — 2026-11-19, `./dev.sh`, agent Pape Cissé, fil du bail LS-GZD7PKJ2

- **360 px** : l'appui long sur un message ouvre la feuille « Ce message → Noter un engagement ». Le
  formulaire est prérempli depuis le message (citation, heure). Porteur par défaut « Vous »,
  bénéficiaire par défaut « L'agence », calendrier, heure facultative. La carte « Votre engagement ·
  Ouvert » porte « C'est fait », « Proposer une autre date » et « Annuler l'engagement ».
  L'annulation replie la carte en « Annulé », sans confirmation, avec le toast « Engagement annulé ».
  L'onglet « Engagements » : puces Tous, On me doit (0), Les miens (2), Tenus, Annulés ; groupes
  « Cette semaine » et « Clos ».
- **1280 px** : « Noter un engagement » apparaît au survol et au focus de la bulle. Le fil annulé est
  barré, avec l'aperçu « Engagement annulé » dans la liste. La section « Engagements de ce fil » est
  dans le dossier.
- **Retard** (échéance mise dans le passé, puis `commitments:signal`) : badge « En retard », ligne
  « En retard de 1 jour » en rouge, « Relancer maintenant », ligne repliée « Tenu ? demandé »,
  ligne système « L'engagement est en retard ». Dans la liste, le fil passe « À vous », avec
  « Vous aviez prévu : … ».
- **Écart nommé** : après le signal de retard, le fil montre deux cartes vivantes du même
  engagement, la carte d'origine et celle du retard, avec les mêmes gestes.
- **Non relevé ici** : « Tenu ? » vu par un porteur non agent au téléphone, ainsi que AC2 et AC3, qui
  demandent deux sessions. Leur logique est couverte par les tests du ticket.

## Relevé — 2026-11-19 (2)

- AC2 : conforme, relevé à deux sessions.
- AC3 : non coché. Le sens agent (personnel rouvre toujours) a été vu ; la paire « porteur non membre du personnel déclare tenu, bénéficiaire rouvre, plus personne ne voit « Ce n'est pas fait » » n'a pas été jouée de bout en bout.
- Manque encore AC1 `echeance` vu par un porteur non agent, au téléphone.

## Relevé — 2026-11-19 (3)

- AC1 (`echeance`) et AC3 : conformes, relevés à trois sessions (agent, propriétaire à 360 px, locataire). Pour rejouer le sens inverse, `party_reopened_at` de l'engagement 7 a été remis à null par script. Tous les critères sont cochés.
