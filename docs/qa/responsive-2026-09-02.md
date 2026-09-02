# Campagne responsive — 135 écrans × 5 largeurs (2026-09-02)

> **Mesuré le 2026-09-02**, sur `dev` @ `e1411088` (avant correction), front `next dev` sur
> `127.0.0.1:3000`, API `php artisan serve` sur `127.0.0.1:8002` avec `CACHE_STORE=array`
> (le limiteur `public-read`, 90 requêtes/min par IP, rendait des états d'erreur au bout de deux
> pages — ce n'est pas un changement du dépôt, c'est une condition de la mesure), PostgreSQL 17 en
> docker, base de démonstration (`migrate:fresh --seed`, ~840 biens).
>
> **Ce document est un relevé, pas une opinion.** Chaque défaut porte la page, la largeur, le
> chiffre et l'élément qui le rend. Ce qui n'a pas été mesuré est dit non mesuré. Le ticket qui
> décide est [TCK-505](../backlog/tickets/TCK-505-responsive-onze-defauts-mesures-sur-135-ecrans.md) ;
> le plan est [`docs/plans/2026-09-02-tck-505-responsive-tablette-et-mobile.md`](../plans/2026-09-02-tck-505-responsive-tablette-et-mobile.md).

---

## 1. Méthode — ce que la sonde voit, et ce qu'elle ne voit pas

**Le banc.** Chrome headless piloté en CDP direct (WebSocket natif de Node 24, pas le MCP —
[[project_mesure_navigateur_par_cdp_direct]]), un contexte de navigateur isolé par travailleur,
`Emulation.setDeviceMetricsOverride` pour la largeur, `Runtime.evaluate` pour la sonde,
`Page.captureScreenshot` à 390 et 1366. Le rôle est injecté par les cookies du BFF (`auth_token`,
`NEXT_LOCALE=fr`), jamais par le formulaire de connexion : huit jetons Sanctum, un par rôle.

**Les largeurs** : 360 (petit Android), 390 (iPhone), **768** (tablette portrait, et seuil `md` de
Tailwind), 1024 (tablette paysage, seuil `lg`), 1366 (bureau de référence).

**Les pages** : les 117 `page.tsx` du front, chacune rendue avec le rôle qui y a droit — anonyme,
agent, propriétaire, locataire, prestataire, admin d'agence, super-admin, utilisateur sans profil.
Certaines sont rendues avec deux rôles quand le contenu diffère (`/app`, `/app/payments`,
`/app/properties/1`…) : **135 couples page × rôle**, 672 relevés, 0 erreur. Cinq couples
supplémentaires ont été relevés après coup pour couvrir des redirections (§ 2).

**La sonde**, exécutée dans la page après stabilisation du réseau :

| Mesure | Ce qu'elle rend | Seuil |
|---|---|---|
| `docOverflow` | `document.scrollWidth − innerWidth` | > 0 = le document défile horizontalement |
| `over[]` | éléments dont `right` dépasse le viewport, **hors** ceux qu'un ancêtre `overflow-x: auto/scroll` fait défiler | tout |
| `tables[]` | chaque `<table>` : largeur, colonnes, et si un ancêtre la fait défiler (`scrolls`), la contient (`fits`) ou la **coupe** (`NONE-clipped`) | `NONE-clipped` |
| `narrowText` | texte de < 80 px de large rendu sur ≥ 3 lignes | tout |
| `lt24` / `lt44` | cibles interactives sous 24 px (WCAG 2.5.8) et sous 44 px | comptés, non jugés ici |
| `smallText` | texte sous 12 px | compté |
| `redirected` | l'URL finale diffère de celle demandée | → couverture |

**Ce que la sonde ne voit pas, et qu'il ne faut pas lui faire dire** : le sens d'une mise en page
(un tableau de bord lisible mais laid passe), le contraste, le clavier, et tout ce qui demande une
interaction (tiroirs, menus, modales). Les captures à 390 et 1366 ont servi à *lire* chaque défaut
chiffré avant de le retenir — quatre relevés ont été rejetés à cette lecture (§ 5).

