# Smoke Browser QA — Super-admin plateforme

Source QA : `docs/qa/super-admin-qa.md`  
Date : 2026-05-08  
Testeur : Codex  
Environnement : `http://localhost:3000` + `http://127.0.0.1:8002`  
Méthode : Chrome headless piloté via CDP + appels API directs Laravel/Sanctum.

## Synthèse

Le smoke test confirme que la console `/super-admin/*` existe, que le shell plateforme est distinct, que les guards UI/API bloquent les rôles non-super-admin, et que les principales pages se chargent sans crash.

Points bloquants / anomalies observées :

| # | Sévérité | TC | Page / API | Description | Statut |
|---|---|---|---|---|---|
| 1 | Moyenne | TC-SUP-07 | `GET /api/admin/reports/growth/export?format=csv...` | L’export retourne `200` mais en JSON (`Content-Type: application/json`), pas un téléchargement CSV. | Ouvert |
| 2 | Moyenne | TC-SUP-08 | `/super-admin/agencies` | La liste agences affiche nom/slug/statut/email/licence/actions, mais pas les colonnes demandées : logo, membres, biens, création, dernière activité. | Ouvert |
| 3 | Moyenne | TC-SUP-15 | `/super-admin/users` | Les rôles cross-tenant sont incomplets pour les comptes agence seedés : beaucoup de lignes affichent `Rôles : —`. | Ouvert |
| 4 | Moyenne | TC-SUP-49 | `/admin/properties` | La navigation finit sur `/super-admin/properties`, pas sur `/admin/properties` comme attendu par le cas QA. | Ouvert |
| 5 | Haute | TC-SUP-54 | `GET /api/agencies` | En `agency_admin`, la route retourne les 3 agences seedées, au lieu de limiter aux agences dont l’utilisateur est membre. | Ouvert |

Notes :
- Les actions destructives ou à effet fort (suspendre agence, force-delete, maintenance ON/OFF, paiement, suppression, reset 2FA, révocation sessions) n’ont pas été confirmées. Elles sont notées `⚠️ Partiel` ou `🔲 Non testé`.
- Le rate-limit de login s’est déclenché après plusieurs tentatives (`429`), puis le cache de dev a été vidé pour poursuivre. C’est cohérent avec TC-SUP-51 Q2.

## Résultats Détaillés

