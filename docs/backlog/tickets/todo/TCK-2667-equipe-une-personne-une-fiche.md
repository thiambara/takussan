---
id: TCK-2667
title: "Équipe : une personne, une fiche — la liste des collaborateurs et la fiche de chaque membre"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2665, TCK-2641, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2668]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models: []
tags: [front, team, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin trouve un membre en deux secondes, voit tout ce qui le concerne sur une fiche, et peut suspendre son accès depuis le téléphone en cas d'urgence.

## Contrat de données

- Membres : `GET /api/users` avec `filter[role]=agent,agency_admin`, `include=team_summary`, `meta.counts` (TCK-2665) ; recherche et filtre de statut existants.
- Gestes existants : rôle (`PATCH /api/agencies/{a}/members/{u}/role`, rôle personnalisé `PATCH /api/profiles/{id}/agency-role`), taux de commission (`PATCH /api/profiles/{agent_profile}/commission-rate`), suspendre / réactiver (`POST /api/agencies/{a}/team/{u}/suspend|reactivate`), retirer et passer le portefeuille (`GET …/members/{u}/portfolio`, `POST …/members/{u}/handover`).
- Performance : `GET /api/agencies/{a}/team-performance?period=` (existant).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-equipe&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Liste » et « Fiche d'un membre », téléphone et bureau.
- **Téléphone** : « Équipe » et « Inviter » dans l'en-tête ; pastilles Tous · Agents · Admins · Absents avec leurs comptes ; recherche ; une ligne par personne sur deux lignes (initiales, nom, rôle ; « En ligne hier · 2FA ✓ », « Absent jusqu'au 14 nov. → Khady », « 2FA à activer » en ton d'attention), chevron ; en bas, « N invitations en cours » et « Performance de l'équipe » ; une phrase « Vos bailleurs sont dans Propriétaires ». Le toucher ouvre la **fiche plein écran** : bandeau d'absence s'il y en a une ; Rôle et commission ; Portefeuille (biens suivis, commissions dues → la page Commissions filtrée sur la personne) ; Sécurité (2FA, dernière connexion) ; Absences (à venir, en cours, « Déclarer ») ; Accès et départ (« Suspendre l'accès », destructif, qui dit ce qu'il fait ; « Retirer de l'agence »).
- **Bureau** : tableau Membre · Rôle · Statut et absence · Double auth. · Biens suivis · Commissions dues · Dernière connexion · « … » ; bandeau des absences en cours au-dessus ; la fiche s'ouvre en panneau latéral large dès `lg` ; l'onglet Performance reste.

## Contraintes strictes (métier)

Fonctions existantes à garder (`team/page.tsx`, `TeamConsole.tsx`, `AdminUsersTable.tsx`, `UserDetailDrawer.tsx`, `HandoverWizard`) :

- « Inviter » aussi pour un non-admin qui tient `team.invite` (les gestes que l'API réserve à l'admin lui restent cachés).
- Vues dans l'URL (pastilles à la place des onglets ; un lien entrant `?vue=performance` mène toujours à la performance) ; Performance pour une agence `standard` et qui tient `reports.view_agency`.
- Recherche (nom, e-mail, téléphone), filtre de statut, tris (membre, dernière connexion, arrivée), « Vous », colonne 2FA.
- Suspendre (confirmation, l'admin principal ne se suspend pas), réactiver, retirer → passation du portefeuille ; double authentification exigée sur chaque geste (`avecGardeDoubleFacteurAction`).
- Rôle d'agence (sélecteur) et taux de commission (`team.assign_role`) sur la fiche.
- États : sans agence (`EmptyState` et lien vers la fiche d'agence), liste vide, vide filtrée, erreur avec « Réessayer ».
- **Pas de régression sur les bailleurs** (décision 2) : ils quittent la liste, mais leurs gestes d'adhésion (suspendre, réactiver, retirer) ne disparaissent pas. Tant que la fiche du bailleur (famille 4, page Bailleurs) ne les porte pas, la vue filtrée des bailleurs reste atteignable depuis la phrase « Vos bailleurs… ».
- « Dans l'équipe depuis » remplace « Créé le » (`joined_at`, TCK-2665).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] Liste par personne (téléphone) et tableau enrichi (bureau), pastilles et comptes.
- [ ] Fiche d'un membre, plein écran au téléphone, panneau au bureau, avec tous les gestes existants.
- [ ] Bandeau des absences en cours.
- [ ] Tests : bailleurs absents de la liste et atteignables par le renvoi ; geste « Suspendre » sous double authentification ; commissions dues absentes sans la capacité ; `?vue=performance`.

## Critères d'acceptation

- [ ] AC1 — À 390 px, aucun tableau à défilement horizontal : une ligne par personne, et « Suspendre l'accès » est atteignable en deux touches depuis la liste.
- [ ] AC2 — Avec 9 agents, 2 admins et 11 bailleurs, la pastille « Tous » affiche 11 et aucun bailleur n'est listé.
- [ ] AC3 — Le renvoi « Vos bailleurs… » mène à une liste où « Suspendre » fonctionne encore pour un bailleur (tant que la famille 4 ne l'a pas repris).
- [ ] AC4 — Un admin sans `payouts.approve` ni `reports.view_agency` ne voit pas la colonne « Commissions dues ».
- [ ] AC5 — `/app/agency/team?vue=performance` ouvre la performance.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2667.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- « Couvrir une absence » et l'écran des invitations (TCK-2668).
- « Rappeler » d'activer la double authentification (aucun envoi n'existe).
- Le départ d'un agent en un seul parcours (suspendre, passer, solder) : ambition de l'audit.

## Notes d'implémentation

**2026-11-12 — implémenté (terrain-5), branche `feat/audit-ux-app-lot-2`.**

API :
- `TeamMemberSummary::counts` rend `staff` (agent OU administrateur, une fois par personne) : c'est le compte de « Tous » (AC2). `absent` lit le nouveau `User::scopeAbsentDansLAgence`, que `buildAgencyTeamQuery` sert aussi en `filter[absent]=1` (la pastille « Absents »). Tests : `TeamStaffCountAndAbsentFilterTest` (4, ablation du résumé : 2 rouges), `TeamMembersSummaryTest` (tableaux exacts complétés de `staff`).

Front — `src/components/admin/equipe/` remplace `TeamConsole`, `AdminUsersTable`, `UserDetailDrawer`, `AdminUsersFilters`, `isAgencyStaffRow` et `InviteMemberButton` (supprimés avec leurs 11 fichiers de tests, dont l'intention est reprise) :
- `ConsoleDeLEquipe` : au téléphone l'en-tête de la coque (« Équipe », « Inviter » plein), les pastilles Tous · Agents · Admins · Absents et leurs comptes, la recherche et une feuille « Trier et filtrer », une ligne par personne, la fiche poussée (`?membre=`) avec « Suspendre » et « Déclarer une absence » dans sa barre (AC1). Au bureau `PageHeader` et les onglets Membres · Invitations · Performance, le bandeau des absences, le tableau, la fiche en panneau de 480 px dès `xl` (plein écran dessous).
- La liste ne demande que le personnel (`filter[role]=agent,agency_admin`) ; « Vos bailleurs sont dans Propriétaires » mène à `/app/owners`, dont la fiche porte suspendre / réactiver depuis TCK-2641 (AC3) ; l'ancien `?filter[role]=owner` y est renvoyé.
- « Commissions dues » (colonne et rangée) n'existe que si la ligne porte `commissions_due_amount` (AC4) ; `?vue=performance` ouvre la performance (AC5).
- La fiche : identité, Appeler / WhatsApp / E-mail, absence en cours, « Rôle et commission » en rangées (`MemberAgencyRoleSelect` et `AgentCommissionRateField` gagnent `disposition="ligne"` ; « Profil dans l’agence » = `UserRolesEditor`, qui lit désormais le profil en place quand la ligne ne porte pas `roles` — il s'ouvrait sur « Choisir un rôle » pour un agent actif, déjà dans le tiroir d'avant), Portefeuille, Sécurité, absences (`AgentAbsencesSection`, bornée au membre), Accès et départ. Tous les gestes passent sous la double authentification comme avant.
- `console-agence-a11y`, `equipe-membre-sans-nom.p220-04`, `TeamPerformance.tck-595` et `agency/__tests__/gardes` portent sur les nouveaux composants. Le tableau défile désormais dans son cadre à toute largeur (il rognait dès `xl`).

Tests : `equipe/__tests__/` — ConsoleDeLEquipe (39), etat-de-l-equipe (9), FicheDuMembre.role-et-commission (4), BandeauDesAbsences (3). Ablations : liste sans le filtre du personnel (3 rouges), colonne et rangée des dues forcées (2), agence hors de la clé de requête (1), cadre du tableau sans défilement (1), profil en place retiré (1) — toutes restaurées.

Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2667.json` (relevés v3, écarts acceptés et leurs motifs). AC-F6 : `balayer` 360 · 768 · 1024 · 1280, liste et fiche ouverte — débord 0, coupes 0.

Restes, notés pour la suite :
- `?membre=` n'ouvre la fiche que si le membre est sur la page et sous les filtres en cours (la fiche se lit dans la page de la liste) ; un lien profond vers un membre d'une autre page ouvre la liste seule.
- « Modifier » une absence, « Couvrir une absence » et les invitations : TCK-2668.
- Non servis par l'API, donc non affichés : ventilation des biens suivis, ancienneté des commissions dues, date d'activation de la 2FA, appareil de la dernière connexion, description des rôles système (vide en démo) ; aucune liste de biens ni de clients ne se filtre par agent.
