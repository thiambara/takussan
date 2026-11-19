---
id: TCK-2973
title: "Les engagements dans la boîte, à l'écran : la puce « Retard », la ligne d'engagement d'un fil, l'onglet « Engagements » et la fiabilité du personnel"
status: doing
phase: P2
family: front
estimate: L
wave: 96
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2971, TCK-2972, TCK-2987]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, engagements, boite, i18n, adr-0130, adr-0128]
---

## Objectif utilisateur

- **Tout lecteur** voit dans la boîte les fils où une promesse qu'on lui doit n'a pas été tenue (puce
  « Retard »). Chaque ligne dit quelle promesse est en cours ou en retard, et la pastille de l'onglet
  Messages compte ces retards comme des gestes attendus.
- **Tout lecteur** ouvre l'onglet « Engagements » de la messagerie : ce qu'on lui doit, les siens, les
  tenus et les annulés.
- **Le personnel de l'agence** voit, à côté d'un participant du fil, combien de ses engagements ont été
  tenus et combien en retard sur 90 jours. Personne d'autre ne le voit.

## Contrat de données

Les endpoints sont ceux de TCK-2971 (la boîte) et de TCK-2987 (la liste et la fiabilité) :

- `GET /api/conversations` :
  - `filter[file]=retard` ;
  - `meta.counts.retard` ;
  - `meta.gestes`, qui compte désormais `vous` + `retard` ;
  - par fil, `retard_depuis` et `engagement` `{id, title, holder_id, due_at, etat}` ;
- `GET /api/commitments`, avec `filter[role]=owed|mine`, `filter[etat]=…` et
  `meta.counts.{owed,mine,late}` ;
- `GET /api/conversations/{id}/context` : `commitments_records`, une table indexée par compte
  `{kept, late}`, présente pour le seul personnel.

Sparse fieldsets : les champs ajoutés entrent dans la constante `*_FIELDS` de la liste.

## Direction UX / Artistique

