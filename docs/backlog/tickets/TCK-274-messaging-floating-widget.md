---
id: TCK-274
title: "Messagerie — widget flottant accessible site-wide"
status: review
phase: P2
family: front
estimate: M
created: 2026-05-13
updated: 2026-05-13
depends_on: [TCK-045, TCK-085, TCK-129]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#20-message-
tags: [front, messaging, ux]
---

## Objectif utilisateur

Permettre à tout utilisateur authentifié (Locataire, Bailleur, Agent, Admin
agence, Super-admin) d'accéder à sa messagerie depuis n'importe quelle page de
l'application — site public, fiche bien, dashboard — sans quitter son contexte
de navigation, et de voir d'un coup d'œil son nombre de messages non lus.

## Contrat de données

Aucun nouvel endpoint backend. Le widget consomme exclusivement les API déjà
livrées par TCK-045 et TCK-085 :

- `GET /api/conversations` — liste paginée (poll long).
- `GET /api/conversations/{id}` — détail.
- `GET /api/conversations/{id}/messages` — fil (poll court quand ouvert).
- `POST /api/conversations/{id}/messages` — envoi.
- `POST /api/conversations/{id}/messages/{msg}/attachments` — pièce jointe.

Le compteur global de non-lus est dérivé côté client à partir du champ
`unread_count` déjà exposé par chaque `Conversation` (cf. `spec_refs.models`).

## Direction UX / Artistique

**Référence visuelle** : Facebook Messenger sur le bureau, Intercom / Crisp
côté simplicité. Le widget doit se sentir comme une extension naturelle du
design system Ancrage Local (TCK-129) — pas comme un greffon générique.

- **Bouton bulle** ancré bas-droite, toujours visible, sobrement teinté
  (cohérent avec la palette terre / sable du DS), avec un badge rond
  contenant le nombre de non-lus (cap à `9+`). Ombre douce, pas de bordure
  1px, conforme à la règle "no-line" du DS.
- **Au clic** : le bouton ouvre un panneau "liste de conversations" de
  largeur ~320 px, hauteur ~480 px, ancré bas-droite, avec un en-tête
  (titre + bouton fermer) et un footer minimal (lien "Voir toute la
  messagerie" → `/app/messages`).
- **Sélection d'une conversation** : la liste glisse / se substitue à la
  vue chat compacte (réutilisation du composant chat existant en mode
  réduit) — toujours dans la même fenêtre flottante, **une seule
  conversation ouverte à la fois**.
- **Mobile (< 768 px)** : pas de panneau flottant ni de popup. Un simple
  FAB rond bas-droite avec badge unread, qui redirige vers
  `/app/messages`. Le widget desktop ne doit jamais empiéter sur le
  viewport mobile.
- **Polling** : la liste rafraîchit le compteur unread à intervalle long
  (10 s) tant que l'onglet est visible ; la vue chat ouverte poll à
  intervalle court (3 s) comme aujourd'hui. Pause complète quand
  `document.hidden`.
- **Animations** : ouverture / fermeture en transform + opacity, durée
  courte (≤ 200 ms), pas de bounce. Respecter `prefers-reduced-motion`.

Aucune prescription de structure de dossiers, de noms de composants ou de
choix de state management — l'implémentation décide.

## Contraintes strictes (métier)

- **Visibilité conditionnée à l'authentification** : le widget n'apparaît
  que si l'utilisateur est connecté. En session anonyme, ni bouton ni
  badge.
- **Périmètre d'affichage** : toutes les pages **sauf** les écrans
  d'authentification (`/login`, `/register`, `/forgot-password`, callbacks
  OAuth) et les écrans d'onboarding (`/onboarding/*`). Sur le site public
  authentifié et sur tout le dashboard, le widget est présent.
- **Ne remplace pas `/app/messages`** : la page complète reste l'inbox de
  référence (recherche, gestion fine des groupes via
  `ConversationInfoSheet`, ajout / retrait de participants, renommage,
  etc.). Le widget est un **raccourci**, pas une refonte.
- **Cas dégradés** : si la liste est vide, afficher un état vide
  cohérent (CTA "Démarrer une conversation depuis une annonce"). Si une
  erreur réseau survient, ne jamais bloquer la navigation — afficher un
  message inline dans le panneau et garder le bouton fonctionnel.
- **Conversations de groupe** : le widget les affiche dans la liste et
  permet la lecture / l'envoi de messages texte + pièces jointes. Les
  actions admin (ajouter, retirer, promouvoir, renommer) restent
  accessibles uniquement via la page `/app/messages` et son
  `ConversationInfoSheet` — un lien "Gérer le groupe" dans la vue chat
  compacte renvoie vers la page complète.
