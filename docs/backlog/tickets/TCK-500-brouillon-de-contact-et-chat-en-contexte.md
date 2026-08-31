---
id: TCK-500
title: "Contact d'un bien — brouillon pré-rempli et ouverture du chat en contexte"
status: review
phase: P2
family: full
estimate: M
wave: 57
created: 2026-08-31
updated: 2026-08-31
depends_on: []
blocks: [TCK-501, TCK-502]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#3-property
tags: [full, messaging, property-detail, contact, ux, bug]
---

## Objectif utilisateur

Un visiteur connecté qui clique « Envoyer un message » sur un bien se retrouve **dans le chat**,
devant un message déjà rédigé qu'il lui reste à ajuster ou à envoyer — au lieu d'une boîte de
dialogue et d'une page blanche à remplir.

## Contrat de données

**À créer — un seul endpoint, en lecture seule :**

`GET /api/public/properties/{slug}/conversation` (authentifié) répond, pour le couple
*(bien, utilisateur courant)* :

- l'identifiant de la conversation existante, ou son absence explicite ;
- si l'utilisateur est en droit d'écrire à propos de ce bien (il existe un destinataire, et ce
  n'est pas lui-même) ;
- de quoi composer le brouillon et l'en-tête du fil sans second appel : le bien (titre,
  référence, slug) et le destinataire (nom, avatar).

**Existants, consommés tels quels :**

- `POST /api/public/properties/{slug}/contact-message` — crée la conversation *et* poste le
  message. C'est lui, et lui seul, qui écrit.
- `POST /api/public/properties/{slug}/contact-lead` — chemin anonyme, inchangé.
- `GET /api/conversations/{id}` et `GET /api/conversations/{id}/messages` — dès que la
  conversation existe.

Modèles impliqués : `Conversation` (porte déjà `property_id`), `ConversationParticipant`,
`Message`, `Property` — cf. `spec_refs`.

## Direction UX / Artistique

**Le geste de référence est le pré-rempli WhatsApp** : le champ contient déjà une phrase, le
curseur est dedans, on envoie d'un geste ou on réécrit tout. Rien n'est verrouillé, rien n'est
imposé.

Le message par défaut est **court** : salutation, titre du bien entre guillemets, sa référence,
une question de disponibilité. Ni prix ni ville — le prix vieillit mal une fois inscrit dans un
fil, et la conversation porte déjà le bien.

**On ne quitte pas le bien qu'on est en train de regarder.** Au-dessus du point de rupture `md`,
le chat s'ouvre par-dessus la fiche, qui reste visible et consultable derrière. En dessous, la
surface flottante ne tient pas : on bascule sur la messagerie pleine page, avec le même bien en
contexte et le même brouillon.

Le fil s'ouvre **vide, avec le bien nommé en en-tête** et son lien de retour : la conversation
n'a pas encore commencé, et l'écran doit le dire — pas de faux message système, pas de bulle
fantôme.

**Le brouillon ouvre une discussion, il n'en continue pas une.** Sur un fil qui existe déjà, on
ouvre l'historique et le champ reste vide : retrouver « Bonjour, je suis intéressé(e) par… » au
quatrième échange avec le même agent est absurde.

## Contraintes strictes (métier)

1. **Aucune conversation n'est créée avant l'envoi.** Ouvrir le chat, le refermer, recharger la
   page ne laisse rien en base et ne notifie personne. La conversation naît du premier message,
   par le chemin d'écriture existant.
2. **L'endpoint de résolution n'écrit rien** — pas de création, pas de `lockForUpdate`, pas de
   notification.
3. **Le destinataire et la recherche du fil existant sont calculés par un seul code**, partagé
   avec le chemin d'écriture. Deux calculs divergents ouvriraient un fil et livreraient le
   message dans un autre.
4. **Le texte du message ne transite jamais par l'URL** : seul l'identifiant du bien voyage, et
   le message est reconstruit à l'arrivée. Un lien forgé ne doit pas pouvoir pré-écrire un
   message dans le composeur de quelqu'un d'autre.
5. **Un utilisateur ne peut pas s'écrire à lui-même** : l'accès au contact n'est pas proposé
   quand l'utilisateur est le destinataire calculé du bien, ni quand aucun destinataire n'existe.
6. **Le contact anonyme reste sans friction** : le chemin visiteur garde son formulaire et son
   absence de compte requis. Il gagne le brouillon, rien d'autre.
7. **Un bien non public ou en brouillon reste introuvable** par l'endpoint de résolution, à
   l'identique du chemin d'écriture.
8. **Le texte affiché appartient au front** : le message par défaut est rédigé en `fr`/`en`/`wo`,
   jamais émis par l'API (principe non négociable n°5).
9. **Sparse fieldsets** sur toute lecture depuis le front.

## Delta à produire

**Backend**

- [ ] Service `App\Services\Conversation\PropertyConversationResolver` — extrait tel quel de
      `PublicPropertyController::contactMessage()` : `recipientFor(Property): ?User` (le
      collaborateur `CollaboratorRole::Agent`, à défaut le propriétaire) et
      `existingConversation(Property, User $user, User $recipient): ?Conversation`.
