---
id: TCK-2611
title: "Invitation : l'agence, la personne qui invite et le rôle en tête, puis un code — et un lien expiré qui le dit tout de suite"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598, TCK-2609, TCK-2610, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, invitation, onboarding, mobile, audit-ux, app]
---

## Objectif utilisateur

L'invité qui ouvre un lien reçu par SMS sait immédiatement qui l'invite et pour quoi — Dakar Immo, Aïssatou Diallo, comme bailleur, trois biens qui l'attendent —, entre par son numéro et un code, et ne remplit jamais un formulaire pour un lien qui ne marche plus.

## Contrat de données

- `GET /api/public/invitations/{token}` (TCK-2609) : agence, invitant (prénom), rôle, destinataire masqué, expiration, noms préremplis, ce qui attend ; 404 / 410 avec agence et date.
- `POST /api/public/invitations/{token}/code` et `…/verify` (TCK-2610) : session ouverte + invitation acceptée.
- `POST /api/public/invitations/{token}/renewal-request` (TCK-2609).
- Existant : `POST /api/invitations/{token}/accept` (voie mot de passe, compte connecté), `destinationDInvitation` (assistant du rôle).

**Relevé après TCK-2610 (882002ea9), 2026-11-11** — ce que l'écran doit savoir du contrat livré :

