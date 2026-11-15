---
id: TCK-2861
title: "Messagerie : la bulle de note vocale dessinée (lecture, onde, « 0:23 ») et l'onde à l'enregistrement, « Charger les messages précédents », et la nouvelle conversation qui passe en groupe à deux destinataires (« À : », interrupteur, phrase de pied)"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#20-message-"
tags: [front, messagerie, note-vocale, groupe, audit-ux, app]
---

## Objectif utilisateur

L'agent écoute une note vocale comme sur WhatsApp, voit qu'il enregistre, remonte un fil à son rythme, et crée un groupe simplement en choisissant deux personnes.

## Contrat de données

Aucun endpoint neuf : messages audio (ADR-0038, `metadata.duration`), pagination des messages (`GET conversations/{c}/messages`), création de fil direct ou de groupe (`POST /api/conversations`).

Relevé (audit-f3-coque.md, app-messagerie e0, e1, e3, e5 ; « Écarts couverts » 4 à 7) : `ChatView.tsx:632-654` (`VoiceNotePlayer` = `<audio controls>` natif + « N s ») ; `VoiceNoteRecorder.tsx:162` (« l'onde n'est pas dessinée ») ; `ChatView.tsx:447-458` (défilement infini à sentinelle au lieu du bouton) ; `ConversationList.tsx:211-219` (« Chargement… ») ; `NouvelleConversation.tsx:55-57` (le commentaire assume l'absence de bascule automatique), `:251-276` (interrupteur), téléphone : rangée à chevron vers `NewGroupDialog`, pas de « À : », pas de phrase de pied.

Le lecteur réutilisable de note vocale est extrait par **TCK-2901** (famille 4, ADR-0113) : s'il est livré, la bulle le compose ; sinon ce ticket dessine la bulle et TCK-2901 la reprendra. Ne pas créer deux lecteurs.

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-messagerie.tsx`, approche a :

- **e1 « Fil »** et **e5 « Groupe et note vocale »**, **les deux formats** : bulle vocale = rond de lecture, **forme d'onde**, durée « 0:23 » (l. 106 et le rendu des bulles) ; en tête du fil, le bouton **« Charger les messages précédents »** (l. 222) au lieu du chargement automatique.
- **e5**, composeur en enregistrement et en écoute : l'**onde** à côté de « m:ss / 1:00 ».
- **e0 « Liste »** : le texte de pagination « Chargement des conversations plus anciennes… » (l. 414, 626).
- **e3 « Nouvelle conversation »** :
  - **téléphone** : le champ précédé de « À : » (l. 750) ; « Créer un groupe » est un **interrupteur** dans la feuille (et non une rangée vers un autre dialogue) ; la phrase de pied « Vous pouvez écrire aux clients, aux propriétaires et aux collègues de {agence}. » (l. 780) ;
  - **bureau** : sous l'interrupteur, l'aide « Activé d'office à partir de deux destinataires. » (l. 828) ;
  - **les deux** : choisir une personne la pose en puce ; une **deuxième** puce active d'elle-même le mode groupe (nom, bien, bail rattachés) ; une seule puce + « Écrire » ouvre (ou crée) le fil direct.

## Contraintes strictes (métier)

- L'onde de lecture est calculée côté navigateur depuis le fichier (aucune donnée neuve demandée à l'API) ; à défaut (décodage impossible), une onde neutre, jamais une bulle vide.
- La bulle reste utilisable au clavier (lecture/pause nommée) et annonce sa durée.
- « Charger les messages précédents » conserve la position de lecture après chargement.
- Le passage en groupe garde les puces déjà choisies ; retirer une puce sous deux repasse en direct.
- Les tests existants de `VoiceNoteRecorder` et du composeur gardent leurs attentes (le bouton envoyer, la borne de 60 s).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Bulle vocale dessinée ; onde au composeur.
- [ ] Bouton « Charger les messages précédents » ; texte de pagination de la liste.
- [ ] Nouvelle conversation : « À : », puces, bascule automatique, interrupteur au téléphone, aide, phrase de pied.
- [ ] Tests : bulle avec « 0:23 » et bouton de lecture nommé ; bouton de chargement qui appelle la page précédente ; deux puces → mode groupe et champ « Nom du groupe » ; une puce → fil direct.

## Critères d'acceptation

- [ ] AC1 — Un message audio de 23 s rend une bulle sans élément `<audio controls>` visible, avec un bouton « Lire » et « 0:23 ».
- [ ] AC2 — En enregistrement, le composeur rend une onde (élément qui se met à jour) à côté du chronomètre.
- [ ] AC3 — Fil de 60 messages : seuls les derniers sont rendus avec, en tête, « Charger les messages précédents » ; le toucher charge la page précédente sans déplacer le message lu à l'écran.
- [ ] AC4 — Nouvelle conversation à 1440 : choisir Malick puis Awa active l'interrupteur « Créer un groupe » sans geste de plus ; à 390, le champ est précédé de « À : » et la phrase de pied est rendue.
- [ ] AC5 — Vérifier au navigateur (audit, non vérifiables) une vraie note vocale dans un fil (lecture, durée), et les lignes de détail des sections de « Nouvelle conversation » au téléphone (bien · ville, rôle · agence, « N biens gérés ») sur des données qui les produisent — corriger si absentes.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2861.json` : app-messagerie e0, e1, e3, e5, téléphone et bureau, avec une note vocale réelle dans le fil.
- [ ] AC-F2 — Zéro écart non expliqué ; ni la bulle ni l'onde ne sont rangées en « donnée » ou « technique » ; « Créer un groupe » et la phrase de pied ne sont plus des « décisions produit » non validées.

## Hors périmètre

- Le contexte, le menu « ⋯ », la coche « Lu » : TCK-2860. L'enregistreur hors messagerie : TCK-2901.

## Notes d'implémentation

_(à remplir par implementing-specs)_
