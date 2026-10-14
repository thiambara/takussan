---
id: TCK-649
title: L'administration d'agence s'ouvre dans /app (/app/agency/*) — /admin supprimé
status: review
phase: P1
family: full
estimate: L
wave: 78
created: 2026-10-14
updated: 2026-10-14
depends_on: [TCK-647, TCK-648]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#112-agence--équipe
    - docs/features.md#23-notifications
  models: []
tags: [front, back, navigation, app-shell, agence, adr-0064]
---

## Objectif utilisateur

L'admin d'agence administre son agence sans quitter son espace de travail : le menu de `/app` lui
montre, à côté de ce qu'il fait, les seules pages d'administration qu'il peut ouvrir.

## Contrat de données

- Consommé, inchangé : toutes les API que lisent les pages déplacées ; `GET /api/me/capabilities`
  pour la table des pages.
- **Back (prescriptif)** : `App\Domain\Notifications\NotificationTarget::PATHS` — `agency_kyc` →
  `/app/agency/kyc`, `finances` → `/app/agency/finances`, `team` → `/app/agency/team`,
  `agency_settings` → `/app/agency`, `audit` → `/app/agency/audit`, `review_moderation` →
  `/app/agency/moderation` (il vaut `/admin/reviews`, page inexistante : la cloche mène
  aujourd'hui à un 404). Le chemin étant calculé à la lecture, les notifications déjà stockées
  suivent.
- Décision et table des chemins : [ADR-0064](../../adr/0064-l-administration-d-agence-vit-dans-app.md) §1, §2, §4.

## Direction UX / Artistique

- Les pages gardent leur contenu ; elles changent de coque (`AppShell`) et d'adresse.
- Le menu de `/app` gagne une section d'agence, après les entrées de travail ordonnées par
  TCK-646 — une section qui se lit comme telle (titre, regroupement), pas une liste plate allongée.
  Un admin d'agence `individual` y lit « Mon espace », comme aujourd'hui.
- Mobile : le tiroir de `/app` porte la même section ; rien ne pousse la barre du haut.

## Contraintes strictes (métier)

- **La table des pages reste LA source** (§2.2, TCK-633) : la section du menu, les liens du profil,
  l'entrée « Mon espace » et la garde serveur de chaque page en dérivent. Seuls les chemins
  changent ; aucune exigence (`role`, `agence`, `capacite`) ne bouge.
- Une page refusée renvoie à la première page accessible, ou à `/app` s'il n'y en a aucune.
- **Aucune redirection** des anciennes URL (décision du porteur, ADR-0064 §4) : `/admin/*` rend 404.
- La garde serveur reste dans la page ou le layout qui la rend fiable (TCK-426 : un `redirect()` de
  page sous un `loading.tsx` rend 200).
- Les espaces de noms i18n de l'administration sont servis sous `/app/agency` (ADR-0022, ensemble
  cumulé) — une clé manquante lève.

## Delta à produire

- [x] Les pages d'agence de `(dashboard)/admin/*` vivent sous `/app/agency/*` (table de l'ADR §1).
- [x] `PAGES_ADMIN` : nouveaux chemins ; `/admin/users` et `/admin/settings/tags` supprimées,
      avec `AdminNotice` et `lib/admin/notices.ts` si plus rien ne les émet.
- [x] `AppSidebar` : la section d'agence dérivée de la table remplace l'entrée unique
      « Administration ».
- [x] Suppression de `(dashboard)/admin/layout.tsx`, `AdminShell`, `AdminSidebar` — après avoir
      vérifié ce que `/super-admin` en réutilise.
- [x] `src/proxy.ts` : `/admin` ne figure plus dans la garde d'authentification.
- [x] Les 169 occurrences de `/admin` du front (hors `/api/admin`, `/super-admin`) sont réécrites
      ou supprimées.
- [x] Gardes racine : `check-pro-routes.mjs` vérifie `app/(dashboard)/app/agency` et casse si
      `app/(dashboard)/admin` réapparaît ; les autres gardes qui citent `/admin`
      (`check-app-tokens`, `check-super-admin-tokens`, `check-locale-figee`,
      `check-auth-interrupts`) sont réalignées.
- [x] Garde racine neuve : chaque chemin de `NotificationTarget::PATHS` correspond à une page du
      front (ablation : remettre `/admin/reviews` la fait casser).
