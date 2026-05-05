# QA — Super-admin plateforme 👑

**Acteur :** Super-administrateur de la plateforme Takussan (rôle `super_admin`)
**Précondition :** Compte avec rôle `super_admin` (ex: `superadmin@takussan.com` / `password`).
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :** dev branch

> Le `super_admin` cumule **toutes** les capacités de l'`agency_admin` (voir [`admin-qa.md`](./admin-qa.md)) plus une vue cross-tenant et des actions plateforme.
> Les fonctionnalités transverses (auth, profil, notifications, i18n) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).

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
3. **Sidebars distinctes** (palettes ambre vs bleu)

### Partie B — Console plateforme (`/super-admin/*`)

4. **Console** (`/super-admin`) — vue d'ensemble plateforme
5. **Agences** (`/super-admin/agencies`) — liste, vérifier, suspendre, désactiver vérification
6. **Biens cross-tenant** (`/super-admin/properties`)
7. **Utilisateurs cross-tenant** (`/super-admin/users`) — recherche, blocage, rôles, **impersonation**
8. **Audit cross-tenant** (`/super-admin/audit`)
9. **Système** (`/super-admin/system`) — métriques, intégrations globales

### Partie C — Privilèges étendus dans `/admin/*`

10. **Modération avis** (`/admin/moderation`) — super_admin only
11. **Biens cross-agence** (`/admin/properties`) — visible toutes agences
12. **Audit cross-tenant** (`/admin/audit`) — toutes agences
13. **Suppression définitive** (force delete) sur entités sensibles

### Partie D — Sécurité, conformité, RGPD

14. **Audit complet** des actions super_admin
15. **Délégations** & élévation de privilèges
16. **Restrictions sur le rôle super_admin** lui-même
17. **API directe** — vérifier que toutes les routes `EnsureSuperAdmin` filtrent

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
- `/super-admin` = `SuperAdminShell` (palette stone-900 + accent ambre `amber-300/200/500`, mention "Console Takussan / Espace plateforme") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Aucun risque de confusion visuelle (les couleurs et libellés indiquent clairement quel espace est actif) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-03 — Garde serveur sur `/super-admin`

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

### TC-SUP-04 — Vue d'ensemble plateforme

**Étape 1 :** Connecté en super_admin, naviguer vers `/super-admin`.

**Q1 :** Le titre "Console Takussan" et la baseline "Vue plateforme — agences, utilisateurs, modération et revenu" sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une grille de métriques (`SystemMetricsGrid`) affiche au moins :
- Nombre total d'agences (actives / suspendues / vérifiées)
- Nombre total d'utilisateurs (par rôle)
- Nombre total de biens (publiés / brouillons / archivés)
- Revenus plateforme (cumul ou mois en cours)
- Volume de transactions
- Taux d'erreur API / disponibilité backend ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les chiffres correspondent à la BDD (recouper avec `/api/admin/system/metrics`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La sidebar de gauche affiche : **Console / Agences / Biens / Utilisateurs / Audit / Système** avec icônes et état actif sur la page courante ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Gestion des agences (`/super-admin/agencies`)

### TC-SUP-05 — Liste des agences

**Étape 1 :** Naviguer vers `/super-admin/agencies`.

**Q1 :** La liste affiche **toutes** les agences de la plateforme avec : logo, nom, slug, statut (Active / Suspendue), vérification (Vérifiée / Non vérifiée), nombre de membres, nombre de biens, date de création, dernière activité ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche par nom / slug et filtres : statut, vérifiée, plage de dates ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Tri par : date, nom, taille (membres), volume (biens) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-06 — Vérifier une agence

**Étape 1 :** Sur une agence non vérifiée, cliquer "Vérifier" (`POST /api/admin/agencies/{id}/verify`).