| TC | Statut | Réponses |
|---|---|---|
| TC-SUP-01 — Connexion super_admin | ⚠️ Partiel | Q1 : login API `super@demo.takussan.sn / password` OK (`200`), puis session navigateur authentifiée sur `/app`. Le submit UI complet n’a pas été validé jusqu’au bout. Q2 : le lien `Administration` est visible dans `/app`. |
| TC-SUP-02 — Distinction des trois espaces | ✅ Pass | Q1 : `/app` utilise une coque claire, `/admin` une coque sombre admin, `/super-admin` la coque stone/ambre avec `Console Takussan / Espace plateforme`. Q2 : distinction visuelle claire. Q3 : lien `Retour à l'espace perso` présent et pointe vers `/app`. |
| TC-SUP-03 — Sidebar super-admin groupée | ✅ Pass | Q1 : 5 groupes visibles : Vue d’ensemble, Opérations, Revenus, Contenu, Plateforme. Q2 : `Système` expose `Santé`, `Maintenance`, `Planificateur`. Q3 : l’actif a un fond ambre translucide et texte ambre clair. |
| TC-SUP-04 — Garde serveur `/super-admin` | ✅ Pass | Q1 : `agency_admin` redirigé vers `/app`. Q2 : `agent` et `customer` redirigés vers `/app`. Q3 : anonyme redirigé vers `/auth/login?redirect=%2Fsuper-admin`. |
| TC-SUP-05 — Vue d’ensemble plateforme | ✅ Pass | Q1 : `Console Takussan` visible. Q2 : métriques agences, utilisateurs, biens et revenu visibles. Q3 : `/api/admin/system/metrics` retourne `200` avec les mêmes ordres de grandeur : 3 agences, 211 utilisateurs actifs, 3 biens publiés, revenu plateforme. |
| TC-SUP-06 — Page Reporting | ✅ Pass | Q1 : sections `Croissance`, `Revenu`, `Cohortes`, `Funnel` visibles. Q2 : filtres période/granularité visibles via sélecteurs. |
| TC-SUP-07 — Export CSV | ❌ Fail | Q1 : bouton `Exporter CSV` visible, mais l’appel direct avec `format=csv` retourne du JSON, pas un CSV téléchargeable. Q2 : audit d’export non vérifié. |
| TC-SUP-08 — Liste des agences | ⚠️ Partiel | Q1 : toutes les agences seedées sont listées avec nom, slug, statut, email/licence et actions, mais colonnes logo/membres/biens/date/dernière activité absentes. Q2 : recherche et filtre statut visibles, pas de plage de dates. Q3 : tri date/nom/taille/volume non observé. |
| TC-SUP-09 — Vérifier une agence | ⚠️ Partiel | Q1 : action `Vérifier` visible sur les cartes agences, confirmation non ouverte/validée. Q2 : audit non vérifié. |
| TC-SUP-10 — Retirer la vérification | ⚠️ Partiel | Q1 : action `Déverifier` visible, confirmation et audit non validés. |
| TC-SUP-11 — Suspendre une agence | ⚠️ Partiel | Q1 : action `Suspendre` visible. Q2/Q3 : suspension, notifications et blocage agent non exécutés. |
| TC-SUP-12 — Détail d’une agence | ⚠️ Partiel | Q1 : endpoints détail/team/properties/health répondent `200` pour l’agence 1. Q2 : endpoint KYC agence répond `200`. Vue détail navigateur non parcourue. |
| TC-SUP-13 — Abonnement agence | ⚠️ Partiel | Q1 : endpoint subscription répond `200` mais `data: null` sur l’agence 1. Q2/Q3 : changement/annulation non exécutés. |
| TC-SUP-14 — Création agence | ⚠️ Partiel | Q1 : bouton `Nouvelle agence` visible. Soumission non exécutée. |
| TC-SUP-15 — Liste utilisateurs | ⚠️ Partiel | Q1 : utilisateurs cross-tenant visibles, mais rôles/agences/statut/email vérifié/2FA/dernière connexion pas tous visibles. Q2 : recherche nom/email visible. Q3 : filtres rôle/agence/statut/vérifié/2FA non observés. |
| TC-SUP-16 — Détail utilisateur | ⚠️ Partiel | Q1 : endpoints `/users/1`, `/sessions`, `/activity` répondent `200`. Vue navigateur non parcourue. |
| TC-SUP-17 — Actions support | 🔲 Non testé | Q1-Q5 : actions à effet fort non exécutées. |
| TC-SUP-18 — Export RGPD user | 🔲 Non testé | Q1 : non exécuté. |
| TC-SUP-19 — Impersonation | ⚠️ Partiel | Q1 : boutons `Impersonifier` visibles. Q4 : self-impersonation retourne bien `422 "You cannot impersonate yourself."`. Q2/Q3/Q5-Q7 : démarrage/arrêt/bandeau/audit non exécutés. |
| TC-SUP-20 — Biens cross-tenant | ⚠️ Partiel | Q1 : liste biens visible avec agences et actions. Q2 : filtres agence/statut/type/publication/recherche visibles ; filtre signalements/date non observé. |
| TC-SUP-21 — Modération forcée plateforme | 🔲 Non testé | Q1 : action destructive non exécutée. |
| TC-SUP-22 — Force delete | 🔲 Non testé | Q1/Q2 : non exécuté. |
| TC-SUP-23 — File KYC | ⚠️ Partiel | Q1 : page `File KYC` chargée. Q2/Q3 : dossier/action vérifier/rejeter non ouverts. |
| TC-SUP-24 — File modération plateforme | ⚠️ Partiel | Q1 : file cross-tenant visible avec filtres et items. Q2 : décision non exécutée. |
| TC-SUP-25 — Catalogue plans | ✅ Pass | Q1 : page plans visible avec formulaire et catalogue. |
| TC-SUP-26 — Créer un plan | ⚠️ Partiel | Q1 : champs code/libellé/prix/fee et bouton `Créer` visibles. Submit non exécuté. |
| TC-SUP-27 — Modifier / supprimer plan | 🔲 Non testé | Q1/Q2 : non exécuté. |
| TC-SUP-28 — Liste reversements | ✅ Pass | Q1 : page reversements visible avec filtres agence/statut et bouton clôture. |
| TC-SUP-29 — Clôture période | ⚠️ Partiel | Q1 : bouton `Clôturer` et champs période/agence visibles. Génération non exécutée. |
| TC-SUP-30 — Approuver / payé | 🔲 Non testé | Q1-Q3 : non exécuté. |
| TC-SUP-31 — Annuler reversement | 🔲 Non testé | Q1 : non exécuté. |
| TC-SUP-32 — Audit cross-tenant | ⚠️ Partiel | Q1 : endpoint `/api/admin/audit` répond `200`; page audit visible. Q2 : filtres événement/causer/date visibles, filtre agence/super_admin only non confirmé. Q3 : détails entrée non audités exhaustivement. |
| TC-SUP-33 — Recherche événements sensibles | 🔲 Non testé | Q1/Q2 : filtres spécifiques non appliqués. |
| TC-SUP-34 — Vue système | ✅ Pass | Q1 : sous-pages Santé, Maintenance, Planificateur visibles dans sidebar et page système. |
| TC-SUP-35 — Santé | ⚠️ Partiel | Q1 : page healthcheck visible, endpoint `200`. Q2 : section `Jobs échoués` visible. Q3 : `Rejouer tout` visible ; retry/delete non exécutés. |
| TC-SUP-36 — Maintenance | ⚠️ Partiel | Q1 : état courant et formulaire de fenêtre visibles. Q2/Q3 : activation/désactivation non exécutées. |
| TC-SUP-37 — Planificateur | ✅ Pass | Q1 : page `Scheduler` et `Tâches planifiées` visibles, endpoint `200`. |
| TC-SUP-38 — API métriques | ✅ Pass | Q1 : super_admin reçoit `200` sur `/api/admin/system/metrics`. Q2 : agency_admin reçoit `403`. |
| TC-SUP-39 — Tags | ⚠️ Partiel | Q1 : page tags visible avec recherche, filtres, bouton nouveau, actions modifier/supprimer. CRUD non exécuté. |
| TC-SUP-40 — Enums métier | ⚠️ Partiel | Q1 : enums visibles. Q2 : ajouter/modifier/désactiver visibles mais non exécutés. |
| TC-SUP-41 — Templates | ⚠️ Partiel | Q1 : templates visibles par event/channel. Q2 : éditeur sujet/corps + preview/enregistrer visibles, non exécutés. |
| TC-SUP-42 — Annonces | ⚠️ Partiel | Q1 : liste/composer visibles. Q2 : création/modification/désactivation non exécutées. |
| TC-SUP-43 — Paramètres plateforme | ⚠️ Partiel | Q1 : groupes devises, formats, frais, limites visibles. Q2 : sauvegarde non exécutée. |
| TC-SUP-44 — Intégrations | ⚠️ Partiel | Q1 : intégrations visibles avec boutons tester/éditer/webhooks. Q2/Q3 : non exécutés. |
| TC-SUP-45 — Feature flags | ⚠️ Partiel | Q1 : flags visibles avec tester/configurer. Q2/Q3 : toggle/override non exécutés. |
| TC-SUP-46 — Règles d’alerte | ⚠️ Partiel | Q1 : page alertes visible avec `Nouvelle règle`. Q2 : opérations non exécutées. |
| TC-SUP-47 — Modération avis `/admin/moderation` | ⚠️ Partiel | Q1 : file avis visible dans shell admin. Q2 : actions non exécutées. |
| TC-SUP-48 — Modération biens `/admin/moderation/properties` | ⚠️ Partiel | Q1 : file biens signalés visible avec approuver/rejeter. |
| TC-SUP-49 — `/admin/properties` | ❌ Fail | Q1 : navigation vers `/admin/properties` termine sur `/super-admin/properties`; la page attendue sous `/admin/*` n’est pas conservée. |
| TC-SUP-50 — `/admin/audit` | ⚠️ Partiel | Q1 : page audit admin visible avec filtres et export. Vérification cross-tenant complète non réalisée. |
| TC-SUP-51 — Protection compte super_admin | ⚠️ Partiel | Q1 : pas d’avertissement 2FA persistant observé dans le smoke. Q2 : rate-limit login observé (`429`) après tentatives répétées. |
| TC-SUP-52 — Actions tracées | 🔲 Non testé | Q1/Q2 : actions destructives non exécutées, audit global non validé. |
| TC-SUP-53 — Middleware super-admin | ⚠️ Partiel | Q1 : les routes GET testées répondent `200` super_admin, `403` agency_admin/agent, `401` anonyme. Les POST destructifs n’ont pas été exécutés. |
| TC-SUP-54 — Pas de fuite `/api/agencies/*` | ❌ Fail | Q1 : super_admin voit les agences. Q2 : agency_admin voit aussi les 3 agences seedées, donc le scope attendu n’est pas respecté. |
| TC-SUP-55 — Switch profil multi-agence | 🔲 Non testé | Q1/Q2 : précondition non établie dans ce smoke. |
| TC-SUP-56 — Consistance compteurs | ⚠️ Partiel | Q1/Q2 : métriques plateforme et pages chargées, mais comparaison exhaustive des sommes par agence non effectuée. |
| TC-SUP-57 — Performance vues plateforme | 🔲 Non testé | Q1/Q2 : seed requis non présent (211 users, pas 5000) et pas de trace perf dédiée. |

