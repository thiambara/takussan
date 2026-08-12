---
id: TCK-173
title: RBAC UI customer — masquer surfaces agent + compléter la sidebar customer
status: done
phase: P1
family: front
estimate: M
wave: 19
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-167]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#21-authentification--comptes
tags: [front, rbac, dashboard, navbar]
---

## Objectif utilisateur

Le locataire/acheteur ne doit voir dans son interface que les actions qui le concernent — pas de bouton « Nouveau bail », pas de lien « Publier un bien », pas de section agent — et doit retrouver toutes les pages de son parcours dans la sidebar.

## Contrat de données

Findings smoke test 2026-05-05 :

**Surfaces agent visibles côté customer (à masquer)** :

- Navbar publique (composant top nav `(public)`) : lien `List a property` qui pointe vers `/app/properties/new` (page agent + crash 500 — cf. TCK-167).
- `/app/leases` : bouton `Nouveau bail` (lien `/app/leases/new`) ; `/app/leases/new` est elle-même accessible sans gating.
- `/app/leases/[id]` : boutons `Ajouter un document`, `Générer l'échéancier`, `Enregistrer un paiement`, `Ajouter un garant` — tous des actions agent.
- `/app/bookings/[id]` : bouton `Enregistrer un paiement` (action agent ; remplacé par `Payer l'acompte/solde` côté customer dans TCK-172).

**Sidebar customer incomplète (à compléter)** :

Présent : Tableau de bord, Mes favoris, Recherches sauvegardées, Messagerie, Documents, Statistiques, Réservations, Visites, Baux.

Manque (cités dans la grille QA et présents en route) : Paiements (`/app/payments`), Maintenance (`/app/maintenance`), Avis (`/app/profile/reviews`), États des lieux (`/app/inventories`).

Calendrier (`/app/calendar`) reste réservé aux rôles agent/owner/admin (cf. TCK-167).

## Direction UX / Artistique

Pas de re-design, pure mise à jour conditionnelle des composants existants. Les libellés FR doivent être : `Paiements`, `Maintenance`, `Mes avis`, `États des lieux` (cohérents avec les pages cibles). L'ordre suit le parcours métier : Tableau de bord → Découverte (favoris, saved searches) → Demandes (visites, réservations, maintenance) → Engagements (baux, paiements, EDL) → Communication (messagerie) → Données (documents, mes avis) → Statistiques.

## Contraintes strictes (métier)

- Aucun de ces masquages ne dispense du gating serveur (TCK-167) — l'UI est cosmétique, la sécurité reste côté Server Component / API policy.
- La nav publique ne doit pas faire un check de rôle qui révèle l'identité connectée à un visiteur anonyme — cacher le lien si `user.role === customer`, garder visible si non connecté ou rôle agent/owner/admin.
- Le composant sidebar doit consommer la même source de vérité (`getMeAction()` ou helper rôle) pour décider quels items afficher — ne pas dupliquer la logique.

## Delta à produire

- [ ] Top nav publique (`(public)/_components/...`) : conditionner l'affichage du lien `List a property` au rôle (`agent | owner | admin | super_admin`).
- [ ] Sidebar dashboard `/app/*` : ajouter les 4 entrées manquantes (`Paiements`, `Maintenance`, `Mes avis`, `États des lieux`) pour le rôle `customer`, dans l'ordre métier décrit ci-dessus.
- [ ] `/app/leases` : masquer le bouton `Nouveau bail` côté `customer`.
- [ ] `/app/leases/[id]` : masquer ou désactiver les CTA agent (`Ajouter un document`, `Générer l'échéancier`, `Enregistrer un paiement`, `Ajouter un garant`) côté `customer`. Remplacer par `Télécharger le contrat PDF` (cf. TC-LOC-18 Q4) + (à défaut) `Voir le bien` + `Payer le loyer` (couvert par TCK-172).
- [ ] `/app/bookings/[id]` : remplacer `Enregistrer un paiement` côté customer par les CTA passerelle de TCK-172 (placeholder OK si TCK-172 pas encore mergé, simple disable + texte explicatif).
- [ ] Tests : Playwright (ou équivalent) — un customer ne voit aucun des libellés interdits, voit les 4 nouvelles entrées de sidebar.

## Critères d'acceptation

- [ ] Aucun lien `List a property` / `Publier un bien` / `Nouveau bail` n'apparaît dans le DOM connecté en customer.
- [ ] La sidebar `/app/*` du customer contient `Paiements`, `Maintenance`, `Mes avis`, `États des lieux`.
- [ ] `/app/leases/[id]` côté customer affiche `Télécharger le contrat PDF` au lieu des CTA agent.
- [ ] Connecté en agent, tous les CTA agent restent visibles et fonctionnels (non-régression).

## Hors périmètre

- Génération du contrat PDF côté backend (à câbler dans le ticket Lease ; ce ticket ajoute juste le bouton et son lien).
- i18n des libellés (TCK-175).
- Implémentation des passerelles de paiement (TCK-172).

## Notes d'implémentation

- `Navbar.tsx` (public top nav) : le bouton `Publier un bien` est désormais conditionné à `canPublishProperty = isAgent || isOwner || isAdmin`. Pour un visiteur anonyme on garde le CTA (qui redirige vers `/auth/login?redirect=/app`) — c'est cohérent avec le `t('publish')` déjà rendu.
- `AppSidebar.tsx` : la branche `customer` liste désormais l'ordre métier complet (visites → réservations → maintenance → baux → paiements → EDL → avis). Les autres branches (owner / agent) restent inchangées.
- `(dashboard)/app/leases/page.tsx` : bouton `Nouveau bail` masqué pour le rôle customer.
- `LeaseDetail` : un nouveau gate `isAgentSurface` (équivalent au gate `canRefundDeposit`) cache `Ajouter un document`, `Générer l'échéancier`, `Enregistrer un paiement` côté tenant et les remplace par un lien `Télécharger le contrat PDF` (route existante `GET /api/leases/{lease}/contract/pdf`). Le bouton `Renouveler le bail` / `Résilier le bail` restait déjà gaté.
- `GuarantorSection` reçoit un prop `canManage` (par défaut `true` pour la non-régression) qui cache le CTA `Ajouter un garant` — et toute la section si aucun garant n'est attaché — quand on est sur la surface tenant.
