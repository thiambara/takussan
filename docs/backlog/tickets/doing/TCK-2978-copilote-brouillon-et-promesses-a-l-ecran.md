---
id: TCK-2978
title: "Le copilote à l'écran, agir : le brouillon dans le composeur (Envoyer seul publie), les promesses repérées sous leur message, « Noter l'engagement » et « Écarter »"
status: doing
phase: P2
family: front
estimate: M
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2975, TCK-2977, TCK-2969, TCK-2972]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, copilote, ia, engagements, i18n, adr-0131]
---

## Objectif utilisateur

- **L'agent ou l'administrateur d'agence** :
  - demande un brouillon depuis ✦ du composeur, le relit avec ce sur quoi il s'appuie, le raccourcit
    ou en demande un autre, puis l'envoie ou le jette ;
  - voit sous un message la promesse qu'il contient, et la note en engagement en un geste, ou
    l'écarte.

  Rien ne part, rien ne se crée, sans ce geste.

## Contrat de données

- `POST /api/conversations/{conversation}/copilote/brouillon` `{ton?}` et `…/promesses`
  (TCK-2975), état par `GET …/copilote` et signal `copilote.updated` (le hook de TCK-2977).
- **Envoyer** : la route ordinaire `POST /api/conversations/{conversation}/messages`. Ensuite
  `PUT /api/copilote/suggestions/{id}/decision` : `accepted` si le texte est identique, sinon
  `edited` avec `final: {texte}`. « Jeter le brouillon » → `rejected`.
- **Noter l'engagement** : le formulaire « Noter un engagement » de TCK-2972, qui crée par
  `POST /api/conversations/{conversation}/commitments` (TCK-2969). Il est pré-rempli avec
  `source_message_id`, `holder_id`, `title` et `due_at` de la promesse ; l'objet est celui du fil.
  Au succès, la décision `accepted`, ou `edited` avec les champs créés s'ils diffèrent. « Écarter »
  → `rejected`.
- Les promesses se demandent **à l'ouverture du fil** par le personnel, en même temps que l'état.
  L'API n'appelle le modèle que s'il y a de nouveaux messages.

## Direction UX / Artistique

- **Référence de fidélité** : `fil-copilote`, approche **A**, écrans `brouillon` et `extraction`, à
  360 et 1280 px.
- **Le brouillon** vit dans le composeur, dans la grammaire de TCK-2977 (tirets, aplat beige,
  « Brouillon de l'assistant · relisez avant d'envoyer »).
  - « Appuyé sur : » liste ses appuis en puces (bail, paiement, engagement), chacune vers l'objet.
  - Il garde son cadre **tant qu'il n'est pas retouché**. Dès la première frappe, il devient un
    texte ordinaire du composeur, et l'étiquette disparaît.
  - Gestes : « Jeter le brouillon », « Proposer un autre brouillon », « Plus court », puis
    « Envoyer », le seul qui publie.
- **Les promesses** : le passage repéré est souligné dans la bulle. Sous le message, un bloc « Repéré
  par l'assistant » porte une carte par promesse : porteur · libellé, échéance et objet, puis
  « Noter l'engagement » et « Écarter ».
  - **Au plus un bloc par message**, replié après « Écarter ».
  - Une promesse notée laisse place à l'événement d'engagement du lot 3.
- Le montant repéré et « Ajouter au devis » de la maquette **ne sont pas livrés** : écart nommé.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (wolof en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Un brouillon n'est jamais envoyé sans « Envoyer »**, ni en mode « Équipe » de la note d'équipe :
  ✦ du composeur n'est offert qu'en mode Fil.
- **Une promesse ne crée rien seule** : « Noter l'engagement » passe par la route du lot 3, qui juge
  ses droits.
- **Les blocs du copilote ne sont jamais vus d'un autre lecteur**, ni recopiés dans un message.

## Delta à produire

- [ ] ✦ dans le composeur (mode Fil seulement) et l'état du brouillon (cadre, appuis, gestes,
  retouche).
- [ ] La décision après envoi, ou au jet.
- [ ] Le soulignement et le bloc des promesses dans la bulle, « Noter l'engagement » vers la création
  du lot 3, et « Écarter ».
- [ ] Messages `fr` / `en` / `wo`.
- [ ] Tests Vitest :
  - « Utiliser » ne fait aucun `POST …/messages` ;
  - « Envoyer » tel quel → `accepted`, retouché → `edited` ;
  - ✦ absent en mode Équipe ;
  - « Écarter » → `rejected` et bloc replié ;
  - « Noter l'engagement » appelle la route du lot 3, jamais une route du copilote.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px : les écrans `brouillon` et
  `extraction` de `fil-copilote` A sont fidèles à la maquette, sauf l'écart nommé du montant.
