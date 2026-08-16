# QA — Admin d'agence / Super-admin 🛡️

**Acteur :** Superviseur de la plateforme et de l'agence (rôle `agency_admin` ou `super_admin`)
**Précondition :** Compte connecté en `agency_admin` (ou `super_admin` pour les TC marqués `[SUPER]`).
**Environnement :** `http://localhost:3000` · `http://localhost:8002`
**Testeur :**
**Date :**
**Version :** dev branch

> Les fonctionnalités transverses (auth, profil, notifications, i18n, médias, recherche) sont couvertes dans [`utilisateurs-authentifies-qa.md`](./utilisateurs-authentifies-qa.md).
> Les actions métier (biens, baux, réservations, CRM…) suivent les flux décrits dans [`agent-qa.md`](./agent-qa.md) — le rôle admin a tous les pouvoirs d'un agent + administration.

> ### ⚠️ Un « rôle » n'est pas une permission — lire avant de tester la §5
>
> `spatie/laravel-permission` a été **désinstallé** (TCK-278). Il n'y a plus de table de rôles, plus
> de permissions granulaires, plus de rôles personnalisés, et **plus de page `/admin/roles`**. Le
> rôle d'un utilisateur est la présence d'un **profil polymorphe** (`OwnerProfile`, `AgentProfile`,
> `AgencyAdminProfile`, `BrokerProfile`, `ServiceProviderProfile`, `PlatformProfile`) dans une
> agence donnée ; les droits sont l'enum `Capability` résolue par `MembershipCapabilityResolver`
> pour un couple *(utilisateur, agence)*.
>
> Ce document faisait tester `/admin/roles`, `POST /api/roles`, `POST /api/roles/{role}/permissions`
> et `POST /api/users/{user}/roles` — **quatre surfaces qui n'existent plus**. Un testeur les aurait
> toutes remontées en ❌ sans qu'aucune ne soit un défaut. Corrigé le 2026-08-16 (TCK-311).

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

`[SUPER]` = test à exécuter avec un compte `super_admin` uniquement.

---

## Ordre de test optimisé

> Suivre l'ordre pour parcourir l'ensemble du back-office en limitant les retours.

### Partie A — Agency admin (`/admin/*`)