## API Guard Matrix Échantillonnée

| Route | super_admin | agency_admin | agent | anonyme |
|---|---:|---:|---:|---:|
| `GET /api/admin/agencies` | 200 | 403 | 403 | 401 |
| `GET /api/admin/users/1` | 200 | 403 | 403 | 401 |
| `GET /api/admin/audit` | 200 | 403 | 403 | 401 |
| `GET /api/admin/moderation` | 200 | 403 | 403 | 401 |
| `GET /api/admin/kyc` | 200 | 403 | 403 | 401 |
| `GET /api/admin/system/metrics` | 200 | 403 | 403 | 401 |
| `GET /api/admin/health` | 200 | 403 | 403 | 401 |
| `GET /api/admin/scheduler` | 200 | 403 | 403 | 401 |
| `GET /api/admin/jobs/failed` | 200 | 403 | 403 | 401 |
| `GET /api/admin/settings` | 200 | 403 | 403 | 401 |
| `GET /api/admin/integrations` | 200 | 403 | 403 | 401 |
| `GET /api/admin/feature-flags` | 200 | 403 | 403 | 401 |
| `GET /api/admin/plans` | 200 | 403 | 403 | 401 |
| `GET /api/admin/payouts` | 200 | 403 | 403 | 401 |
| `GET /api/admin/reports/revenue` | 200 | 403 | 403 | 401 |
| `GET /api/admin/reports/cohorts` | 200 | 403 | 403 | 401 |
| `GET /api/admin/reports/funnel` | 200 | 403 | 403 | 401 |
| `GET /api/admin/maintenance` | 200 | 403 | 403 | 401 |

`GET /api/admin/reports/growth` sans `metric` retourne `422` pour super_admin, puis `200` avec `metric=agencies&period=12m`.
