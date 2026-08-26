---
id: TCK-357
title: "Console super-admin — primitives partagées (table, en-tête, tuile, badge, filtres, états)"
status: review
phase: P2
family: front
estimate: L
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: [TCK-358, TCK-360, TCK-361, TCK-362, TCK-363, TCK-365, TCK-373]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, super-admin, table, primitives]
---

## Objectif utilisateur

Le super-admin retrouve la même table, le même en-tête, le même badge de statut et le même état de chargement d'un écran à l'autre de la console — au lieu de réapprendre la mise en page à chaque menu.

## Contrat de données

- Ticket purement frontend. Aucun endpoint créé ni modifié, aucun contrat de réponse touché.
- Les 11 écrans qui rendent une table aujourd'hui consomment déjà leurs données ; seule la couche de rendu bouge.

## Direction UX / Artistique

- **Densité unique.** Aujourd'hui cinq échelles de padding cohabitent dans les cellules (`px-2/3/4` × `py-2/3`) selon le fichier. Une seule densité, appliquée partout, avec une variante compacte assumée si un écran la réclame.
- **La table est la forme par défaut d'une liste** dans cette console. `/users` rend des cartes empilées quand les dix autres listes sont des tables : c'est la carte qui doit céder, pas l'inverse.
- Lignes survolables, colonne d'actions alignée à droite, défilement horizontal encapsulé dans la table (jamais dans la page).
- États de chargement en squelettes, jamais en spinner centré ; un seul gris de chargement (aujourd'hui `bg-stone-200` et `bg-muted` coexistent dans la même page).
- `<Tabs>` existe dans `src/components/ui/` et n'est utilisé nulle part dans la console — les onglets faits main de Reporting et de la fiche agence passent dessus.

## Contraintes strictes (métier)

- Toute primitive ajoutée sous `src/components/ui/` doit tourner sur `@base-ui/react` — **aucune dépendance Radix dans ce dépôt**.
- `EmptyState` / `ErrorState` restent les seuls composants d'état vide et d'erreur du dépôt : `scripts/check-feedback-states.mjs` casse la CI sur toute redéfinition locale. Les primitives de ce ticket les **composent**, ne les remplacent pas.
- Accessibilité des tables : `<th scope="col">` sur chaque en-tête (aujourd'hui 15 occurrences pour 11 tables), `<caption>` en `sr-only` portant le sujet de la table.
- Aucune couleur codée en dur dans les primitives créées — elles sont le point où la palette est décidée une fois (TCK-358 s'appuie dessus).

## Delta à produire

- [x] Primitive `Table` (`npx shadcn@latest add table`, vérifier `@base-ui/react`)
- [x] Composant `DataTable` : densité unique, tri par colonne, ligne survolée, colonne d'actions, défilement encapsulé, `caption` sr-only
- [x] Composant `PageHeader` (titre `font-display` + sous-titre + zone d'actions) — remplace l'en-tête recopié dans 24 pages
- [x] Composant `StatCard` (libellé, valeur, indice, delta optionnel, lien optionnel)
- [x] Composant `StatusBadge` bâti sur `<Badge>` — remplace les 8 pastilles `rounded-full bg-*-100` faites à la main
- [x] Composant `FilterBar` (conteneur, compteur de résultats, action « réinitialiser »)
- [x] Composant `DataState` regroupant chargement / erreur / vide en un seul point d'appel
- [x] Migration des 11 tables : `agency-upgrade-requests`, `moderation`, `system-health` (×2), `alerts`, `business-enums`, `CrossTenantAuditTable`, `integrations`, `feature-flags`, `scheduler`, `announcements`, `SuperAdminPropertiesTable`
- [x] Migration de `/users` : cartes → `DataTable`
- [x] Migration des onglets faits main vers `<Tabs>` : `ReportingShell`, `agency-detail`
- [x] Tests : rendu des primitives (tri, état vide, état d'erreur) + non-régression des écrans migrés

## Critères d'acceptation

- [x] AC1 — `grep -rE '<table' takussan-web/src/app/\(super-admin\) takussan-web/src/components/admin/super takussan-web/src/components/super-admin` ne renvoie que des occurrences situées **dans** la primitive `DataTable`
- [x] AC2 — une seule échelle de padding de cellule subsiste : le relevé `grep -rhoE '<(th|td)[^>]*className="[^"]*"'` sur l'arbre super-admin ne rend plus qu'une valeur distincte de padding
- [x] AC3 — chaque `<th>` rendu par `DataTable` porte `scope="col"` et chaque table porte un `<caption>` sr-only
- [x] AC4 — `/users` rend une table, pas une liste de cartes
- [x] AC5 — aucun onglet fait main ne subsiste dans l'arbre super-admin (`ReportingShell` et `agency-detail` importent `@/components/ui/tabs`)
- [x] AC6 — `npm run lint`, `npx tsc --noEmit` et `npm run test` passent

## Hors périmètre

- Le choix des couleurs et leur passage aux tokens : TCK-358.
- La refonte de la page d'accueil de la console : TCK-360.
- Les graphiques de `/super-admin/reports` : TCK-361.
- Le contenu fonctionnel des écrans (colonnes affichées, actions disponibles) — ce ticket déplace le rendu, il n'ajoute aucune capacité.

## Notes d'implémentation

**Les primitives vivent sous `src/components/console/`, pas sous `src/components/ui/`.** `ui/` est
réservé aux primitives shadcn `base-nova` ; les six composants de ce ticket sont des COMPOSITIONS
(`DataTable` compose `ui/table`, `DataState` compose `ErrorState`, `StatusBadge` compose `Badge`).
Seule la primitive `Table` a été posée dans `ui/`, par `npx shadcn@latest add table` — vérifiée sans
aucune dépendance Radix, c'est du HTML nu.

**Défaut trouvé PAR le test de densité, pas avant lui.** `cn()` est `twMerge(clsx())`, et twMerge ne
résout la famille du padding que dans **un** sens : un `p-2` posé APRÈS `px-3` l'efface, l'inverse
non. Le `TableHead`/`TableCell` du registre shadcn arrive avec `h-10 px-2` / `p-2` ; passer la
densité par `className` laissait donc **`p-2 px-3 py-2.5`** sur chaque cellule — trois classes de
padding dont seule la cascade de Tailwind départageait le vainqueur. Le rendu était juste, l'AC2 ne
l'était pas. *Correction à la source* : `ui/table.tsx` ne porte plus AUCUN padding sur ses cellules,
et un commentaire d'en-tête dit pourquoi ; la densité appartient à `DataTable`, et à lui seul.
Le test qui l'a attrapé compte les échelles de padding **sur le DOM rendu**, pas sur la prop.

**`StatusBadge` n'a que cinq tons, et `attention` est une dette assumée.** Le DS prescrit
`amber-500` pour l'avertissement, mais `globals.css` ne publie **aucun** jeton de warning ; l'écrire
en dur ici rouvrait exactement la couleur en dur que cette primitive ferme. `attention` emprunte donc
`--primary` (terracotta) — **c'est TCK-358 qui pose le jeton**, et ce ton changera d'une ligne.

**Les onglets montent leurs panneaux À LA DEMANDE.** `<TabsContent>` monte ses enfants même caché,
et les quatre graphiques de Reporting comme les cinq onglets de la fiche agence déclenchent chacun
leur requête au montage. Sans le garde `{actif ? <Panneau /> : null}`, la bascule vers `<Tabs>`
aurait multiplié par quatre (resp. cinq) le nombre de requêtes à l'ouverture de l'écran.

**Trois cellules composées sont des COMPOSANTS, pas des fonctions en ligne** (`AnnouncementSegment`,
`AnnouncementAction`, `UpgradeRequest*Cell`) : elles appellent `useTranslations` ou `useMutation`, et
la prop `cell` d'une colonne est un callback — y appeler un hook viole les règles des hooks.

**Le contrat de tri est la chaîne spatie, pas un couple (colonne, direction).** Les trois écrans
triables écrivaient tous `?sort=-created_at` et re-dérivaient chacun la bascule de direction ;
`DataTable` compose la chaîne suivante, l'appelant ne fait plus que l'écrire dans l'URL.

**Le test `/users` a changé d'objet, délibérément.** Il assérait la phrase-résumé de la carte
(« Statut : … · Email … · 2FA … ») ; il assère désormais la STRUCTURE de table — légende accessible,
liste exacte des en-têtes, contenu de la ligne. Les clés `rolesLabel`, `agenciesLabel` et `summary`
de `superAdmin.pages.users` sont mortes avec les cartes et ont été retirées des trois locales.

**Vérification NON faite : aucun parcours navigateur de la console authentifiée.** `./dev.sh doctor`
rend la base « ne répond pas ou n'a jamais été migrée », et `/super-admin/*` redirige en 307 vers
`/auth/login` sans jeton. Ce qui a été vérifié à la place : `next build` vert (le React Compiler ne
tourne qu'au build), le serveur de dev qui sert les routes sans erreur de compilation, et les 38
tests de primitives qui mesurent le DOM réel — rôles ARIA, `scope`, `aria-sort`, échelles de padding.
**Un écran de la console migrée n'a pas été regardé.**

Ablation faite sur les garanties d'accessibilité : retirer `scope="col"`, le `sr-only` de la légende
ou l'échelle unique de padding fait rougir `DataTable.test.tsx`. Le test de densité, lui, avait déjà
prouvé sa valeur en attrapant le défaut ci-dessus avant toute ablation.