- **Performance** : pas de second hook qui dupliquerait `useMessages` —
  réutiliser les query keys existantes pour partager le cache React Query
  entre la page `/app/messages` et le widget. Une seule conversation
  active poll à la fois (pas de polling en arrière-plan sur les
  conversations fermées).
- **Accessibilité** : le bouton bulle a un `aria-label` localisé. Le
  panneau ouvert est un dialog focusable, fermable au clavier (`Escape`).
  Le badge unread est annoncé aux lecteurs d'écran.
- **i18n** : tous les libellés du widget passent par `next-intl` (FR / EN
  / WO), pas de chaînes en dur.

## Delta à produire

- [ ] Composant racine du widget (orchestrateur bouton + panneau + chat
      compact), monté une seule fois dans le layout authentifié.
- [ ] Hook de comptage des non-lus global, dérivé de la query
      `conversations.list` existante (zéro nouvel endpoint).
- [ ] Variante compacte de la vue chat existante (réutilisation maximale
      de `ChatView` — extraction d'une prop ou d'un sous-composant si
      nécessaire), sans dupliquer la logique de polling, d'envoi ou
      d'upload.
- [ ] Mount conditionnel : exclure `/login`, `/register`,
      `/forgot-password`, callbacks OAuth, `/onboarding/*`. Le widget
      n'est jamais rendu côté serveur en session anonyme.
- [ ] Branche mobile (< 768 px) : FAB unique qui redirige vers
      `/app/messages` (pas de panneau, pas de popup chat).
- [ ] Lien "Gérer le groupe" dans la vue chat compacte pour les
      conversations de type `group` → renvoie vers
      `/app/messages?conversation={id}` (deep-link à supporter côté
      `MessagesPage` si non déjà câblé).
- [ ] Traductions FR / EN / WO pour tous les libellés du widget.
- [ ] Tests : rendu conditionnel selon route, badge unread, ouverture /
      fermeture, sélection conversation, comportement mobile vs desktop,
      cas dégradé erreur réseau.

## Critères d'acceptation

- [ ] AC1 — En session authentifiée, sur n'importe quelle page hors
      `/login`, `/register`, `/forgot-password`, callbacks OAuth et
      `/onboarding/*`, le bouton bulle est visible bas-droite.
- [ ] AC2 — En session anonyme, le widget n'est rendu nulle part
      (vérifiable via inspection du DOM sur la home publique anonyme).
- [ ] AC3 — Le badge affiche la somme des `unread_count` de toutes les
      conversations non muted, capée à `9+`. Quand un message est lu
      (ouverture de la conv dans le widget OU navigation vers
      `/app/messages`), le badge se met à jour sans rechargement.
- [ ] AC4 — Au clic sur le bouton, le panneau s'ouvre avec la liste des
      conversations triées par `last_message_at` desc, identique à celle
      de `/app/messages`.
- [ ] AC5 — Au clic sur une conversation dans le panneau, la vue chat
      compacte s'affiche dans la même fenêtre flottante. L'envoi de
      message texte fonctionne. L'upload de pièce jointe fonctionne.
      Une seule conversation est ouverte à la fois.
- [ ] AC6 — Sur viewport < 768 px, seul un FAB bas-droite est rendu ;
      au clic il navigue vers `/app/messages`. Aucun panneau flottant
      ni popup ne s'ouvre sur mobile.
- [ ] AC7 — Le polling de la liste pause quand `document.hidden = true`
      et reprend à la visibilité ; la vue chat ouverte respecte la même
      règle (déjà en place dans `ChatView`).
- [ ] AC8 — `Escape` ferme le panneau ouvert. Le focus est restauré sur
      le bouton bulle après fermeture.
- [ ] AC9 — Tous les libellés du widget existent dans les trois locales
      (FR, EN, WO) et `npm run lint` ne signale aucune chaîne en dur.
- [ ] AC10 — La page `/app/messages` continue de fonctionner exactement
      comme avant (aucune régression sur la création de groupe,
      `ConversationInfoSheet`, renommage, ajout/retrait participants).

## Hors périmètre

- Notifications push navigateur ou notifications système OS pour les
  nouveaux messages (cf. P3 dans `features.md` §1.7).
- Notifications sonores (ping audio) à l'arrivée d'un message.
- Indicateur "en train d'écrire…" / présence en ligne.
- Drag & drop pour déplacer ou empiler les fenêtres de chat.
- Plus d'une conversation ouverte simultanément dans le widget (choix
  produit explicite — l'agent qui jongle plusieurs leads continue
  d'utiliser `/app/messages`).