**Deux artefacts de mesure ont dû être neutralisés** avant que le relevé soit lisible :

1. Le limiteur de débit de l'API (`public-read`, 90/min par IP) : après deux pages, les suivantes
   rendaient des cartes d'erreur, et une carte d'erreur ne déborde jamais. API relancée avec
   `CACHE_STORE=array` (le compteur ne survit pas à la requête).
2. Le tour de bienvenue (`welcome_views`) : sur 53 pages `/app`, la feuille plein écran couvrait
   la page et la sonde mesurait le tour. Lignes `welcome_views` insérées pour les sept comptes de
   mesure, 53 pages re-relevées.

---

## 2. Couverture — ce qui a été vu, ce qui ne l'a pas été

| Coque | Couples page × rôle | Note |
|---|---|---|
| Site public (`/fr/…`) | 14 | anonyme |
| `/auth/*` | 8 | anonyme, plus `verify-email` avec deux rôles |
| `/onboarding/*` | 14 | huit rôles ; **5 redirigent** (voir ci-dessous) |
| `/app/*` | 53 | agent, propriétaire, locataire, prestataire, admin |
| `/admin/*` | 15 | admin d'agence |
| `/super-admin/*` | 28 | super-admin |
| autres (`/publish`, `/`, callback OAuth) | 4 | |

**Vingt relevés sont des redirections**, dont dix-neuf voulues. Elles sont dans le relevé parce
qu'une redirection *est* le comportement de la page pour ce rôle, mais elles ne mesurent pas la
page visée :

- **Par conception** : `/onboarding/{owner,agent,agency-admin,service-provider}` → `/app` pour un
  compte sans profil (il passe par `/onboarding/intention`) ; `/publish` → `/onboarding/host` ;
  `/admin/settings`, `/admin/moderation` → `/admin` pour un admin d'agence (réservés au super-admin,
  `app/(dashboard)/admin/settings/page.tsx:28`) ; `/admin/settings/tags` → `/admin?notice=…` ;
  `/admin/users` → `/admin/team` ; `/app/crm` → `/app/customers` ; `/app/overview` →
  `/app/overview/<rôle>` ; `/auth/verify-email` → `/app` pour un compte déjà vérifié ;
  `/onboarding/super-admin` → `/super-admin` (déjà onboardé) ; `/onboarding/host` →
  `/app/properties/new` pour un propriétaire déjà hôte.
- **Par capacité** : `/app/overview/alerts` et `/app/overview/kpis` renvoient l'agent vers sa vue ;
  **re-relevées avec l'admin d'agence** (§ 4).
- **Par état** : `/app/leases/onboarding-pending` → `/app` — aucun bail du jeu de démonstration
  n'est en attente d'onboarding pour le locataire de mesure. **Non mesurée.**
- **La seule anormale** : `/auth/oauth/google/callback?code=x` → `/auth/login?error=oauth_invalid`,
  attendu sans fournisseur configuré.

**Ce qui reste hors relevé** : les tiroirs ouverts (menu mobile, filtres), les modales, les
menus déroulants, les pages de `loading.tsx`, et l'état « erreur » de chaque page.

---

## 3. Le relevé avant correction

### 3.1 Vue d'ensemble

| Largeur | Pages | Document qui défile | Texte en colonne étroite | Pages avec cibles < 24 px |
|---|---|---|---|---|
| 360 | 135 | **4** ⚠ | 10 | 79 |
| 390 | 135 | **5** ⚠ | 8 | 80 |
| **768** | 134 | **55** | 12 | 116 |
| 1024 | 134 | 1 | 3 | 121 |
| 1366 | 134 | **0** | 0 | 123 |

