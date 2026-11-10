---
id: TCK-2635
title: "Profil : un sommaire de réglages (une rangée par section, ce qui demande une action marqué), les avis en onglets Reçus · À laisser · Publiés, et plus de texte technique"
status: todo
phase: P2
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, profil, avis, securite, mobile, audit-ux, app]
---

## Objectif utilisateur

Pour vérifier son numéro ou activer la double authentification, on ne traverse plus six écrans : le profil s'ouvre sur un sommaire où ce qui demande une action est marqué. L'agent lit d'abord sa réputation (avis reçus), puis ce qu'il lui reste à noter.

## Contrat de données

Aucun endpoint neuf. Les sections lisent et écrivent ce qu'elles lisent et écrivent aujourd'hui :

- `/api/auth/me` et ses mises à jour ;
- profils (`GET /api/me/profiles`) ;
- sécurité (2FA TOTP, vérification du téléphone, sessions, suppression du compte avec délai de grâce) ;
- moyens de versement (avec la double authentification à l'écriture) ;
- préférences de recherche du client, fiche publique de l'agent (langues, quartiers, TCK-2518), annuaire public ;
- avis (`ProfileReviewsList` : postés, à laisser, reçus avec filtres et signalement) ;
- exports de données personnelles (`GET/POST /api/me/data-exports`).

**La note moyenne des avis reçus** n'est rendue que par la fiche publique de l'agent. Les avis d'un compte ne la rendent pas. Le sommaire l'affiche pour l'agent depuis sa fiche publique ; pour les autres personas, elle est absente plutôt que calculée sur une page chargée.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-profil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Sommaire », « Coordonnées », « Fiche publique (agent) », « Mes avis », « Sécurité », « Sommaire (bailleur) ».
- **Sommaire (téléphone)** :
  - en-tête d'identité (avatar, nom, fonction, « Voir ma fiche publique » pour l'agent) ;
  - puis « À régler » : ce qui demande une action, avec son geste (« Vérifier votre numéro · Vérifier », « Activer la double authentification ») ;
  - puis des rangées de 56 px qui ouvrent chacune sa page, avec un point terracotta sur ce qui demande une action.
- **Rangées, selon le persona** :
  - Coordonnées ;
  - Profil professionnel (agent) ;
  - Fiche publique (agent) ;
  - Préférences de recherche (client) ;
  - Annuaire public (bailleur) ;
  - Moyens de versement (bailleur, prestataire) ;
  - Notifications ;
  - Mes avis ;
  - Sécurité ;
  - Menu et affichage ;
  - Mes espaces ;
  - Mes données ;
  - et en dernier, en rouge, « Supprimer mon compte ».