**Q1 :** Une modale demande confirmation + commentaire optionnel (justificatif) ; après validation, l'agence passe en "Vérifiée" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un badge "Vérifiée" apparaît sur les fiches biens publiques de cette agence ; un email de confirmation est envoyé aux admins de l'agence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'événement "verified" est tracé dans l'audit cross-tenant avec auteur (super_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-07 — Retirer la vérification

**Étape 1 :** Sur une agence vérifiée, cliquer "Retirer la vérification" (`POST /api/admin/agencies/{id}/unverify`).

**Q1 :** Confirmation requise + motif obligatoire ; le statut passe à "Non vérifiée" ; le badge disparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-08 — Suspendre une agence

**Étape 1 :** Sur une agence active, cliquer "Suspendre" (`POST /api/admin/agencies/{id}/suspend`).

**Q1 :** Une modale d'avertissement liste les conséquences : biens retirés du public, paiements en cours bloqués, membres alertés ; un motif est obligatoire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer la suspension.

**Q2 :** Statut → "Suspendue" ; les biens publiés deviennent invisibles publiquement (mais conservés en BDD) ; les membres reçoivent un email + notif ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Tenter de se connecter en tant qu'agent de cette agence : connexion possible mais accès aux ressources de l'agence bloqué (message explicite) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Réactiver" sur une agence suspendue.

**Q4 :** L'agence redevient active ; les biens redeviennent visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-09 — Détail d'une agence

**Étape 1 :** Cliquer sur une agence dans la liste.

**Q1 :** La fiche détaillée affiche : informations légales, équipe complète (membres + rôles), biens, baux actifs, KPIs, historique d'événements (verify / suspend / création) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un bouton "Accéder à l'admin agence" permet de basculer dans `/admin` avec scope sur cette agence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Biens cross-tenant (`/super-admin/properties`)

### TC-SUP-10 — Liste plateforme des biens

**Étape 1 :** Naviguer vers `/super-admin/properties`.

**Q1 :** La liste affiche **tous** les biens de **toutes** les agences ; colonnes : référence, agence, agent, titre, statut, prix, vues, signalements, date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres : agence (multi-sélection), statut, signalements > 0, date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-11 — Modération forcée plateforme

**Étape 1 :** Sur un bien, cliquer "Forcer la dépublication".

**Q1 :** Le bien est dépublié immédiatement (peu importe son agence) ; motif obligatoire ; agence + agent + bailleur sont notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-12 — Suppression définitive (force delete)

**Étape 1 :** Sur un bien problématique, cliquer "Supprimer définitivement" (super_admin only).

**Q1 :** Une **double confirmation** est demandée (saisir le titre du bien pour confirmer) ; après confirmation, le bien est force-deleted (au-delà du soft-delete) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'événement est tracé en audit (avec snapshot des données effacées pour traçabilité RGPD/légale) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Utilisateurs cross-tenant (`/super-admin/users`)

### TC-SUP-13 — Liste des utilisateurs

**Étape 1 :** Naviguer vers `/super-admin/users`.

**Q1 :** La liste affiche **tous** les utilisateurs de la plateforme avec : nom, email, rôles (multi), agences associées, statut (actif / bloqué / suspendu agence), email vérifié, 2FA, dernière connexion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche multicritère : email partiel, nom, ID, téléphone ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Filtres : rôle (incluant `super_admin`), agence, statut, vérifié, 2FA ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-14 — Bloquer un utilisateur (cross-agence)

**Étape 1 :** Sur n'importe quel user (autre que self), cliquer "Bloquer".

**Q1 :** Le user est bloqué ; toutes ses sessions sont révoquées ; il ne peut plus se connecter ; cela fonctionne même pour des users d'autres agences ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tentative de bloquer son **propre** compte → bloqué côté UI et API (protection auto-blocage) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-15 — Attribution du rôle `super_admin`

**Étape 1 :** Sur un user, ouvrir "Rôles" et tenter d'ajouter le rôle `super_admin`.

**Q1 :** Une confirmation supplémentaire est demandée (rôle critique) ; après confirmation, le user devient super_admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cette action est tracée en audit avec auteur, cible, date ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Tenter de retirer le rôle `super_admin` du seul super_admin existant.

**Q3 :** L'opération est bloquée (au moins un super_admin doit exister) avec message explicite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-16 — Impersonation d'un utilisateur

**Étape 1 :** Sur un user (ex: un agent d'une autre agence), cliquer "Impersonate" (`POST /api/admin/users/{user}/impersonate`).

**Q1 :** Une confirmation détaille le risque (toutes les actions seront tracées comme `super_admin via impersonation`) ; un motif/justification est demandé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Confirmer l'impersonation.

**Q2 :** Une session impersonation s'ouvre ; le super_admin voit la plateforme comme l'utilisateur cible (sidebar / données / permissions identiques à l'utilisateur cible) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un bandeau **persistant et bien visible** en haut de toutes les pages : "⚠️ Vous voyez la plateforme en tant que [Nom Prénom — Email]. [Quitter l'impersonation]" — couleur d'alerte distincte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Pendant l'impersonation, les actions critiques (suppression, paiement, modification de données sensibles) sont soit bloquées, soit nécessitent une re-confirmation explicite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Quitter l'impersonation" sur le bandeau (`POST /api/admin/impersonate/stop`).

**Q5 :** Retour immédiat à la session super_admin sans relogin ; les cookies/tokens d'impersonation sont nettoyés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** L'événement complet (début, durée, fin, actions effectuées) est tracé dans `/super-admin/audit` avec un type dédié `impersonation` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Tenter d'impersoner un autre super_admin.

**Q7 :** L'opération est bloquée (impossible d'impersoner un autre super_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-17 — Suppression d'utilisateur

**Étape 1 :** Sur un user inactif, cliquer "Supprimer définitivement" (`DELETE /api/users/{user}`).

**Q1 :** Une double confirmation est demandée ; les données personnelles sont anonymisées (RGPD), les ressources liées (biens, baux, paiements) restent traçables avec un libellé "Utilisateur anonymisé" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un super_admin **ne peut pas se supprimer lui-même** ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Audit cross-tenant (`/super-admin/audit`)

### TC-SUP-18 — Journal complet plateforme

**Étape 1 :** Naviguer vers `/super-admin/audit` (ou `GET /api/admin/audit`).

**Q1 :** Le journal affiche les événements de **toutes** les agences (vs `/admin/audit` qui filtre par agence pour un agency_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres supplémentaires : agence (multi), type d'événement, événements `super_admin` seulement, événements `impersonation` seulement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Chaque entrée affiche : agence d'appartenance, utilisateur, action, entité, IP, user-agent, snapshot avant/après ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-19 — Recherche d'événements sensibles

**Étape 1 :** Filtrer "type = impersonation" sur les 30 derniers jours.

**Q1 :** Toutes les sessions d'impersonation passées sont listées avec durée, cible, motif fourni ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Filtrer "type = role_assigned" pour le rôle `super_admin`.

**Q2 :** Toutes les attributions/retraits du rôle super_admin sont tracées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-20 — Export du journal cross-tenant (P2)

**Étape 1 :** Cliquer "Exporter" → CSV / JSON.

**Q1 :** Une tâche async est lancée ; le fichier inclut tous les champs (snapshot avant/après, agence, user-agent, IP) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le téléchargement est tracé lui-même comme événement audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Système (`/super-admin/system`)

### TC-SUP-21 — Métriques techniques

**Étape 1 :** Naviguer vers `/super-admin/system`.

**Q1 :** Section "Base de données" : taille totale, top tables par volume, nombre d'enregistrements actifs vs soft-deleted ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Section "Utilisation" : DAU / WAU / MAU (utilisateurs actifs jour/semaine/mois), nouveaux comptes par jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Section "Files de jobs" : taille de chaque queue (default, mailer, exports, scout), jobs failed sur 24h, jobs traités ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Section "API & erreurs" : taux d'erreur 5xx sur 24h, latence p50/p95, top 5 endpoints les plus appelés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-22 — Statut des intégrations globales

**Étape 1 :** Section "Intégrations".

**Q1 :** Statut en direct (ping) de : Mailer, SMS providers (LafricaMobile / mTarget / Orange), Storage (S3 ou local), Search (Scout / Meilisearch), passerelles paiement (Wave / OM / Stripe) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Pour chaque intégration : indicateur (vert / jaune / rouge), dernier ping, message d'erreur si échec ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-23 — API métriques (`/api/admin/system/metrics`)

**Étape 1 :** Appeler `GET /api/admin/system/metrics` avec un token super_admin.

**Q1 :** Réponse 200 avec un payload JSON structuré contenant l'ensemble des métriques affichées dans l'UI ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Appeler la même route avec un token `agency_admin`.

**Q2 :** Réponse 403 (middleware `EnsureSuperAdmin`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Privilèges étendus dans `/admin/*`

### TC-SUP-24 — Modération avis (super_admin only)

**Étape 1 :** Naviguer vers `/admin/moderation`.

**Q1 :** L'entrée "Modération avis" est visible dans la sidebar admin **uniquement pour super_admin** (pas pour agency_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La file affiche les avis signalés sur **toutes** les agences ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Approuver / Masquer / Supprimer un avis.

**Q3 :** Toutes les actions de modération fonctionnent et sont tracées ; l'auteur et la cible sont notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-25 — Liste plateforme dans `/admin/properties`

**Étape 1 :** Naviguer vers `/admin/properties`.

**Q1 :** Pour un super_admin, la liste affiche **tous** les biens de toutes agences (vs agence-only pour agency_admin) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-26 — Audit cross-tenant via `/admin/audit`

**Étape 1 :** Naviguer vers `/admin/audit`.

**Q1 :** Pour super_admin, les événements de toutes agences sont listés (filtre agence disponible) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-27 — Suppression définitive (force delete)

**Étape 1 :** Sur des entités soft-deleted (biens, baux, paiements), super_admin peut "Force delete".

**Q1 :** L'option est disponible **uniquement** pour super_admin ; double confirmation requise ; tracé en audit avec snapshot ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Sécurité du rôle super_admin

### TC-SUP-28 — Protection du compte super_admin

**Q1 :** Le compte super_admin a obligatoirement la 2FA activée (ou un avertissement persistant l'incite fortement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les tentatives de connexion en super_admin sont rate-limited et alertent en cas d'échec répété ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La suppression du compte super_admin via `DELETE /api/auth/account` est bloquée si c'est le dernier super_admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-29 — Délégation temporaire de super_admin (P3)

**Étape 1 :** Tester si une délégation temporaire du rôle `super_admin` est possible (`POST /api/agencies/{id}/role-delegations`).

**Q1 :** Soit la délégation du rôle super_admin est totalement interdite (recommandé), soit elle nécessite une approbation à 2 super_admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-30 — Toutes les actions super_admin tracées

**Étape 1 :** Effectuer 5 actions diverses (vérifier agence, suspendre, impersoner, force-delete, créer rôle super_admin), puis ouvrir l'audit.

**Q1 :** Les 5 événements sont présents dans l'audit avec auteur (super_admin), cible, IP, user-agent, motif si fourni ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Aucune action super_admin n'échappe à l'audit (test API direct + UI) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Vérifications API directes

### TC-SUP-31 — Routes protégées par `EnsureSuperAdmin`

**Étape 1 :** Pour chacune des routes ci-dessous, tester avec un token (a) super_admin → 200 OK, (b) agency_admin → 403, (c) agent → 403, (d) sans token → 401 :

| Route | super_admin | agency_admin | agent | anonyme |
|-------|------------|--------------|-------|---------|
| `GET /api/admin/agencies` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/verify` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/unverify` | _______ | _______ | _______ | _______ |
| `POST /api/admin/agencies/{id}/suspend` | _______ | _______ | _______ | _______ |
| `GET /api/admin/audit` | _______ | _______ | _______ | _______ |
| `GET /api/admin/system/metrics` | _______ | _______ | _______ | _______ |
| `POST /api/admin/users/{user}/impersonate` | _______ | _______ | _______ | _______ |
| `POST /api/admin/impersonate/stop` | _______ | _______ | _______ | _______ |

**Q1 :** Toutes les routes sont correctement gardées par `EnsureSuperAdmin` (pas de fuite) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-32 — Pas de fuite via `/api/agencies/*`

**Étape 1 :** En `super_admin`, lister les agences via `GET /api/agencies` (route classique).

**Q1 :** Le super_admin voit toutes les agences (pas seulement les siennes) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** En `agency_admin`, lister `/api/agencies`.

**Q2 :** L'agency_admin ne voit que les agences dont il est membre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-33 — Création d'agence

**Étape 1 :** En super_admin, créer une nouvelle agence via `POST /api/agencies`.

**Q1 :** Création réussie ; l'agence est visible immédiatement dans `/super-admin/agencies` ; le super_admin peut nommer un premier agency_admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** En agency_admin / agent, tenter `POST /api/agencies`.

**Q2 :** Selon politique : soit autorisé (création d'agence par tout user), soit bloqué (super_admin only). Documenter le comportement observé.
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Cas limites & cohérence

### TC-SUP-34 — Switch de profil multi-agence

**Précondition :** Compte super_admin qui est aussi agent dans 2 agences distinctes.

**Étape 1 :** Ouvrir le `ProfileSwitcher` dans la sidebar.

**Q1 :** Les profils des 2 agences sont visibles en plus du profil super_admin "global" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Basculer sur un profil agence.

**Q2 :** L'UI `/admin` se scope sur cette agence ; mais les liens `/super-admin` restent accessibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-35 — Consistance des compteurs

**Étape 1 :** Comparer les compteurs entre `/super-admin` (vue plateforme), `/super-admin/agencies` (vue agences), `/admin` (agence courante).

**Q1 :** La somme des biens par agence dans `/super-admin/agencies` = total biens dans `/super-admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les chiffres sont cohérents (à la marge des nouveaux biens créés depuis le rendu) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-SUP-36 — Performance des vues plateforme

**Étape 1 :** Avec un seed important (10+ agences, 1000+ biens, 5000+ users), charger `/super-admin/users`.

**Q1 :** La page se charge en moins de 3 secondes (pagination serveur, pas tout le set d'un coup) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les filtres et la recherche restent réactifs (debounced, limites raisonnables) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Récapitulatif — Bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

---

## 13. Notes du testeur

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```
