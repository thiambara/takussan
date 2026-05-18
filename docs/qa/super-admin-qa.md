# QA — Super-admin plateforme 👑

**Acteur :** Super-administrateur de la plateforme Takussan (rôle `super_admin`, `team_id = null`)
**Précondition :** Compte avec rôle `super_admin` (ex: `superadmin@takussan.com` / `password`).
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :** dev branch

> Le `super_admin` cumule **toutes** les capacités de l'`agency_admin` (voir [`admin-qa.md`](./admin-qa.md)) plus une vue cross-tenant et des actions plateforme.
> Les fonctionnalités transverses (auth, profil, notifications, i18n) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).
> **Namespace API** : toutes les routes super-admin vivent sous `/api/admin/*` et sont gardées par le middleware `super-admin` (qui vérifie `hasRole('super_admin')` avec `team_id = null`).

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## Ordre de test optimisé

> Le super_admin a deux espaces : la console plateforme (`/super-admin/*`) et l'admin agence (`/admin/*`) qu'il peut consulter sur n'importe quelle agence. L'ordre suit ces deux périmètres.

### Partie A — Discrimination & cohabitation

1. **Connexion** + redirection
2. **Cohabitation** des espaces (`/app`, `/admin`, `/super-admin`)
3. **Sidebar groupée** (palette stone-900 + ambre)

### Partie B — Console plateforme (`/super-admin/*`)

4. **Console** (`/super-admin`) — vue d'ensemble plateforme
5. **Reporting** (`/super-admin/reports`) — growth / revenue / cohorts / funnel + export CSV
6. **Agences** (`/super-admin/agencies`) — liste, vérifier, suspendre, détail, abonnement
7. **Utilisateurs** (`/super-admin/users`) — recherche, support (unlock / reset-2fa / revoke-sessions), **impersonation**, data export RGPD
8. **Biens cross-tenant** (`/super-admin/properties`)
9. **KYC** (`/super-admin/kyc`) — dossiers en attente
10. **Modération** (`/super-admin/moderation`) — file plateforme
11. **Plans** (`/super-admin/plans`) — plans d'abonnement plateforme
12. **Reversements** (`/super-admin/payouts`) — clôture période → approbation → paiement
13. **Audit cross-tenant** (`/super-admin/audit`)
14. **Système** (`/super-admin/system`) — santé, maintenance, planificateur
15. **Contenu** — tags, enums, templates, annonces
16. **Plateforme** — paramètres, intégrations, feature flags, alertes

### Partie C — Privilèges étendus dans `/admin/*`

17. **Liste cross-agence** dans `/admin/properties` et `/admin/audit`
18. **Modération avis** (`/admin/moderation`) — partagée agency_admin + super_admin
19. **Modération biens** (`/admin/moderation/properties`)

### Partie D — Sécurité, conformité, RGPD

20. **Audit complet** des actions super_admin (`super_admin_*` events)
21. **Restrictions sur le rôle super_admin** lui-même
22. **API directe** — vérifier que toutes les routes du middleware `super-admin` filtrent

---

## 1. Connexion & cohabitation des espaces

### TC-SUP-01 — Connexion super_admin

**Étape 1 :** Naviguer vers `/auth/login`. Saisir le compte super_admin. Cliquer "Se connecter".

**Q1 :** L'utilisateur est redirigé vers `/app` par défaut (comme tout user) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Dans la sidebar du dashboard `/app`, un lien "Administration" est visible (puisque super_admin satisfait `isAdmin()`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-02 — Distinction des trois espaces

**Étape 1 :** Naviguer successivement vers `/app`, `/admin`, `/super-admin`.

**Q1 :** Chaque espace a une coque distincte :
- `/app` = `AppShell` (palette claire, sidebar agent)
- `/admin` = `AdminShell` (palette sombre, sidebar admin agence)
- `/super-admin` = `SuperAdminShell` (palette `bg-stone-900` + accent ambre `amber-300/200/500`, mention "Console Takussan / Espace plateforme") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Aucun risque de confusion visuelle (les couleurs et libellés indiquent clairement quel espace est actif) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le footer de la sidebar super-admin affiche un lien "Retour à l'espace perso" qui renvoie vers `/app` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-03 — Sidebar super-admin groupée

