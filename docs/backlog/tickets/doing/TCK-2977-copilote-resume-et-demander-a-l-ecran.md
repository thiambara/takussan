---
id: TCK-2977
title: "Le copilote à l'écran, lire : grammaire « proposé, non envoyé », « Ce que vous avez manqué » au premier non-lu, « Demander au fil », transcription sous la note vocale, états en pause, coupé et indisponible"
status: doing
phase: P2
family: front
estimate: L
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2974, TCK-2975, TCK-2976]
blocks: [TCK-2978]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, copilote, ia, note-vocale, i18n, adr-0131]
---

## Objectif utilisateur

- **L'agent ou l'administrateur d'agence** :
  - rouvre un fil chargé et lit, au premier non-lu, ce qu'il a manqué ;
  - va d'un geste à la question qui l'attend ;
  - pose une question au fil depuis l'icône ✦ de l'en-tête ;
  - lit sous une note vocale ce qu'elle dit, sans l'écouter, en sachant que la note fait foi.

  Il distingue toujours, d'un coup d'œil, ce que l'assistant propose de ce que des personnes ont
  écrit.
- **Le client, le bailleur et le prestataire** ne voient ni ✦, ni résumé, ni le mot « assistant ».

## Contrat de données

- **`copilote`** (booléen) de `ConversationResource` (TCK-2974), sur la liste et le fil : faux, le
  front n'émet **aucune** requête `…/copilote` et n'affiche rien.
- `GET /api/conversations/{conversation}/copilote` (TCK-2974) : l'état par sorte (`aucun`,
  `en_cours`, `prete`, `refusee`, `echec`, avec code).
- `POST /api/conversations/{conversation}/copilote/resume` `{depuis_message_id}` (TCK-2974) et
  `…/question` `{question}` (TCK-2975). Les deux rendent `202`, ou `200` avec un résumé déjà fait.
  `depuis_message_id` est le premier message non lu affiché au séparateur « N nouveaux messages »,
  **retenu avant** que `useMarkConversationRead` marque le fil lu
  (`src/lib/queries/conversations.ts:321`).
- `PUT /api/copilote/suggestions/{suggestion}/decision` (TCK-2975) : « Utile » →
  `accepted`, « Pas utile » → `rejected`.
- Signal `copilote.updated` sur le canal de l'utilisateur (`src/lib/temps-reel/hooks.ts`,
  `useSignal`). À sa réception, le front relit l'état. La relecture de sécurité de 60 s (ADR-0129
  § 4) rattrape un signal perdu.
- **Transcription** (TCK-2976) : `MessageResource.transcription`, présente pour le seul personnel
  servi, absente pour tout autre lecteur, de valeur `{etat, texte?, langue?, code?}`.
  `POST /api/conversations/{conversation}/messages/{message}/transcription` est appelé **à
  l'affichage** d'une note dont `etat` vaut `aucune`, une fois par note et par session. Le signal
  `message.updated` sur le canal de l'utilisateur relit le message (`useFilEnDirect.ts`).
- **Coupé** : l'état `coupe` porte sa portée (`plateforme` ou `agence`), rendue par le résolveur
  `ReglagesDuCopilote` de TCK-2974. La portée `agence` n'apparaît qu'une fois TCK-2979 fusionné ;
  l'écran la prévoit dès maintenant, sans dépendre de TCK-2979.
- Le compte de non-lus du fil à l'ouverture (`unread_count`, `ConversationResource`, lu **avant** la
  marque de lecture) décide de la demande du résumé : 10 au moins. Le seuil est une constante nommée
  du front, égale à celle de l'API, qui le rejuge sur la fenêtre (422 `copilote.resume_inutile`,
  alors rien ne s'affiche).

## Direction UX / Artistique

- **Référence de fidélité** (maquette locale, hors git) : `fil-copilote`, approche **A** « Au fil de
  la lecture ». Écrans `manque`, `demander`, `vocal` et `limites`, à 360 et 1280 px.