- **Référence de fidélité** (maquettes locales, hors git) :
  - `fil-boite`, approche **D** : la rangée Tous · Non lus · À vous · **Retard** · En attente ·
    Rappels, dans cet ordre (`PUCES_DE_PILOTAGE`, `components/messages/boite/pilotage.ts`). Le compte
    de « Retard » est en ocre gras quand il n'est pas nul et que la puce n'est pas active. Les écrans
    de `fil-boite` D se relèvent cette fois **avec** « Retard », et l'état vide de « Retard » a son
    texte (« Une promesse prise dans le fil n'a pas été tenue. ») ;
  - `fil-engagements`, approche **A**, écrans « On me doit / les miens » (`liste`) et « Fiabilité
    d'une personne » (`fiabilite`, bureau).
- **La ligne d'engagement d'un fil** (signal de la rangée) :
  - « Ousmane : « je paie le 5 » · 3 j de retard », en ocre, avec l'icône d'alerte, pour un engagement
    en retard ;
  - « Astou Sy : « je passe mardi 9 h 30 » » en encre douce pour un engagement à venir ;
  - pour le porteur, « Vous aviez prévu de … » ;
  - le nom vient des participants, jamais un identifiant à l'écran.
- **L'onglet « Engagements »** est à côté de « Conversations », dans la page Messages, avec son compte :
  - au téléphone : les puces On me doit · Les miens · Tenus, puis des groupes En retard (encre
    d'alerte) · Aujourd'hui · Cette semaine · Plus tard ;
  - au bureau : les puces Tous · On me doit · Les miens · Tenus · Annulés, puis un tableau Qui
    s'engage · Engagement (et son fil) · Échéance · Rattaché à · État ;
  - une ligne ouvre son fil sur la carte de l'engagement.
- **La fiabilité** : deux nombres, « 12 tenus · 2 en retard · sur 90 jours », avec la rangée de
  pastilles (tenus, en retard). Jamais un pourcentage, une note ou une étoile. Une ligne dit qui la
  voit : « Visible par l'équipe de <agence> seulement ». Elle se place dans la colonne de contexte du
  fil (bureau) et la fiche du participant ouverte depuis le fil (téléphone).
- Textes en `fr` et `en`, et en `wo` le texte français tel quel. Vouvoiement.

## Contraintes strictes (métier)

- **Le filtre part au serveur** : `filter[file]=retard`, `filter[role]` et `filter[etat]`, jamais sur
  une page déjà reçue. Les comptes des puces lisent `meta.counts`.
- **La pastille lit `meta.gestes`** et rien d'autre : le front n'additionne pas lui-même `vous` et
  `retard`.
- **La fiabilité ne s'affiche que si `commitments_records` est présent** : le front ne la cache pas
  sur un rôle qu'il aurait déduit. Un client, le participant lui-même et l'impersonation d'un
  locataire ne voient ni le bloc, ni son texte.
- Sous impersonation, aucun geste.

## Delta à produire

- [ ] La puce « Retard » dans la rangée de pilotage, sa file serveur et son état vide.
- [ ] La ligne d'engagement sur la rangée d'un fil.
- [ ] L'onglet « Engagements » de la messagerie, ses puces et ses groupes (téléphone), et son tableau
  (bureau).
- [ ] Le bloc de fiabilité dans la colonne de contexte et la fiche du participant.
- [ ] Clés i18n `fr`, `en`, `wo` (wo = texte français).
- [ ] Tests :
  - « Retard » envoie `filter[file]=retard` ;
  - la pastille suit `meta.gestes` ;
  - la ligne d'engagement nomme le porteur, sans identifiant ;
  - l'onglet envoie `filter[role]` ;
  - la fiabilité est absente quand `commitments_records` l'est, et présente avec ses deux nombres sinon.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px :
  - les écrans de `fil-boite` D, avec « Retard » ;
  - les écrans `liste` et `fiabilite` (bureau) de `fil-engagements` A.

  Chaque écart est nommé dans le ticket. Écarts attendus, à ne pas combler :
  - pas de proposition de l'assistant dans l'onglet (lot 4) ;
  - pas de liste « Les derniers » dans la fiabilité (décision 1 : un compte seulement) ;
  - pas de « mot » du porteur sur un retard ;
  - pas de page « Astou Sy » à onglets au téléphone : la fiabilité vit dans la fiche du participant
    ouverte depuis le fil ;
  - « Visible par … et par Moussa Fall » devient « par l'équipe seulement ».
- [ ] **AC2** — Relevé à deux sessions : le porteur laisse passer l'échéance. Chez l'agent, le fil passe
  dans « Retard » et la pastille monte d'une unité. Déclaré tenu par le porteur, le fil en sort et la
  pastille redescend.
- [ ] **AC3** — Un locataire connecté ne voit le bloc de fiabilité d'aucun participant, le sien
  compris. Relevé au navigateur. *Ablation : afficher le bloc sur `commitments_records?.[id] ??
  {kept: 0, late: 0}` fait rougir un test.*
- [x] **AC4** — `npm run lint`, `npx tsc --noEmit`, `check:i18n` et `check:vouvoiement` sont verts, et
  les tests des fichiers touchés aussi. — preuve : CI verte de #1700 sur 2cf49b37f : Web CI 44461750708 (ESLint, tsc, check:i18n, check:vouvoiement, Vitest en 4 shards).

## Hors périmètre

- La puce d'objet de la rangée (« Devis 145 000 F à approuver », la `carte` de `fil-boite` D) : elle
  n'est pas liée aux engagements dans la maquette. C'est une question de la session (ADR-0130,
  rapport du lot 3).
- Un seuil minimal d'affichage de la fiabilité.
- Une page « Engagements » d'agence dans le menu (approche B, écartée).

## Notes d'implémentation

Relevé du 2026-11-19, contre l'API de TCK-2971 et TCK-2987 écrite dans le même arbre (non fusionnée). Les
formes ont été relues dans le code : `retard_depuis`, `engagement` `{id, title, holder_id, due_at, etat}`
(`ConversationResource::engagementPressant`), `meta.counts.retard` (`FileDuFil`), et
`commitments_records` absent hors du personnel (`ConversationContextResource`, `when`).

**Fait** :
- « Retard » dans `PUCES_DE_PILOTAGE`, après « À vous » ; sa file part au serveur (`filter[file]=retard`).
  Le compte (`meta.counts.retard`) est en ocre gras, non nul et puce inactive. L'aide et l'état vide ont
  leur texte, et l'étiquette de file « Retard » est au ton d'attention. Le test de TCK-2968 qui figeait
  « cinq puces, sans Retard » est mis à jour (bloc marqué TCK-2973).
- La ligne d'engagement d'une rangée (`SignauxDuFil`) : « Nom : « titre » · N j de retard » en ocre, et
  la promesse à venir en encre douce. Pour le porteur : « Vous aviez prévu : « titre » ». C'est un écart :
  « Vous aviez prévu de … » demanderait de conjuguer un titre libre. Le nom vient des participants : sans
  nom connu, la promesse seule, jamais l'identifiant.
- La fiabilité (`FiabiliteDuFil`) : dans la colonne de contexte (bureau) et la feuille « ⋯ » du fil
  (téléphone). Elle n'existe que si `commitments_records` est rendu, et pour les seuls comptes qu'il
  porte ; soi exclu. « Visible par l'équipe de l'agence seulement » : le contexte ne rend pas le nom de
  l'agence. Ablation rouge : `commitments_records?.[id] ?? {kept: 0, late: 0}`.

**Prémisses** :
- La pastille lit déjà `meta.gestes` (`MessagesPage`, TCK-2968) : rien à changer côté front. Je n'ai pas
  re-mesuré un autre lecteur de la pastille (navigation).
- `fields[conversations]` est inerte (`ConversationController::index` sans `buildQuery`) : les deux
  champs neufs y sont déclarés pour la lecture, comme les autres.

**L'onglet « Engagements »** (`EngagementsDeLaMessagerie`, `OngletsDeLaMessagerie`) : « Conversations ·
Engagements » en tête de la colonne de liste de `MessagesPage`. Les puces Tous · On me doit · Les miens ·
Tenus · Annulés partent au serveur (`filter[role]=owed|mine`, `filter[etat]=kept|cancelled`, `per_page=50`).
Leurs comptes lisent `meta.counts.{owed, mine}`. Les groupes : En retard (encre d'alerte), Aujourd'hui,
Cette semaine, Plus tard (heure de Dakar), Clos. Une ligne ouvre son fil. `GET /api/commitments` ne lit
aucun `fields[…]` (`ListCommitmentsRequest`) : aucun sparse fieldset envoyé.

Au bureau, l'onglet ouvre dans le panneau principal un **tableau** Qui s'engage · Engagement (et son fil)
· Échéance · Rattaché à · État, dans l'ordre de l'API ; « Rattaché à » nomme le type de l'objet
(`object.type` : intervention, bail, réservation, bien…), « — » sinon. Une ligne ouvre son fil et referme
le tableau ; la colonne de la liste garde les puces et les groupes.

Écarts avec la maquette :
- « Rattaché à » nomme le type de l'objet, pas l'objet lui-même : la projection ne rend que `{type, id}`.
- Les cinq puces sont aussi au téléphone (la maquette en montre trois).
- L'onglet n'a pas de compte : il faudrait une requête de plus sur chaque écran de la messagerie.
- La ligne ouvre le fil, mais pas sur la carte de l'engagement : aucun défilement jusqu'à elle.

AC1 à AC3 au navigateur : non mesurés.

## Relevé partiel — 2026-11-19, `./dev.sh`, agent Pape Cissé

- **Boîte, à 360 px** : puces Tous, Non lus 0, À vous 9, Retard 0, En attente 4, Rappels 0, sans
  défilement horizontal. Sous « Retard », l'aide dit « Une promesse qu'on vous doit n'a pas été
  tenue. ». L'engagement en retard que l'agent PORTE lui-même fait passer son fil sous « À vous »,
  avec « Vous aviez prévu : … » et « Tenu ? » demandé ; il ne compte pas dans « Retard », conformément
  à ADR-0130.
- **Onglet « Engagements », à 360 px** : puces et groupes « Cette semaine » et « Clos », relevés avec
  TCK-2972. Par défaut, c'est la puce « On me doit » qui est active.
- **Non relevés** : un fil sous « Retard » (il faut une promesse due à l'agent, donc une seconde
  session), la fiabilité au bureau, et AC2.

## Reste sur dev

Le code est sur `dev` (#1700, 83f651c16). Il reste :

- AC1 : relevé partiel (boîte et onglet à 360 px). Manquent un fil sous « Retard » et la fiabilité au bureau.
- AC2, AC3 : relevés à deux sessions, non faits.