1. **Connexion** + **Dashboard agence** (`/admin`)
2. **Sidebar** + vérification rôle
3. **Mon agence** (`/admin/agency`) — config, logo, commission par défaut
4. **Équipe** (`/admin/team`) — invitations, rôles, retraits
5. **Utilisateurs** (`/admin/users`) — recherche, blocage, activation, attribution de rôle
6. **Rôle = profil polymorphe** — depuis `/admin/users` (il n'y a **pas** de page `/admin/roles`)
7. **Modération biens** (`/admin/moderation/properties`)
8. **Modération avis** (`/admin/moderation`) `[SUPER]`
9. **Finances** (`/admin/finances`) — paiements, factures, payouts, rapprochement
10. **Biens** (`/admin/properties`) — liste plateforme, dépublication forcée
11. **Audit** (`/admin/audit`) — journal, filtres, export
12. **Settings** (`/admin/settings`, `/admin/settings/tags`, `/admin/settings/integrations`)
13. **Stats avancées** (`/app/overview/agency`, `/app/overview/kpis`, `/app/overview/alerts`)

### Partie B — Super admin (`/super-admin/*`) `[SUPER]`

14. **Console super-admin** (`/super-admin`)
15. **Agences** (`/super-admin/agencies`)
16. **Biens cross-tenant** (`/super-admin/properties`)
17. **Utilisateurs cross-tenant** (`/super-admin/users`) — impersonation
18. **Audit cross-tenant** (`/super-admin/audit`)
19. **Système** (`/super-admin/system`) — métriques, intégrations globales

---

## 1. Connexion & Dashboard agence

### TC-ADM-01 — Connexion admin

**Étape 1 :** `/auth/login` → compte admin (ex: `admin1@dakarimmo.sn` / `password`).

**Q1 :** Après connexion, l'utilisateur peut accéder à `/app` (espace agent) **et** à `/admin` (espace admin) via la sidebar (lien "Administration") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur "Administration" dans la sidebar.

**Q2 :** Redirection vers `/admin` ; l'AdminShell (sidebar fond sombre + header dédié) est affiché ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La sidebar admin affiche, dans cet ordre : Tableau de bord, Équipe, Agence, KYC, Facturation, Finances, Modération biens, Journal d'audit, Paramètres ; pour `super_admin` aussi : Biens (en tête) et Modération avis ?
> Référence : `takussan-web/src/components/layout/AdminSidebar.tsx`. **Il n'y a ni entrée
> « Utilisateurs » ni entrée « Rôles & Permissions »** — leur absence n'est pas un bug.
> Certaines entrées sont cadenassées « Pro » selon le plan de l'agence (cf. `isProRouteLocked`).
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-02 — Dashboard agence (`/admin`)

**Étape 1 :** Naviguer vers `/admin`.

**Q1 :** Widget "Vue d'ensemble" : nombre total de biens (actifs / archivés), revenus du mois, impayés du mois, total de vues sur les biens ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Widget "Baux & occupation" : nombre de baux actifs, taux d'occupation (%), prochaines fins de bail ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Widget "Équipe" : nombre d'agents, top 3 agents par revenu généré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Widget "À traiter" : modérations en attente (biens / avis), réservations en attente, devis à valider ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les chiffres correspondent à la BDD (vérifier rapidement avec quelques requêtes API) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Mon agence (`/admin/agency`)

### TC-ADM-03 — Configuration agence (P0)

**Étape 1 :** Naviguer vers `/admin/agency`.

**Q1 :** La page affiche les champs : nom, raison sociale, numéro de licence, email pro, téléphone, adresse, site web, description, devise par défaut, logo ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Modifier le nom (suffixer ` — QA`), sauvegarder.

**Q2 :** Modification persistée ; la nouvelle valeur s'affiche partout (sidebar admin, factures, etc.) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Restaurer le nom initial.

**Q3 :** Restauration persistée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-04 — Logo de l'agence (P0)

**Étape 1 :** Cliquer "Modifier le logo". Uploader un PNG (200×200, < 1 Mo).

**Q1 :** Le logo est uploadé ; l'aperçu est immédiat ; le logo apparaît sur la sidebar admin et sur les fiches biens publiques ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tenter un fichier > 5 Mo : erreur claire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-05 — Commission par défaut (P1)

**Étape 1 :** Sur `/admin/agency`, repérer "Commission par défaut".

**Q1 :** Le champ accepte un pourcentage (ex: 5%) avec validation 0-100 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La nouvelle valeur s'applique aux futurs baux/payouts (pas rétroactivement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-06 — Watermark des photos (P2)

**Étape 1 :** Cliquer "Régénérer les watermarks" via `POST /api/agencies/{id}/regenerate-watermarks`.

**Q1 :** Une tâche asynchrone est démarrée (notif "Génération en cours") ; les photos publiées sont régénérées avec le logo de l'agence en filigrane ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-07 — Statistiques globales agence

**Étape 1 :** Sur `/admin/agency`, repérer "Statistiques".

**Q1 :** Affiche : biens publiés, biens vendus / loués (cumul), revenus cumulés, taux de conversion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Équipe (`/admin/team`)

### TC-ADM-08 — Liste des membres (P0)

**Étape 1 :** Naviguer vers `/admin/team`.

**Q1 :** La liste des membres affiche : nom, email, rôle (badge coloré), date d'arrivée, statut (actif / suspendu) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche par nom et filtre par rôle disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-09 — Inviter un agent (P0)

**Étape 1 :** Cliquer "Inviter un agent". Saisir email + rôle (`agent`).

**Q1 :** Soit (a) si l'email correspond à un User existant : ajout direct au membership de l'agence ; soit (b) si nouvel email : un email d'invitation est envoyé avec lien de création de compte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Vérifier en BDD ou via `GET /api/agencies/{id}/members`.

**Q2 :** Le nouveau membre apparaît dans la liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-10 — Modifier le rôle d'un membre (P1)

**Étape 1 :** Sur un agent, ouvrir le menu actions, choisir "Changer le rôle" → `agency_admin`.

**Q1 :** Une confirmation est demandée ; le rôle est mis à jour (`PUT /api/agencies/{id}/members/{user}/role`) ; le membre voit immédiatement les liens admin sans re-login ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-11 — Retirer un agent (P0)

**Étape 1 :** Sur un agent, choisir "Retirer de l'agence". Confirmer.

**Q1 :** Le membre disparaît de la liste ; ses accès aux ressources de l'agence sont révoqués (vérifier via API que ses biens sont réassignés ou archivés selon politique) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une notification est envoyée à l'agent retiré ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-12 — Délégations temporaires (P2)

**Étape 1 :** Sur un membre, cliquer "Déléguer un rôle temporairement". Choisir rôle + dates.

**Q1 :** Une délégation est créée (`POST /api/agencies/{id}/role-delegations`) ; le membre obtient le rôle entre les dates indiquées ; la révocation manuelle est possible (`DELETE`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Utilisateurs (`/admin/users`)

### TC-ADM-13 — Liste

**Étape 1 :** Naviguer vers `/admin/users`.

**Q1 :** La liste affiche : nom, email, rôles, agence(s), date d'inscription, statut (actif / bloqué), email vérifié, 2FA activée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Recherche par nom/email + filtres (rôle, statut, agence, vérification email) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-14 — Bloquer / activer un utilisateur (P0)

**Étape 1 :** Sur un utilisateur, cliquer "Bloquer". Confirmer + saisir motif optionnel.

**Q1 :** Statut → "Bloqué" ; toutes ses sessions sont révoquées ; il ne peut plus se connecter (message "Compte suspendu") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Réactiver".

**Q2 :** Statut → "Actif" ; l'utilisateur peut à nouveau se connecter ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-15 — Changer le rôle d'un utilisateur (P1)

> Le rôle est **remplacé**, pas cumulé : le PUT matérialise le profil cible dans l'agence et
> supprime les profils agence-scopés concurrents. Composant : `UserRolesEditor.tsx`.

**Étape 1 :** Sur un utilisateur, ouvrir "Rôle". Choisir `owner` sur un agent existant.

**Q1 :** Le rôle est appliqué (`PUT /api/users/{user}/role`, via le BFF `/api/admin-users/{id}/role`) ; l'`AgentProfile` de l'agence est remplacé par un `OwnerProfile` ; la sidebar reflète les nouveaux liens dès le prochain refresh ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur le même utilisateur, choisir `tenant` (ou `customer`, ou `service_provider`).

**Q2 :** Ces trois valeurs sont acceptées par la validation mais **ne créent aucun profil** — elles passent par les flux dédiés (invitation / booking / bail). L'UI l'explique-t-elle au lieu de laisser croire à un échec ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Rôle = profil polymorphe (depuis `/admin/users`)

> **Il n'existe pas de page `/admin/roles`, et c'est voulu** (TCK-278). Les scénarios ci-dessous
> remplacent les anciens TC-ADM-16/17/18, qui testaient des rôles personnalisés et des permissions
> granulaires — un mécanisme désinstallé. Ne pas remonter l'absence de `/admin/roles` comme un bug.

### TC-ADM-16 — Les rôles assignables sont un ensemble fermé (P0)

**Étape 1 :** Sur `/admin/users`, ouvrir l'éditeur de rôle d'un utilisateur.

**Q1 :** Les valeurs proposées sont un **ensemble fixe, défini en code** (`UserRoleController::allowedRoles()`) — il n'y a aucun moyen de créer un rôle depuis l'UI ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Aucune page ni aucun lien de l'espace admin ne mène à une gestion de « permissions » individuelles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-17 — Le profil est scopé à l'agence (P0)

**Étape 1 :** En `agency_admin` de l'agence A, changer le rôle d'un utilisateur membre de l'agence A.

**Q1 :** L'opération réussit et n'affecte **que** les profils de l'agence A — les profils que ce même utilisateur porte dans une autre agence sont intacts ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Tenter le même `PUT /api/users/{user}/role` sur un utilisateur qui n'appartient pas à l'agence A.

**Q2 :** 403 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-18 — `super_admin` ne s'auto-attribue pas (P0)

**Étape 1 :** En `agency_admin`, tenter `PUT /api/users/{user}/role` avec `{"role": "super_admin"}`.

**Q1 :** 403 avec le message `messages.only_super_admin_can_grant_super_admin` — seul un `super_admin` peut accorder `super_admin` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Refaire l'opération avec un compte `super_admin`.

**Q2 :** Un `PlatformProfile` de niveau `super_admin` (cross-tenant) est créé ou réactivé ; l'événement est tracé dans l'audit log ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Modération des biens (`/admin/moderation/properties`)

### TC-ADM-19 — File de modération (P2)

**Précondition :** Un bien soumis à modération via `POST /api/properties/{id}/submit-moderation`.

**Étape 1 :** Naviguer vers `/admin/moderation/properties`.

**Q1 :** La file affiche les biens "En attente" avec : photo de couverture, titre, agent soumetteur, date de soumission, badge urgence ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un compteur dans la sidebar admin badge "X biens à modérer" est mis à jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-20 — Approuver un bien

**Étape 1 :** Cliquer sur un bien dans la file. Examiner les détails (photos, description, prix, conformité).

**Q1 :** Cliquer "Approuver" ; un commentaire interne optionnel ; le bien passe à "Publié" et devient visible publiquement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une notification est envoyée à l'agent soumetteur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-21 — Rejeter un bien

**Étape 1 :** Sur un bien en attente, cliquer "Rejeter". Sélectionner un motif (Photos manquantes / Description insuffisante / Prix incohérent / Doublon / Autre) + commentaire.

**Q1 :** Le bien retourne au statut "Rejeté" / "À corriger" ; l'agent reçoit une notification + le motif ; il peut corriger et resoumettre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Modération des avis (`/admin/moderation`) `[SUPER]`

### TC-ADM-22 — File des avis signalés (P2)

**Précondition :** Au moins un avis signalé.

**Étape 1 :** Naviguer vers `/admin/moderation` (super_admin).

**Q1 :** La file affiche les avis signalés avec : auteur, cible, contenu, motif(s) du signalement, signaleur(s) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur un avis, cliquer "Approuver" (l'avis reste publié), "Masquer" (l'avis n'est plus visible publiquement), ou "Supprimer" (suppression définitive).

**Q2 :** Chaque action met à jour le statut et trace l'événement dans l'audit log ; l'auteur est notifié ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un avis "Masqué" disparaît de la fiche bien publique immédiatement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. Finances (`/admin/finances`)

### TC-ADM-23 — Vue d'ensemble finances

**Étape 1 :** Naviguer vers `/admin/finances`.

**Q1 :** Onglets : Paiements / Factures / Payouts / Commissions / Rapprochement bancaire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les KPIs en haut : revenus du mois, factures impayées, payouts en attente, commissions non versées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-24 — Enregistrer un paiement manuel (P0)

**Étape 1 :** Cliquer "Nouveau paiement". Choisir entité (réservation / bail / facture). Saisir montant, méthode (virement / espèces / chèque / mobile money), date, référence.

**Q1 :** Le paiement est enregistré ; le statut de l'entité associée est mis à jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Une quittance / reçu PDF est généré et téléchargeable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-25 — Statuts des paiements

**Q1 :** Les statuts (En attente / Payé / Remboursé / Échec / Annulé) sont visibles dans la liste avec des badges colorés cohérents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-26 — Factures (P1)

**Étape 1 :** Onglet "Factures", cliquer "Nouvelle facture".

**Q1 :** Formulaire : Customer destinataire, lignes (description / quantité / PU), TVA, conditions, échéance ; PDF prévisualisable avant envoi ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Émettre, envoyer, marquer payée, annuler successivement.

**Q2 :** Toutes les transitions de statut fonctionnent ; le destinataire reçoit les notifications appropriées ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-27 — Payouts (reversement bailleur) (P1)

**Étape 1 :** Onglet "Payouts", cliquer "Nouveau payout". Sélectionner bailleur, période, paiements à inclure.

**Q1 :** Calcul automatique : montant brut, commission agence, montant net ; possibilité d'éditer la commission ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Marquer le payout comme "Traité" (versement effectué).

**Q2 :** Statut → "Traité" ; le bailleur reçoit une notification + reçu PDF ; tracé dans l'audit ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sur un payout en cours, cliquer "Marquer en échec" puis "Annuler".

**Q3 :** Les transitions sont possibles avec motif obligatoire ; un payout annulé peut être recréé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-28 — Rapprochement bancaire (P2)

**Étape 1 :** Onglet "Rapprochement bancaire". Cliquer "Importer un relevé". Uploader un CSV / PDF de relevé bancaire.

**Q1 :** Les lignes du relevé sont parsées (date, libellé, montant, solde) et affichées dans `/api/agencies/{id}/bank-statements/{statement}/lines` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur une ligne, le système suggère un paiement potentiel (matching auto). Valider via `POST /api/bank-statement-lines/{line}/match`.

**Q2 :** Le paiement est rapproché ; sur les lignes non rapprochées, on peut ignorer (`POST /.../ignore`) ou rapprocher manuellement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Finaliser le relevé" via `POST /api/bank-statements/{statement}/finalize`.

**Q3 :** Le relevé est verrouillé ; les lignes ne sont plus modifiables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-29 — Relances de factures (P2)

**Précondition :** Une facture en retard.

**Q1 :** À J+3 / J+7 / J+15, des relances automatiques sont envoyées au destinataire ; le statut "En relance" apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-30 — Commissions par agent (P3)

**Étape 1 :** Onglet "Commissions". Filtrer par agent.

**Q1 :** Le récap mensuel par agent est affiché : commissions générées, versées, en attente ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 9. Biens — Liste plateforme (`/admin/properties`)

### TC-ADM-31 — Liste admin biens

**Étape 1 :** Naviguer vers `/admin/properties`.

**Q1 :** Liste enrichie : référence, titre, agence, agent, statut, prix, vues, favoris, signalements, dernière modification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Filtres : statut (incluant "modération en attente"), agence, agent, date, signalements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-32 — Actions modération forcée

**Étape 1 :** Sur un bien, cliquer "Forcer la dépublication".

**Q1 :** Le bien est dépublié immédiatement ; un motif est obligatoire ; l'agent et le bailleur sont notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Supprimer définitivement" sur un bien problématique (super_admin uniquement).

**Q2 :** Une double confirmation est demandée ; le bien est supprimé (force-delete au-delà du soft-delete) ; l'audit log conserve la trace ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Audit (`/admin/audit`)

### TC-ADM-33 — Journal d'activité (P0)

**Étape 1 :** Naviguer vers `/admin/audit`.

**Q1 :** Le journal liste les événements en ordre chronologique inverse avec : utilisateur, action (créé / modifié / supprimé / approuvé / etc.), entité (Property #42, Lease #17), horodatage, IP ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le diff "avant / après" est affiché pour les modifications ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-34 — Filtres du journal (P1)

**Étape 1 :** Appliquer filtres : utilisateur = un agent précis, plage de dates = derniers 7 jours, action = `updated`, entité = `Property`.

**Q1 :** Les résultats sont correctement filtrés ; l'URL contient les paramètres ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur un événement.

**Q2 :** Le détail montre les valeurs avant/après ; lien vers l'entité concernée si elle existe encore ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-35 — Audit par entité

**Étape 1 :** Sur la fiche d'un bail, cliquer "Voir l'historique".

**Q1 :** L'API `/api/audit-log/{entity}/{id}` renvoie tous les événements pour cette entité ; même résultat via UI ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-36 — Export du journal (P2)

**Étape 1 :** Cliquer "Exporter" → CSV.

**Q1 :** Une tâche est lancée (`GET /api/activity-logs/export`) ; un téléchargement est proposé une fois prêt (`/download`) ; le CSV contient toutes les colonnes attendues ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-37 — Alertes sur actions sensibles (P3)

**Q1 :** Une notif admin est envoyée pour : suppression de bien, suppression de bail, modification de rôle super_admin, échec de paiement répété ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Settings (`/admin/settings`)

### TC-ADM-38 — Vue d'ensemble settings

**Étape 1 :** Naviguer vers `/admin/settings`.

**Q1 :** Sections visibles : Tags & Amenités, Configuration email, Intégrations, Paramètres globaux ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-39 — Tags & amenités (`/admin/settings/tags`) (P0)

**Étape 1 :** Liste des tags. Cliquer "Nouveau tag". Nommer "Domotique", choisir une icône.

**Q1 :** Le tag est créé et apparaît dans le sélecteur d'amenités sur les fiches biens ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Modifier un tag, puis tenter de le supprimer.

**Q2 :** Si le tag est utilisé par des biens, soit blocage avec message explicite, soit confirmation "Le tag sera retiré de N biens" ; après suppression, il disparaît partout ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-40 — Configuration email (P1)

**Étape 1 :** Section "Email". Modifier l'adresse expéditrice, le nom expéditeur, l'adresse de support.

**Q1 :** Les valeurs sont sauvegardées ; un email test peut être envoyé pour vérifier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les templates (vérification email, reset password, invitation, confirmation booking) sont éditables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-41 — Intégrations (`/admin/settings/integrations`) (P2)

**Étape 1 :** Liste des intégrations disponibles : Wave, Orange Money, Stripe, Twilio (SMS), Mapbox.

**Q1 :** Pour chaque intégration : statut (active / inactive), bouton "Configurer", bouton "Tester" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Configurer Stripe (saisir clés API). Sauvegarder.

**Q2 :** Les clés API sont stockées chiffrées ; après sauvegarde, seules les 4 derniers caractères sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Tester l'intégration" via `POST /api/integrations/{integration}/test`.

**Q3 :** Le test renvoie OK ou un message d'erreur explicite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Désactiver l'intégration.

**Q4 :** L'intégration est désactivée sans perte de configuration ; les paiements en cours via cette passerelle ne sont pas affectés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-42 — Paramètres globaux (P2)

**Q1 :** Champs : devise par défaut (XOF / EUR / USD), délai d'expiration des réservations en attente, délai de relance d'impayés (J+3, J+7), pourcentage de pénalité de retard ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les modifications prennent effet pour les futurs événements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Statistiques avancées admin

### TC-ADM-43 — Dashboard agency (`/app/overview/agency`)

**Étape 1 :** Naviguer.

**Q1 :** Vue avancée : revenus / occupations / impayés / nouveaux clients par mois, comparatifs avec mois précédent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-44 — KPIs personnalisables (`/app/overview/kpis`) (P3)

**Étape 1 :** Cliquer "Nouveau KPI". Nommer, choisir métrique parmi `/api/kpi-configs/metrics`, choisir la période et la cible.

**Q1 :** Le KPI est créé (`POST /api/kpi-configs`) ; il apparaît sur le dashboard avec un graphique d'évolution ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Modifier le KPI, puis le supprimer.

**Q2 :** Modification + suppression fonctionnent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-45 — Alertes sur seuils (`/app/overview/alerts`) (P3)

**Étape 1 :** Cliquer "Nouvelle alerte". Définir : métrique = "Taux d'impayés", seuil = 10%, canal de notification (email / in-app).

**Q1 :** L'alerte est créée (`POST /api/threshold-alerts`) ; quand le seuil est dépassé, une notification est envoyée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 13. Exports (`/app/overview/exports`)

### TC-ADM-46 — Exports CSV / Excel / PDF (P2)

**Étape 1 :** Pour chaque entité (paiements / baux / clients / biens), tester un export.

| Entité | Format | Téléchargé | Contenu cohérent | Statut |
|--------|--------|------------|------------------|--------|
| Paiements | CSV | _______ | _______ | ✅ ❌ ⚠️ 🔲 |
| Baux | CSV | _______ | _______ | ✅ ❌ ⚠️ 🔲 |
| Clients | CSV | _______ | _______ | ✅ ❌ ⚠️ 🔲 |
| Biens | CSV | _______ | _______ | ✅ ❌ ⚠️ 🔲 |
| Quittances | PDF | _______ | _______ | ✅ ❌ ⚠️ 🔲 |
| Factures | PDF | _______ | _______ | ✅ ❌ ⚠️ 🔲 |

**Q1 :** Toutes les exports fonctionnent et les fichiers sont structurés/lisibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 14. Isolation des données

### TC-ADM-47 — Cloisonnement par agence

**Précondition :** Connecté en `agency_admin` (pas super_admin).

**Q1 :** L'admin ne voit QUE les données de son agence dans : `/admin/users`, `/admin/properties`, `/admin/finances`, `/admin/audit` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tentative API de lire une ressource d'une autre agence → 403 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Aucun lien `/super-admin` n'est visible dans la sidebar ; tentative directe → redirection ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'agency_admin ne peut pas s'attribuer le rôle `super_admin` — cf. TC-ADM-18, qui le vérifie au niveau de l'API ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 15. Console super-admin (`/super-admin/*`) `[SUPER]`

### TC-ADM-48 — Accès console

**Précondition :** Compte `super_admin` (ex: `superadmin@takussan.com` / `password`).

**Étape 1 :** Naviguer vers `/super-admin`.

**Q1 :** Le SuperAdminShell s'affiche (palette stone-900 + accent ambre) ; sidebar : Console, Agences, Biens, Utilisateurs, Audit, Système ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un user non super_admin tentant d'accéder à `/super-admin` est redirigé ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-49 — Liste des agences (`/super-admin/agencies`)

**Étape 1 :** Liste de toutes les agences de la plateforme.

**Q1 :** Colonnes : nom, slug, statut (active / suspendue), nombre de membres, nombre de biens, date de création, statut de vérification (vérifiée / non vérifiée) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sur une agence, cliquer "Vérifier".

**Q2 :** L'agence passe en statut "Vérifiée" (`POST /api/admin/agencies/{id}/verify`) ; un badge apparaît sur les fiches biens ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Suspendre" (`POST /api/admin/agencies/{id}/suspend`).

**Q3 :** L'agence est suspendue ; ses biens sont retirés du public ; ses membres sont notifiés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-50 — Biens cross-tenant (`/super-admin/properties`)

**Étape 1 :** Liste de tous les biens de la plateforme.

**Q1 :** Filtres par agence + actions de modération forcée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-51 — Utilisateurs cross-tenant (`/super-admin/users`)

**Étape 1 :** Liste de tous les users de la plateforme.

**Q1 :** Bouton "Impersonate" sur chaque user (POST `/api/admin/users/{user}/impersonate`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer "Impersonate" sur un user.

**Q2 :** Une session impersonation est ouverte ; un bandeau persistant en haut "Vous voyez la plateforme en tant que [User]. [Quitter l'impersonation]" est visible ; le SuperAdmin peut naviguer comme cet user ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer "Quitter l'impersonation" (`POST /api/admin/impersonate/stop`).

**Q3 :** Retour à la session super_admin sans relogin ; l'événement est tracé dans l'audit log ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-52 — Audit cross-tenant (`/super-admin/audit`)

**Étape 1 :** Naviguer vers `/super-admin/audit`.

**Q1 :** Le journal d'audit affiche les événements de **toutes** les agences avec un filtre "Agence" supplémentaire ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-ADM-53 — Système (`/super-admin/system`)

**Étape 1 :** Naviguer vers `/super-admin/system`.

**Q1 :** Métriques techniques : taille BDD, nombre d'utilisateurs actifs (DAU/MAU), file de jobs (queue size), erreurs 500 sur 24h, taux d'occupation Redis/cache ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Statut des intégrations globales (Mailer, SMS providers, Storage, Search) avec ping en direct ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** L'API `/api/admin/system/metrics` est accessible et renvoie les métriques en JSON ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 16. Récapitulatif — Bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

---

## 17. Notes du testeur

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```