- **`phone` au `/verify` aussi pour une invitation par e-mail** : le numéro saisi à l'envoi du code (`/code`) est renvoyé à la vérification ; requis par e-mail, ignoré par SMS (le code part au numéro de l'invitation). Champs de `/verify` : `phone` (par e-mail), `code`, `first_name`, `last_name`, `two_factor_code` | `recovery_code`, `device_name`, `terms_version`.
- **Refus à traiter**, sur `/verify` comme sur `POST /api/invitations/{token}/accept` :
  - 401 `invitation.requires_login` (+ `requires_login: true`, `email` **masqué** — TCK-2727 : la valeur de `recipient.masked` de l'aperçu, que l'action relaie sous `emailMasque`) — l'e-mail de l'invitation appartient à un autre compte que celui du numéro prouvé : dire à quel compte se connecter (« m•••@gmail.com »), sans jamais préremplir le formulaire de connexion avec cette valeur ;
  - 403 `invitation.email_mismatch` / `invitation.phone_mismatch` — sous session, le compte connecté porte un autre e-mail, ou n'a pas vérifié le numéro de l'invitation (ADR-0094 § 7 : il n'est plus créé de compte pour l'invité sous la session d'un autre). L'écran propose de se déconnecter ou de changer de compte ;
  - réponses de la connexion par téléphone : `requires_2fa` (même code reposé avec le TOTP), `requires_terms` (même code reposé avec `terms_version`), 422 `phone_code_invalid`, 423 `account_locked`, 429.
- **Le code est consommé même quand l'acceptation est ensuite refusée** (401, 403, 409, 410) : l'écran redemande un code avant tout nouvel essai.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-invitation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Invitation valide », « Code », « Lien expiré », « Déjà inscrit », et les variantes dessinées sous les écrans (agent, prestataire, compte existant, code faux, compte sans nom, mauvais compte, liens qui ne s'ouvrent pas).
- Valide : logo et nom de l'agence ; « Aïssatou Diallo vous invite comme bailleur » en titre (h1) ; carte « Ce qui vous attend » selon le rôle (bailleur : biens suivis, loyers et versements, quittances ; agent ; prestataire : l'intervention) ; « Invitation pour m•••@gmail.com · valable jusqu'au 17 nov. » ; prénom et nom préremplis côte à côte ; numéro prérempli et masqué pour une invitation par SMS ; bouton collé « Continuer avec mon numéro » ; liens « Utiliser un mot de passe », « J'ai déjà un compte ».
- Code : « Code envoyé au 77 •• •• 45 67 · Modifier », six cases, encadré de test hors production, bouton « Rejoindre Dakar Immo ».
- Expiré / annulé / déjà accepté / inconnu : un écran à part qui le dit et donne l'issue — « Demander une nouvelle invitation » (expiré), le numéro de l'agence s'il est public, « Me connecter » (déjà acceptée), « Vérifie le lien reçu » (inconnu).
- Déjà inscrit : « Vous êtes connecté en tant que Moussa Ndiaye (77 •• •• 45 67) », « Rejoindre Dakar Immo », « Ce n'est pas moi — changer de compte ».
- **Téléphone (360-390 px)** : une colonne, bouton collé au-dessus du clavier. **Bureau (≥ 1280 px)** : à gauche l'agence (logo, ville, nombre de biens, « agence vérifiée ») et ce qui attend ; à droite le formulaire de 400 px.
- Ton : **vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton** — avec ou sans session : la page n'a qu'une voix, sans message à double voix.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0094](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md), [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — restent :

- Sans jeton : « Ce lien d'invitation est incomplet. Rouvre-le depuis le message reçu. »
- Drapeau `phone_login` éteint (lu comme aujourd'hui par le navigateur) : « Continuer avec mon numéro » n'est pas rendu, la voie mot de passe est la voie ouverte par défaut.
- Déconnecté, voie mot de passe : prénom, nom, mot de passe (règle en aide, **avec l'œil**), « Créer mon compte et accepter », connexion automatique, puis l'assistant du rôle.
- « J'ai déjà un compte » → connexion avec retour à l'invitation.
- Connecté sans nom : noms préremplis à confirmer (TCK-2281) ; connecté : acceptation en un geste ; refus de l'API affiché, avec « Se connecter » quand le compte existe déjà ; profils relus après acceptation.
- Invitation par e-mail ou par SMS ; expiration à 7 jours.
- **Aucune requête qui accepte au rendu** ; `Referrer-Policy: no-referrer` ; le jeton n'entre pas dans la mesure d'audience (TCK-610, contrainte 1).
- Les noms préremplis viennent de l'agence : l'invité peut les corriger avant d'envoyer.
- « Vous êtes invité » au masculin seul disparaît ; la note « Vos réponses sont enregistrées au fur et à mesure » n'est pas affichée (rien n'est un brouillon ici).
- Libellés neufs en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Lecture de l'aperçu au rendu serveur ; écrans valide, code, déjà inscrit, et les quatre écrans de lien qui ne s'ouvre pas.
- [ ] Entrée par code (envoi, vérification, second facteur, session ouverte par `openSession`), puis l'assistant du rôle.
- [ ] Voie mot de passe repliée derrière « Utiliser un mot de passe ».
- [ ] Demande de nouveau lien.
- [ ] Tests : rendu sans `POST` ; jeton inconnu / expiré / révoqué / accepté → quatre écrans et aucun formulaire ; code → assistant du rôle ; voie mot de passe inchangée ; connecté sans nom → noms préremplis ; « Ce n'est pas moi » déconnecte et revient ; jeton absent de l'appel de mesure d'audience.

## Critères d'acceptation

- [ ] AC1 — Un jeton expiré affiche « Cette invitation a expiré » et le nom de l'agence, sans aucun champ de saisie dans le DOM (sur `dev`, le formulaire complet s'affiche).
- [ ] AC2 — Le rendu d'un lien valide n'émet aucune requête `POST` (réseau) ; le h1 contient le prénom de l'invitant, le nom de l'agence et le rôle.
- [ ] AC3 — Invitation par SMS : « Continuer avec mon numéro » → code juste → arrivée sur `/onboarding/owner?owner=…` avec une session ouverte, sans mot de passe saisi.
- [ ] AC4 — À 390 px, le bouton « Continuer avec mon numéro » reste visible clavier ouvert ; à 1280 px, l'agence est à gauche et le formulaire à droite.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2611.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les assistants de rôle (TCK-2613) ; les dialogues d'envoi (TCK-448).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**2026-11-13 — livraison (terrain-8).**

- **La page lit l'aperçu au rendu serveur** (`lireInvitation`, `src/lib/invitation-apercu.ts`) et choisit
  son écran : valide (l'entrée), ou l'un des six écrans fermés — expirée, annulée, acceptée (410), inconnue
  (404), incomplet (sans `token`), indisponible (toute autre erreur : rien n'est affirmé de l'invitation).
  Un écran fermé n'a aucun champ (AC1, `EcranFerme.tck-2611.test.tsx`).
- **Rien n'accepte au rendu** (AC2) : le rendu n'émet aucun `POST` — éprouvé en vitest, et mesuré au
  navigateur par la garde des relevés, qui refuse et compte toute écriture.
- **AC3 est éprouvé en vitest seulement** (`EntreeDInvitation.tck-2611.test.tsx`, « par SMS : numéro →
  code juste → assistant du bailleur ») : au navigateur, `/code` envoie un SMS réel et `/verify`
  consomme l'invitation — les relevés doublent `/code` et ne vérifient jamais de code.
- **Le drapeau `phone_login` est lu dans le navigateur** (`useDrapeauConnexionParTelephone`) : tant
  qu'il n'est pas connu, aucune des deux voies n'est proposée ; éteint, la voie mot de passe est ouverte
  sans « Continuer avec mon numéro ».
- **Un seul h1, qui nomme l'invitant, le rôle et l'agence à toute largeur** : sous `xl`, la phrase
  « Aïssatou vous invite comme bailleur » est visible et « chez Dakar Immo » est en `sr-only` (l'agence
  est dans le bloc juste au-dessus) ; dès `xl`, « Rejoignez Dakar Immo » est visible et la phrase en
  `sr-only`.
- **Code consommé** : un 401 (`requires_login`), 403, 409 ou 410 à la vérification ramène à l'étape
  du numéro ; le 410 relit la page (l'invitation s'est fermée entre-temps).
- **« Ce n'est pas moi »** déconnecte par `useAuth().logout()` PUIS relit la page (`router.refresh()`) —
  l'ordre est éprouvé par ablation.
- **`Referrer-Policy: no-referrer`** : balise (`generateMetadata`), en-tête sur `/invitations/:path*`,
  et sur `/auth/*` quand `redirect` emporte `/invitations/…` (`next.config.ts`).
- **Mesure d'audience : il n'y en a aucune dans le front** (ni dépendance, ni script, ni `beforeSend`) —
  la contrainte « le jeton n'entre pas dans la mesure d'audience » tient par absence. Le ticket qui en
  posera une devra exclure `token` de l'URL relevée (TCK-610, contrainte 1).
- **Coque** : `DeclarerEntree` reçoit l'option `objetAGauche` (`CoqueDEntree.tsx`) — l'agence à gauche
  et la colonne de 400 px à droite dès 1280, dans 1080 px ; sous 1280, l'objet n'est pas rendu (la
  colonne dit l'agence). Sans l'option, rien ne change pour TCK-2598.
- **Bouton à 15 px** (`BOUTON_D_INVITATION`) : la maquette de l'invitation le dessine à 15 px à toute
  largeur, celles de la connexion et de l'orientation à 16 (`BOUTON_D_ENTREE`, `text-action`). La page
  suit sa maquette ; la constante de la famille n'est pas touchée.
- **Ablations** (chacune attrapée) : téléphone envoyé pour une invitation par SMS ; code consommé sans
  retour au numéro ; 410 sans relecture ; drapeau éteint ignoré ; relecture avant la déconnexion ; h1
  sans l'agence ; règle `/invitations` absente ; `redirect` sans `/invitations` ; 404 lu comme
  « indisponible ».
- **Fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2611.json`.
- **Invitation de relevé dans la base de démo LOCALE** (accord de team-lead, 2026-11-13) : **id 189**,
  Dakar Immo, rôle owner, e-mail fictif `moussa.ndiaye@example.test`, `sent`, expiration à 7 jours,
  Moussa Ndiaye en métadonnées — créée par `Invitation::create` direct (aucun envoi), sans bien en attente
  (Dakar Immo n'en a aucun dans la démo : rien d'existant n'est modifié). `/verify` jamais appelé ;
  passée en `revoked` après les relevés (2026-11-13, `status` et `revoked_at` posés) — relu : l'aperçu
  de son lien répond 410 `invitation.token_revoked`.
  Rouverte une fois pour rejouer AC4 sur l'état final (accord de team-lead, 2026-11-13 vers 21 h :
  `status` sent, `revoked_at` null, expiration inchangée au 20 nov.), puis repassée en `revoked` avec un
  `revoked_at` neuf — relu : 410 `invitation.token_revoked`. Rien d'autre écrit, aucun envoi, `/verify`
  jamais appelé.
- **AC4 mesuré sur l'état final** (390 × 844, champ du numéro au focus, clavier émulé de 336 px, zone
  visible 508, écritures bloquées 0) : « Continuer avec mon numéro » de 428 à 476, entier — même résultat
  que la mesure d'avant le passage du libellé « Votre numéro » en bloc.