- **Une seule grammaire pour « proposé, non envoyé »**, pour tout ce que le copilote montre (ce
  ticket et TCK-2978) :
  - bordure en tirets, aplat beige de chrome, étiquette « ✦ … de l'assistant » en toutes lettres ;
  - jamais le style d'une bulle envoyée, jamais la couleur seule ;
  - la ligne « Visible par vous seulement · rien n'est envoyé ». C'est une forme neutre : la
    maquette écrit « vous seule ».

  Un composant commun, que TCK-2978 réutilise.
- **« Ce que vous avez manqué »** s'insère au séparateur « N nouveaux messages ». Chaque point
  renvoie, par son heure cliquable, au message qu'il résume (défilement et surlignage). Le point qui
  attend le lecteur passe en tête, en gras, et « Aller à la question » y mène. « Lire les N messages »
  replie le résumé. Pendant l'appel, un état d'attente discret à la même place, sans spinner plein
  écran.
- **« Demander au fil »** : depuis ✦ de l'en-tête, une feuille au téléphone (88 % de hauteur), la
  colonne de droite au bureau, à la place de la colonne de contexte. Elle montre :
  - la question posée, la réponse dans la grammaire ci-dessus ;
  - les sources, qui mènent au message ou à l'objet ;
  - « Mettre dans le composeur » ;
  - la phrase « L'assistant ne lit que ce fil et ses objets. La réponse n'est vue que par vous. »
- **La transcription** (écran `vocal`) se place sous le lecteur de la note (`NoteVocale.tsx`),
  séparée par un filet en tirets, dans la même grammaire :
  - prête : « ✦ Transcription automatique », le texte en italique, puis « Peut contenir des
    erreurs · la note fait foi » ;
  - en cours : une ligne discrète, sans spinner ;
  - indisponible : « ✦ Transcription indisponible » et une phrase courte selon le code :
    - `ai.role_unassigned` : « La transcription n'est pas activée » ;
    - `copilote.budget_epuise` : « en pause jusqu'à demain » ;
    - `copilote.coupe` : « désactivée » ;
    - une langue rendue autre que `fr` : « Seules les notes en français sont transcrites ».
- **États** (écran `limites`) : ✦ grisé et une explication à la place de la proposition, jamais
  une erreur rouge.
  - « Assistant en pause jusqu'à demain » pour `budget_epuise`, sans montant ;
  - « Désactivé par l'agence » ou « Désactivé » (plateforme) pour `coupe`, selon sa portée ;
  - rien du tout quand `copilote` est faux : le client ne doit même
    pas apprendre qu'un assistant existe.

  Le reste de la messagerie n'est jamais touché.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (wolof en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Aucun appel automatique hors du seuil** : le résumé ne se demande qu'à l'ouverture d'un fil à 10
  non-lus ou plus, une fois par ouverture.
- **Rien ne s'envoie** : « Mettre dans le composeur » remplit le composeur, sans envoyer.
- **Le résumé et la réponse sont propres au lecteur** : jamais mis dans un cache partagé entre
  comptes (clé de requête par fil **et** par utilisateur).
- **Une note vocale n'est demandée qu'une fois par session**, même si la bulle se remonte
  (virtualisation, relecture).
- **Un lecteur sans copilote** (client, bailleur, prestataire, super-admin, impersonation) ne
  déclenche aucune requête vers `…/copilote`.

## Delta à produire

- [ ] Le composant de la grammaire IA (étiquette, cadre, ligne « rien n'est envoyé », avis Utile /
  Pas utile).
- [ ] Le hook d'état du copilote d'un fil (lecture, demande, relecture au signal).
- [ ] « Ce que vous avez manqué » dans la chronologie du fil (`ChatView.tsx`), au séparateur des
  nouveaux messages, avec le renvoi aux messages.
