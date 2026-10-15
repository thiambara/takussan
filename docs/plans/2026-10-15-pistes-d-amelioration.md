# Pistes d'amélioration et corrections — exploration du 2026-10-15

Relevé en lecture seule, un angle à la fois, par des agents d'exploration lancés depuis la
session de TCK-651 (branche `feat/reglages-metier-au-catalogue`). **Rien ici n'est un ticket** :
chaque piste qui mérite d'être faite passe par `/write-spec`, et toute décision structurelle par un
ADR.

Chaque constat cite `fichier:ligne` et dit comment il a été établi (lu, mesuré, déduit). *Une piste
déduite d'un nom ou d'un docblock n'est pas un constat* : elle est marquée **à vérifier**.

Gravité : 🔴 défaut avéré (comportement faux aujourd'hui) · 🟠 risque ou dette qui coûte · 🟢
amélioration.

## Angles

| # | Angle | État |
|---|-------|------|
| 1 | Recherche d'un bien (public et `/app`) : pertinence, filtres, performances, UX | en cours |
| 2 | Performances des requêtes : N+1, index manquants (FK non indexées sous PostgreSQL), pagination | à faire |
| 3 | Isolation d'agence et autorisation : routes, policies, fuites entre agences | à faire |
| 4 | Argent : montants, devises, arrondis, pénalités, factures, idempotence des paiements | à faire |
| 5 | Jobs planifiés et files : idempotence, reprise, `withoutOverlapping`, échecs muets | à faire |
| 6 | Texte affiché par l'API (principe n° 5) et trous d'i18n fr/en/wo | à faire |
| 7 | Accessibilité du front : formulaires, focus, contrastes, lecteurs d'écran | à faire |
| 8 | Parcours mobile : formulaires longs, tableaux, défilement, cibles tactiles | à faire |
| 9 | Pages publiques : SEO, métadonnées, temps de chargement, images | à faire |
| 10 | Médias : tailles, conversions, disques privés/publics, nettoyage | à faire |
| 11 | Notifications (e-mail, SMS, WhatsApp, in-app) : doublons, préférences, échecs | à faire |
| 12 | Tests : zones non couvertes, tests qui seraient verts sans le code qu'ils gardent | à faire |
| 13 | Code mort et doublons : services, composants, routes, clés i18n | à faire |
| 14 | Observabilité : erreurs avalées, journaux, alertes, ce qu'on ne verrait pas en production | à faire |
| 15 | Parcours d'une agence neuve : inscription, mise en service, premier bien, premier bail | à faire |

---