- [ ] **AC2** — Onglet réseau : aucun `POST …/messages` ni création d'engagement avant le geste
  « Envoyer » ou « Noter l'engagement ».
- [ ] **AC3** — Le locataire de la même salle ne voit ni soulignement ni bloc « Repéré », relevé avec
  deux sessions.
- [x] **AC4** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests
  des fichiers touchés verts. — preuve : CI verte de #1700 sur 2cf49b37f : Web CI 44461750708 (ESLint, tsc, check:i18n, check:vouvoiement, Vitest en 4 shards).

## Hors périmètre

- Le montant repéré, « Ajouter au devis ».
- L'écran des engagements et leur événement dans le fil : lot 3.
- Un brouillon de note d'équipe.

## Notes d'implémentation

Implémenté le 2026-11-19 (agent impl-2977, arbre partagé), contre le contrat de TCK-2975 et d'ADR-0131 : **l'API de
TCK-2975 n'existait pas** (`SortesDuCopilote` ne porte que `resume`), elle est doublée dans les tests.

**Livré** :
- `src/lib/queries/copilote.ts` (blocs TCK-2978) : `brouillon` et `promesses` dans l'état ; décision `edited` avec
  `final` ; `demanderUnBrouillon` et `deciderLaSuggestion` SANS hook (le composeur vit dans `ChatView`, rendu aussi
  sans client de requêtes) ; `demanderLesPromesses`, une fois par (utilisateur, fil, dernier message à l'ouverture).
- `copilote/BrouillonDuComposeur.tsx` : au-dessus du champ, « Brouillon de l'assistant · relisez avant d'envoyer »,
  « Appuyé sur : », « Jeter le brouillon », « Proposer un autre brouillon », « Plus court ». Le texte va DANS le
  champ ; le cadre disparaît dès la première retouche.
- `copilote/PromessesDuMessage.tsx` : la demande à l'ouverture, et sous un message au fil (jamais une note
  d'équipe ni une carte) au plus un bloc « Repéré par l'assistant », une carte par promesse, « Noter
  l'engagement » et « Écarter ».
- `ChatView.tsx` (blocs TCK-2978) : ✦ « Proposer une réponse » dans `leading`, dans la seule branche Fil ; la
  décision après « Envoyer » (`accepted` tel quel, `edited` + `final: {texte}`) ; le bloc des promesses après la bulle.
- `engagements/NoterUnEngagement.tsx` (fichier de TCK-2972, ajout marqué TCK-2978) : `prerempli`
  `{holder_id, title, due_at}` et `onCree(corps)`. La création reste la seule route du lot 3.
- 19 clés `messaging.copilote.brouillon.*`, `.appui.*`, `.promesses.*`.

**Contrat supposé, à vérifier contre TCK-2975 une fois fusionné** : `sortes.brouillon = {statut, suggestion_id,
proposition: {texte, appuis: [{type, id}]}}` ; `sortes.promesses = {statut, promesses: [{suggestion_id, proposition:
{message_id, porteur_id, libelle, echeance}}]}` (`propositions` et `proposition.promesses` sont lus aussi).

**Écarts** :
- **Pas de soulignement du passage** dans la bulle : la sortie de `fil.promesses` ne porte pas le passage (ni texte
  ni position), seulement `message_id`. Le bloc est sous la bulle, sans repère dans le texte.
- Le brouillon est dans le champ (Textarea) et le cadre au-dessus ne porte que l'étiquette, les appuis et les gestes,
  là où la maquette met le texte dans le cadre.
- Les puces d'appui ne mènent pas à l'objet : aucun chemin d'objet n'est rendu par la proposition (`{type, id}`).
- La carte de promesse ne dit pas l'objet du fil (« Intervention · Fuite sous évier ») : non porté par la proposition.
- Le montant repéré et « Ajouter au devis » : non livrés (hors périmètre).

**Tests** : `src/components/messages/__tests__/ChatView.copilote-brouillon.tck-2978.test.tsx` (7) verts ; ceux de
TCK-2977, ChatView, MessagesPage et `engagements/` (156) verts. Ablations restaurées par md5 : envoi au remplissage
(rouge), « Écarter » sans repli (rouge), retouche jugée identique (rouge). ✦ absent en mode Équipe : garde
structurelle (branche `equipe` du `leading`), non ablatée.

**Non mesuré** : AC1 à AC3 (navigateur, deux sessions). `check-front-routes` rouge sur la décision tant que
TCK-2975 n'est pas fusionné.

## Reste sur dev

Le code est sur `dev` (#1700, 83f651c16). Il reste :

- AC1 : relevé au navigateur des écrans `brouillon` et `extraction`, non fait. Il faut un fournisseur d'IA en local.
- AC2 : relevé réseau, non fait. AC3 : relevé à deux sessions, non fait.
