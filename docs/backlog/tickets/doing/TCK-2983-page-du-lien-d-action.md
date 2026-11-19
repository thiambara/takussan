---
id: TCK-2983
title: "La page publique du lien d'action (fil-pont D) : le geste, fait, expiré, déjà servi, la signature par code ; et l'interrupteur du résumé du lundi dans les préférences"
status: doing
phase: P2
family: front
estimate: M
wave: 98
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2982, TCK-2985]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#23-notifications
  models: []
tags: [front, pont, liens-d-action, public, preferences, i18n, maquette, adr-0132]
---

## Objectif utilisateur

- **La personne qui ouvre un lien reçu sur WhatsApp ou par SMS** (le plombier, le bailleur, le locataire) : elle
  voit en un coup d'œil ce qu'on lui demande, fait le geste d'un bouton, et sait que c'est fait. Un lien mort lui
  dit seulement quoi faire.
- **Le bailleur** : il active ou coupe le résumé du lundi depuis ses préférences de notification.

## Contrat de données

- `GET /api/a/{token}` → `{gesture, state, object}` ; `POST /api/a/{token}` (paramètres selon le geste) →
  `{state: done, object}` ; `POST /api/a/{token}/code` (signature) ; 410 `action_link.expired|used|revoked` ;
  404 jeton inconnu ; 429 limiteur (TCK-2982).
- L'URL de la page est `/{langue}/fil/a/{jeton}` : c'est l'URL qu'émet l'API (TCK-2982).
- Trois gestes : `property_visit.confirm`, `maintenance_request.accept`, `inventory.sign`. Payer n'a pas de lien
  du pont (le lien porteur d'ADR-0051 part avec les relances de loyer, ADR-0132 § 5).
- `GET|PATCH /api/me/notification-preferences` : l'événement `owner_weekly_digest` (canaux `email` et
  `whatsapp`, éteints par défaut ; pas d'`inapp`, TCK-2985). La liste des événements du front est
  `src/lib/notification-preferences.ts` (`:24-67`), ses libellés sous `profile.notifications.events.*`.

## Direction UX / Artistique

- **Référence de fidélité** : maquette `fil-pont`, approche **D** (locale, `…/playground/maquettes/pages/app/fil-pont*.tsx`),
  écrans « Page par lien · le geste », « confirmé et invitation à un compte », « expiré », « déjà utilisé »,
  et la saisie du code de l'écran « devis (code exigé) » appliquée à la **signature** (le devis n'a pas de lien).
- **Une colonne de 480 px**, centrée au bureau, pleine largeur au téléphone : la page s'ouvre depuis WhatsApp,
  donc au téléphone d'abord.
- **Un seul geste par page** : un bouton principal large. Les autres boutons de la maquette (« Proposer un autre
  créneau », « Je ne peux pas intervenir ») ne sont **pas** retenus : un lien fait un geste (ADR-0132 § 5) ; la
  page renvoie à la conversation WhatsApp pour tout le reste.
- **Après le geste** : une coche, « C'est fait », ce que la réponse rend (l'adresse et le contact sur place pour
  le prestataire), et une invitation douce à créer son mot de passe, qui mène au parcours existant.
- **Lien mort** : la page ne dit rien de l'objet, ni de l'agence, ni d'une date. Expiré : « Demandez un nouveau
  lien en répondant à l'agence sur WhatsApp. » Déjà servi : « Si ce n'était pas vous, prévenez l'agence. » Pas de
  bouton « Recevoir un nouveau lien » (aucune route ne le fait).
- Vouvoiement ; textes dans les trois langues (`wo` = le français, wolof en pause) ; pas de navigation de
  l'application, pas d'indexation.
- **Préférences** : une ligne de plus, dans le groupe de la maquette `app-profil` où se rangent les biens et les
  baux (le groupe est à mesurer dans `notification-preferences.ts`), avec les seules cases que l'API ouvre
  (`email`, `whatsapp`).

## Contraintes strictes (métier)

- **Aucune session** : la page n'utilise ni le jeton de l'utilisateur ni un cookie de session pour ces appels ;
  elle marche dans une fenêtre privée.
- **Le jeton ne fuit pas** : ni dans le titre, ni dans une requête vers un tiers (polices, analytique), ni dans
  l'en-tête `Referer` (politique `no-referrer` sur la page).
- **Rien n'est affiché que la réponse ne porte** : la page n'infère ni adresse ni montant.
- Le geste est désactivé pendant l'envoi ; un double clic n'envoie qu'une requête.
- `apiFetch` / `apiRequest` : le piège du préfixe `/api` (`CLAUDE.md`).

## Delta à produire

- [ ] La page publique `/{langue}/fil/a/{jeton}` et ses états : geste (par geste du registre : confirmer une
  visite, accepter une intervention et son créneau, signer avec code), fait, expiré, utilisé, révoqué,
  introuvable, trop de tentatives, erreur de l'objet (le refus de la machine d'état, par son code).
- [ ] L'interrupteur `owner_weekly_digest` dans les préférences, libellés `fr`, `en`, `wo`.
- [ ] Tests (Vitest) : chaque état rendu depuis une réponse de test ; un 410 n'affiche aucun champ d'objet même
  si la réponse de test en glisse un ; le bouton désactivé pendant l'envoi ; l'interrupteur envoie le bon
  `PATCH`.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px, contre la maquette `fil-pont` D :
  chaque état (geste, fait, expiré, utilisé, signature par code) ; pas de défilement horizontal à 360.
