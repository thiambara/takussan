---
id: TCK-632
title: "Un compte ouvert par téléphone ajoute et vérifie son adresse e-mail depuis le profil"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-11
updated: 2026-10-11
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [api, front, auth, profil, email, telephone]
---

## Objectif utilisateur

- **La personne qui a ouvert son compte par téléphone** ajoute une adresse e-mail depuis
  `/app/profile`, reçoit le lien de vérification, et peut le renvoyer tant qu'elle ne l'a pas suivi.

## Contexte

Retour du porteur (2026-10-11) : compte créé par numéro de téléphone, impossible d'ajouter puis de
vérifier un e-mail dans le profil. Relevé dans le code :

- le compte naît avec `users.email = null` (`PhoneLoginService`, TCK-589) ;
- `ProfileContactSection` affichait l'adresse dans un champ `disabled` ;
- `PUT /auth/profile` (`UpdateProfileRequest`) n'acceptait aucun champ `email` ;
- `POST /auth/email/resend` n'avait qu'un appelant, la page `/auth/verify-email`.

Aucune voie, donc, ni pour ajouter l'adresse ni pour la vérifier.

## Décision

- **Ajouter, ou corriger une adresse jamais vérifiée : libre.** L'API range l'adresse (repliée en
  minuscules), remet `email_verified_at` à `null` et envoie le lien (`RegistrationConfirmationNotification`).
- **Remplacer une adresse VÉRIFIÉE : refusé (403 `email.change_requires_proof`).** Elle ouvre le
  compte (mot de passe oublié) au même titre qu'un numéro vérifié, et aucune preuve sur l'ancienne
  boîte n'existe encore. Le front la laisse en lecture seule.
- **Unicité jugée sur l'expression de `users_email_lower_unique`** (ADR-0025) : une variante de
  casse d'une adresse prise rend 422, pas la 500 de l'index.
- **Le renvoi sans adresse rend 422 `email.missing`.**
- **Le code de suppression de compte reste par SMS tant que l'adresse ajoutée n'est pas vérifiée**
  (`DeletionStepUpService`) : une adresse mal saisie ne doit pas le recevoir.

## Critères d'acceptation

- [x] Un compte sans adresse envoie `email` à `PUT /auth/profile` : 200, adresse rangée, non vérifiée,
      lien envoyé.
- [x] Une adresse non vérifiée se corrige ; une adresse vérifiée ne se remplace pas (403, rien
      d'écrit, aucun lien).
- [x] La même adresse renvoyée (casse comprise) n'envoie aucun lien.
- [x] Une adresse prise sous une autre casse : 422 sur `email`.
- [x] `POST /auth/email/resend` sans adresse : 422.
- [x] Le step-up de suppression part par SMS tant que l'adresse n'est pas vérifiée.
- [x] Profil : champ modifiable tant que l'adresse n'est pas vérifiée, badge « Non vérifié »,
      « Renvoyer le lien » ; lecture seule une fois vérifiée.
- [x] Chaque test neuf échoue quand on retire le correctif qu'il garde (ablation).
- [x] Au navigateur (local) : connexion par téléphone, adresse ajoutée, lien suivi, badge « Vérifié »
      et alertes e-mail débloquées. La ligne « E-mail » de la sécurité et le lien « Vérifier mon
      email » des préférences mènent aux coordonnées au lieu d'une boîte inexistante.

## Hors périmètre

- **Remplacer une adresse vérifiée** avec une preuve (lien ou code sur l'ancienne boîte, mot de
  passe, TOTP), sur le modèle de `PhoneChangeGuard`.
- **Retirer son adresse.**
- **Prévenir le numéro vérifié qu'une adresse a été ajoutée.** Le premier ajout est libre, comme le
  premier numéro (TCK-589) : un jeton volé peut s'y donner une adresse, puis un mot de passe par
  « mot de passe oublié ». Le risque est le même que pour le premier numéro ; à traiter ensemble.
