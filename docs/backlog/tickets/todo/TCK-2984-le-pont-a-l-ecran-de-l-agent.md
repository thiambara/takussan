---
id: TCK-2984
title: "Le pont à l'écran de l'agent (fil-pont D) : qui est joint par quoi, la fenêtre de 24 h et le message type, « Joindre par WhatsApp », l'état des relais, la trace du lien sur la carte"
status: todo
phase: P2
family: front
estimate: L
wave: 98
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2980, TCK-2981, TCK-2982]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, pont, whatsapp, non-fuite, i18n, maquette, adr-0132]
---

## Objectif utilisateur

- **Le personnel de l'agence**, dans un fil : il voit qui lit dans Takussan et qui est joint par WhatsApp, si la
  fenêtre de 24 h est ouverte et pour combien de temps, par où chacun de ses messages est parti et s'il est arrivé,
  et, sur une carte, si le lien a été envoyé, ouvert, utilisé. Il joint par WhatsApp un participant qui n'ouvre
  pas Takussan, et, fenêtre fermée, il sait que son message partira en message type (un extrait), et pourquoi.
- **Tout autre lecteur** (locataire, bailleur, prestataire connectés) : il ne voit rien du pont : ni le canal
  d'un message d'un autre (l'auteur seul voit le sien), ni les avis du pont, ni numéros, ni relais.

## Contrat de données

- `MessageResource` : `channel` (chaîne libre déclarée par le pilote — `app`, `whatsapp`, `sms` aujourd'hui,
  d'autres demain, ADR-0132 § 0 — pour le personnel de l'agence du fil et l'auteur seuls). Le front a un libellé et
  une icône pour les canaux connus et un rendu générique (« par une autre messagerie ») pour une valeur inconnue :
  un canal neuf ne casse pas l'écran ; `relays`
  (`[{user_id, channel, form, status, at}]`) et, sur une carte ou un événement, `action_link`
  (`{sent_at, opened_at, used_at, expires_at}`) — **présents pour le seul personnel de l'agence du fil**
  (TCK-2981, TCK-2982).
- `GET /api/conversations/{id}/context` : par participant, `pont`
  `{joint, accord_at, opposition_at, fenetre_jusqu_a, invitable}` pour ce même lecteur seulement (TCK-2981).
- `POST /api/conversations/{id}/pont/invitations` `{user_id}` ou `{customer_id}` ; refus 422 à code
  (`pont.not_participant`, `pont.no_phone`, `pont.invalid_phone`, `pont.opted_out`, `pont.already_joined`,
  `pont.customer_not_in_room`, `pont.numero_deja_a_un_compte`) (TCK-2981). Une personne déjà d'accord sur ce
  numéro est jointe d'emblée, sans invitation : l'écran le dit (« jointe », pas « invitation envoyée »).
- Avis à code : `pont.stop`, `pont.start`, `pont.accord`, `pont.media_non_relaye`, `pont.numero_deja_a_un_compte`
  (TCK-2980, TCK-2981), écrits en `visibility = team` (le personnel seul les reçoit), composés par le front comme
  les autres avis (`useTexteMessageSysteme`).
- Le socle temps réel (ADR-0129) rafraîchit le fil sur `message.created` ; l'état d'un relais se relit à la
  relecture du fil (aucun signal neuf n'est demandé).

## Direction UX / Artistique

- **Référence de fidélité** : maquette `fil-pont`, approche **D** (locale, jamais commitée), écrans « Agent ·
  fil, canaux, fenêtre ouverte », « Agent · fenêtre de 24 h fermée » et la partie consentement de « Agent ·
  stop svp » ; téléphone et bureau. Sur le bureau, le panneau « Participants et canaux » ; au téléphone, des
  puces de participants sous l'en-tête.
- **Le canal se lit sans légende** : une puce WhatsApp discrète sur le nom et sur les messages relayés ou reçus
  par WhatsApp ; l'état d'un message relayé en petit (envoyé, remis, lu, échec, « renvoyé par SMS »), dans la
  même grammaire que les accusés existants.
- **La fenêtre** : un bandeau calme quand elle est ouverte (« lit sur WhatsApp, fenêtre ouverte encore … ») ; un
  bandeau d'attention quand elle est fermée, et le composeur le dit : **ce qu'il écrit partira en message type**
  (un extrait, avec le nom de l'agence ; TCK-2981 relaie par le gabarit `pont_nouveau_message`), et la réponse de
  la personne rouvre la fenêtre. La maquette propose de choisir parmi plusieurs messages types : non retenu, un
  seul gabarit relaie tout message (ADR-0132 § 4).
- **STOP** : la puce de la personne barrée, « WhatsApp coupé par la personne », la date ; aucun bouton pour
  passer outre.
- **« Joindre par WhatsApp »** : dans le panneau des participants, sur une personne `invitable` ; l'état
  « invitation envoyée, en attente d'accord » ; les refus dits par leur code.
- **La carte** : sa trace (lien envoyé · ouvert · fait, avec l'heure) sous la carte, pour le personnel seul.
- La note d'équipe garde son traitement de TCK-2968 ; rien du pont n'apparaît sur une note.
- Vouvoiement ; `fr`, `en`, `wo` (= le français, wolof en pause).

## Contraintes strictes (métier)

- **Rien du pont pour un lecteur qui n'est pas personnel** : le front n'affiche `relays`, `pont`, `action_link`
  que si la réponse les porte, et ne déduit jamais un canal d'un autre champ.
- **Aucun numéro de téléphone** à l'écran, dans aucune vue du pont.
- Fenêtre fermée, le composeur ne promet pas un envoi tel quel : il annonce le message type ; il n'invente aucun
  autre gabarit.
- L'invitation : désactivée pendant l'envoi, un seul appel.

## Delta à produire

- [ ] Puces et panneau des participants avec leur canal, l'accord, l'opposition, la fenêtre.
- [ ] Bandeau de la fenêtre ; annonce du message type dans le composeur quand elle est fermée pour un destinataire
  joint.
- [ ] « Joindre par WhatsApp » et ses refus.
- [ ] État des relais sur les messages du personnel ; puce « par WhatsApp » sur les messages reçus.
- [ ] Trace du lien sur la carte.
- [ ] Libellés des avis `pont.*` dans `useTexteMessageSysteme`.
- [ ] Tests (Vitest) : rendu pour le personnel et pour le locataire depuis la même réponse de test augmentée ;
  annonce du message type fenêtre fermée ; invitation et ses refus ; chaque avis `pont.*`.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px, contre la maquette `fil-pont` D : fil avec
  un participant joint par WhatsApp, fenêtre ouverte puis fermée, STOP, carte avec sa trace.
- [ ] **AC2** — Le locataire connecté au même fil ne voit ni panneau des canaux, ni état des relais, ni trace de
  lien, ni bouton « Joindre ». *Ablation : afficher les relais sans tester leur présence dans la réponse, sur une
  réponse de test qui les porte pour le locataire — rouge.*
- [ ] **AC3** — Fenêtre fermée pour un destinataire joint, le composeur annonce que le message partira en message
  type ; fenêtre ouverte, il ne l'annonce pas (jugé sur `fenetre_jusqu_a`). *Ablation : annoncer sans lire
  `fenetre_jusqu_a` — rouge.*
- [ ] **AC4** — Aucun numéro de téléphone n'apparaît dans le DOM du fil (relevé et test).
- [ ] **AC5** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests des fichiers
  touchés verts.

## Hors périmètre

- Trancher un refus qui n'est pas un STOP exact (« stop svp ») : non retenu (ADR-0132).
- Le résumé du lundi dans le panneau (la maquette le montre ; il se règle dans les préférences du bailleur,
  TCK-2983).
- Médias relayés, réponse par SMS.

## Notes d'implémentation

_(à remplir par implementing-specs)_