- [ ] ✦ dans l'en-tête (`EnTeteDuFil.tsx`), « Demander au fil » en feuille ou en colonne.
- [ ] Les états en pause, coupé et sans droits.
- [ ] Le bloc de transcription sous `NoteVocale.tsx`, ses états, la demande à l'affichage.
- [ ] Messages `fr` / `en` / `wo`.
- [ ] Tests Vitest :
  - ✦ absent pour un client ;
  - résumé demandé à 10 non-lus et pas à 9, avec le `depuis_message_id` retenu avant la marque de lecture ;
  - signal → relecture ;
  - `budget_epuise` → bandeau « en pause » sans montant ;
  - « Utile » envoie `accepted` ;
  - transcription : absente sans la clé ; demandée une fois quand `etat = aucune` ;
    `ai.role_unassigned` → « pas activée » ; langue `wo` rendue → phrase « en français ».

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px : les écrans `manque`,
  `demander`, `vocal` et `limites` de `fil-copilote` A sont fidèles à la maquette (le faux modèle du SDK, ou
  une suggestion insérée en base de développement, fournit le contenu). Chaque écart est nommé dans
  le ticket.
- [ ] **AC2** — Connecté en locataire dans la même salle, aucune requête `…/copilote` ni
  `…/transcription` dans l'onglet réseau, et ni ✦, ni le mot « assistant », ni bloc sous une note
  vocale à l'écran.
- [ ] **AC3** — Le résumé d'un agent n'apparaît pas chez son collègue du même fil, relevé avec deux
  sessions.
- [x] **AC4** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests
  des fichiers touchés verts. — preuve : CI verte de #1700 sur 2cf49b37f : Web CI 44461750708 (ESLint, tsc, check:i18n, check:vouvoiement, Vitest en 4 shards).

## Hors périmètre

- Le brouillon et les promesses : TCK-2978.
- Les réglages de la console et de l'agence : TCK-2979.
- Le fil « sans assistant » et la mention aux autres participants
  (ADR-0131, « Ce que ça ne règle pas »).

## Notes d'implémentation

Implémenté le 2026-11-19 (agent impl-2977, arbre partagé `feat/le-fil-lots-3-5`), contre le contrat des tickets et
contre le code de TCK-2974 tel qu'écrit à cette date. Aucun fichier de `takussan-api/` touché.

**Livré** :
- `src/lib/queries/copilote.ts` : le seul module du contrat (routes, lecture défensive de l'état, clé de requête
  `['copilote','etat',fil,utilisateur]`, dédoublonnage par session des demandes de résumé — (utilisateur, fil,
  premier non-lu) — et de transcription — (utilisateur, message) —, `SEUIL_DU_RESUME = 10`, `copiloteDuFil` :
  `copilote === true` et jamais sous impersonation, `relaisImpersonationActif()`).