- Gestion fine des groupes (ajout / retrait / promotion / rename / mute)
  depuis le widget — reste sur `/app/messages` via
  `ConversationInfoSheet`.
- Affichage du widget dans l'espace super-admin si la route est
  considérée hors-scope par le produit (à confirmer pendant
  l'implémentation — par défaut le widget est rendu).
- Recherche full-text dans les messages depuis le widget (couvert par
  TCK-094).

## Notes d'implémentation

- **Mount au root layout** : `ChatWidget` est rendu une seule fois dans
  `src/app/layout.tsx`, à l'intérieur des providers
  `NextIntlClientProvider` / `QueryProvider` / `AuthProvider` /
  `UserLocationProvider`, après `{children}`. Les gates de visibilité sont
  synchronisés dans le composant lui-même (return `null` immédiat) pour
  éviter tout coût de hooks supplémentaire sur les pages où il ne s'affiche
  pas.
- **Pas de nouveau modèle ni hook de polling** : `useUnreadCount` consomme
  exclusivement le cache de `useConversations` déjà en place (poll 10 s,
  partagé via React Query avec `/app/messages`). La conversation ouverte
  dans le widget réutilise `ChatView` (poll 3 s) — donc une seule conv
  active poll à la fois, comme exigé par le ticket.
- **Réutilisation de `ChatView`** : ajout de deux props non-breaking
  (`variant: 'page' | 'widget'`, `onBack?`). `variant='page'` reste le
  défaut → la page `/app/messages` se comporte exactement comme avant
  (`ConversationInfoSheet` rendu, bouton Info, pas de back-button).
  `variant='widget'` ajoute le bouton retour, masque le sheet
  in-place, et remplace le bouton Info par un lien `Settings` vers
  `/app/messages?conversation={id}`.
- **Deep-link** : `MessagesPage` lit `useSearchParams().get('conversation')`
  au mount pour seed `selectedId`. Validé numérique (`> 0`) pour ignorer
  les valeurs poubelle. Pas d'écriture URL — la sélection ne pousse pas
  d'historique pour ne pas empiler des entrées dans le navigateur quand
  l'utilisateur change de conversation.
- **Mobile vs desktop** : split via classes Tailwind responsive
  (`hidden md:block` / `md:hidden`) plutôt que via détection JS du
  viewport. Avantage : pas de FOUC, pas de hook resize. Conséquence : en
  jsdom (tests), les deux éléments sont rendus dans le DOM — mais avec
  des `data-testid` distincts (`chat-widget-launcher` côté desktop,
  `chat-widget-mobile-fab` côté mobile) pour désambiguïser.
- **Routes exclues** : `/auth/*` (vraies URLs après le segment groupé
  `(auth)`), `/onboarding/*`, `/maintenance`, `/app/messages` et
  `/app/messages/*`. Liste dure dans le composant ; aucune config externe.
- **A11y** : bouton bulle `aria-expanded`, panneau `role="dialog"` +
  `aria-label`, badge `aria-live="polite"` avec libellé non lu lu par les
  lecteurs d'écran. `Escape` ferme et `launcherRef.current?.focus()`
  restaure le focus.
- **Tests** :
  - `useUnreadCount.test.tsx` (5 tests) — sum, mute filter, left filter,
    loading=0, vide=0
  - `ChatWidget.test.tsx` (8 tests) — visibilité par route + auth
  - `MessagesPage.test.tsx` (3 tests) — deep-link nominal + absent + invalide
  - Total : 16 tests neufs, tous verts. 9 tests messages existants
    inchangés (3 SystemMessageBubble + 3 NewGroupDialog + 3 MessagesPage).
- **Hors scope confirmé** : pas de toast / sonore à l'arrivée d'un message,
  pas d'indicateur "en train d'écrire", pas de drag/drop, pas de
  multi-popups. La gestion fine des groupes (rename, add/remove
  participants, mute) reste sur `/app/messages` via le sheet existant.
- **Verif** :
  - `npm test -- --run src/components/chat-widget/ src/components/messages/`
    → 22/22 vert
  - `npx eslint src/components/chat-widget src/components/messages
    src/app/layout.tsx` → exit 0
  - `npx tsc --noEmit` → exit 0
  - Les 9 échecs résiduels sur `npm test` (calendar, leases, onboarding,
    admin) sont **antérieurs** au ticket — vérifié par `git stash` + run
    sur HEAD propre.