- [x] Back : `NotificationTarget::PATHS` ; test `NotificationTargetTest` (ou celui qui couvre
      `PATHS`) mis à jour.
- [x] `takussan-web/CLAUDE.md` et `takussan-api/CLAUDE.md` : les passages qui décrivent `/admin`.

## Critères d'acceptation

- [x] AC1 — un admin d'agence `standard` ouvre chaque page de la table de l'ADR §1 à sa nouvelle
      adresse, dans `AppShell`, sans changer de coque.
- [x] AC2 — le menu de `/app` montre exactement les pages à menu de la table que le profil actif
      peut ouvrir : admin `standard`, admin `individual`, agent, bailleur, locataire —
      chacun vérifié ; un profil qui n'en a aucune ne voit pas la section.
- [x] AC3 — une page de la section refusée au profil actif (ex. `/app/agency/roles` pour un admin
      `individual`) renvoie vers sa première page accessible, avec un code 307, pas 200.
- [x] AC4 — toute URL `/admin/*` rend 404 ; `grep` ne trouve plus de lien vers `/admin` dans
      `takussan-web/src` (hors `/api/admin`, `/super-admin`).
- [x] AC5 — une notification `review_moderation`, `team`, `finances`, `audit`, `agency_kyc` ou
      `agency_settings` — y compris stockée avant le changement — ouvre la bonne page.
- [x] AC6 — `check-pro-routes.mjs` casse si une page de `/app/agency` n'appelle pas la garde de son
      chemin (vérifié par ablation).

## Hors périmètre

- `/super-admin/*` et `/api/admin/*` (ADR-0064 §5).
- Les specs (`features.md` §1.12 et §2.2 citent `/admin`) : `/sync-specs` après fusion.
- Une réorganisation du contenu des pages déplacées.

## Notes d'implémentation

- **Déplacement par `git mv`** (historique conservé) ; `/admin/users` et `/admin/settings/tags`
  supprimées, avec le mécanisme d'avis de redirection (`AdminNotice`, `lib/admin/notices.ts`) dont
  elles étaient le seul émetteur.
- **Section d'agence** ajoutée par `avecSectionAgence(items, acces)` après `buildNavItems`, en
  dernier (après l'ordre TCK-646), titrée « Administration » / « Mon espace » ; chaque section
  titrée est un `role="group"` nommé. Les compteurs de modération de l'ancienne barre y sont repris
  avec les MÊMES clés de cache que les files du tableau de bord (même coque désormais).
- **Les pages entrent sous les conventions de `/app`** (`etats-de-route`, `titres-onglets`) : elles
  gagnent `generateMetadata` ; le `notFound` du relevé monte dans `[statementId]/layout.tsx`. PAS de
  `loading.tsx` : il rendrait 200 au lieu de 307 (TCK-426). `garderPageAdmin` devient un terminateur
  de refus, et une page qui se garde par la table est exemptée de repli par propriété dérivée ;
  `check-pro-routes` refuse aussi un `loading.tsx` au-dessus d'une telle page.
- `'admin'` reste dans `SEGMENTS_NON_LOCALISES` (`src/i18n/routing.ts`) : sans lui, `/admin/team`
  serait redirigé en 307 vers `/fr/admin/team` avant le 404 (`robots.txt` interdit donc encore `/admin`).
- `check-pro-routes` lisait les chemins de la table par un motif figé sur `/admin` : au changement de
  table, il est tombé à « aucun chemin lu ». Il lit désormais tout chemin, et interdit l'URL `/admin`
  servie par n'importe quel groupe de routes.
- **Garde neuve `check-notification-target-paths.mjs`** : sa première lecture a trouvé DEUX chemins
  morts depuis TCK-597 — `review_moderation` → `/admin/reviews` et `reviews` → `/app/reviews` (la
  boîte vit sous `/app/profile/reviews`), corrigés.
- Le non-admin qui ouvre `/app/agency/*` est renvoyé vers `/app` (et non plus `/app/profile`).
- Vérifié au navigateur (390 et 1366 px) : admin `standard` (10 entrées), admin `individual`
  (« Mon espace », 5 entrées), statuts 307 / 404 relevés par requêtes HTTP.
- Préexistant, hors périmètre : la page Intégrations répète son introduction (sous-titre de
  l'en-tête + `intro` du composant).
