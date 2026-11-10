---
id: TCK-2604
title: "Entrer : une seule porte par numéro, surmontée de ce que le visiteur était en train de faire"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598]
blocks: [TCK-2606]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, auth, mobile, intention, audit-ux, app]
---

## Objectif utilisateur

Le visiteur à qui l'on demande un compte au milieu d'un geste voit le bien qu'il quittait et l'action interrompue, entre son numéro sans avoir à choisir entre « se connecter » et « s'inscrire », et reprend là où il s'était arrêté.

## Contrat de données

Existant, re-mesuré sur `dev` (1bce3798a) :

- `POST /api/auth/phone/request-code` (202, même réponse que le numéro ait un compte ou non, `retry_after`) et `POST /api/auth/phone/verify-code` (compte créé au premier code ; `requires_2fa`, `requires_terms`) ; drapeau `phone_login` lu par le navigateur.
- L'intention : `?redirect=` filtré (`destinationInterne`, `destinationPublique`), posée par `hrefConnexion` (barre publique) et par les dialogues de la fiche (`PropertyReservationDialog`), relue jusqu'à `/onboarding/intention` (TCK-624). L'URL ne porte aujourd'hui que la page, jamais l'action.
- Le bien quitté : `GET /api/public/properties/{slug}` avec les seuls champs de la carte (titre, quartier, prix, fréquence, couverture).
- `/auth/register` (`register/page.tsx`) rend la même voie téléphone sous un autre titre.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-connexion&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Numéro (venant d'une visite) », « Numéro (arrivée directe) », « Code ». **Le bureau est validé tel quel ; le téléphone a été redessiné le 2026-11-10.**
- **Téléphone (360-390 px)** : en tête, la photo du bien quitté (176 px) qui porte l'action (« Votre demande de visite ») et le bien (« Studio meublé · Mermoz · 250 000 F CFA / mois ») ; « Entrez votre numéro », « Nouveau ou déjà inscrit : un code par SMS suffit. » ; le numéro est le seul champ, en grand, avec sa coche quand il est complet ; Google et l'e-mail tiennent sur une ligne ; « Recevoir un code » est posé juste au-dessus du pavé numérique ouvert. Arrivée directe (sans intention) : la photo porte la marque et ce que le compte ouvre (« Vos visites, vos favoris, vos annonces. »).
- Écran du code : le bien reste dans la barre du haut (vignette, action, nom du bien) ; « Code envoyé au 77 123 45 67 · Modifier » ; six cases, remplissage automatique du SMS, envoi au sixième chiffre ; « Valable 5 minutes · Renvoyer le code dans 54 s » ; « Tu reprends là où tu t'es arrêtée » ; bouton « Me connecter ».
- **Bureau (≥ 1280 px)** : deux colonnes ; à gauche (45 %), l'objet de l'intention — grande photo du bien, titre, prix, l'action et sa date si elle est connue ; à droite, le formulaire de 400 px. Sans intention, aucune villa ni slogan : la marque seule (une photo de Dakar **libre de droits, fournie par le porteur** — décidé le 2026-11-10 ; sans elle, la marque seule).
- Le séparateur dit « ou » (plus « OU CONTINUER AVEC EMAIL » au-dessus de Google).
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — restent, à l'identique de comportement :

- Voie téléphone en tête quand `phone_login` est allumé, voie e-mail sinon ; bascule dans les deux sens.
- +221 hors du champ et son aide (« À l'étranger ? Commence par + ») ; code à 6 chiffres valable 5 min ; renvoi au délai rendu par l'API ; changer de numéro ; mention des CGU sous le champ.
- Messages distincts : verrou (423), compte suspendu, trop de demandes (429), numéro invalide (422), indicatif refusé, code faux ; code affiché hors production (« Environnement de test », « Utiliser ce code ») ; étape « conditions » d'un compte né du Radar ; second facteur (code d'application ou de récupération, « Annuler »).
- Google seulement s'il est configuré, intention mémorisée avant le départ ; un échec de chargement des fournisseurs **retire** le bouton (plus de pilule grise ni de « Impossible de charger les fournisseurs d'authentification ») ; après un échec Google, le message propose la voie affichée (le numéro), pas l'e-mail.
- Sortie unique vers `/onboarding/intention?redirect=…` (TCK-624), filtre anti-redirection ouverte ; « Retour » vers la page publique quittée ; session ouverte par `openSession` seulement.
- **`/auth/register` redirige vers `/auth/login` en gardant `redirect`** (et l'onglet « Créer un compte » de la voie e-mail, TCK-2606) ; aucun lien entrant ne casse.
- **Pas d'énumération** : rien sur l'écran du numéro ou du code ne dit avant le code si le numéro a un compte ; le bouton du code a un seul libellé.
- L'action affichée vient d'une liste fermée (réservation, visite, alerte, favori, publication, invitation) posée par l'appelant ; une valeur inconnue est ignorée ; aucun texte de l'URL n'est affiché tel quel.
- Libellés neufs en `fr`/`en`/`wo` ; « Valider » disparaît.

## Delta à produire

- [ ] Écran unique du numéro (téléphone redessiné, bureau validé), carte et photo d'intention.
- [ ] Paramètre d'action facultatif, liste fermée, posé par les appelants qui interrompent une action (dialogue de réservation de la fiche, alerte, favori, « Me connecter » du départ de `/publish`).
- [ ] Écran du code : six cases, envoi au sixième chiffre, rappel du numéro et « Modifier ».
- [ ] `/auth/register` → `/auth/login` (redirection qui garde `redirect`).
- [ ] Tests : intention « réservation » d'une fiche → carte du bien ; action inconnue ignorée ; sans intention → aucune image de bien ; envoi automatique au sixième chiffre une seule fois ; `/auth/register?redirect=/publish` → `/auth/login?redirect=/publish` ; échec des fournisseurs → pas de bouton Google ; les huit messages d'erreur rendus ; `login-retour-a-l-origine` et `inscription-intention` restent verts.

## Critères d'acceptation

- [ ] AC1 — Depuis la fiche d'un bien, « Réserver » sans compte ouvre la connexion qui montre la photo, le titre et le prix de CE bien (comparés à la fiche), et l'action « réservation ».
- [ ] AC2 — À 390 × 844, pavé numérique émulé, le bouton « Recevoir un code » est entièrement visible au-dessus du pavé.
- [ ] AC3 — Au sixième chiffre, exactement un `POST /api/auth/phone/verify-code` part (réseau) ; un code faux laisse les six cases et dit « Vérifiez-le, ou demandez-en un nouveau ».
- [ ] AC4 — `GET /auth/register?redirect=%2Fpublish` aboutit sur `/auth/login?redirect=%2Fpublish` (307 ou navigation client), et le parcours ramène à `/publish`.
- [ ] AC5 — La réponse de `request-code` et l'écran du code sont identiques pour un numéro connu et inconnu (comparaison DOM).

## Hors périmètre

- Voie e-mail, mot de passe oublié, vérification de l'adresse (TCK-2606).
- La connexion sans quitter la page (approche C, non retenue) ; la connexion par WhatsApp.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
