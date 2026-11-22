---
id: TCK-2736
title: "Messagerie : l'URL signée d'une pièce jointe ne reste pas lisible 30 minutes après le départ d'un membre"
status: done
phase: P1
family: full
estimate: S
wave: 87
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2631]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#20-message-"
tags: [back, front, messagerie, media, securite, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Le participant retiré d'une conversation, ou celui qui a quitté l'agence, ne peut plus ouvrir les photos, les PDF ni
les notes vocales du fil, même avec un lien qu'il avait déjà reçu.

## Contexte

Relevé à la vérification de TCK-2631 et accepté pour le lot avec un « suivi à écrire » (journal du lot 1,
`docs/plans/2026-11-11-audit-ux-app-implementation.md`). Re-mesuré dans le code le 2026-11-11 :

- `MessageResource::attachments()` émet `url` et `thumbnail_url` par `PrivateMediaAccess::signedUrl()`, sans
  échéance passée. L'échéance est donc `SIGNED_ROUTE_TTL_MINUTES = 30`.
- La route `media.private.show` (`routes/api/media.php`) est **hors `auth:sanctum`** : la signature tient lieu
  d'autorisation. C'est le choix de TCK-539, et celui de la note vocale
  ([ADR-0038](../../../adr/0038-note-vocale-dans-la-messagerie.md)), qui vit dans la même collection
  `attachments`.
- Un membre retiré ne reçoit plus d'URL neuve (403 sur `GET …/messages`), mais **une URL déjà émise reste lisible
  jusqu'à 30 minutes** par qui la détient.
- `features.md` §1.7 dit cet écart depuis la passe du lot 1 (⚠).

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tout »).**

- **(a) Une échéance courte pour la collection `attachments`** : 5 minutes, comme l'URL présignée de
  `PrivateMediaAccess::redirect()`. Le front relit le fil quand une pièce rend 403 à l'ouverture. La fenêtre passe de
  30 à 5 minutes. Elle n'est pas fermée.
- **(b) Une route authentifiée pour les pièces jointes**, qui rejuge à chaque lecture la participation actuelle
  (`ConversationAccess`). La fenêtre est fermée. En contrepartie, un `<img>` ou un `<audio>` ne porte pas le jeton
  Sanctum : il faut un route handler BFF côté front qui relaie la session, et une décision sur la mise en cache.
- **(c) Statu quo**, écrit dans la spec.

## Contrat de données

Aucune colonne. Option (a) : `signedUrl($media, now()->addMinutes(N))` dans `MessageResource`, N en constante
nommée. Option (b) : une route `GET /api/conversations/{conversation}/attachments/{media}` sous `auth:sanctum`,
gardée par la policy de la conversation.

## Contraintes strictes (métier)

- Un fichier privé ne sort que par `PrivateMediaAccess` après l'autorisation (règle 2 des médias,
  `takussan-api/CLAUDE.md`). Jamais `getUrl()` sur un média privé.
- Les autres ressources qui signent (`DocumentResource`, `InventoryResource`, `MaintenanceRequestResource`…) gardent
  leur échéance. Le ticket ne touche que la messagerie.
- Pour (a), la note vocale suit la même échéance : elle est dans la même collection.

## Delta à produire (option a)

- [ ] `MessageResource::attachments()` : échéance courte pour `url` et `thumbnail_url`
- [ ] Front : une pièce jointe dont l'ouverture rend 403 relit le fil (nouvelle URL), sans message d'erreur au
      participant actuel
- [ ] Tests API : `MessageAttachmentSignedUrlTest` — l'URL expire à l'échéance courte

## Critères d'acceptation (option a)

- [ ] AC1 — Une URL de pièce jointe émise à T est refusée (403) à T + échéance + 1 s (`travelTo`), et lisible à
      T + échéance − 1 s
- [ ] AC2 — Les URL signées d'un document du coffre gardent 30 minutes (témoin : la règle ne déborde pas)
- [ ] AC3 — Ablation : remettre l'échéance par défaut rougit AC1 et laisse AC2 vert

## Hors périmètre

- L'antivirus des pièces jointes (ardoise D-73)
- Les URL présignées R2 de `redirect()` (5 minutes, inchangées)

## Notes d'implémentation

_(À remplir pendant l'implémentation.)_

Vérification (2026-11-11) — API acceptée par verif-patrimoine (06188fe65), front accepté par verif-commercial
au navigateur (935adb23d) ; trous de test fermés (fa013e886 : le membre retiré ; l'âge qui repart sur l'URL neuve).
- **Fenêtre réelle sur R2 : jusqu'à ~10 min, pas 5.** Le lien signé ouvert à T+4:59 redirige vers une URL
  présignée R2 de 5 min émise au clic (`PrivateMediaAccess::redirect()`, hors périmètre de ce ticket) : un
  membre retiré peut donc lire le fichier jusqu'à ~T+10. Les tests ne le voient pas (disque local servi
  directement). À porter au porteur si la fenêtre doit être stricte.
- Une relecture du fil re-signe toutes les pièces et coupe une note vocale en cours de lecture (mesuré : 2,5 s → 0) ;
  c'était déjà vrai au retour de focus. Sur un fil devenu illisible, un onglet blanc s'ouvre brièvement puis se
  referme. Le clic du milieu ouvre l'ancienne URL (limite documentée dans PieceJointeDuFil).
