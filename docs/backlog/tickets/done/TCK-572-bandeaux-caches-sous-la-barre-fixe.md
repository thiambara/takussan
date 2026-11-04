---
id: TCK-572
title: "Bandeaux du site (annonce, maintenance) cachés sous la barre publique fixe, croix inatteignable, page décalée ; coque de la console qui débordait"
status: done
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, mobile, navbar, bandeau, annonce, maintenance, a11y, ux, retour-testeur]
---

## Objectif utilisateur

Quand l'équipe publie une annonce ou programme une maintenance, le visiteur la VOIT sous la barre
du haut, la lit dans sa langue, et la ferme d'un appui — sur téléphone comme au bureau, sur le site
public comme dans son espace. Aucun bandeau ne pousse la page sans se montrer.

## Contexte

Défaut latent relevé par TCK-563 (M1, retour testeur du 2026-09-23 : « Padding trop large » sous la
barre de l'accueil mobile) et laissé hors de son périmètre. `app/layout.tsx` rendait
`MaintenanceBanner` (`sticky top-0 z-50`) et `GlobalAnnouncementBanner` (dans le flux) AVANT la
page ; la `Navbar` publique, `fixed top-0 z-50`, plus loin dans le DOM, les recouvrait.

Mesures AVANT (2026-09-24, 00:50 Z, Chrome headless piloté par CDP, `next dev` de l'arbre, émulation
mobile + tactile ; réponses de `/api/announcements/active` et `/api/maintenance/status` SUBSTITUÉES
par `Fetch.fulfillRequest` — rien d'écrit en base ; `load average` 6,5 / 6,5 / 8,6 sur 8 cœurs) :

| Cas | Mesure |
|---|---|
| `/fr`, 320 px, propriétaire, annonce | bandeau 0..127 sous la barre 0..69 : invisible (`elementFromPoint`) ; `<h1>` à 244 au lieu de 117 (+127) |
| même cas, appui sur la croix | la croix (264,12) est SOUS « Ouvrir le menu » : l'appui **ouvre le menu** (document verrouillé à 640) |
| `/fr`, 320 px, anonyme, maintenance | 0..76 sous la barre, invisible ; `<h1>` 193 (+76) ; défilée, elle reste collée SOUS la barre |
| `/fr`, 1366 px | annonce 0..67 entièrement sous la barre 0..135, croix sous « Menu utilisateur » ; `<h1>` 251 au lieu de 184 |
| `/app`, 320 px | maintenance 76 + annonce 107 AVANT la coque `h-dvh` : document de 823 px pour 640 ; défilé, la maintenance collante (0..76) recouvre la barre haute (0..56) |
| `/app`, 1366 px | document qui défile de 103 px ; maintenance 0..36 sur la barre haute |

Deux défauts voisins, dans les mêmes composants : le message de maintenance était toujours
`messages.fr` et ses dates formatées en `'fr-SN'` en dur ; l'avis de maintenance ne se fermait
pas ; la croix de l'annonce offrait 32 × 32 px au bureau.

## Direction UX

- Un bandeau est du **contenu** : il se place juste SOUS la barre, dans le flux de la page, et
  défile avec elle. Il ne réserve aucune hauteur fixe — les géométries calées sur la barre (cales,
  `scroll-mt-*`, carte mobile de `/properties`, barre latérale collante des filtres) restent justes.
- Site public : sous `NavbarSpacer`. Console (`AppShell`) : en tête du `<main>` qui défile, sous la
  barre haute. Ailleurs (`/auth`, `/onboarding`…) : le repli du layout racine, en tête de page.
- Un seul emplacement affiché : le repli racine s'efface dès qu'une page monte le sien.

## Delta produit

- [x] `components/announcements/BandeauxDuSite.tsx` (neuf) : `emplacement="racine" | "page"`,
      registre `useSyncExternalStore` — le repli racine rend `null` tant qu'un emplacement de page
      est monté ; hors `QueryClientProvider` (page montée seule, tests), rien.
- [x] `app/layout.tsx` : les deux bandeaux remplacés par `<BandeauxDuSite emplacement="racine" />`.
- [x] `components/home/NavbarSpacer.tsx` : la cale, puis `<BandeauxDuSite emplacement="page" />`.
- [x] `components/layout/AppShell.tsx` : `<BandeauxDuSite emplacement="page" />` en tête du `<main>`.
- [x] `MaintenanceBanner` : dans le flux (plus de `sticky top-0 z-50`) ; message dans la langue du
      visiteur (repli `fr`), fenêtre par `useFormatteurs().dateTime` et la clé
      `announcements.maintenanceWindow` ; croix « Masquer l'avis de maintenance »
      (`announcements.maintenanceDismissAria`), masquage pour la session (`sessionStorage`,
      empreinte `id:état:fin` — l'avis revient quand il passe « en cours » ou change de fin).
- [x] `GlobalAnnouncementBanner` : `data-bandeau`, croix de 44 px touchables (`after:-inset-2` —
      `-inset-1.5` à l'origine, qui ne donnait que 42 au-delà de `sm` : voir la reprise du 2026-09-24).
- [x] i18n : `announcements.maintenanceDismissAria`, `announcements.maintenanceWindow` (fr/en/wo).

## Critères d'acceptation

- [x] AC1 — site public, 320/360/390/1366 px : l'annonce est visible juste sous la barre et sa
      croix est atteignable. *Mesuré : 69..196 à 320 et 360, 69..176 à 390, 136..203 à 1366 ;
      `elementFromPoint` au centre de la croix = « Masquer l'annonce ».*
- [x] AC2 — fermée, la page retrouve exactement sa géométrie sans bandeau. *`<h1>` 117 à 320/360/390,
      184 à 1366 — identique au cas sans bandeau.*
- [x] AC3 — maintenance sur le site public : visible sous la barre (69..145 à 320, 136..184 à
      1366), elle défile avec la page (−331..−255 à `scrollY` 400) au lieu de rester collée sous
      la barre.
- [x] AC4 — console, 320/360/390/1366 : la barre haute reste à 0..56, les bandeaux sont DANS le
      `<main>` (`page:2:main`), le document ne déborde plus (640/640, 800/800) ; défilé de 150,
      le `<main>` emporte les bandeaux et la barre haute ne bouge pas.
- [x] AC5 — page sans emplacement (`/auth/login`, 320) : le repli racine affiche la maintenance en
      tête (0..76), dans la langue du visiteur (« Planned maintenance tonight. From 24 Sept 2026,
      22:00 to 24 Sept 2026, 23:00 »). Sur `/fr`, un seul emplacement rendu (`page:1`).
- [x] AC6 — l'avis de maintenance se ferme (croix 40 × 40 visibles sous `sm`, `::after` à −6 px,
      −8 px depuis la reprise du 2026-09-24),
      reste fermé pour la session à la navigation suivante (`/fr/properties`), et revient quand la
      fenêtre passe « en cours ».
- [x] AC7 — chaque croix offre au moins 44 × 44 px touchables, À TOUTES LES LARGEURS. *Coché à tort
      jusqu'au 2026-09-24 : vrai sous `sm` (50), FAUX au-delà (42 × 42 à 1366 — le `::after` part de
      la boîte de padding, bordure de 1 px déduite). Décoché, corrigé (`after:-inset-2`), recoché
      après mesure : zone de 54 × 54 à 320 et de 46 × 46 à 1366 pour les deux croix,
      `elementFromPoint` au centre ± 22 px (quatre côtés) = la croix. Voir la reprise ci-dessous.*
- [x] AC8 — chaque correctif porte un test qui rougit sans lui (ablations ci-dessous).
- [x] AC9 — consoles d'administration (`/admin`, `/super-admin`) : le bandeau se place sous leur
      barre haute sans faire déborder le document. *(Fait par la session le 2026-09-24 :
      `<BandeauxDuSite emplacement="page" />` en tête du `<main>` d'`AdminShell` et de
      `SuperAdminShell`, comme `AppShell`. Avant : à 320, bandeau 0..76 HORS du `<main>`, barre
      repoussée à 76..132, document 716 pour 640 ; à 1366, document 848 pour 800. Après (Chrome
      headless, maintenance et annonce substituées) : `/admin` à 320, barre 0..56, maintenance
      56..132 et annonce 132..239 dans le `<main>`, document 640/640 ; à 1366, 800/800 ;
      `/super-admin`, 640/640 et 800/800 ; un seul emplacement affiché, `scrollWidth` = largeur.
      `layout/__tests__/Consoles.bandeaux.test.tsx` ; montage retiré → **2 rouges**.)*

## Vérification

- Tests : `announcements/__tests__/BandeauxDuSite.test.tsx` (3), `announcements/__tests__/croix-des-bandeaux.test.tsx`
  (2), `layout/__tests__/AppShell.bandeaux.test.tsx` (1), `maintenance/__tests__/MaintenanceBanner.test.tsx` (8, dont 7 neufs — le huitième ajouté par la reprise du 2026-09-24).
- Ablations (copie, mutation, rouge, restauration par `cp`, md5 identique) :
  - bandeaux retirés de `NavbarSpacer` → 1 rouge (bandeau absent après la cale) ;
  - retirés du `<main>` d'`AppShell` → 1 rouge ;
  - repli racine qui ne s'efface plus → 2 rouges (bandeau rendu deux fois) ;
  - garde « hors couche de données » retirée → 13 rouges (`PropertiesDiscoveryPage.etat-vide`, page montée sans `QueryClientProvider`) ;
  - `MaintenanceBanner` de `HEAD` → 4 rouges ; `sticky top-0 z-50` remis → 1 ; masquage ignoré → 1 ;
    empreinte sans l'état « en cours » → 1 ; empreinte sans la fin (`ends_at`) → 1 ; `wo` retiré du
    choix de langue du message → 1 (ces deux derniers ajoutés après la seconde vérification, qui
    les avait trouvés verts : mutations Vb et Vc) ;
  - `after:-inset-1.5` retiré de l'une ou l'autre croix → 1 rouge chacun ; depuis la reprise du
    2026-09-24, `after:-inset-2` ramené à `-inset-1.5` → 1 rouge chacun (42 < 44).
- `eslint` propre sur les fichiers touchés, `tsc --noEmit` propre, `check-i18n-namespaces` vert ;
  `surface-publique.contraste.test.ts` vert (compte `ENCRES_INVERSES` inchangé).

## Hors périmètre

- La vue carte mobile de `/properties` (carte `fixed` sous la barre) recouvre le bandeau : c'est
  un écran plein, le bandeau reparaît en vue liste.
- Le décalage de 1 px entre la barre de bureau (135) et sa cale (136), antérieur.
- ~~Les couleurs brutes du bandeau de maintenance~~ : passées sur les jetons de `GlobalAnnouncementBanner`
  (`bg-destructive text-background`, `bg-warning text-warning-foreground`) par la session — rendu
  dans `/app`, le bandeau tombait sous `check-super-admin-tokens`, rouge.

## Seconde vérification (2026-09-24) — ce qu'elle a relevé, et ce qui en a été fait

- **L'empreinte `id:état:fin` n'était gardée que sur l'état** : retirer `ends_at` restait vert
  (mutation Vb). *Test ajouté* — « revient quand la fin de la même fenêtre est repoussée » : avis
  fermé, puis même fenêtre, même état, fin +1 h → l'avis revient. Mutation rejouée : 1 rouge ;
  restauré, md5 `122ca41e415bf3b779f330772bed6ef2` identique.
- **Le message wolof n'était gardé par aucun test** : réduire le choix à `en` servait le français
  aux visiteurs wolof, suite verte (mutation Vc). *Test ajouté* — « sert le message wolof au
  visiteur wolof » — et un second pour le repli `fr` quand la langue du visiteur n'a pas de
  message. Mutation rejouée : 1 rouge ; restauré, md5 identique.
- **`announcements.maintenanceDismissAria` en wolof gardait le mot français** (« Nëbb yégle
  maintenance bi ») quand `wo.json` traduit partout maintenance par « Defar ». *Corrigé* par
  `i18n-set.mjs` : « Nëbb yégleb defar bi » (connectif de classe `b`, `yégle bi`). `check-i18n` et
  `check-i18n-namespaces` verts.
- **Consoles d'administration** : *mesuré* (la vérification n'avait pu l'établir que par le code,
  la connexion étant limitée) — voir AC9, corrigé ensuite par la session.

## Reprise des défauts mineurs (2026-09-24)

Deux défauts laissés par les vérifications adverses de la vague 69, reproduits avant correction.

### 1. AC7 était faux au-delà de `sm` : les croix offraient 42 × 42, pas 44

- **Cause.** Un `::after` en `position: absolute` se place depuis la boîte de **padding** de son
  bouton. Le `Button` porte `border` (1 px, transparente) : au-delà de `sm`, `size-8` +
  `after:-inset-1.5` donne (32 − 2 × 1) + 2 × 6 = **42**. Sous `sm`, le plancher tactile porte la
  boîte à 40 : 38 + 12 = 50 — d'où un AC vrai sur téléphone et faux au bureau.
- **Le test l'acceptait.** `coteTouchable` (`croix-des-bandeaux.test.tsx`) comptait `size` + 2 ×
  `inset` sans la bordure : 44, vert.
- **Mesure AVANT** (Chrome headless, CDP port 9402, `next dev` de l'arbre, propriétaire connecté,
  réponses des deux bandeaux substituées par `Fetch.fulfillRequest`, rien en base ; zone mesurée
  en marchant par pas de 0,5 px depuis le centre tant que `elementFromPoint` rend la croix) :

  | Largeur | Croix | Boîte | `::after` | Zone touchable | centre ± 22 px |
  |---|---|---|---|---|---|
  | 320 | annonce, maintenance | 40 × 40 | −6 px | 50 × 50 | 4/4 dans la croix |
  | 1366 | annonce, maintenance | 32 × 32 | −6 px | **42 × 42** | **0/4** |

- **Correctif.** `after:-inset-2` sur les deux croix (`GlobalAnnouncementBanner.tsx`,
  `MaintenanceBanner.tsx`) : (32 − 2) + 16 = 46 au-delà de `sm`, 54 en deçà. Apparence inchangée :
  la boîte visible reste 32 × 32 (40 × 40 sous `sm`), seul le pseudo-élément transparent grandit ;
  à 1366, il s'arrête au bord du bandeau de maintenance (`py-2`) et à l'espace (`gap-2`) qui le
  sépare du texte, sans empiéter.
- **Test corrigé.** `coteTouchable` déduit deux fois la bordure (`border` → 1 px, `border-<n>` →
  n px). Sur le code d'avant, il rend **42** → les deux cas rougissent (`expected 42 to be greater
  than or equal to 44`).
- **Mesure APRÈS** (même protocole) :

  | Largeur | Croix | Boîte | `::after` | Zone touchable | centre ± 22 px |
  |---|---|---|---|---|---|
  | 320 | annonce, maintenance | 40 × 40 | −8 px | 54 × 54 | 4/4 dans la croix |
  | 1366 | annonce, maintenance | 32 × 32 | −8 px | **46 × 46** | **4/4** |

- **Ablations** (copie dans le scratchpad, mutation, rouge, restauration par `cp`, md5 identique
  — `MaintenanceBanner.tsx` `98c5d067e1e6f4e91bf8e7f3e550e9a1`, `GlobalAnnouncementBanner.tsx`
  `335d43b779fcb865856cf4c64f464a6b`) : `-inset-2` → `-inset-1.5` sur la maintenance → 1 rouge
  (42) ; sur l'annonce → 1 rouge (42).

### 2. Rien ne gardait que les dates de la maintenance passent par `useFormatteurs`

- **Reproduit.** Remplacer `dateTime(…)` par `new Date(…).toLocaleString('fr-SN')` laissait les
  15 tests de `maintenance/` et `announcements/` **verts** : le test « parle la langue du
  visiteur » ne lisait que la forme `From … to …`, que la phrase anglaise garde autour de dates
  `07/05/2026 10:20:00`.
- **Test ajouté** (`MaintenanceBanner.test.tsx`, « formate la fenêtre dans la langue du visiteur,
  pas en fr-SN ») : en `en`, le texte vaut EXACTEMENT `From 7 May 2026, 10:20 to 7 May 2026, 11:00`
  (format `en-GB` du dépôt, fuseau `Africa/Dakar` — indépendant du fuseau de la machine), et ne
  contient aucune date `jj/mm/aaaa`.
- **Ablation** : la mutation `toLocaleString('fr-SN')` → **1 rouge** (ce test seul) ; restauré,
  md5 identique.

### Commandes

- `npx vitest run` sur `MaintenanceBanner.test.tsx` et `croix-des-bandeaux.test.tsx` : 10 verts.
- `eslint` sur les quatre fichiers touchés : propre ; `npx tsc --noEmit` : propre.
