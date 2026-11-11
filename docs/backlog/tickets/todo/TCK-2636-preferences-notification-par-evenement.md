---
id: TCK-2636
title: "Préférences de notification : une rangée par événement au téléphone (WhatsApp enfin réglable), les six événements oubliés, des en-têtes en français"
status: todo
phase: P1
family: front
estimate: S
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
tags: [front, notifications, preferences, mobile, whatsapp, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, on règle « Loyer en retard » sur WhatsApp, le canal par défaut au Sénégal, sans qu'une colonne sorte de l'écran. Chaque notification que l'application envoie a son interrupteur.

## Contrat de données

Aucun endpoint neuf. Lecture et écriture existantes :

- `GET` et `PATCH /api/me/notification-preferences` ;
- la liste des canaux (`channels`, dont `whatsapp`) ;
- l'état de chaque case (`locked` et sa raison, par exemple `phone_without_whatsapp` ou KYC critique).

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **WhatsApp hors d'atteinte à 390** : la carte de chaque groupe est en `overflow-hidden` (`NotificationPreferencesMatrix.tsx:290`), comme le cadre du tableau. L'en-tête « WhatsApp » commence à x = 373 et la carte s'arrête à 374 (mesure de l'audit, `admin-wa-m.json`). Rien ne défile.
- **Six événements de l'API sans interrupteur** : `PreferenceResolver::EVENTS` en compte 20, la liste du front 14, malgré son commentaire « Must mirror `PreferenceResolver::EVENTS` ». Manquent :
  - `lease_renewed` ;
  - `lease_early_termination` ;
  - `lease_rent_reviewed` ;
  - `invoice_reminder_sent` ;
  - `task_due_reminder` ;
  - `tenant_inventory_reminder`.

  Ces six événements partent avec les réglages par défaut, sans que l'utilisateur puisse les couper.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-profil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écran « Préférences de notifications ».
- **Décision 7 (a) du porteur — téléphone (360–390)** :
  - une rangée par événement (« Loyer en retard »), groupée sous son titre (« Baux », « Messages »…) ;
  - sous le libellé, des **puces de canaux** cochables (« Appli · E-mail · SMS · WhatsApp ») qui passent à la ligne si besoin ;
  - une puce verrouillée est grisée, avec sa raison en sous-ligne (« Ajoutez un numéro WhatsApp », « Obligatoire pour la vérification de votre agence ») ;
  - le canal « Notification mobile » est dessiné verrouillé (« pas encore disponible ») et non absent, tant qu'il n'a pas de transport.
- **Bureau (≥ 1280)** : la matrice reste (elle a la place), avec des en-têtes en français : « Appli », « E-mail », « Notif. mobile », « SMS », « WhatsApp ». Entre `md` et `lg`, les rangées du téléphone.
- « Enregistré » s'annonce à chaque changement, comme aujourd'hui.

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- l'enregistrement à chaque case, avec « Enregistré » annoncé (`aria-live`) ;
- les cases verrouillées qui disent pourquoi ;
- WhatsApp actif par défaut pour échéance, retard, rappel de visite et statut de réservation (TCK-588) ;
- les groupes (Messages, Réservations, Baux, Maintenance, Avis, Alertes, Biens) ;
- le repli du libellé sur la valeur brute pour un canal inconnu (relevé du 2026-09-16) ;
- le fil d'Ariane « Profil / Notifications » au bureau, et la flèche unique au téléphone (TCK-2617).

**Autres règles :**

- **Les six événements** prennent place dans leur groupe :
  - « Baux » : renouvellement, résiliation anticipée, révision du loyer, relance de facture, rappel d'état des lieux d'entrée ;
  - « Alertes » : rappel de tâche.

  Les libellés sont en `fr`/`en`/`wo` (`wo` = le français tel quel).
- **Un événement que le persona ne reçoit jamais** (un client et `task_due_reminder`) peut rester affiché. Le masquer demande une règle de l'API qu'elle ne rend pas : hors périmètre.
- **Garde de parité** : la liste des événements du front ne peut plus diverger de `PreferenceResolver::EVENTS` sans qu'un test rougisse. Le test lit la constante PHP comme les gardes de recensement lisent leurs sources.
- Aucune colonne ni puce ne sort de l'écran à 360.

## Delta à produire

- [ ] Rangées par événement avec puces de canaux sous `lg`, matrice dès `lg`.
- [ ] Retrait du rognage qui cache WhatsApp ; en-têtes en français.
- [ ] Les six événements manquants, dans leur groupe, avec leurs libellés.
- [ ] Garde de parité front / API des événements.
- [ ] Tests :
  - à 390, chaque événement a ses puces, dont « WhatsApp », dans le cadre ;
  - cocher WhatsApp sur « Loyer en retard » envoie le `PATCH` attendu ;
  - une puce verrouillée n'envoie rien et montre sa raison ;
  - 20 événements rendus ;
  - la garde rougit si l'on retire un événement du front.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844 (`innerWidth` relevé), la puce « WhatsApp » de « Loyer en retard » est entièrement dans le viewport, et `scrollWidth − innerWidth = 0` sur la page.
