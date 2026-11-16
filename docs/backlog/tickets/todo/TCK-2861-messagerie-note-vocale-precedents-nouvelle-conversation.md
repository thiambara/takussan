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

### Livré (2026-11-15)

- **Bulle vocale** : `takussan-web/src/components/messages/NoteVocale.tsx` (module ISOLÉ pour TCK-2901 : `Onde`, `minutesSecondes`, `useOndeDuFichier`, `useNiveauxDuMicro`, `LecteurDeNoteVocale`). Rond « Lire »/« Pause » (état lu sur les événements `play`/`pause`/`ended` de l'élément, pas sur le clic : le hook TCK-2736 relance seul après une URL périmée), onde qui se remplit, « 0:23 » depuis `metadata.duration` (MediaRecorder rend souvent `duration = Infinity`). L'onde est décodée dans le navigateur (`fetch` + `decodeAudioData`), mise en cache par **id de pièce** (pas par URL : chaque relecture du fil signe une URL neuve) ; sans `AudioContext` aucune requête, onde neutre de 28 barres. Un échec du dessin ne passe jamais par `relirePiece`.
- L'élément `<audio>` (sans `controls`, caché) reste **écrit dans `ChatView.tsx`** par une prop `rendreAudio` : `check-eslint-suppressions` refuse une entrée neuve, et le gel `media-has-caption` est au nom de `ChatView.tsx`. TCK-2901 devra trancher (sous-titres / transcription) en sortant le lecteur.
- **Composeur** : l'onde à côté de « m:ss / 1:00 » — niveaux mesurés du micro (`AnalyserNode`, relevé 100 ms, contexte fermé à l'arrêt/rejet/démontage) ; en écoute, la note réduite à ses crêtes, remplie avec la lecture. Sans `AudioContext`, onde neutre qui avance avec le chronomètre. Le commentaire « l'onde n'est pas dessinée » est remplacé. Les tests TCK-2632 de l'enregistreur sont inchangés et verts.
- **« Charger les messages précédents »** : bouton en tête du fil, rendu seulement s'il y a une page précédente (plus de sentinelle `aria-hidden`). Position conservée par `scrollTop + (scrollHeight après − avant)` relevés AU CLIC ; le fil « collé en bas » est décollé le temps du chargement. Vaut aussi pour le widget flottant (même `ChatView`).
- **Liste** : « Chargement des conversations plus anciennes… » (clé neuve `messaging.list.chargementPlusAnciennes` ; `chat.loadingMore` reste celle du fil).
- **Nouvelle conversation** : champ « À » à puces aux deux formats (« À : » en rangée au téléphone, champ encadré « À » + aide au bureau), interrupteur « Créer un groupe » aux deux formats (au téléphone il remplace la rangée vers `NewGroupDialog`), aide « Activé d'office à partir de deux destinataires. » au bureau, phrase de pied au téléphone. Règle d'état : 2 puces → groupe ; retirer sous 2 → direct (même si l'interrupteur avait été allumé à la main) ; allumé à la main avec 0-1 puce → formulaire de groupe ; à ≥ 2 puces, `readOnly`. Une puce + « Écrire » → `useTrouverLeFilDirect` (fil existant ou brouillon). Une personne en puce n'est plus proposée. Au bureau, en groupe, la liste ne paraît qu'à la recherche.

### Décisions

- **Fail-closed (TCK-645)** : sans `onNouveauGroupe` (l'espace ne propose pas de groupe), pas de puces ; toucher une personne ouvre son fil comme avant — une deuxième ne peut jamais produire un groupe.
- **Phrase de pied** : seulement si `useNomDeLAgenceActive()` rend un nom ; sans agence, elle serait fausse et n'est pas rendue. Vérifié : seul `AgentProfileResource` sert `agency_id` — un profil bailleur n'a pas d'agence, la phrase ne lui paraît pas.
- La troncature « N sur M — précisez la recherche » se juge sur ce que le serveur a rendu, pas sur la liste privée des puces (sinon toute liste dont une personne est en puce se dirait tronquée).

### À relever au navigateur

- L'onde télécharge chaque note à l'ouverture du fil (l'élément est en `preload="none"`, le dessin non) et ouvre un `AudioContext` par bulle, fermé après décodage. Le CORS de l'URL signée décide si l'onde est réelle ou neutre.

### Écarts à la prémisse

- Lignes citées re-mesurées : `ChatView.tsx:632-654` (lecteur natif), `VoiceNoteRecorder.tsx:162` (commentaire), `ChatView.tsx:447-458` (sentinelle), `ConversationList.tsx:211-219`, `NouvelleConversation.tsx:55-57` / `:251-276` — conformes.
- TCK-2901 n'est pas livré : la bulle est dessinée ici, dans un module isolé.

### Tests dont l'attente change (voulu)

- `NouvelleConversation.tck-2632` : « Créer un groupe ferme ce dialogue et ouvre la création » → c'est un interrupteur de la feuille.
- `NouvelleConversation.groupe.tck-2748` : personnes choisies dans la liste sous « À » (plus le menu d'un sélecteur) ; au téléphone, interrupteur au lieu de la rangée vers `NewGroupDialog`.
- `NouvelleConversation.sections.tck-2830` (dernier cas) : en groupe au bureau, la ligne de détail se lit dans la liste de recherche sous « À ».

### Reste

- `NewGroupDialog` n'est plus ouvert par aucun geste réel (`MessagesPage` le monte encore via `onNouveauGroupe`, gardé comme signal « groupe proposé ») : à retirer dans un ticket à part. → **Soldé par TCK-2860** (fichier et test supprimés, `groupePossible`).
- `MessagesPage.test.tsx` : son double de `NouvelleConversation` clique encore « Créer un groupe » → `NewGroupDialog`, un chemin que le vrai composant n'a plus. → **Soldé par TCK-2860**.
- `docs/qa/audit-ux-2026-11/fidelite/TCK-2632.json` porte des écarts acceptés que ce ticket lève (l. 336 « forme d'onde », l. 402 « la rangée mène à NewGroupDialog », l. 547 catégorie « forme d'onde, bulle de note vocale ») : à retirer au relevé (AC-F2). → l. 336 (« forme d'onde ») reste à ce ticket ; les écarts lus par TCK-2860 (coche, rôle, contexte, menu) sont retirés par lui.
- AC5, AC-F1, AC-F2 : non mesurés au navigateur (lot sans navigateur). Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2861.json` écrite à la lecture, `releve_le: null`.


**Re-mesure des restes (ECARTS-2, 2026-11-16)** — fermé par TCK-2860 (bfeba8d5b) : `NewGroupDialog` n'existe plus (`MessagesPage.tsx:463`), `MessagesPage.test.tsx:615-624` ouvre la vraie `NouvelleConversation` et y trouve l'interrupteur « Créer un groupe » ; `messaging.voiceNote.duration` absente des dictionnaires. Rien à corriger.
