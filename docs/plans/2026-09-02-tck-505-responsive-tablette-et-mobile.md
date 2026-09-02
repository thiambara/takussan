# Plan — TCK-505 : responsive tablette et mobile, onze défauts mesurés

Ticket : `docs/backlog/tickets/TCK-505-responsive-onze-defauts-mesures-sur-135-ecrans.md`.
Rapport de campagne : `docs/qa/responsive-2026-09-02.md`.

## Ce que le relevé a appris, et qui gouverne le plan

**Un seul point de rupture casse : 768 px.** À 360, 390, 1024 et 1366, aucune page ne déborde
hors les cas isolés (#3, #5, #6, #8). À 768, **55 pages** sur 135 font défiler le document. La
raison est structurelle, pas locale : `md:` (≥ 768) est le seuil où les trois coques montrent la
barre latérale (256 px) **et** où la plupart des composants passent « en colonnes ». Les deux
décisions sont prises au même pixel, et la seconde ignore la première : un composant en 4
colonnes dès `md` dispose de 768 − 256 − 48 = **464 px** de contenu, pas de 768.

D'où la règle unique du plan : **dans `/app` et `/admin`, ce qui se pose en colonnes se pose dès
`lg`** ; sur le site public (pas de barre latérale), la barre de navigation passe elle aussi en
bureau dès `lg`, parce que son contenu de bureau mesure 869 px.

## Méthode — la même pour chaque correction

1. **Test d'abord** (rouge), colocalisé en `__tests__/`, qui assert la classe ou la structure
   responsable **et** rougit par ablation : retirer la classe corrective doit faire échouer le
   test. Un `expect(...).toContain('lg:grid-cols-4')` seul ne suffit pas s'il resterait vert
   avec `md:grid-cols-4 lg:grid-cols-4` — asserter aussi l'absence de l'ancienne classe quand
   c'est elle le défaut.
2. **Correction minimale**, dans le système de classes existant (Tailwind v4, `cn()`), sans
   nouvelle dépendance ni valeur en dur.
3. **Vérification par la sonde** qui a trouvé le défaut : le banc de mesure
   (`harness.mjs`, CDP direct) sur la page concernée, à la largeur concernée, **et à 1366** pour
   prouver que le bureau est inchangé. Le chiffre avant/après va dans le message de commit.
4. `npm run lint` et `npx tsc --noEmit` sur l'arbre, `npm run test -- <fichiers>` sur les tests
   touchés. La suite entière est lancée **une fois, par la session déléguante**, à la fin.

## Les corrections, par groupe (un agent par groupe, arbre partagé)

### Groupe A — les deux barres du haut (#1, #2, #3)

**`src/components/layout/AppTopbar.tsx`** — 52 pages (+3 qui en héritent), +81 à +118 px à 768.
- `SearchAutocomplete` : `hidden md:block min-w-80 flex-1` → `hidden lg:block min-w-0 flex-1
  max-w-xl`. Le `min-w-80` (320 px) est la cause directe : il interdit à la recherche de
  rétrécir, et `ml-auto` du cluster droit n'a plus rien à distribuer.
- Cluster droit `ml-auto flex items-center gap-2` : ajouter `min-w-0 shrink`. Le libellé de
  `ProfileSwitcher` (« Agent · Dakar Immo ») et le prénom de `UserMenu` (`hidden sm:inline`)
  passent à `hidden lg:inline` — à 768 ne restent que les icônes.
- Mesure attendue : `docOverflow` 0 à 768 sur `/app` (agent, propriétaire, admin) et `/admin`.

**`src/components/home/Navbar.tsx`** — 14 pages publiques.
- Les quatre occurrences `md:flex` / `md:hidden` passent à `lg:flex` / `lg:hidden` : entre 768
  et 1023 le site public prend la barre mobile (pastille de recherche + menu), qui tient.
- Bouton de recherche mobile : `flex-1 flex items-center …` → ajouter `min-w-0`. C'est lui qui
  impose sa largeur de contenu (« Où cherchez-vous ? » non rétrécissable) et pousse le bouton
  menu à 400 px sur 390.
- Le `SearchToolbar` public (groupe D) et la `FilterSidebar` (`hidden md:block`) ne changent pas
  de seuil : la sidebar de filtres à 264 px tient à 768 sans barre latérale de coque.

### Groupe B — messagerie et agenda (#4, #6)

**`src/components/messages/MessagesPage.tsx`** (+ `__tests__/MessagesPage.test.tsx`).
- `md:grid-cols-[320px_1fr]` → `lg:grid-cols-[320px_1fr]`, `md:border-r md:border-border` →
  `lg:…`, et le gate `useMatchesMaxWidth(MD_BREAKPOINT_PX - 1)` → une constante `LG_BREAKPOINT_PX
  = 1024` (contrainte 3 du ticket : les deux couches basculent au même pixel).
- Le test existant assert le seuil `md` : le faire évoluer, garder l'ablation (AC5 de TCK-501),
  et ajouter le cas 768 → un seul panneau.

**`src/components/calendar/MonthView.tsx`**.
- La cellule de jour (`min-h-24 border-t border-l …`) reçoit `min-w-0 overflow-hidden` : un
  enfant de grille a `min-width: auto`, donc `truncate` sur la puce ne peut pas agir — la
  cellule s'élargit au lieu de couper. Mesure : aucune puce dont `right` dépasse celui de sa
  cellule, à 390.

### Groupe C — les quatre tables (#5)

`src/components/payments/PaymentsHistoryTable.tsx:81`, `InvoicesTable.tsx:64`,
`PayoutsTable.tsx:63`, `src/components/leases/LeaseSchedule.tsx:71`.
- `overflow-hidden` → `overflow-x-auto` sur le conteneur (exactement TCK-371 sur
  `AdminUsersTable`), et `whitespace-nowrap` sur les cellules de date, de montant et de statut.
  Sans le second, la table reste à `w-full` et compresse ses colonnes (dates sur 3 lignes) au
  lieu de défiler.
- Test par table, sur le modèle de `AdminUsersTable` (TCK-371) : le conteneur porte
  `overflow-x-auto` et **pas** `overflow-hidden`.
- Mesure : à 390, `/app/payments` (locataire et agent), `/admin/finances`, `/app/leases/1` —
  `tables[].scroller === 'scrolls'`, `narrowText` vide.

### Groupe D — grilles et barres d'outils (#7, #8, #9, #10, #11)

- **`src/components/billing/AdminPlansClient.tsx`** : les deux grilles `md:grid-cols-[…]` →
  `xl:grid-cols-[…]` (à `lg`, 1024 − 256 − 48 = 720 px pour six colonnes dont 160 + 140 + deux
  boutons : trop juste ; vérifier à 1024 et choisir `lg` si la mesure le permet).
- **`src/components/search/SearchToolbar.tsx`** : le `<p>` du compteur reçoit `shrink-0
  whitespace-nowrap` ; la rangée `flex items-center justify-between gap-4` reçoit `flex-wrap`
  pour que les contrôles passent sous le compteur à 360-390 plutôt que de rogner Filtres.
- **KPI** : `md:grid-cols-4` → `lg:grid-cols-4` (en gardant `sm:grid-cols-2`) dans
  `app/(dashboard)/app/overview/{agency,owner,tenant,agent}/page.tsx`,
  `components/pipeline/PipelineStatsBar.tsx`, `components/dashboard/DashboardMeKpis.tsx`,
  `components/property-dashboard/PropertyKpiStrip.tsx`. Les autres `md:grid-cols-4` (loading,
  skeleton, MediaManager, InventoryDetail, QuoteCard, MaintenanceDetail) : vérifier à 768 et
  n'y toucher que si la mesure rend une colonne étroite.
- **`src/components/public/profile/TeamStrip.tsx`** : les deux flèches `absolute left-full /
  right-full` sortent du conteneur `max-w-[1200px]` dès que le viewport n'a pas 52 px de marge
  (< 1304 px). Les déplacer dans l'en-tête de section, à droite du titre — le motif exact des
  sections de l'accueil (« Tout voir ‹ › »).
- **`PropertySimilar.tsx`** : **relever d'abord** à 390 — position du premier slide
  (`getBoundingClientRect().left`) et `emblaApi.scrollProgress()`. Si le premier slide est bien
  hors champ, chercher la cause (conteneur embla sans `overflow-hidden` ? `-mx-4` parent ?) avant
  de toucher quoi que ce soit. Si le relevé montre un affichage correct, l'écrire dans le rapport
  et fermer le point.

## Après les quatre groupes — la session déléguante

1. `npm run lint`, `npx tsc --noEmit`, `npm run test` (suite entière, une fois).
2. **Re-campagne complète** : 135 pages × 5 largeurs, même banc, même sonde. AC1 (0 débordement
   à 768) et AC8 (1366 identique) se lisent dans le diff des deux `results.jsonl`.
3. Mettre à jour `docs/qa/responsive-2026-09-02.md` avec les chiffres après correction.
4. Rituel de fin de branche, PR vers `dev`.