- **Bureau (≥ 1280)** : deux colonnes dès `lg`, avec un sommaire collant de 240 px à gauche (« Vue d'ensemble » en tête) et la section à droite.
- **Un seul « Enregistrer » par section**, collant en bas de la section modifiée, actif seulement s'il y a une modification.
- **Mes avis** : onglets « Reçus (12) · À laisser (2) · Publiés ».
  - La note moyenne est en tête des reçus (agent).
  - Les filtres passent dans une feuille au téléphone.
  - Le bouton d'une carte seule dit « Publier mon avis ».
- **Vocabulaire** :
  - « Fuseau horaire : Dakar (GMT) », et non « Africa/Dakar » ;
  - « Double authentification » ;
  - « Numéro au format international » ;
  - « Carte professionnelle » et non `license_number` ;
  - statut « Actif » et non « · active ».
- **Mobile (360–390)** : chaque section est une page de détail, avec l'en-tête « détail » de TCK-2617 et la flèche unique.

## Contraintes strictes (métier)

**Pas de régression : chaque section d'aujourd'hui a sa rangée et sa page.** Relevé dans `profile/page.tsx` :

- **Coordonnées** :
  - courriel « Vérifié », non modifiable ici ;
  - téléphone et encart « Vérifiez votre numéro » ;
  - bio sur 500 caractères.
- **Fuseau horaire**.
- **Menu** : « Revenir au menu par défaut » (TCK-2480), barre latérale sur cet appareil.
- **Mes profils** : une carte par profil, avec agence, rôle, statut, profil actif et informations KYC propres.
- **Selon le persona** :
  - section client (préférences de recherche) ;
  - profil professionnel de l'agent (agence liée, carte professionnelle, spécialisations) ;
  - fiche publique de l'agent (langues, quartiers 0 sur 5 par ville, « Voir ma fiche publique ») ;
  - section bailleur ;
  - annuaire public ;
  - section admin ;
  - moyens de versement (bailleur, prestataire, sous double authentification) ;
  - section prestataire.
- **Sécurité** :
  - courriel vérifié ;
  - 2FA TOTP ;
  - vérification du téléphone ;
  - sessions actives avec « Courante » et révocation ;
  - **suppression du compte** avec délai de grâce de 30 jours.
- **Données** : « Mes données personnelles » (`/app/account/privacy` : archive ZIP de portabilité, liste des exports demandés).
- **Avis** :
  - postés ;
  - à laisser (étoiles, commentaire, publier) ;
  - reçus avec filtres (bien, type, statut, cible), pagination, « En attente de validation », signalement.
- **Les adresses existantes restent** (`/app/profile`, `/app/profile/notifications`, `/app/profile/reviews`, `/app/account/privacy`) : chacune ouvre sa section, et un lien d'e-mail vers l'une d'elles ne casse pas.

**Autres règles :**

- **La suppression du compte** reste derrière ses confirmations d'aujourd'hui (double authentification si active, délai de grâce affiché). Elle est en dernier, jamais au milieu.
- **« Mes espaces »** montre les espaces sans slug, avec rôle et ville (même règle que TCK-2621).
- **Le point « à régler »** ne se calcule que sur des faits rendus par l'API (téléphone non vérifié, 2FA inactive pour un admin, fiche publique incomplète pour l'agent), jamais sur une supposition.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [ ] Sommaire (téléphone) et colonne de sommaire (bureau), rangées par persona, bloc « À régler ».
- [ ] Une page par section, aux contenus et gestes d'aujourd'hui ; un seul « Enregistrer » par section.
- [ ] Mes avis en trois onglets, note moyenne de l'agent, filtres en feuille.
- [ ] Vocabulaire : fuseau, 2FA, format du téléphone, carte professionnelle, statut des profils.
- [ ] Adresses existantes conservées.
- [ ] Tests :
  - rangées exactes par persona (agent, bailleur, prestataire, client, admin) ;
  - « Vérifier votre numéro » présent si et seulement si le téléphone n'est pas vérifié ;
  - aucun texte `license_number` ni « · active » rendu ;
  - « Supprimer mon compte » en dernière rangée ;
  - `/app/profile/reviews` ouvre « Mes avis » ;
  - un seul bouton « Enregistrer » visible par section.

## Critères d'acceptation

- [ ] AC1 — Agent au téléphone non vérifié et sans 2FA, à 390 : le premier écran de `/app/profile` montre « À régler », avec « Vérifier votre numéro » et « Activer la double authentification », au-dessus du pli.
- [ ] AC2 — La page de l'agent ne contient nulle part les chaînes `license_number` ni `active` en minuscule après un point médian (DOM entier, sections ouvertes).
- [ ] AC3 — À 1280, le sommaire de 240 px reste visible en défilant une section longue (position collante relevée après défilement).
- [ ] AC4 — Bailleur : le sommaire a « Moyens de versement » et « Annuaire public », et n'a pas « Fiche publique ». Modifier un moyen de versement demande toujours la double authentification (même requête qu'avant le ticket).
- [ ] AC5 — « Mes avis » d'un agent ouvre sur « Reçus ». La note moyenne affichée est celle de sa fiche publique (même valeur au réseau). « Signaler » reste sur chaque avis reçu.
- [ ] AC6 — `/app/account/privacy` ouvre la section « Mes données », et « Demander mon export » envoie la même requête qu'avant le ticket.

## Hors périmètre

- Les préférences de notification (TCK-2636).
- Le score de complétude de la fiche de l'agent (ambition de l'audit, non retenue).
- Le choix d'espace (TCK-2621).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