- [ ] AC2 — La toucher envoie `PATCH /api/me/notification-preferences` avec `lease_payment_overdue.whatsapp` inversé (réseau), et « Enregistré » est annoncé.
- [ ] AC3 — La page rend exactement 20 événements, autant que `PreferenceResolver::EVENTS`, dont « Rappel de tâche » et « Renouvellement du bail ».
- [ ] AC4 — À 1280, les en-têtes de la matrice sont « Appli, E-mail, Notif. mobile, SMS, WhatsApp » ; aucun « In-app » ni « Push ».
- [ ] AC5 — Ablation : retirer `task_due_reminder` de la liste du front fait rougir la garde de parité.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2636.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le sommaire du profil (TCK-2635).
- Le masquage des événements selon le persona (règle à poser côté API d'abord).
- Le transport des notifications mobiles.

## Notes d'implémentation

Implémenté le 2026-11-11 (branche `feat/audit-ux-app-lot-2`).

- **Une donnée, deux dessins, un seul monté** — `NotificationPreferencesMatrix` choisit par
  `useMatchesMedia('(min-width: 64rem)')` : sous `lg` les rangées à puces, dès `lg` la matrice. Deux
  arbres cachés par CSS auraient doublé chaque case pour l'assistance et pour les tests.
- **Les groupes et la liste des événements** vivent dans `src/lib/notification-preferences.ts`
  (`GROUPES_DE_PREFERENCES`, ordre de la maquette : Baux en tête) ; `EVENEMENTS_DE_PREFERENCE` en est
  DÉRIVÉE. Les six événements prennent leur place (cinq dans Baux, le rappel de tâche dans Alertes) ;
  `visit_reminder` reste dans Alertes.
- **Garde de parité** — `src/lib/__tests__/notification-preferences.parity.test.ts` lit
  `public const EVENTS = [ … ];` de `PreferenceResolver.php` (commentaires retirés). `web-ci.yml` se
  déclenche désormais sur ce fichier (les deux côtés d'une garde la réveillent). AC5 par ablation :
  retirer `task_due_reminder` → 2 rouges.
- **Téléphone** — groupes repliables ; Baux et Messages ouverts au chargement, les cinq autres repliés
  sur leur résumé (« 6 événements · WhatsApp, SMS, E-mail, Appli »), comme la maquette (arbitrage du
  2026-11-11, option b). Le contenu replié reste MONTÉ (`hidden`) : AC3 compte des événements
  atteignables — 20 rangées, toutes visibles avec leurs puces une fois chaque groupe ouvert. Puce = `button role="checkbox"`, 32 px, cible de 44
  par `before:`. « Appli » (`inapp_always_on`) : cochée, figée, sans cadenas, comme la maquette. Une
  puce `channel_unavailable` n'est pas proposée (TCK-588) : une ligne du groupe le dit, comme
  « Notification mobile : pas encore disponible. ». Les autres verrous : puce grisée + sous-ligne
  (« SMS et WhatsApp : vérifiez votre téléphone pour les activer. »).
- **Bureau** — une table ARIA par groupe (légende, en-têtes lus), rangée d'en-têtes visible commune,
  colonnes de 76 px sur l'échelle, cadre `overflow-x-auto` (plus d'`overflow-hidden`). En-têtes
  « Appli, E-mail, Notif. mobile, SMS, WhatsApp ».
- **« Enregistré » à chaque changement** — toast du produit (TCK-2688) à chaque succès ; l'ancien
  `<p role="status">` gardait le même texte et ne se réannonçait pas. Le bouton « Rafraîchir »,
  absent de la maquette, est retiré (sa suppression ESLint consignée avec).
- **Page** — le fil « Profil › Notifications » passe par `fil` (`FilDAriane`, dès `md`) : au
  téléphone, la flèche unique de la coque (TCK-2617).
- Mesures au navigateur (persona `admin`, seul compte de démo au téléphone vérifié) : AC1 à 390 et
  360, débord 0, puce WhatsApp de « Loyer en retard » dans le viewport ; AC2 : action serveur portant
  `lease_payment_overdue.whatsapp` inversé, API relue avant/après, toast « Enregistré » dans la
  région vivante, état rétabli ; AC3 20 rangées atteignables à 390 (cinq groupes ouverts d'un geste chacun, 20 visibles avec leurs puces) et 20 en-têtes de rangée à 1280 ; AC4 ; 768,
  1024, 1440 sans débord. Fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2636.json`.