- `src/components/messages/copilote/` : `GrammaireDeLAssistant` (cadre en tirets, « ✦ … », « Visible par vous
  seulement · rien n'est envoyé », Utile / Pas utile — le composant commun que TCK-2978 réutilise),
  `CeQueVousAvezManque`, `DemanderAuFil`, `EtatDeLAssistant`, `TranscriptionDeLaNote`, `CopiloteDuFil`
  (✦ de l'en-tête, écoute de `message.updated` sur le canal personnel), `fenetreDesNonLus`.
- `ChatView.tsx` (blocs marqués TCK-2977) : la fenêtre relevée au premier rendu qui a des messages ; le séparateur
  et le résumé avant le premier non-lu ; ✦ par l'emplacement `assistant` d'`EnTeteDuFil` ; « Demander au fil » ;
  `data-message-id` sur la bulle (renvoi et surlignage) ; la transcription sous `LecteurDeNoteVocale`.
- Clés `messaging.copilote.*` (fr, en, wo = fr), 43 clés.

**Écarts à la prémisse** :
- **Il n'existait aucun séparateur « N nouveaux messages »** dans `ChatView` (grep du 2026-11-19). Il est créé ici, et
  rendu **pour le seul lecteur qui a le copilote** : le reste de la messagerie n'est pas touché.
- **`unread_count` n'est pas rendu par `GET /api/conversations/{id}`** (`whenHas`, seul `index` le compte). La fenêtre
  lit donc le `unread_count` de la LISTE en cache (`['conversations','list',…]`), relevé au premier rendu, avant
  l'effet de `useMarkConversationRead` ; sans la liste (lien direct), `last_read_at` du lecteur (course possible avec
  la marque de lecture, non mesurée). **Ni l'un ni l'autre (lecteur absent des participants chargés) : aucune
  fenêtre** — un compte inconnu ne doit jamais faire passer un fil lu pour chargé, puisque l'API compte depuis
  `depuis_message_id` et non depuis le curseur de lecture. La liste la plus fraîche (`dataUpdatedAt`) l'emporte
  sur une liste filtrée inactive. Le premier non-lu est le N-ième message compté (règle de `NonLus`) depuis le
  plus récent parmi les messages chargés ; l'API rejuge.
- **Forme réelle de l'état** (`ConversationCopiloteController::etat`, `EtatDuCopilote`) : `{data: {conversation_id,
  sortes: {resume: {statut, code?, portee?, suggestion_id?, proposition?}}}}` — `statut`, pas `etat`. Le front lit
  les deux.
- **`copilote` est faux quand TOUTES les fonctions sont coupées** (`GardeDuCopilote::disponiblesParmi` →
  `ReglagesDuCopilote::disponible`) : « Désactivé » / « Désactivé par l'agence » ne s'affichent donc que si une
  autre fonction reste servie. À trancher avec TCK-2974/2979 si l'écran `limites` doit les montrer fil coupé.
- **« Demander au fil » au bureau** est le panneau droit modal de `FeuilleDuBas` (480 px), pas la colonne de
  contexte remplacée en place (`MessagesPage` la monte, hors de ce ticket) : écart de la maquette à relever.
- Un résumé prêt n'est affiché que s'il résume CETTE ouverture (`proposition.depuis_message_id` = le premier non-lu
  relevé) : le dernier résumé du lecteur peut dater d'une ouverture précédente.
- Le surlignage ne vise que les bulles (`MessageBubble`) : une note d'équipe ou une carte citée par le résumé
  défile mais n'a pas d'ancre (`data-message-id` absent de `NoteDEquipe` et `CarteDuFil`).

- L'écoute de `message.updated` (transcriptions) se monte dès qu'un message chargé porte la clé `transcription`, et
  non sur `copilote` : la transcription a son propre interrupteur d'agence (ADR-0131 § 8).

**Tests** : `src/components/messages/__tests__/ChatView.copilote.tck-2977.test.tsx` (9 : sans copilote, 10/9
non-lus, fenêtre relevée avant la marque, remontage, compte inconnu fermé, impersonation, « Mettre dans le
composeur » sans envoi) et `src/components/messages/copilote/__tests__/copilote.tck-2977.test.tsx` (14) verts ;
fichiers existants de ChatView, MessagesPage, EnTeteDuFil et note vocale (15 fichiers, 172 tests) verts. Ablations, une à une, restaurées par md5 : garde `copilote` de
ChatView, `copiloteDuFil` (copilote faux, puis impersonation), garde d'impersonation de la transcription, fenêtre
fermée sur compte inconnu, garde `etat === 'aucune'` de la transcription, dédoublonnage de la transcription et du
résumé, clé par utilisateur, fenêtre du résumé — toutes rouges sans le correctif.

**Non mesuré** : AC1 (relevé au navigateur, 360 et 1280), AC2 et AC3 (deux sessions) — à la session.
`check-front-routes` rougit sur `POST …/messages/{m}/transcription` et `PUT /api/copilote/suggestions/{s}/decision`
tant que TCK-2976 et TCK-2975 ne sont pas fusionnés.

## Reste sur dev

Le code est sur `dev` (#1700, 83f651c16). Il reste :

- AC1 : relevé au navigateur des écrans du copilote, non fait. Il faut un fournisseur d'IA en local, ou le faux modèle du SDK.
- AC2 : relevé réseau d'un locataire, non fait. AC3 : relevé à deux sessions, non fait.