- [x] **AC2** — Un lien mort n'affiche rien de l'objet. *Ablation : rendre `object` quand la réponse de test le
  porte malgré le 410 — rouge.* — preuve : takussan-web/src/components/lien-d-action/__tests__/PageDuLienDAction.tck-2983.test.tsx (« 410 … rien de l’objet même si la réponse en glisse un (AC2) »)
- [x] **AC3** — La page fonctionne sans session (fenêtre privée, relevé) et ne pose aucun cookie de session.
- [ ] **AC4** — Le résumé du lundi s'active et se coupe depuis les préférences ; la valeur relue après
  rechargement est celle choisie.
- [x] **AC5** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests des fichiers
  touchés verts. — preuve : tsc --noEmit propre, eslint propre sur les fichiers touchés, check:vouvoiement vert, vitest 5 fichiers / 50 tests verts ; check:i18n ne rougit que sur playground/maquettes (exclu de git en local)

## Hors périmètre

- La vue de l'agent : TCK-2984.
- Demander un nouveau lien depuis la page.
- Le paiement lui-même (la page du lien porteur existe, ADR-0051).

## Notes d'implémentation

**La page** — `src/app/[locale]/(public)/fil/a/[token]/page.tsx` (coque de lien nue, titre fixe, `noindex`,
`no-referrer` en balise et en en-tête dans `next.config.ts`), sa frontière de dictionnaire `fil/layout.tsx`
(`lienPublic`, `inventory` pour le tracé de signature : plafond 22 %), et l'écran
`src/components/lien-d-action/PageDuLienDAction.tsx`. `fil` rejoint les pages par lien de
`barre-publique.ts` : ni barre d'onglets ni dock du comparateur.

**Le contrat** est lu dans un seul module, `src/lib/queries/lien-d-action.ts`, aligné sur le code de TCK-2982
(`ActionLinkController`, `GestesParLien::projection`) : enveloppe `{data}`, `state: open` à la lecture,
`{state: done, object}` après le geste, 410 `{code: action_link.expired|used|revoked}`, 404. Les appels passent
par `apiFetch` : ni jeton d'API ni cookie (autre origine). La lecture part du navigateur, jamais du rendu
serveur : l'aperçu d'un lien par WhatsApp ne l'« ouvre » pas.

**Les états** : le geste (visite, intervention, signature : code par SMS puis tracé), fait, expiré, déjà servi,
révoqué, introuvable, trop de tentatives (429, « Réessayer »), erreur de lecture, et le refus de l'objet (son
message localisé par l'API, le geste reste possible). Un lien mort ne porte que sa cause dans son état : la
non-fuite tient au type. Le geste se verrouille par une référence en plus de `disabled` : deux clics du même
instant n'envoient qu'une requête.

**Le récapitulatif n'affiche que ce que la réponse porte.** Avant le geste : créneau, motif, bien, quartier et
ville. Après : l'adresse et le contact sur place que la ressource de l'objet ouvre à ce compte (bloc `access`
d'une intervention), jamais avant. L'invitation à créer son mot de passe mène à `/auth/forgot-password`, sans
le jeton.

**Préférences** : `owner_weekly_digest` dans le groupe « Biens », libellé « Résumé du lundi de mes biens ». La
garde de parité lisait `PreferenceResolver::EVENTS` entre quotes seulement : `self::OWNER_WEEKLY_DIGEST` lui
échappait, et elle serait restée verte sur l'écart. Elle résout désormais les constantes.

Écarts avec la maquette et le ticket :
- Pas de « Demandé par … » ni du nom de l'agence en tête : la projection ne les porte pas.
- Le surtitre ne nomme pas la catégorie (« Intervention · Plomberie ») ni le type d'état des lieux : la
  projection porte `category` et `type` en valeurs brutes, et leurs libellés vivent dans des espaces de
  `/app` que la page ne charge pas.
- Pas de « Plus tard » sous l'invitation au compte, ni d'« Ajouter à mon agenda ».

## Relevé — 2026-11-19, `./dev.sh`, contexte de navigateur neuf (sans session)

Lien émis par `LiensDAction::emettre()` pour l'intervention 107, au prestataire assigné.

- **Geste, à 360 px** : surtitre « Intervention », question, motif, lieu (quartier et ville) et l'encart
  « L'adresse exacte… une fois l'intervention acceptée ». Le bouton est collé en bas de l'écran. Pas
  de défilement horizontal (`scrollWidth` 360).
- **Fait** : « C'est fait », avec l'adresse et le contact sur place révélés après le geste seulement,
  puis l'invitation « Créer mon mot de passe ».
- **Déjà servi**, au rechargement : « Ce lien a déjà servi », sans rien de l'objet. À 1280 px, la
  carte est centrée, sans débordement.
- **AC3** : en-têtes `Referrer-Policy: no-referrer` et `Cache-Control: no-store` ; seul cookie posé,
  `NEXT_LOCALE`. Il n'y a aucun cookie de session, ni avant ni après le geste.
- **Non relevés** : l'état « expiré », la signature par code et AC4 (préférence du résumé du lundi).
  Leurs tests de composant existent.

## Reste sur dev

Le code est sur `dev` (#1700, 83f651c16). Il reste :

- AC1 : les états « expiré » et « signature par code » n'ont pas été relevés au navigateur.
- AC4 : le résumé du lundi, activé puis coupé depuis les préférences et relu après rechargement, n'a pas été relevé.
