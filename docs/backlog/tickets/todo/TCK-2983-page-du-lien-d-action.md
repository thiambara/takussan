---
id: TCK-2983
title: "La page publique du lien d'action (fil-pont D) : le geste, fait, expiré, déjà servi, la signature par code ; et l'interrupteur du résumé du lundi dans les préférences"
status: todo
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
- [ ] **AC2** — Un lien mort n'affiche rien de l'objet. *Ablation : rendre `object` quand la réponse de test le
  porte malgré le 410 — rouge.*
- [ ] **AC3** — La page fonctionne sans session (fenêtre privée, relevé) et ne pose aucun cookie de session.
- [ ] **AC4** — Le résumé du lundi s'active et se coupe depuis les préférences ; la valeur relue après
  rechargement est celle choisie.
- [ ] **AC5** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests des fichiers
  touchés verts.

## Hors périmètre

- La vue de l'agent : TCK-2984.
- Demander un nouveau lien depuis la page.
- Le paiement lui-même (la page du lien porteur existe, ADR-0051).

## Notes d'implémentation

_(à remplir par implementing-specs)_