- [ ] `PublicPropertyController::contactMessage()` refactorisé pour consommer le service —
      **aucun changement de comportement observable**.
- [ ] Route `GET public/properties/{slug}/conversation` → `PublicPropertyController::conversation`,
      nom `properties.conversation`, derrière l'authentification.
- [ ] `PublicPropertyController::conversation()` : `conversation_id` (ou `null`), `can_message`,
      `property`, `recipient`.
- [ ] Correctif : `contactMessage()` renvoie `redirect_to` = `/app/messages?conversation={id}`
      (aujourd'hui `/messages/{id}`, route inexistante côté front).
- [ ] Tests `tests/Feature/Public/PropertyConversationResolveTest.php` — 6 scénarios : aucun fil,
      fil existant, destinataire = collaborateur agent, destinataire = propriétaire par défaut,
      `can_message=false` sur son propre bien, 401 anonyme, 404 sur bien non public.
- [ ] Test ajouté à `PropertyContactMessageTest` : le destinataire annoncé par la résolution est
      celui à qui le message est effectivement livré.

**Frontend**

- [ ] Le clic connecté sur « Envoyer un message » n'ouvre plus de boîte de dialogue : il ouvre le
      chat, sur place au-dessus du point de rupture `md`, sur la messagerie pleine page en dessous.
- [ ] Construction du message par défaut à partir du titre et de la référence du bien, traduit
      `fr`/`en`/`wo`, posé comme **valeur** modifiable du champ — pas comme indication.
- [ ] État « conversation pas encore née » dans la vue de chat : en-tête du bien, fil vide,
      envoi par le chemin d'écriture existant, puis bascule sur la conversation réelle.
- [ ] La pièce jointe n'est pas proposée tant que la conversation n'existe pas — le chemin
      d'écriture n'accepte qu'un texte.
- [ ] Fil déjà existant : ouverture de l'historique, champ vide.
- [ ] Correctif : « Envoyer un message » n'est pas proposé quand `can_message` est faux.
- [ ] Chemin anonyme : le formulaire existant reçoit le même message par défaut.
- [ ] Tests : construction du message dans les 3 locales ; valeur par défaut posée une fois et non
      ré-imposée après édition ; clic connecté au-dessus du point de rupture (chat ouvert,
      brouillon présent, **aucune requête d'écriture émise**) ; clic en dessous (navigation vers la
      messagerie, **aucun texte de message dans l'URL**) ; envoi depuis l'état neuf ; fil existant
      → champ vide.

## Critères d'acceptation

- [ ] **AC1** — Connecté, sur un bien dont il n'a jamais parlé, au-dessus du point de rupture
      `md` : le clic ouvre le chat par-dessus la fiche, en-tête au titre du bien, fil vide, et le
      bouton d'envoi est **actif sans que rien n'ait été saisi** — la phrase est une valeur, pas
      une indication.
- [ ] **AC2** — Pendant tout ce temps, `conversations`, `conversation_participants` et `messages`
      comptent exactement le même nombre de lignes qu'avant le clic, et le destinataire n'a reçu
      aucune notification. Refermer le chat ou recharger la page ne change rien à ce compte.
- [ ] **AC3** — Le texte est intégralement remplaçable : après l'avoir effacé et réécrit, c'est le
      texte de l'utilisateur qui part, et le défaut ne revient pas se réinstaller.
- [ ] **AC4** — L'envoi crée **exactement une** conversation portant le `property_id` du bien,
      l'utilisateur et le destinataire en participants, et un message. L'écran bascule sur cette
      conversation sans rechargement.
- [ ] **AC5** — Un second clic sur « Envoyer un message » depuis la même fiche rouvre **ce** fil,
      historique visible, champ vide, et ne crée pas de seconde conversation.
- [ ] **AC6** — Sur un bien dont le collaborateur agent diffère du propriétaire, le destinataire
      annoncé par la résolution et celui qui reçoit le message sont le **même** utilisateur.
- [ ] **AC7** — En dessous du point de rupture `md`, le clic mène à la messagerie pleine page avec
      le bien en contexte et le même brouillon, et l'URL ne contient **que** l'identifiant du
      bien : aucun fragment du texte du message n'y figure.
- [ ] **AC8** — L'agent (ou le propriétaire) d'un bien ne se voit pas proposer « Envoyer un
      message » sur son propre bien. Aujourd'hui, il rédige puis reçoit un 422.
- [ ] **AC9** — Après un envoi, la destination annoncée par l'API répond 200. Aujourd'hui
      `/messages/{id}` répond 404.
- [ ] **AC10** — Visiteur anonyme : le formulaire de contact s'ouvre comme avant, sans compte
      requis, et son champ message contient le même texte par défaut modifiable.
- [ ] **AC11** — Le message par défaut s'affiche traduit en `fr`, `en` et `wo` ; aucune clé brute
      n'apparaît, et le titre du bien y survit intact qu'il contienne guillemets ou apostrophes.
- [ ] **AC12** — La pièce jointe n'est pas proposée dans l'état « conversation pas encore née »,
      et redevient disponible dès le premier message envoyé.
- [ ] **AC13** — Chaque test de ce ticket rougit quand on retire le correctif qu'il garde
      (vérification par ablation, consignée dans les notes d'implémentation).

## Hors périmètre

- **Persistance du brouillon.** Fermer le chat sans envoyer perd le texte ; le rouvrir le
  reconstruit à l'identique. Rien n'est stocké.
- **Variante plein écran de la surface flottante sur mobile.** En dessous du point de rupture, on
  navigue vers la messagerie pleine page, comme le fait déjà l'accès flottant.
- **Pièces jointes au premier message** — supposerait d'élargir le chemin d'écriture.
- **Brouillon sur les autres surfaces de contact** (fiche d'agent, fiche d'agence) : ce ticket ne
  traite que le contact depuis un bien.
- **Choix du destinataire.** La règle actuelle (collaborateur agent, à défaut propriétaire) est
  reprise telle quelle, elle n'est pas rediscutée.
- **Temps réel.** Les cadences d'interrogation existantes ne changent pas.

## Notes d'implémentation

**Trois écarts au plan, chacun pour une raison mesurée.**

1. **Le service vit dans `App\Services\Messaging\`, pas dans un namespace `Conversation` neuf.**
   `Messaging/` existait déjà (`GroupConversationService`, `SystemMessageFactory`) ; ouvrir un
   second toit pour la même matière aurait été un choix de plan contre un choix de dépôt.

2. **`contactLead` passe aussi par le service, alors que le ticket ne le demandait pas.** Le calcul
   du destinataire y était écrit une **troisième** fois, à l'identique, 90 lignes plus bas. Un
   service qui prétend être la source unique pendant qu'une copie survit ne garde rien : c'est
   exactement le motif que la classe existe pour fermer. Trois lignes, aucun changement de
   comportement, couvert par `PropertyContactLeadTest` et `AgentContactLeadTest` (verts).

3. **Pas de `ChatComposer` partagé — seulement `ChatComposerShell`, une coque de mise en forme.**
   Les deux composeurs n'ont presque rien en commun : l'un poste sur `/conversations/{id}/messages`
   avec react-hook-form et sait joindre un fichier, l'autre appelle `contact-message` et n'accepte
   qu'un texte (AC12). Mutualiser la logique aurait demandé un composant à drapeaux décrivant deux
   comportements. La coque garantit l'allure ; chacun garde sa mécanique.

**Deux corrections imposées par des gardes du dépôt, et les deux avaient raison sur le fond :**

- `react-hooks/set-state-in-effect` a refusé la première version de `ChatWidget`, qui recopiait la
  cible du contexte dans un état local. La cible est désormais **dérivée au rendu**. Deux sources
  pour un même fait se désynchronisent — et c'est précisément ce qui est arrivé au bouton
  « retour ».
- `react-hooks/refs` a refusé le brouillon calculé dans un `useRef` lu au rendu. Un initialiseur
  paresseux de `useState` fait le même travail, en une ligne de moins.

**Deux défauts trouvés au navigateur, invisibles en test :**

- **Le bouton « retour » refermait tout le panneau** au lieu de revenir à la liste. Quand le
  panneau est ouvert depuis une fiche de bien, `open` reste `false` : c'est la cible seule qui le
  tient ouvert, et la consommer le faisait disparaître. Gardé par
  `ChatWidget.test.tsx` › « retour » revient à la liste.
- **La résolution restait en cache 30 s après un envoi** (`staleTime`), si bien qu'un second clic
  sur « Envoyer un message » dans cette fenêtre reposait le brouillon par-dessus une conversation
  déjà créée. Passé le délai, l'écran se corrigeait tout seul — d'où l'invalidation explicite de
  `propertyConversationQueryKey` après l'envoi, et sa garde dans
  `PropertyDraftChatView.test.tsx`. *Un défaut qui disparaît en trente secondes ne se reproduit
  pas à la demande : il lui faut un test, pas une note.*

**Mesures prises sur la base de développement le 2026-08-31** (837 biens, 300 utilisateurs) :
quatre appels à `.../conversation` laissent `conversations`, `conversation_participants` et
`messages` à 240 / 920 / 3590 — inchangés. Un envoi les porte à 241 / … / 3591. `redirect_to` rend
`/app/messages?conversation=241`, qui répond 307 vers la connexion (route réelle) là où l'ancien
`/messages/241` rend **404** après redirection de locale.

**Deux découvertes hors périmètre, filées en tickets** : [TCK-501] (la messagerie pleine page
impose deux panneaux fixes sur un écran de téléphone — préexistant, mais ce ticket en fait le
chemin mobile nominal) et [TCK-502] (la carte de contact nomme le propriétaire, le message part au
collaborateur `agent` — et « l'agent principal » n'est défini par aucun ordre).

**Vérification par ablation (AC13)** — six correctifs cassés un par un, chacun fait rougir son test
et lui seul : la clé `wo` du brouillon, `findExisting` remplacé par `firstOrCreate`, le brouillon
ramené à un champ vide, un `&draft=` ajouté à l'URL mobile, le `setOpen(true)` du retour, et
l'invalidation après envoi.
