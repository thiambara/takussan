---
id: TCK-2606
title: "Voie e-mail en deux onglets, mot de passe oublié qui propose le code SMS, vérification de l'adresse qui pousse à continuer"
status: todo
phase: P2
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2604, TCK-2605]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, auth, email, audit-ux, app]
---

## Objectif utilisateur

Celui qui préfère l'e-mail se connecte ou crée son compte en trois contrôles ; celui qui a oublié son mot de passe apprend qu'un code SMS suffit ; celui qui vient de s'inscrire continue sans attendre sa boîte mail, et sait à quelle adresse le lien est parti.

## Contrat de données

Existant : `POST /api/auth/login`, `POST /api/auth/register` (assoupli par TCK-2605 : e-mail + mot de passe), `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, renvoi du lien de vérification, correction d'une adresse non vérifiée (TCK-632), compte relu après vérification (TCK-2162). L'adresse du compte est lue sur `GET /api/auth/me` (session ouverte dès l'inscription).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-connexion&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Voie e-mail », « Voie e-mail : créer », « Mot de passe oublié », « Lien envoyé », « Vérifier l'adresse ».
- Voie e-mail : « Avec votre e-mail », deux onglets « J'ai un compte » / « Créer un compte » ; créer = e-mail, mot de passe (œil, règle en **aide permanente sous le champ**, plus en *placeholder*), case des conditions avec liens, « Votre prénom vous sera demandé à l'écran suivant — rien d'autre. » ; lien bas « Utiliser plutôt mon numéro ».
- Mot de passe oublié : sous le bouton, encadré « Vous avez un numéro sur votre compte ? Recevez plutôt un code par SMS — sans rien réinitialiser. » vers la voie téléphone. Envoyé : le message tel qu'il attend dans la boîte (expéditeur, objet, première ligne), « Lien envoyé à a•••@gmail.com », renvoi à rebours, « Ouvrir Gmail » quand l'adresse est Gmail.
- Vérifier l'adresse : « Un lien est parti à **{adresse}**. Vous pouvez continuer : nous vous le rappellerons. », bouton plein **« Continuer »** (vers l'intention), liens « Renvoyer le lien » (à rebours) et « Corriger l'adresse ».
- **Téléphone (360-390 px)** : clavier ouvert, bouton au-dessus ; le bien quitté reste dans la barre (TCK-2604). **Bureau (≥ 1280 px)** : même contenu dans la colonne de droite d'TCK-2604, ou colonne centrée de 480 px pour oubli et vérification.
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton — connexion, inscription, oubli et « Vérifier l'adresse » compris.

## Contraintes strictes (métier)

Pas de régression — restent : afficher / masquer le mot de passe, « Mot de passe oublié ? », bandeau « Mot de passe modifié » après réinitialisation (`?reset=1`), les trois messages d'échec Google lus dans l'URL, second facteur après le mot de passe, réponse de l'oubli identique compte ou non (pas de fuite d'existence), page de réinitialisation qui nomme l'adresse, état « Lien invalide » avec « Demander un nouveau lien », échec du lien de vérification avec son issue, compte relu après vérification, « Continuer » qui transporte l'intention.

- La confirmation du mot de passe disparaît de l'inscription (l'œil la remplace) ; la réinitialisation garde la sienne.
- Un compte **déjà vérifié** qui ouvre `/auth/verify-email` est redirigé vers sa destination.
- Le lien de vérification ouvert dans un autre onglet ramène à l'intention d'origine quand elle est connue (aujourd'hui il la perd).
- L'adresse est masquée sur l'écran « Lien envoyé » de l'oubli (aucune session : on ne confirme rien) ; elle est en clair sur « Vérifier l'adresse » (compte en session).
- Après l'inscription, l'étape prénom de `/onboarding/intention` s'affiche (prénom requis, nom facultatif).
- Libellés neufs en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Voie e-mail en deux onglets (connexion, création à trois contrôles).
- [ ] Oubli : sortie vers le code SMS ; écran « Lien envoyé ».
- [ ] Vérification : adresse dite, « Continuer » en plein, renvoi à rebours, correction, redirection d'un compte vérifié, intention gardée par le lien.
- [ ] Tests : création sans prénom → étape prénom ; règle du mot de passe visible pendant la frappe ; oubli → même écran compte ou non ; compte vérifié redirigé ; le lien de vérification rend l'intention.

## Critères d'acceptation

- [ ] AC1 — L'onglet « Créer un compte » envoie `{email, password}` (sans `password_confirmation`, vérifié au réseau) puis montre « Comment vous appelez-vous ? » / l'étape prénom.
- [ ] AC2 — Après avoir tapé trois caractères dans le mot de passe, le texte « 8 caractères minimum… » est toujours dans le DOM et visible.
- [ ] AC3 — `/auth/verify-email` pour un compte dont `email_verified_at` est posé redirige vers la destination ; pour un compte non vérifié, l'adresse du compte figure en clair dans la page.
- [ ] AC4 — « Mot de passe oublié » rend le même écran « Lien envoyé » pour une adresse connue et inconnue (comparaison DOM).

## Hors périmètre

- La voie téléphone (TCK-2604) ; l'écran de réinitialisation lui-même (inchangé).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
