# QA — Admin d'agence / Super-admin 🛡️

**Acteur :** Superviseur de la plateforme et de l'agence (rôle `agency_admin` ou `super_admin`)
**Précondition :** Être connecté avec un compte admin, accéder à la zone `/admin`
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :**

> Les fonctionnalités transverses (authentification, notifications, i18n, médias, recherche de base) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## 1. Dashboard agence (`/admin` et `/app/overview/agency`)

### TC-ADM-01 — Vue d'ensemble

**Q1 :** Le dashboard agence affiche le nombre total de biens (actifs, archivés) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les revenus et les impayés du mois sont affichés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le nombre total de vues sur les biens est visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le nombre de baux actifs et le taux d'occupation sont affichés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Gestion de l'agence & de l'équipe (`/admin/agency`, `/admin/team`)

### TC-ADM-02 — Configuration de l'agence (P0)

**URL :** `/admin/agency`

**Q1 :** Il est possible de modifier le nom, la licence, les coordonnées et le logo de l'agence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'upload du logo de l'agence fonctionne et s'affiche correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les paramètres de commission par défaut (%) peuvent être configurés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-03 — Gestion des membres d'équipe (P0)

**URL :** `/admin/team`

**Q1 :** La liste des membres de l'agence est affichée avec leur nom, email et rôle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un bouton "Ajouter un agent" permet d'inviter un nouvel agent (par email ou recherche utilisateur) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le retrait d'un agent de l'agence fonctionne et révoque ses accès ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les statistiques globales de l'agence (biens, ventes, revenus) sont visibles sur cette page ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Rôles & permissions (`/admin/roles`)

### TC-ADM-04 — Rôles prédéfinis (P0)