**Étape 1 :** Sur `/super-admin`, examiner la sidebar de gauche.

**Q1 :** La sidebar est organisée en **5 groupes** avec libellés en majuscules :
- **Vue d'ensemble** : Console, Reporting
- **Opérations** : Agences, Utilisateurs, Biens, KYC, Modération
- **Revenus** : Plans, Reversements
- **Contenu** : Tags, Enums, Templates, Annonces
- **Plateforme** : Paramètres, Intégrations, Feature flags, Alertes, Audit, Système ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'item "Système" est expansible et affiche un sous-menu : Santé, Maintenance, Planificateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'item actif a un fond `amber-500/15` et un texte `amber-200` (état visuel distinct) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-04 — Garde serveur sur `/super-admin`

**Étape 1 :** Se déconnecter, se reconnecter en `agency_admin` (pas super_admin). Tenter `/super-admin`.

**Q1 :** Redirection vers `/app` (pas de flash de l'UI super-admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Idem en `agent` puis en `customer`.

**Q2 :** Mêmes redirections, aucune fuite d'information ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** En navigation privée (non connecté), tenter `/super-admin`.

**Q3 :** Redirection vers `/auth/login?redirect=%2Fsuper-admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Console plateforme (`/super-admin`)

### TC-SUP-05 — Vue d'ensemble plateforme

**Étape 1 :** Connecté en super_admin, naviguer vers `/super-admin`.

**Q1 :** Le titre "Console Takussan" et la baseline sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une grille de métriques agrège (via `GET /api/admin/system/metrics`) au moins :
- Volume agences (actives / suspendues)
- Volume utilisateurs (par rôle)
- Volume biens (publiés / brouillons / archivés)
- Activité plateforme (transactions, revenus) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les chiffres correspondent à la BDD (recouper avec un appel direct sur `/api/admin/system/metrics`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Reporting cross-tenant (`/super-admin/reports`)

### TC-SUP-06 — Page Reporting

**Étape 1 :** Naviguer vers `/super-admin/reports`.

**Q1 :** La page expose des sections / onglets distincts pour chaque rapport : **Growth** (`/api/admin/reports/growth`), **Revenue** (`/api/admin/reports/revenue`), **Cohorts** (`/api/admin/reports/cohorts`), **Funnel** (`/api/admin/reports/funnel`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres temporels (plage de dates) et granularité (jour / semaine / mois) disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-07 — Export CSV

**Étape 1 :** Sur n'importe quel rapport, cliquer "Exporter" (`GET /api/admin/reports/{report}/export`).

**Q1 :** Le téléchargement CSV démarre, contenant les colonnes attendues pour le rapport et la plage filtrée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'export est tracé en audit (`super_admin_*`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Gestion des agences (`/super-admin/agencies`)

### TC-SUP-08 — Liste des agences

**Étape 1 :** Naviguer vers `/super-admin/agencies`.

**Q1 :** La liste affiche **toutes** les agences de la plateforme avec : logo, nom, slug, statut (`AgencyStatus` : Active / Suspendue / Inactive), nombre de membres, nombre de biens, date de création, dernière activité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche par nom / slug et filtres : statut, plage de dates ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Tri par : date, nom, taille (membres), volume (biens) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-09 — Vérifier une agence (`POST /api/admin/agencies/{id}/verify`)

**Étape 1 :** Sur une agence non vérifiée, cliquer "Vérifier".

> ℹ️ Implémentation : la vérification mappe sur `AgencyStatus` (pas de colonne `verified_at` séparée).

**Q1 :** Une modale demande confirmation ; après validation, l'agence passe au statut "Vérifiée" / "Active" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'événement est tracé dans l'audit cross-tenant avec auteur (super_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-10 — Retirer la vérification (`POST /api/admin/agencies/{id}/unverify`)

**Étape 1 :** Sur une agence vérifiée, cliquer "Retirer la vérification".

**Q1 :** Confirmation requise ; le statut bascule ; tracé en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-11 — Suspendre une agence (`POST /api/admin/agencies/{id}/suspend`)

**Étape 1 :** Sur une agence active, cliquer "Suspendre".

**Q1 :** Une modale d'avertissement liste les conséquences (biens retirés du public, accès agence bloqué, membres alertés) ; un motif est obligatoire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer la suspension.

**Q2 :** Statut → "Suspendue" ; les biens publiés deviennent invisibles publiquement ; les membres reçoivent une notification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Tenter de se connecter en tant qu'agent de cette agence : connexion possible mais accès aux ressources de l'agence bloqué (message explicite) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-12 — Détail d'une agence

**Étape 1 :** Cliquer sur une agence dans la liste — `/super-admin/agencies/{id}`.

**Q1 :** La fiche détaillée affiche : informations légales, équipe (`GET /api/admin/agencies/{id}/team`), biens (`/properties`), santé (`/health`), historique d'événements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une section dédiée affiche le statut KYC de l'agence (`GET /api/admin/agencies/{id}/kyc`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-13 — Abonnement de l'agence

**Étape 1 :** Dans la fiche agence, ouvrir la section "Abonnement" (`GET /api/admin/agencies/{id}/subscription`).

**Q1 :** Le plan actif, la période, le statut (trial / active / expired) sont affichés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Changer de plan" → choisir un plan (`POST /api/admin/agencies/{id}/subscription`).

**Q2 :** Le plan est appliqué immédiatement ; un événement `subscription_*` est tracé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Annuler l'abonnement" (`POST /api/admin/agencies/{id}/subscription/cancel`).

**Q3 :** L'abonnement est annulé (effet immédiat ou en fin de période selon le plan) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-14 — Création d'une nouvelle agence

**Étape 1 :** Cliquer "Créer une agence" (`POST /api/admin/agencies`).

**Q1 :** Un formulaire collecte les infos minimales (nom, slug, contact) ; après submit l'agence apparaît dans la liste ; le super_admin peut y nommer un premier `agency_admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Utilisateurs cross-tenant (`/super-admin/users`)

### TC-SUP-15 — Liste des utilisateurs

**Étape 1 :** Naviguer vers `/super-admin/users`.

**Q1 :** La liste affiche **tous** les utilisateurs de la plateforme avec : nom, email, rôles (multi), agences associées, statut, email vérifié, 2FA, dernière connexion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche multicritère : email partiel, nom, ID, téléphone ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Filtres : rôle (incluant `super_admin`), agence, statut, vérifié, 2FA ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-16 — Détail utilisateur (`/super-admin/users/{id}`)

**Étape 1 :** Cliquer sur un user dans la liste.

**Q1 :** La fiche affiche : profil complet (`GET /api/admin/users/{id}`), sessions actives (`/sessions`), activité récente (`/activity`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-17 — Actions de support

**Étape 1 :** Sur la fiche d'un user, tester les actions de support :

| Action | Endpoint | Q |
|---|---|---|
| Forcer reset mot de passe | `POST /api/admin/users/{id}/force-password-reset` | Q1 |
| Déverrouiller le compte | `POST /api/admin/users/{id}/unlock` | Q2 |
| Réinitialiser la 2FA | `POST /api/admin/users/{id}/reset-2fa` | Q3 |
| Révoquer toutes les sessions | `POST /api/admin/users/{id}/revoke-sessions` | Q4 |
| Révoquer une session précise | `DELETE /api/admin/users/{id}/sessions/{tokenId}` | Q5 |

**Q1–Q5 :** Chaque action déclenche une modale de confirmation, fonctionne, et est tracée en audit avec auteur + cible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-18 — Export RGPD des données utilisateur

**Étape 1 :** Sur la fiche d'un user, cliquer "Exporter les données" (`POST /api/admin/users/{id}/data-exports`).

**Q1 :** Une tâche d'export asynchrone est lancée ; l'utilisateur cible (et le super_admin) reçoivent un lien de téléchargement ; l'opération est tracée en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-19 — Impersonation d'un utilisateur

**Étape 1 :** Sur un user (ex: un agent d'une autre agence), cliquer "Impersonate" (`POST /api/admin/users/{id}/impersonate`).

**Q1 :** Une confirmation détaille le risque ; le motif/justification est facultatif mais conseillé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer l'impersonation.

> ℹ️ Implémentation (TCK-144) : un token Sanctum dédié `impersonation` est créé (≤ 1 h). Le frontend conserve **deux** tokens : celui de l'opérateur (super_admin) et celui d'impersonation. La session impersonation est persistée localement (`writeImpersonationSession`).

**Q2 :** La plateforme bascule sur le contexte du user cible (sidebar, données, permissions identiques au user cible) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un bandeau **persistant et non-dismissible** en haut de l'app (`<ImpersonationBanner>`, `data-testid="impersonation-banner"`) affiche :
- Couleur d'alerte ambre (`bg-amber-500 text-stone-900`)
- Texte "Vous agissez en tant que [Nom — Email] — session jusqu'à [expires_at]"
- Bouton "Arrêter l'impersonation" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Tenter de s'impersoner soi-même (super_admin → super_admin courant).

**Q4 :** L'API renvoie 422 "You cannot impersonate yourself." ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Cliquer "Arrêter l'impersonation" sur le bandeau (`POST /api/admin/impersonate/stop`).

**Q5 :** Retour immédiat à la session super_admin (sans re-login) ; le token d'impersonation est révoqué côté backend et nettoyé localement (`clearImpersonationSession`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Les événements `super_admin_impersonation_started` et `super_admin_impersonation_stopped` apparaissent dans `/super-admin/audit`, liant l'auteur (super_admin) et la cible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Lancer une impersonation A, puis sans arrêter, en lancer une autre B.

**Q7 :** Les anciens tokens d'impersonation sur A sont révoqués (cleanup automatique) avant la création du nouveau pour B ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

> 🚧 **Hors périmètre actuel :** il n'existe pas (encore) d'endpoint pour "bloquer" un user, "supprimer" un user, ou attribuer/retirer le rôle `super_admin` via l'UI super-admin. La gestion fine des rôles agence-scopés se fait sur `/api/roles` (voir QA admin agence). À documenter si ces capacités sont ajoutées.

---

## 6. Biens cross-tenant (`/super-admin/properties`)

### TC-SUP-20 — Liste plateforme des biens

**Étape 1 :** Naviguer vers `/super-admin/properties`.

**Q1 :** La liste affiche **tous** les biens de **toutes** les agences ; colonnes : référence, agence, agent, titre, statut, prix, vues, signalements, date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres `SuperAdminPropertiesFilters` : agence (multi-sélection), statut, signalements > 0, date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-21 — Modération forcée plateforme

**Étape 1 :** Sur un bien, cliquer "Forcer la dépublication".

> ℹ️ Implémentation : utilise les routes standard `/api/properties/*` (pas un namespace `/api/admin/properties/*`). Le contrôleur autorise l'opération via la policy super_admin.

**Q1 :** Le bien est dépublié immédiatement (peu importe son agence) ; agence + agent sont notifiés ; tracé en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-22 — Suppression définitive (force delete)

**Étape 1 :** Sur un bien problématique soft-deleted, super_admin peut "Forcer la suppression".

**Q1 :** Une **double confirmation** est demandée ; après confirmation, le bien est force-deleted (au-delà du soft-delete) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'événement est tracé en audit avec snapshot pour traçabilité RGPD/légale ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. KYC (`/super-admin/kyc`)

### TC-SUP-23 — File des dossiers KYC

**Étape 1 :** Naviguer vers `/super-admin/kyc` (`GET /api/admin/kyc`).

**Q1 :** La liste affiche les dossiers KYC en attente (toutes agences) avec : agence, type de dossier, date de soumission, statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Ouvrir un dossier (`/super-admin/kyc/{dossier}`).

**Q2 :** Les pièces justificatives sont affichées ; les boutons "Vérifier" (`POST .../verify`) et "Rejeter" (`POST .../reject`) sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le rejet exige un motif ; les deux actions notifient l'agence et sont tracées en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Modération (`/super-admin/moderation`)

### TC-SUP-24 — File de modération plateforme

**Étape 1 :** Naviguer vers `/super-admin/moderation` (`GET /api/admin/moderation`).

**Q1 :** La file affiche les éléments à modérer (signalements) sur **toutes** les agences ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur un item, prendre une décision (`POST /api/admin/moderation/{id}/decide`) — Approuver / Masquer / Supprimer.

**Q2 :** L'action s'applique ; auteur + cible notifiés ; tracée en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Plans d'abonnement (`/super-admin/plans`) — TCK-222

### TC-SUP-25 — Catalogue des plans

**Étape 1 :** Naviguer vers `/super-admin/plans` (`GET /api/admin/plans`).

**Q1 :** La liste affiche tous les plans plateforme avec : nom, code, prix, période (mensuel/annuel), quotas (membres, biens), statut (actif/désactivé) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-26 — Créer un plan

**Étape 1 :** Cliquer "Nouveau plan" (`POST /api/admin/plans`).

**Q1 :** Le formulaire collecte tous les champs (nom, code unique, prix, devise, quotas) ; après submit le plan apparaît dans la liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-27 — Modifier / supprimer un plan

**Étape 1 :** Sur un plan, cliquer "Modifier" (`PATCH /api/admin/plans/{id}`).

**Q1 :** Les modifications sont appliquées sans casser les abonnements en cours (les agences gardent leur version souscrite) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur un plan inutilisé, cliquer "Supprimer" (`DELETE /api/admin/plans/{id}`).

**Q2 :** La suppression est bloquée si au moins une agence souscrit encore le plan (message explicite) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Reversements (`/super-admin/payouts`) — TCK-223

### TC-SUP-28 — Liste des reversements

**Étape 1 :** Naviguer vers `/super-admin/payouts` (`GET /api/admin/payouts`).

**Q1 :** La liste affiche les reversements plateforme → agence avec : agence, période, montant, statut (open / pending_approval / approved / paid / cancelled) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-29 — Clôture d'une période

**Étape 1 :** Cliquer "Clôturer la période" (`POST /api/admin/payouts/close-period`).

**Q1 :** Une modale demande la période à clôturer ; après validation, des reversements sont générés pour chaque agence éligible ; ils apparaissent en statut "pending_approval" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-30 — Workflow approuver → marquer payé

**Étape 1 :** Sur un reversement "pending_approval", ouvrir le détail (`GET /api/admin/payouts/{id}`).

**Q1 :** Le détail affiche les transactions agrégées de la période (locations encaissées, commissions plateforme, montant net à reverser) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Approuver" (`POST /api/admin/payouts/{id}/approve`).

**Q2 :** Le statut passe à "approved" ; tracé en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Marquer payé" (`POST /api/admin/payouts/{id}/mark-paid`).

**Q3 :** Une référence de paiement est demandée ; statut → "paid" ; agence notifiée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-31 — Annulation d'un reversement

**Étape 1 :** Sur un reversement non encore payé, cliquer "Annuler" (`POST /api/admin/payouts/{id}/cancel`).

**Q1 :** Motif obligatoire ; statut → "cancelled" ; les transactions agrégées sont remises en file pour la prochaine période ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Audit cross-tenant (`/super-admin/audit`)

### TC-SUP-32 — Journal complet plateforme

**Étape 1 :** Naviguer vers `/super-admin/audit` (`GET /api/admin/audit`).

**Q1 :** Le journal affiche les événements de **toutes** les agences (vs `/admin/audit` qui filtre par agence pour un agency_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres : agence (multi), type d'événement, plage de dates, événements `super_admin_*` seulement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Chaque entrée affiche : agence d'appartenance, utilisateur, action, entité, IP, user-agent, propriétés (snapshot) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-33 — Recherche d'événements sensibles

**Étape 1 :** Filtrer "type = `super_admin_impersonation_started`" sur les 30 derniers jours.

**Q1 :** Toutes les sessions d'impersonation passées sont listées avec auteur + cible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Filtrer les événements liés aux agences (`AgencyModeration*`).

**Q2 :** Toutes les vérifications / suspensions passées sont tracées avec motif ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Système (`/super-admin/system`)

### TC-SUP-34 — Vue d'ensemble système

**Étape 1 :** Naviguer vers `/super-admin/system`.

**Q1 :** La page liste les sous-pages : **Santé**, **Maintenance**, **Planificateur** (accessibles aussi via le sous-menu sidebar) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-35 — Santé (`/super-admin/system/health`)

**Étape 1 :** Naviguer vers la page Santé (`GET /api/admin/health`).

**Q1 :** Les checks core s'affichent en direct : base de données, cache, queue, storage, mailer ; statut vert / jaune / rouge avec dernier ping ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Section "Failed jobs" (`GET /api/admin/jobs/failed`) liste les jobs en échec avec : queue, exception, payload résumé, date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Boutons "Réessayer" (`POST /api/admin/jobs/failed/{id}/retry`), "Réessayer tous" (`POST .../retry-all`), "Supprimer" (`DELETE .../{id}`) fonctionnent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-36 — Maintenance (`/super-admin/system/maintenance`)

**Étape 1 :** Naviguer vers la page Maintenance (`GET /api/admin/maintenance`).

**Q1 :** Le statut courant est affiché (mode maintenance ON/OFF, message éventuel, IPs autorisées) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Activer le mode maintenance (`POST /api/admin/maintenance`) avec un message + une IP autorisée.

**Q2 :** Les utilisateurs hors IP autorisée voient une page de maintenance ; le super_admin (sur l'IP whitelistée) garde l'accès ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Désactiver (`DELETE /api/admin/maintenance`).

**Q3 :** Le mode est levé ; tracé en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-37 — Planificateur (`/super-admin/system/scheduler`)

**Étape 1 :** Naviguer vers la page Planificateur (`GET /api/admin/scheduler`).

**Q1 :** La liste des tâches scheduler s'affiche : commande, expression cron, dernière exécution, prochaine exécution, statut ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-38 — API métriques (`GET /api/admin/system/metrics`)

**Étape 1 :** Appeler `GET /api/admin/system/metrics` avec un token super_admin.

**Q1 :** Réponse 200 avec un payload JSON structuré contenant l'ensemble des métriques affichées dans la console ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Appeler la même route avec un token `agency_admin`.

**Q2 :** Réponse 403 (middleware `super-admin`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Contenu (Tags / Enums / Templates / Annonces)

### TC-SUP-39 — Tags (`/super-admin/tags`)

**Q1 :** CRUD complet des tags plateforme (utilisés pour catégoriser biens, agences, etc.) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-40 — Enums métier (`/super-admin/enums`)

**Étape 1 :** Naviguer vers `/super-admin/enums` (`GET /api/admin/enums`).

**Q1 :** La liste expose les enums métier configurables (ex: types de biens, statuts custom) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur un enum, ajouter une valeur (`POST /api/admin/enums/{key}/values`), modifier (`PATCH .../values/{value}`), désactiver (`DELETE .../values/{value}`).

**Q2 :** Les opérations s'appliquent ; les anciennes valeurs en usage sont préservées (désactivation ≠ suppression dure) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-41 — Templates de notifications (`/super-admin/templates`)

**Étape 1 :** Naviguer vers `/super-admin/templates` (`GET /api/admin/notification-templates`).

**Q1 :** La liste affiche tous les templates par couple (event, channel) — ex: `booking_confirmed/email`, `lease_signed/sms` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur un template, modifier le contenu (`PATCH .../{event}/{channel}`), puis "Prévisualiser" (`POST .../preview`).

**Q2 :** L'éditeur supporte les variables ; la preview rend le template avec un payload de test ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-42 — Annonces (`/super-admin/announcements`)

**Étape 1 :** Naviguer vers `/super-admin/announcements` (`GET /api/admin/announcements`).

**Q1 :** Liste des annonces plateforme (bandeaux, popups) avec audience cible, période, état ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Créer (`POST .../announcements`), modifier (`PATCH .../{id}`), désactiver (`POST .../{id}/deactivate`).

**Q2 :** Une annonce active s'affiche dans l'UI cible ; la désactivation la retire immédiatement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 14. Plateforme (Paramètres / Intégrations / Feature flags / Alertes)

### TC-SUP-43 — Paramètres plateforme (`/super-admin/settings`)

**Étape 1 :** Naviguer vers `/super-admin/settings` (`GET /api/admin/settings`).

**Q1 :** Les réglages globaux (commission plateforme, devise par défaut, limites globales, etc.) sont éditables groupe par groupe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Modifier plusieurs réglages et "Enregistrer" (`PATCH /api/admin/settings`).

**Q2 :** Les changements sont persistés (bulk update) ; tracés en audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-44 — Intégrations (`/super-admin/integrations`)

**Étape 1 :** Naviguer vers `/super-admin/integrations` (`GET /api/admin/integrations`).

**Q1 :** La liste affiche les intégrations disponibles (mailer, SMS providers, paiement, search, storage) avec statut et dernière connexion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Ouvrir une intégration. Modifier la config (`PATCH .../{integration}`) puis "Tester" (`POST .../test`).

**Q2 :** Le test exécute un appel sandbox et renvoie OK / échec avec détail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'onglet "Webhooks" (`GET .../{integration}/webhooks`) liste les événements souscrits ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-45 — Feature flags (`/super-admin/feature-flags`)

**Étape 1 :** Naviguer vers `/super-admin/feature-flags` (`GET /api/admin/feature-flags`).

**Q1 :** La liste affiche tous les flags avec : clé, état (on/off), audience, dernière modification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Toggle un flag (`PATCH /api/admin/feature-flags/{key}`).

**Q2 :** L'état est appliqué globalement ; l'effet est observable côté UI/API immédiatement ou après TTL court ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Créer un override par agence (`POST .../feature-flags/{key}/override`).

**Q3 :** L'override prend précédence sur l'état global pour l'agence ciblée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-46 — Règles d'alerte (`/super-admin/alerts`)

**Étape 1 :** Naviguer vers `/super-admin/alerts` (`GET /api/admin/alert-rules`).

**Q1 :** La liste affiche les règles d'alerte (seuil sur métrique, fréquence, canaux de notification) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Créer (`POST .../alert-rules`), modifier (`PATCH .../{id}`), tester (`POST .../{id}/test`), supprimer (`DELETE .../{id}`).

**Q2 :** Le test envoie une notification factice via le canal configuré ; les autres opérations s'appliquent et sont auditées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 15. Privilèges étendus dans `/admin/*`

### TC-SUP-47 — Modération avis (`/admin/moderation`)

> ℹ️ La file de modération des avis est partagée entre agency_admin (scopée à son agence) et super_admin (toutes agences). La file de modération des biens vit sur `/admin/moderation/properties`.

**Étape 1 :** Naviguer vers `/admin/moderation`.

**Q1 :** Pour super_admin, la file affiche les avis signalés sur **toutes** les agences (vs scope agence pour agency_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Approuver / Masquer / Supprimer un avis.

**Q2 :** Toutes les actions de modération fonctionnent et sont tracées ; auteur et cible notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-48 — Modération biens (`/admin/moderation/properties`)

**Étape 1 :** Naviguer vers `/admin/moderation/properties`.

**Q1 :** Pour super_admin, la file affiche les biens signalés sur **toutes** les agences (TCK-098) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-49 — Liste plateforme dans `/admin/properties`

**Étape 1 :** Naviguer vers `/admin/properties`.

**Q1 :** Pour un super_admin, la liste affiche **tous** les biens de toutes agences (vs agence-only pour agency_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-50 — Audit cross-tenant via `/admin/audit`

**Étape 1 :** Naviguer vers `/admin/audit`.

**Q1 :** Pour super_admin, les événements de toutes agences sont listés (filtre agence disponible) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 16. Sécurité du rôle super_admin

### TC-SUP-51 — Protection du compte super_admin

**Q1 :** Le compte super_admin a obligatoirement la 2FA activée (ou un avertissement persistant l'incite fortement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les tentatives de connexion en super_admin sont rate-limited et alertent en cas d'échec répété ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-52 — Toutes les actions super_admin tracées

**Étape 1 :** Effectuer 5 actions diverses (vérifier agence, suspendre, impersoner, force-delete bien, réinitialiser 2FA d'un user), puis ouvrir `/super-admin/audit`.

**Q1 :** Les 5 événements sont présents dans l'audit avec auteur (super_admin), cible, IP, user-agent, motif si fourni ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Aucune action super_admin n'échappe à l'audit (tester en API directe + UI) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 17. Vérifications API directes

### TC-SUP-53 — Routes protégées par le middleware `super-admin`

**Étape 1 :** Pour chacune des routes ci-dessous, tester avec un token (a) super_admin → 200/204, (b) agency_admin → 403, (c) agent → 403, (d) sans token → 401 :

| Route | super_admin | agency_admin | agent | anonyme |
|-------|------------|--------------|-------|---------|
| `GET /api/admin/agencies` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/verify` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/unverify` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/suspend` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/subscription` | _______ | _______ | _______ | _______ |
| `GET /api/admin/users/{id}` | _______ | _______ | _______ | _______ |
| `POST /api/admin/users/{id}/impersonate` | _______ | _______ | _______ | _______ |
| `POST /api/admin/users/{id}/reset-2fa` | _______ | _______ | _______ | _______ |
| `POST /api/admin/users/{id}/revoke-sessions` | _______ | _______ | _______ | _______ |
| `POST /api/admin/impersonate/stop` | _______ | _______ | _______ | _______ |
| `GET /api/admin/audit` | _______ | _______ | _______ | _______ |
| `GET /api/admin/moderation` | _______ | _______ | _______ | _______ |
| `GET /api/admin/kyc` | _______ | _______ | _______ | _______ |
| `GET /api/admin/system/metrics` | _______ | _______ | _______ | _______ |
| `GET /api/admin/health` | _______ | _______ | _______ | _______ |
| `GET /api/admin/scheduler` | _______ | _______ | _______ | _______ |
| `GET /api/admin/jobs/failed` | _______ | _______ | _______ | _______ |
| `GET /api/admin/settings` | _______ | _______ | _______ | _______ |
| `PATCH /api/admin/settings` | _______ | _______ | _______ | _______ |
| `GET /api/admin/integrations` | _______ | _______ | _______ | _______ |
| `GET /api/admin/feature-flags` | _______ | _______ | _______ | _______ |
| `GET /api/admin/plans` | _______ | _______ | _______ | _______ |
| `GET /api/admin/payouts` | _______ | _______ | _______ | _______ |
| `POST /api/admin/payouts/close-period` | _______ | _______ | _______ | _______ |
| `GET /api/admin/reports/growth` | _______ | _______ | _______ | _______ |
| `GET /api/admin/reports/{report}/export` | _______ | _______ | _______ | _______ |
| `POST /api/admin/maintenance` | _______ | _______ | _______ | _______ |

**Q1 :** Toutes les routes sont correctement gardées par le middleware `super-admin` (pas de fuite, 401 pour anonyme, 403 pour les rôles non super_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-54 — Pas de fuite via `/api/agencies/*`

**Étape 1 :** En `super_admin`, lister les agences via `GET /api/agencies` (route classique).

**Q1 :** Le super_admin voit toutes les agences (pas seulement celles dont il est membre) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** En `agency_admin`, lister `/api/agencies`.

**Q2 :** L'agency_admin ne voit que les agences dont il est membre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 18. Cas limites & cohérence

### TC-SUP-55 — Switch de profil multi-agence

**Précondition :** Compte super_admin qui est aussi agent dans 2 agences distinctes.

**Étape 1 :** Ouvrir le `ProfileSwitcher` dans la sidebar.

**Q1 :** Les profils des 2 agences sont visibles en plus du profil super_admin "global" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Basculer sur un profil agence.

**Q2 :** L'UI `/admin` se scope sur cette agence ; mais les liens `/super-admin` restent accessibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-56 — Consistance des compteurs

**Étape 1 :** Comparer les compteurs entre `/super-admin` (vue plateforme via `system/metrics`), `/super-admin/agencies` (somme par agence), `/admin` (agence courante).

**Q1 :** La somme des biens par agence dans `/super-admin/agencies` = total biens dans `/super-admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les chiffres sont cohérents (à la marge des nouveaux biens créés depuis le rendu) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-57 — Performance des vues plateforme

**Étape 1 :** Avec un seed important (10+ agences, 1000+ biens, 5000+ users), charger `/super-admin/users`.

**Q1 :** La page se charge en moins de 3 secondes (pagination serveur via `per_page` + sparse fields, pas tout le set d'un coup) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les filtres et la recherche restent réactifs (debounced, limites raisonnables) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 19. Récapitulatif — Bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

---

## 20. Notes du testeur

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```
