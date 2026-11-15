---
id: TCK-2692
title: "Fidélité au pixel : la densité du bureau passe par les jetons — racine à 16 px, échelles à ×0,9 dès lg, texte en px converti en rem, rendu inchangé"
status: done
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2684]
blocks: [TCK-2685]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, design-system, jetons, densite, accessibilite, audit-ux, app, fidelite]
---

## Objectif utilisateur

Au bureau, le site et `/app` gardent exactement le rendu d'aujourd'hui (la densité « 90 % » que le porteur a choisie par TCK-635). Mais une personne qui agrandit la police de son navigateur voit **tout** le texte grandir, y compris celui qui ignore aujourd'hui ce réglage. Et un `rem` vaut 16 px à toute largeur.

## Contrat de données

Aucun changement d'API.

- **Lit** : `takussan-web/src/app/globals.css` (règle de TCK-635, `@layer base`, `@theme inline`, `--radius`), le thème par défaut de Tailwind 4 (`--spacing`, `--text-*`, `--container-*`), les feuilles tierces importées (`leaflet.css`, `react-day-picker/style.css`), et les valeurs en `rem` et en px du produit (relevé ci-dessous).
- **Produit** : un bloc de jetons dès `lg` ; le retrait de la règle `html { font-size: 90% }` ; le texte en px converti en `rem` calculés ; un test de la racine qui remplace `src/app/__tests__/echelle-du-bureau.test.ts` ; la comparaison avant/après jointe à la PR.

## Direction UX / Artistique