**Q1 :** Les rôles prédéfinis sont bien présents : `customer`, `agent`, `agency_admin`, `owner`, `service_provider`, `super_admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les permissions granulaires par ressource (bien, bail, paiement…) sont listées pour chaque rôle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La distinction "mes ressources" vs "toutes les ressources" est implémentée pour les permissions ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-05 — Attribution des rôles (P1)

**Q1 :** Il est possible d'attribuer un rôle à un utilisateur depuis `/admin/users` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de retirer un rôle à un utilisateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un changement de rôle prend effet immédiatement (sans déconnexion/reconnexion) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-06 — Éditeur de rôles personnalisés (P1)

**Q1 :** Il est possible de créer un rôle personnalisé scopé par agence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les permissions du rôle personnalisé peuvent être configurées individuellement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un utilisateur avec le rôle personnalisé ne peut accéder qu'aux ressources autorisées par ce rôle ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Gestion des utilisateurs (`/admin/users`)

### TC-ADM-07

**Q1 :** La liste de tous les utilisateurs de la plateforme est accessible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La recherche d'un utilisateur par nom ou email fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Il est possible de bloquer un utilisateur (suspension du compte) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un utilisateur bloqué ne peut plus se connecter et reçoit un message approprié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Il est possible de réactiver un utilisateur bloqué ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Finances (`/admin/finances`)

### TC-ADM-08 — Enregistrer un paiement (P0)

**Q1 :** Il est possible d'enregistrer manuellement un paiement (réservation ou bail) depuis l'interface admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le statut du paiement (en attente, payé, remboursé, annulé) est bien géré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-09 — Factures et historique (P1)

**Q1 :** Une facture peut être générée pour un Customer depuis l'interface admin ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'historique des paiements filtrable par entité (bail, réservation, client) est accessible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le suivi des statuts de paiement (en attente, payé, remboursé, annulé) est visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La relance automatique des factures en retard est configurée et fonctionne (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Reporting & exports (`/app/overview/exports`)

### TC-ADM-10 — Exports CSV/Excel (P2)

**URL :** `/app/overview/exports`

**Q1 :** L'export CSV des paiements fonctionne et télécharge un fichier valide ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'export CSV des baux fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'export CSV des clients fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'export PDF (quittances, factures, rapports) génère un fichier lisible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-11 — Graphiques temporels (P2)

**URL :** `/app/overview/kpis`

**Q1 :** Des graphiques de revenus dans le temps (semaine, mois, année) sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un graphique du taux d'occupation des biens dans le temps est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les données des graphiques correspondent aux données réelles de la base ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-12 — Alertes sur seuils (P3)

**URL :** `/app/overview/alerts`

**Q1 :** Il est possible de configurer une alerte quand le taux d'impayés dépasse un seuil ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Il est possible de configurer une alerte sur le taux de vacance ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les alertes déclenchées sont visibles dans le centre de notifications ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Modération (`/admin/moderation`)

### TC-ADM-13 — Modération des biens (P2)

**URL :** `/admin/moderation/properties`

**Q1 :** La file de biens en attente de validation (avant publication) est accessible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'admin peut approuver un bien, ce qui le rend visible sur le site public ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'admin peut rejeter un bien avec un motif communiqué à l'agent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-14 — Modération des avis (P2)

**URL :** `/admin/moderation`

**Q1 :** La liste des avis signalés est accessible dans l'interface de modération ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'admin peut masquer un avis inapproprié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'admin peut supprimer définitivement un avis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'avis masqué/supprimé disparaît de la fiche bien publique immédiatement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Journal d'audit (`/admin/audit`)

### TC-ADM-15 — Journal d'activité (P0)

**Q1 :** Le journal d'activité est accessible depuis `/admin/audit` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les actions critiques (création/modification de bail, paiement, changement de statut) sont bien enregistrées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Chaque entrée du journal contient : utilisateur, action, entité, horodatage ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Il est possible de consulter le journal d'activité d'une entité spécifique (ex: bail #42) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-16 — Filtrage du journal (P1)

**Q1 :** Le journal peut être filtré par utilisateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le journal peut être filtré par plage de dates ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le journal peut être filtré par type d'action (créé, modifié, supprimé) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'export du journal d'audit est disponible (P2) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Administration & configuration (`/admin/settings`)

### TC-ADM-17 — Tags et amenités (P0)

**URL :** `/admin/settings/tags`

**Q1 :** La liste des tags/amenités disponibles est affichée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un nouveau tag peut être créé (nom + icône/couleur optionnel) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un tag existant peut être modifié ou supprimé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La suppression d'un tag le retire de tous les biens qui y étaient associés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-18 — Configuration email (P1)

**URL :** `/admin/settings`

**Q1 :** Il est possible de configurer l'adresse expéditrice des emails transactionnels ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les templates d'emails (invitation, confirmation de réservation, etc.) sont personnalisables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-19 — Intégrations tierces (P2)

**URL :** `/admin/settings/integrations`

**Q1 :** La page des intégrations liste les passerelles disponibles (Wave, Orange Money, Stripe) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une clé API peut être configurée pour une intégration sans exposer la clé en clair après sauvegarde ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les intégrations activées peuvent être désactivées sans perte de données ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-20 — Paramètres globaux (P2)

**Q1 :** Il est possible de configurer des paramètres globaux de la plateforme (délai de grâce, devise par défaut) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La devise configurable par agence (XOF par défaut, EUR, USD) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Isolation des données (sécurité)

### TC-ADM-21

**Q1 :** Un `agency_admin` ne voit que les données de son agence (pas celles d'autres agences) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Seul le `super_admin` peut accéder aux données de toutes les agences ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Tenter d'accéder à une ressource d'une autre agence retourne bien une erreur 403 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un `agency_admin` ne peut pas élever ses propres permissions au niveau `super_admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Biens — Liste admin (`/admin/properties`)

### TC-ADM-22

**Q1 :** La liste de tous les biens de l'agence est accessible avec filtres (statut, type, agent) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'admin peut forcer la dépublication d'un bien problématique ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'admin peut supprimer un bien définitivement si nécessaire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Récapitulatif des bugs trouvés

| # | Sévérité | Fonctionnalité | Description | Statut |
|---|----------|---------------|-------------|--------|
| | P0 | | | |
| | P1 | | | |
| | P2 | | | |
| | P3 | | | |

---

## 13. Notes du testeur

> _______________________________________________
> _______________________________________________
> _______________________________________________