⚠ **Les lignes 360 et 390 ont d'abord été lues « 0 », et c'était faux.** `scrollWidth − innerWidth`
y vaut 0 sur les 135 pages — mais en émulation mobile, un contenu plus large que l'écran **élargit
le viewport** au lieu de le faire défiler, et les deux termes grandissent ensemble. Le relevé porte
`innerWidth`, et sur 5 couples il dépasse la largeur demandée : `/fr/properties` et `?view=map`
(435 pour 360 et 390 — défaut #8), la fiche bien (369 pour 360 — défaut #12, trouvé par ablation
élément par élément après coup), `/app/profile/notifications` et `/reviews` (425 pour 390 — la
barre du haut, défaut #1), et `/fr/playground` (429, POC hors produit). Le compte ci-dessus est
`max(scrollWidth − innerWidth, innerWidth − largeur demandée)`. *Une soustraction dont les deux
termes bougent rend zéro : c'est la mesure qui rassure qu'il faut re-vérifier.*

**Le point de rupture qui casse est 768.** Les 55 pages qui y débordent se répartissent :
`/app` 37, `/admin` 15, public 1, auth 1, onboarding 1 — et 52 des 55 débordent **du même
nombre de pixels selon le rôle** (+81 agent, +94 propriétaire, +118 admin) : c'est une seule
cause, la barre du haut de la coque, pas 55 défauts.

La raison est structurelle. `md:` (≥ 768) est le seuil où les trois coques montrent la barre
latérale de 256 px **et** le seuil où la plupart des composants passent en colonnes. Les deux
décisions sont prises au même pixel et la seconde ignore la première : un composant « 4 colonnes
dès `md` » dispose de 768 − 256 − 48 = **464 px**, pas de 768.

**Aucune table de la primitive `Table` n'est coupée** (elle porte `overflow-x-auto`, TCK-371) ;
les quatre tables coupées sont des `<table>` bruts sous `overflow-hidden`. Aucun `h-screen` ne
subsiste (TCK-503). Les trois coques passent en tiroir sous `md`.

### 3.2 Les douze défauts retenus

| # | Défaut | Où | Largeurs | Mesure |
|---|---|---|---|---|
| 1 | **Le document défile** — la coque `/app` et `/admin` déborde | `AppTopbar.tsx` (52 pages) | 768 | +81 px (agent), +94 (propriétaire), +118 (admin) ; cause : `SearchAutocomplete` en `min-w-80 flex-1` et cluster droit sans `min-w-0` |
| 2 | Barre publique : « Connexion » coupé, « Publier » invisible | `Navbar.tsx` (14 pages) | 768-~900 | cluster droit `hidden md:flex` atteint 869 px sur 768 |
| 3 | Barre publique mobile : bouton menu rogné | `Navbar.tsx` | 360-767 | bouton à `right=400` sur 390 ; le bouton de recherche `flex-1` n'a pas `min-w-0` |
| 4 | Messagerie : bulles d'un mot par ligne | `MessagesPage.tsx` | 768-1023 | grille `md:[320px_1fr]` + sidebar 256 → colonne ≈ 150 px ; 5 `<p>` en colonne étroite à 768 |
| 5 | Tables de paiements : colonnes de droite inaccessibles | `PaymentsHistoryTable`, `InvoicesTable`, `PayoutsTable`, `LeaseSchedule` | 360-768 | `<table>` de 571-875 px sous `overflow-hidden` ; dates « 16 sept. 2026 » sur 3 lignes (`/admin/finances`, `/app/payments` locataire) |
| 6 | Agenda mensuel : puces hors cellule | `MonthView.tsx` | 360-1024 | cellule de grille à `min-width:auto`, `truncate` inopérant, puce à `right=410` sur 390 |
| 7 | Plans plateforme : champs de 20 px, boutons rognés | `AdminPlansClient.tsx` | 768-1023 | grille `md:[1fr_1fr_160px_140px_auto_auto]` dans ≈ 480 px |
| 8 | Recherche publique : compteur sur 3 lignes, Filtres rogné | `SearchToolbar.tsx` | 360-390 | `<p>« 252 biens trouvés »` < 80 px, sur `/fr/properties` et `?view=map` |
| 9 | KPI en 4 colonnes dès `md` : libellés sur 3-4 lignes | `overview/{agency,owner,tenant}`, `PipelineStatsBar`, `DashboardMeKpis`, `PropertyKpiStrip` | 768 | cartes ≈ 120 px ; « Réservations en attente », « Taux de conversion 30j » en colonne étroite |
| 10 | Bandeau équipe (fiche agence) : flèche « suivants » hors viewport | `TeamStrip.tsx` | 768-1024 | document +4 px sur `/fr/agencies/dakar-immo` — la **seule** page qui déborde à 1024 |
| 11 | Biens similaires (fiche bien) : premier slide hors champ | `PropertySimilar.tsx` | 360-390 | premier slide à x ≈ 310 sur 390 — **à confirmer** avant correction (§ 4) |
| 12 | Fiche bien : le viewport s'élargit de 9 px | `PropertyAgentCard.tsx`, `PropertyDetailContent.tsx` | 360 | `innerWidth` 369 ; retirer les éléments un à un jusqu'à retomber à 360 désigne le `<p class="flex … truncate">` de l'agence : `nowrap` hérité par le lien, enfant flex dont le minimum est son texte ; l'`<aside>` de grille n'a pas `min-w-0` |

### 3.3 Ce qui est relevé et **non** retenu dans TCK-505

**Cibles tactiles.** À 390 px, 437 cibles sur 2 983 mesurent moins de 24 px dans une dimension,
2 348 moins de 44 px. Les plus denses : `/admin/roles` (45/77 — cases à cocher de 16 px),
`/super-admin/properties` (39/69), `/admin/properties` (33/80), `/app/properties/1` (20/27),
`/admin/team` (19/66 — en-têtes de tri en `button` de 16 px de haut). Sur le site public : les
liens du pied de page (20 px), les puces d'agenda (21 px), les boutons « Retirer » du comparateur
(16 px). C'est un chantier a11y à part entière (WCAG 2.5.8), pas un défaut responsive : ces cibles
sont petites à 1366 aussi.

**Trois tables de la primitive `Table` qui se compressent au lieu de défiler** : elles portent leur
`overflow-x-auto`, mais restent en `w-full` et leurs cellules acceptent le retour à la ligne — la
date « 19 août 2026, 23:59 » tient sur quatre lignes sur `/super-admin/agency-upgrade-requests` à
390, « Admin Dakar Immo » sur trois sur `/admin/team`, « Active • dernier test : … » sur
`/admin/settings/integrations` à 768. Lisibles, atteignables, pas rognées : ce n'est pas le
défaut #5 (rien n'est inaccessible), c'est sa version bénigne. La forme qui les redresserait est
la même (`whitespace-nowrap` sur les cellules de date), à poser quand on retouche ces vues.

**`/fr/playground`** (+39 px à 390, rangée des commutateurs de typographie en `shrink-0`) : page de
démonstration de palette, marquée « POC » dans son en-tête, hors produit. Relevée, pas corrigée.

**Trois défauts de design, pas de mise en page** : le tour de bienvenue sur téléphone (feuille vide
sur 80 % de la hauteur) ; la troncature du prix dans la barre d'action collante de la fiche bien
(« /pa… » à 390) ; le libellé « Admin Dakar Immo » en colonne étroite sur `/admin/team` (rendu
d'une cellule d'avatar, lisible).

**Relevés rejetés à la lecture des captures** : `/app/payments/return` (+25 px à 768 —
même cause que #1, comptée dans #1) ; `/app/profile/notifications` et `/reviews` (+51 px — idem) ;
`/onboarding/host` propriétaire (+94 — idem) ; `/auth/verify-email` agent (+81 — idem, la page
redirige vers `/app`). Aucun n'est un défaut propre.

**La page la plus longue** à 390 : `/fr/agencies/dakar-immo`, 21 538 px — 24 biens et l'équipe en
cartes pleine largeur. Long, pas cassé. **La plus lente** : `/app/properties` agent à 768, 100 s
au premier rendu (compilation `next dev`, non représentative).

---

## 4. Après correction

**Re-campagne le 2026-09-02**, même banc, même sonde, sur l'arbre de la branche
`fix/tck-505-responsive-tablette-et-mobile` : **140 couples page × rôle** (les 135 d'origine plus
les 4 relevés de couverture du § 2 et `/app/leases/onboarding-pending` propriétaire, qui redirige
aussi), 5 largeurs, **700 relevés, 0 erreur**, machine à charge 3-8 sur 8 cœurs. Le banc attend
désormais la disparition des squelettes (`animate-pulse`, `aria-busy`) et deux lectures stables de
`scrollWidth`/`scrollHeight` avant de sonder — sous charge, le premier banc mesurait parfois un
squelette, qui ne déborde jamais (constat des groupes B, C et D). Les deux pages de recherche ont
été re-relevées à 360 après la seconde retouche de #8. Comparaison : `compare.mjs` du scratchpad,
`results.avant.jsonl` contre `results.apres.final.jsonl`.

### 4.1 Le compte

| Largeur | Pages avant / après | Document qui déborde (ou viewport élargi) | Texte en colonne étroite |
|---|---|---|---|
| 360 | 135 / 140 | **4 → 1** | 10 → 5 |
| 390 | 135 / 140 | **5 → 1** | 8 → 4 |
| **768** | 134 / 140 | **55 → 0** | 12 → 6 |
| 1024 | 134 / 140 | **1 → 0** | 3 → 3 |
| 1366 | 134 / 140 | 0 → 0 | 0 → 0 |

**Le seul débordement restant est `/fr/playground`** (+69 à 360, +39 à 390), POC de palette hors
produit, hors périmètre déclaré. **AC1 et AC10 sont tenus.**

### 4.2 Les douze défauts, un par un

| # | Où | Avant | Après |
|---|---|---|---|
| 1 | `AppTopbar` | +81 / +94 / +118 px à 768 sur 52 pages | **0** sur les 52 ; `/app/profile/{notifications,reviews}` reviennent de 425 à 390 px de viewport |
| 2 | `Navbar` bureau | cluster droit à 869 px sur 768 | barre mobile entre 768 et 1023 ; bureau dès 1024, identique à 1366 |
| 3 | `Navbar` mobile | bouton menu à 400 px sur 390 | entier ; `min-w-0` sur la rangée **et** la pastille (la pastille seule ne corrigeait rien, mesuré) |
| 4 | `MessagesPage` | 768 : fil ≈ 150 px, 5 bulles étroites | 768 : un panneau de 462 px, 0 bulle étroite ; 1024 et 1366 : deux panneaux, `320px` + reste, inchangé |
| 5 | 4 tables | 390 : 554-594 px sous `overflow-hidden`, dates sur 3 lignes | 623-741 px, la **carte** défile (`clientWidth` 356 / `scrollWidth` 569-741), `main` ne défile pas, 0 date cassée ; 1366 : 1060 px, inchangé |
| 6 | `MonthView` | puces à 393-486 px sur 360 | 0 puce hors de sa cellule aux 5 largeurs (46 puces, 42 cellules) ; il a fallu `block` sur le span en plus de `min-w-0` |
| 7 | `AdminPlansClient` | 768 : champs de 22 px, boutons à 777-945 px | 768 : une colonne, champs 432 px, boutons dans le viewport ; seuil **`xl`** et non `lg` : à 1024 la ligne de plan à six colonnes ne laissait que 41 px |
| 8 | `SearchToolbar` | 390 : compteur sur 3 lignes, viewport élargi à 435 | compteur sur 1 ligne ; **second relevé à 360** : le groupe des contrôles faisait encore 336 px dans 328 → `flex-wrap` sur lui aussi ; viewport 360 / 390 |
| 9 | KPI ×7 | 768 : cartes de 104-107 px, 7 blocs étroits | 2 colonnes de 224 px, 0 bloc étroit ; 1024 et 1366 : 4 colonnes, inchangé |
| 10 | `TeamStrip` | +4 px à 768 et 1024, flèche à 1028 px | 0 ; flèches dans l'en-tête de section (motif de l'accueil) — **c'est le seul changement voulu à 1366** sur cette page |
| 11 | `PropertySimilar` | « premier slide à x ≈ 310 » | **pas de défaut** : premier slide de 16 à 320 px sur 390 ; le 310 était le bord gauche du deuxième slide, qui dépasse à dessein. Fichier non touché |
| 12 | `PropertyAgentCard` | 360 : viewport 369 | 360 ; le lien tronque lui-même, l'`<aside>` a `min-w-0` |

### 4.3 AC8 — 1366 identique

Sur 134 couples relevés aux deux dates, **129 sont identiques** sur `docOverflow`, nombre de
tables et éléments hors viewport non clippés. Les 5 différences ont été lues une à une, aucune
n'est une régression :

- Fiche bien : 12 → 0 éléments « hors viewport non clippés » — ce sont les slides du carrousel,
  identiques avant/après ; avant, la sonde tirait avant l'initialisation d'embla (pas encore
  d'`overflow-hidden`), après, le banc a attendu.
- `/app/payments` (locataire, agent) et `/app/properties` (agent) : 0 → 1 table — la table a
  chargé cette fois (même cause : le banc attend les données).
- `/publish` (propriétaire) : redirigée à 1366 après, pas avant — elle redirigeait déjà à 390
  avant (`→ /onboarding/host`) ; artefact de cadence de `next dev`.

### 4.4 Ce qui reste, et pourquoi

- **Texte en colonne étroite** : 6 pages à 768, toutes des tables `Table` compressées mais
  lisibles (§ 3.3) ou des libellés de 3 mots en 2 colonnes à 360 (`/app/crm/pipeline` : « Taux de
  conversion 30j » sur 3 lignes dans une carte de 156 px). Relevé, pas un défaut de mise en page.
- **`/fr/playground`**, hors produit.
- **Les cibles tactiles** (§ 3.3), ticket a11y à écrire.
- **Vu en passant par le groupe C, hors périmètre** : à 390, la colonne Référence de l'historique
  des paiements (`font-mono`, « BPY-SZYVVN ») se casse sur 2 lignes.

### 4.5 Les gardes posées

- **Un test par correction, chacun rouge par ablation, faite réellement** (classe retirée, test
  lancé, classe remise, `git diff` vérifié) : 10 classes pour le groupe A, 4 ablations pour B, 12
  pour C (dont « `overflow-hidden` **ajouté** à côté d'`overflow-x-auto` » rougit aussi), 9 pour D,
  3 pour #12 et la seconde retouche de #8. Le helper `src/test/defilement-horizontal.ts` lit
  l'overflow comme une **propriété** (`overflow-auto`, `overflow-x-scroll`, `style=` équivalents)
  et non comme un littéral, pour ne pas fabriquer un faux rouge qu'on désarmerait.
- `npm run lint` 0 erreur, `npx tsc --noEmit` propre, **suite entière : 379 fichiers, 3163 tests,
  verts**, lancée une fois par la session, machine au repos.
- La règle « `md` n'est pas bureau dans une coque à barre latérale » est écrite dans
  `takussan-web/CLAUDE.md`.

---

## 5. Ce que la campagne apprend, au-delà de ses onze lignes

1. **Une seule largeur casse, et c'est celle où deux décisions se prennent au même pixel.** Le
   dépôt n'a pas cinquante défauts responsive, il a une convention absente : dans une coque à
   barre latérale, `md` n'est pas « bureau ». La règle est désormais écrite dans TCK-505 et dans
   `takussan-web/CLAUDE.md`.
2. **Un défaut de coque se compte une fois.** 52 des 55 débordements à 768 sont le même. Un
   rapport qui les liste page par page ment sur la taille du chantier.
3. **La sonde qui a trouvé le défaut est celle qui vérifie la correction**, à la même largeur — et
   à 1366 pour prouver que le bureau n'a pas bougé. Un test unitaire sur une classe Tailwind
   garde la régression ; il ne garde pas la mise en page.
4. **Deux artefacts de mesure ont failli s'écrire comme des défauts** (limiteur de débit, tour de
   bienvenue). Un rendu d'erreur ne déborde jamais ; un relevé « propre » sur une page en erreur
   est un relevé absent.