> **Décision du porteur (2026-11-10, « voie 2 »), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)**, qui amende [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 1, 3 et 4.

**Rien ne doit se voir.** Le ticket ne change aucun rendu au réglage par défaut du navigateur, ni au téléphone, ni au bureau, ni sur le site public. Le seul effet visible est qu'au réglage « police 20 px » du navigateur, le texte en px d'aujourd'hui grandit comme le reste.

Ce que la bascule rend possible, et que les tickets suivants emploient :

- les jetons de taille fixe de la maquette (TCK-2685) s'écrivent en `rem` calculés (13 px = 0,8125rem), hors de l'échelle ×0,9 ;
- les requêtes de conteneur écrites après la bascule se lisent à `rem` 16 à toute largeur ;
- la référence de mesure du bureau devient « 1440 × 900, racine 16 px, densité ×0,9 ».

## Contraintes strictes (métier)

- **Rendu identique au pixel au réglage par défaut**, site public compris (ADR-0107 § 5). Une différence n'est acceptée que mesurée, nommée et écrite dans la PR.
- **Rien ne change sous `lg`** (1024 px). La règle de TCK-635 ne valait que dès `lg`. Sous 16 px de texte de champ, Safari iOS zoome : aucune valeur sous `lg` ne bouge.
- **Les requêtes média ne bougent pas.** Leur `rem` se lit contre la taille initiale du navigateur, jamais contre `html`. Les **requêtes de conteneur**, elles, se lisent contre la racine (ADR-0107, correction du 2026-11-10) : elles sont dans l'inventaire.
- **Les gabarits en px restent en px** (`w-[264px]`, `w-[480px]`, bordures, ombres) : ils ne suivaient pas les 90 % et ne doivent pas commencer.
- **Aucune maquette n'est modifiée** : elles sont hors de git (`.git/info/exclude`). Voir § Hors périmètre.

## Delta à produire

Relevé du 2026-11-10 sur `dev` (`8478950a2`), hors tests et hors `playground/maquettes/`. Les comptes sont des ordres de grandeur, à reprendre à la source au démarrage :

```bash
cd takussan-web
grep -rnE "text-\[[0-9.]+px\]" src --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v playground/maquettes | wc -l   # ≈ 371, 112 fichiers
grep -rhoE "[@a-z0-9:/-]*\[[^] ]*[0-9.]+rem[^] ]*\][a-z0-9/:-]*" src --include='*.ts' --include='*.tsx' | …                       # ≈ 123, 70 fichiers
```

1. **Retirer la règle de TCK-635** (`globals.css`, `@layer base`, `@media (min-width: 64rem) { html { font-size: 90%; } }`) et réécrire son commentaire : il renvoie à ADR-0107.
2. **Un bloc de jetons dès `lg`** (`@media (width >= 64rem)`) qui redéfinit à ×0,9 :
   - `--spacing` (0,25rem → 0,225rem) ;
   - chaque `--text-*` du thème (`--text-xs` 0,75rem → 0,675rem, `--text-sm` 0,875rem → 0,7875rem…). Les interlignes `--text-*--line-height` sont sans unité : ils ne bougent pas ;
   - `--radius` (0,625rem → 0,5625rem) : les `--radius-*` en dérivent par `calc(var(--radius) * …)` ;
   - les `--container-*` (`max-w-sm`, `max-w-7xl`…) ;
   - la taille de texte du `body` (`0.9rem`), pour le texte sans classe de taille.
3. **Vérifier que chaque échelle du § 2 est lue par `var()`** dans l'utilitaire compilé (`.next/static/css`), pas recopiée en valeur. `@theme inline` (`globals.css:357`) recopie l'expression : une expression qui lit `var(--radius)` suit ; une valeur littérale ne suivrait pas. Le bloc se place dans une couche qui l'emporte sur `@layer theme` (`base`, ou hors couche). À mesurer, pas à supposer (ADR-0107, Conséquences).
4. **Le texte écrit en px passe en `rem` calculés, au même rendu** : `text-[13px]` → `text-[0.8125rem]` (ou le jeton de TCK-2685 s'il existe déjà). La valeur reste hors de l'échelle ×0,9 : elle rend 13 px à toute largeur, comme avant. Environ 371 occurrences dans 112 fichiers. La conversion est mécanique (n / 16) ; un codemod est permis s'il est joint à la PR.
5. **Les valeurs arbitraires en `rem` actives au bureau passent dans l'échelle**, au même rendu : environ 95 classes (123 occurrences moins 4 variantes de requête média et 25 de requête de conteneur). Une valeur qui ne vaut que sous `lg` (`max-lg:`, `pb-[max(1rem,env(safe-area-inset-bottom))]` d'une barre mobile) ne bouge pas. Les autres reçoivent leur valeur de bureau (`lg:max-w-[19.8rem]` à côté de `max-w-[22rem]`), ou passent par `calc(var(--spacing) * n)` quand c'est un multiple de l'échelle.
6. **Les styles en ligne en `rem`** suivent la même règle (exemple : `LocationPickerMap.tsx:75`, `borderRadius: '0.5rem'`). La page hors ligne du service worker (`src/lib/pwa/service-worker.ts`) est un document à part, sans `globals.css` : elle ne bouge pas.
7. **Les seuils de requête de conteneur en `rem`** (environ 34, dans 8 fichiers : `PropertyCard.tsx`, `cards/PropertyRow.tsx`, `cards/PropertyPhoto.tsx`, `charts/LineChart.tsx`, `charts/BarChart.tsx`, `home/Navbar.tsx`, `kyc/kyc-components.tsx`, `console/StatCard.tsx`) gardent leur seuil d'aujourd'hui de chaque côté de `lg` : au bureau, ils se lisent à `rem` 14,4 et passeraient à 16. Écriture de chaque côté de `lg`, ou écart mesuré et accepté par écrit, page par page.
8. **Les feuilles tierces en `rem`**, inventoriées dans la PR, chacune avec sa décision (passer dans l'échelle, ou écart mesuré et accepté) :
   - `leaflet.css` : `font-size: 0.75rem` de `.leaflet-container` (10,8 px au bureau aujourd'hui, 12 px après) ;
   - `react-day-picker/style.css` (couche `rdp`) : 7 valeurs en `rem`, dont la taille des cellules du calendrier ;
   - toute autre feuille importée que le relevé trouve.
9. **Le test de la racine** : `src/app/__tests__/echelle-du-bureau.test.ts` (qui exige aujourd'hui `90%` dès 64rem) est réécrit. Aucune déclaration `font-size` sur `html` ; un bloc dès `lg` redéfinit `--spacing`, `--text-sm`, `--radius` et `--container-*`.
10. **Documents** : le commentaire de `globals.css` ; `docs/design-guidelines.md` (la densité du bureau, l'unité des jetons) ; la ligne « Design system » de `takussan-web/CLAUDE.md` si elle cite une valeur de racine ; le commentaire de `AppSidebar.personnalisation.test.tsx:431`, qui cite les 90 %.

## Critères d'acceptation

- [ ] AC1 — **La racine.** À 1440 × 900, `getComputedStyle(document.documentElement).fontSize` vaut `16px` sur `/app/leases` et sur `/fr/properties` ; à 390 aussi.
- [ ] AC2 — **L'échelle.** À 1440, le sous-titre du `PageHeader` de `/app/leases` (`text-sm`) rend `font-size: 12.6px` ; un `p-4` rend 14,4 px de padding ; un `rounded-lg` rend 9 px. À 390, les mêmes rendent 14, 16 et 10 px.
- [ ] AC3 — **Le texte en px converti.** Aucun `text-[Npx]` ne reste dans `src/` hors tests et hors `playground/maquettes/` (`grep` de la commande du Delta : 0). Une ligne de la barre latérale de `/app` rend la même taille qu'avant la bascule (14 px aujourd'hui, `text-[14px]`). Elle passera à 12,6 px avec TCK-2691, pas ici.
- [ ] AC4 — **Rendu inchangé, mesuré.** Avec l'outil de TCK-2684, deux `releve` de chaque page de l'échantillon (avant : `dev` ; après : la branche), comparés relevé contre relevé, rendent **0 écart au-delà des tolérances**, à 1440, 1280 et 1024. À 390, 0 écart. Échantillon minimal :
  - public : `/fr`, `/fr/properties`, une fiche de bien (avec sa carte Leaflet) ;
  - `/app` : `/app` (agence), `/app/leases`, `/app/properties`, `/app/notifications`, une page à calendrier (react-day-picker), une page à `StatCard`, une page à graphique.
  Les sorties de `compare` sont jointes à la PR. Chaque écart accepté y est nommé, mesuré et justifié (feuille tierce, seuil de conteneur).
- [ ] AC5 — **Le réglage de police du navigateur.** Taille de police du navigateur réglée à 20 px (préférence `webkit.webprefs.default_font_size` d'un profil Chrome de test, pas le zoom de page), à 1440 : le sous-titre `text-sm` rend 15,75 px (20 × 0,875 × 0,9), et un texte écrit hier en `text-[13px]` rend 16,25 px (20 × 0,8125), là où il rendait 13 px avant la bascule.
- [ ] AC6 — **Ablation.** Remettre `@media (min-width: 64rem) { html { font-size: 90%; } }` dans `globals.css` fait rougir le test de la racine (Delta 9) et AC1. Retirer le bloc de jetons dès `lg` fait rougir AC2 et AC4 (le bureau grossit de 11 %).
- [ ] AC7 — **Seuils de conteneur.** Pour chacun des 8 fichiers du Delta 7, une largeur de conteneur juste sous et juste au-dessus du seuil d'aujourd'hui, à 1440, rend la même disposition avant et après (relevé de l'outil), ou l'écart est accepté par écrit dans la PR.
- [ ] AC8 — **Gardes.** `npm run lint`, `npx tsc --noEmit`, les tests touchés et les gardes `npm run check:*` sont verts. La suite entière est jouée par la CI de la PR.

## Hors périmètre

- **Le rendu des maquettes.** Elles sont hors de git et ne sont pas converties. Après la bascule, la visionneuse les rend à racine 16 : leurs classes Tailwind suivent les jetons ×0,9 comme avant, leur `text-[Npx]` reste en px comme avant, mais **14 valeurs arbitraires en `rem`** (dont 8 `max-w-[22rem]`) perdent le ×0,9 au bureau. Les références gelées de TCK-2684 font foi. La PR le signale à la session, qui tient les maquettes ; elle peut appliquer le ×0,9 à ces 14 valeurs en local.
- Les jetons de taille fixe de la maquette (`--text-ui`, `--text-corps`…) : TCK-2685, qui dépend de ce ticket.
- Toute différence de densité entre `/app` et le site public : ADR-0107 le rend possible, aucune décision ne le demande.
- Les gabarits en px (`w-[264px]`, ombres, bordures), qui ne suivaient pas les 90 %.

## Notes d'implémentation

Implémenté le 2026-11-11 sur `feat/audit-ux-app-lot-1` (arbre partagé), agent « terrain ».

### Re-mesure de la prémisse

- `text-[Npx]` : **371 lignes, 381 occurrences, 112 fichiers** — conforme au relevé.
- Valeurs arbitraires en `rem` : **123 jetons** de classe, plus 21 valeurs hors classe (styles en
  ligne, chaînes `calc` du champ téléphone, `minmax` de `/compare`, zones sûres).
- **Écarts au relevé** :
  - `rounded` sans suffixe compilait `border-radius: .25rem` **en dur** (63 emplois) : Tailwind 4 le
    lit sur la clé de thème `--radius`, absente du thème. Corrigé par
    `@theme inline reference { --radius: var(--spacing); }` : il suit l'échelle.
  - Les variantes nommées de conteneur (`@md:`, `@lg:`…) compilent un seuil **littéral**
    (`@container (width >= 28rem)`) et non `var(--container-*)` : elles sont dédoublées comme les
    seuils arbitraires.
  - `Navbar.tsx` (Delta 7) : ses requêtes de conteneur ne vivent que dans la rangée `lg:hidden`. Elles
    ne s'appliquent jamais dès `lg` : **non dédoublées**. Les 7 autres fichiers du Delta 7 le sont
    (55 seuils au total).
  - Aucune location courte dans la base de démo : le calendrier (react-day-picker) est relevé en
    ouvrant un `DatePicker` de `/app/payments` par perturbation.

### Ce qui a été fait

- `globals.css` : la règle de TCK-635 est retirée (commentaire renvoyant à ADR-0107). Le
  `body` passe à `0.9rem` dès `lg` dans `@layer base`. Le bloc `densite-du-bureau` est placé hors couche, après `:root` :
  `--spacing` 0,225rem, les 13 `--text-*` du thème, `--radius` 0,5625rem (et `--radius-xs`, seule
  valeur littérale), les 13 `--container-*`, tous à ×0,9. S'y ajoutent les feuilles tierces : Leaflet
  (`.leaflet-container` 0,675rem, sélecteur doublé) et react-day-picker (6 variables de `.rdp-root`, en
  couche `rdp`).
- Classes : `rem` arbitraire → `calc(var(--spacing)*K)`, ou classe nommée (`max-w-[22rem]` →
  `max-w-88`). Seuil de conteneur → `max-lg:@max-[11rem]:x lg:@max-[9.9rem]:x`. `text-[Npx]` →
  `text-[N/16rem]`. Les requêtes média ne bougent pas. Conversion par codemod (168 fichiers, aucun
  sauté). Chacune des 126 classes neuves est vérifiée **émise** dans la feuille compilée
  (`check:classes-emises`).
- **Écart au Delta 5, accepté par la session le 2026-11-11 (option « garder »)** : le codemod a
  aussi converti les valeurs qui ne valent que sous `lg`. Leur rendu ne bouge pas : sous `lg`,
  `var(--spacing)` vaut exactement 0,25rem, et les relevés donnent 0 écart à 390 sur les 11 pages.
  Une seule règle, « tout `rem` arbitraire passe par l'échelle », se garde mieux qu'un tri par
  visibilité. `docs/design-guidelines.md` l'énonce ainsi. Valeurs concernées (recensement par
  ligne portant `sm:`/`md:`/`lg:hidden` ou une surcharge du même utilitaire ; il peut ne pas être
  exhaustif) :
  - `CompareColonnes` : les deux `pb` de la barre « Partager » ;
  - `ContactDeFiche` : le `pb` de sa barre ;
  - `FeuilleDeLien` et `dialog` : `max-w-[calc(100%-…*8)]` ;
  - `MessagesPage` : deux `h-[calc(100dvh-…)]` ;
  - `WizardShell` : un `text-[calc(…*6.5)]` et le `pb` de la feuille du bas ;
  - `WelcomeModal` : la hauteur `clamp` de l'illustration ;
  - les chaînes `safeAreaInset` du `FloatingDock` (`PropertyForm`, `WizardShell`,
    `PropertyMobileBottomBar`).
- Le service worker (`src/lib/pwa/service-worker.ts`) n'est pas touché : c'est un document sans
  `globals.css`.
- **Test de la racine** : `src/app/__tests__/echelle-du-bureau.test.ts` est réécrit (44 tests). Il
  vérifie qu'aucun `font-size` n'est posé sur `html`. Il vérifie que le bloc dès `lg` vaut 0,9 × chaque
  échelle de `tailwindcss/theme.css` (lue dans `node_modules`, pour qu'une échelle oubliée échoue),
  que `--radius` vaut ×0,9, que les interlignes restent sans unité, que le `body` vaut 0,9rem en
  `base`, et que les utilitaires compilés lisent `var()`, `rounded` et `rounded-t` compris.
- Les tests qui lisaient une valeur en `rem` dans une classe lisent désormais `var(--spacing)*K` :
  `phone-input`, `Navbar` (téléphone et bureau), `MessagesPage`, `OngletsDeFiche`, `ProfileFilters`,
  `CompareClient.chargement`, `CompareColonnes`, `palette-et-locale`, `FavoritesPopover.panneau`,
  `WelcomeModal`, `dialog-hauteur-bornee`, plus le commentaire d'`AppSidebar.personnalisation`.

### Ablations (arbre d'essai hors dépôt)

- Remettre `html { font-size: 90% }` dès `lg` rend **2 rouges** au test de la racine.
- Retirer `@theme inline reference { --radius: var(--spacing) }` rend **2 rouges** (`rounded`,
  `rounded-t`).
- Retirer `--text-6xl` du bloc rend **1 rouge**.
- Le `globals.css` d'avant la bascule fait échouer tout le fichier.
- Retirer le bloc `densite-du-bureau` entier fait échouer tout le fichier (marqueur absent). Le
  pendant au navigateur (AC2 et AC4 au rouge) n'a pas été mesuré : la mesure inverse, la règle des
  90 % remise, l'a été (aller-retour ci-dessous).
- Recensement des seuils de conteneur (AC7, nouveau `describe` du test de la racine) : retirer le
  jumeau `lg:` d'un seuil de `StatCard` rend **1 rouge** ; retirer son côté (`@min-[12.6rem]` nu)
  en rend **2**.

### Mesures (outil de TCK-2684, Chrome par CDP, racine et police par défaut)

Échantillon : `/fr`, `/fr/properties`, une fiche (avec et sans sa carte Leaflet ouverte), `/app`,
`/app/leases`, `/app/properties`, `/app/notifications`, `/app/overview/agency` (graphiques),
`/app/overview/agent` (StatCard), `/app/payments` (calendrier ouvert). Chaque page est relevée à
390, 1024, 1280 et 1440 : 44 relevés avant (01:42, racine 14,4) et 44 après (03:03, racine 16).

- **AC1** — `html` vaut 16px à 1440 et à 390 sur `/app/leases` et `/fr/properties` ; il valait 14,4px à 1440 avant.
- **AC2** — à 1440 : `text-sm` 12,6px, `p-4` 14,4px, `rounded-lg` 9px, `body` 14,4px. À 390 : 14, 16, 10
  et 16. Ce sont les mêmes valeurs qu'avant.
- **AC3** — `grep` du Delta : 0. La ligne de la barre latérale (`text-[0.875rem]`) rend 14px avant et
  après.
- **AC5** — police du navigateur à 20px (préférence `default_font_size` d'un profil jetable, option
  `--police-navigateur` de l'outil) : `html` 20px (18 avant), `text-sm` 15,75px (identique), et
  l'ex-`text-[13px]` rend **16,25px** (13 avant). Un `text-[14px]` d'hier rend 17,5px (14 avant).
- **AC7** — seuils de conteneur à 1440, mesurés juste sous et juste au-dessus de chaque seuil par
  perturbation, sur les pages graphes, `/app/overview/agent`, KYC, `/fr` et `/fr/properties`.
  Avant et après, ce sont les mêmes seuils en px, avec le même `display` et la même taille de part
  et d'autre. Seul résidu : des largeurs de texte qui bougent de ≤ 0,05px (voir AC4).
  Fichier par fichier :
  - mesurés avant et après : `LineChart` (518,4 / 237,6), `BarChart` (518,4 / 172,8),
    `PropertyPhoto` (172,8), `PropertyCard` (158,4), `PropertyRow` (460,8 à 1094,4 : 5 seuils sur 7)
    et KYC (403,2) ;
  - `StatCard` mesuré après seulement, sur `/app/commissions` : la taille passe de 16,2 à 18px entre
    200,8 et 202,6px de contenu, soit au seuil de 201,6px (14rem × 14,4). ⚠ La perturbation fixe la
    largeur en `border-box` : pour un conteneur à padding, la bascule se lit en largeur de contenu ;
    c'est la même chose avant et après ;
  - non atteints par l'échantillon : `PropertyRow` 576 et 1512, KYC `@xl`.
  Pour TOUS les seuils, le nouveau `describe` du test de la racine recense chaque variante de
  conteneur en `rem` de `src`. Il exige un côté (`max-lg:` ou `lg:`, hors de la rangée `lg:hidden`
  de `Navbar`) et un jumeau de l'autre côté à ×1/0,9, de même sens, même nom et même utilitaire.
- **AC4** — 8 pages sur 11 rendent **0 écart, 0 absent** aux quatre largeurs : accueil `/app`, baux,
  calendrier, graphes, notifications, StatCard, fiche et carte. Leur seul « absent » est le compteur
  de vues de la fiche, que chaque relevé incrémente. Résidu de pixels de 0 à 0,58 % sans aucun écart
  géométrique : l'image de différence montre un anticrénelage de glyphes aux mêmes positions. Cause :
  0,7875rem × 16 et 0,875rem × 14,4 donnent tous deux 12,6px, mais pas au même arrondi flottant.
  L'avance des mots varie de 1/32px au plus.
  Les 3 autres pages (`/app/properties`, `/fr`, `/fr/properties`) avaient des écarts dus aux
  **données**, pas à la bascule. La migration de rattrapage de TCK-2703
  (`2026_11_11_110000_backfill_rent_period_of_rentals`, 02:16) fait apparaître « / mois » sur les
  locations. L'ordre et la sélection des biens publics ont aussi changé entre les deux relevés. Les
  données sont stables depuis : après contre après-bis à 03:16 donne 0 écart sur ces 3 pages.
  **Pour ces 3 pages, la preuve vient d'un aller-retour**, fait avec l'accord de la session : l'arbre
  repassé en arrière (156 sources de rendu, chacune vérifiée par md5) de 03:23 à 03:26, sous le
  verrou de mesure, avec un contrôle de la feuille servie à chaque bascule. On a relevé l'avant-bis,
  remis l'arbre (156 md5 égaux à l'instantané), puis relevé l'après-bis tout de suite derrière, sur
  les mêmes données. Aux 4 largeurs : **0 écart** sur `/app/properties` (394 à 461 conformes),
  `/fr` (57 à 149) et `/fr/properties` (45 à 202). Les « absents » sont les rôles de coque de `/app`,
  sans objet sur une page publique. Le résidu de pixels (0,12 à 0,98 %) est le même anticrénelage
  de glyphes que plus haut.
- Après le changement du sélecteur Leaflet, la carte de la fiche relevée de nouveau à 1440 rend 0 %
  de pixels contre le relevé d'avant.

### Hors périmètre, signalé

- **Les maquettes** (hors git) : leurs 14 valeurs arbitraires en `rem` perdent le ×0,9 au bureau
  après la bascule (voir § Hors périmètre). Les références gelées de TCK-2684 font foi.
- Les gardes `check:i18n`, `check:classes-emises`, `surface-publique.contraste`, `encre-sans-alpha`
  et 5 gardes de la racine rougissent **en local seulement**, toutes sur `playground/maquettes/`.
  Toutes ont été rejouées dans une copie sans les maquettes (même `src`, mêmes scripts), et toutes y sont
  vertes, les 5 gardes de la racine comprises.

### Outil de TCK-2684 étendu

`--largeur 1024`, `--persona aucune` (pages publiques), `--police-navigateur N` (préférence de police
d'un profil Chrome jetable) et le champ `policeNavigateur` du relevé. Il accepte aussi une maquette
encore en chargement après 15 s, notée `chargementDessine` et `"etat": "chargement"` dans `gel.json` ;
le produit reste refusé après 45 s.

### Piège payé

Après une écriture de `globals.css` par renommage atomique, Turbopack (`@tailwindcss/postcss`) a
servi **l'ancienne** feuille (la règle des 90 %) avec les classes neuves. Réécrire le fichier à
l'identique n'y change rien ; un vrai changement de contenu (une espace) la reconstruit. Toute mesure
doit donc vérifier la feuille SERVIE (`.225rem` présent, `font-size: 90%` absent).
