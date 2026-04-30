---
id: POST-MVP-001
title: "Authentification complète seekers"
status: todo
slice: "Post-MVP Phase 1"
estimate: 2 weekends
created: 2026-04-16
depends_on: [MVP-007]
blocks: [POST-MVP-002]
tags: [front, auth, post-mvp]
---

## Objectif utilisateur

Un visiteur peut créer un compte pour sauvegarder ses recherches, favoris et historique de contacts.

## Prérequis

**Déclencheur** : 10+ contacts/semaine atteints pendant 2 semaines consécutives

## Contrat de données

- Auth complète : register/login/forgot password
- Profils seekers : nom, email, téléphone, préférences
- Session JWT avec refresh token
- Social login optionnel (Google/Facebook)

## Contraintes strictes

- **Pas de barrière** : visiteurs peuvent toujours contacter sans compte
- **Valeur ajoutée** : compte doit simplifier la recherche
- **Mobile-first** : formulaire optimisé mobile
- **Privacy** : RGPD conforme

## Delta à produire

### Backend (Laravel)
- [ ] Laravel Sanctum pour API auth
- [ ] Model `User` avec rôle `seeker`
- [ ] AuthController : register, login, logout, refresh
- [ ] Password reset flow
- [ ] Social login controllers (optionnel)

### Frontend (Next.js)
- [ ] Pages : `/register`, `/login`, `/forgot-password`
- [ ] AuthContext global
- [ ] Protected routes
- [ ] Profile page seeker
- [ ] Middleware auth

### Features seekers
- [ ] Sauvegarde recherches favorites
- [ ] Historique annonces vues
- [ ] Historique contacts WhatsApp
- [ ] Alertes email nouvelles annonces
- [ ] Notes privées sur annonces

## Critères d'acceptation

- [ ] Inscription < 2 minutes
- [ ] Login persistant (30 jours)
- [ ] Mot de passe oublié fonctionnel
- [ ] Compte apporte une valeur réelle vs visiteur

## KPI à tracker

- **Conversion visiteur → inscrit** : objectif > 5%
- **Activation rate** : % inscrits qui utilisent une feature
- **Retention week 1** : > 20%

## Hors périmètre

- Vérification identité
- Scoring crédit
- Documents upload
- Abonnements payants
