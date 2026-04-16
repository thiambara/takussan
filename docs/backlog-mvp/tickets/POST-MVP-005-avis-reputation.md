---
id: POST-MVP-005
title: "Système d'avis et réputation"
status: todo
slice: "Post-MVP Phase 2"
estimate: 2 weekends
created: 2026-04-16
depends_on: [POST-MVP-004]
blocks: []
tags: [front, reviews, post-mvp]
---

## Objectif utilisateur

Les seekers et propriétaires peuvent laisser des avis après visite/transaction pour construire la confiance.

## Prérequis

**Déclencheur** : > 100 visites complétées

## Contrat de données

- Avis seekers : qualité annonce, accueil propriétaire
- Avis propriétaires : sérieux seeker
- Notes 5 étoiles + commentaire
- Modération anti-spam

## Contraintes strictes

- **Auth requis** : seulement utilisateurs vérifiés
- **Post-transaction** : seulement après interaction réelle
- **Modéré** : pas de faux avis
- **Transparent** : avis modérés visibles

## Delta à produire

### Backend (Laravel)
- [ ] Models : Review, ReviewReply
- [ ] ReviewController : créer, modérer, répondre
- [ ] Policy : seulement après interaction
- [ ] Modération : flag + validation
- [ ] Calcul scores moyens

### Frontend (Next.js)
- [ ] Widget avis sur annonces
- [ ] Page laisser un avis
- [ ] Section réputation profil
- [ ] Modération interface admin
- [ ] Graphiques scores

### Features
- [ ] Avis seekers (annonce + propriétaire)
- [ ] Avis propriétaires (sérieux seeker)
- [ ] Réponse aux avis
- [ ] Signalement avis inappropriés
- [ ] Badges "Top propriétaire"

## Critères d'acceptation

- [ ] Seuls les utilisateurs ayant interagi peuvent laisser un avis
- [ ] Modération efficace (< 24h)
- [ ] Scores calculés correctement
- [ ] Interface claire et équitable

## KPI à tracker

- **Review rate** : > 60% des interactions génèrent un avis
- **Average rating** : > 4.0/5 (qualité globale)
- **Moderation time** : < 24h

## Hors périmètre

- Système de résolution litiges
- Vérification tierce partie
- Assurance transactions
- Scoring complexe
