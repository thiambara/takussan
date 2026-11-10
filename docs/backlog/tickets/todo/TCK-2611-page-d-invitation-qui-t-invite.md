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
depends_on: [TCK-2598, TCK-2609, TCK-2610]
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

## Hors périmètre

- Les assistants de rôle (TCK-2613) ; les dialogues d'envoi (TCK-448).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
