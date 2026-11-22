# TCK-2481 — La barre d'onglets mobile par persona : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).
>
> ⚠ **Ne démarre qu'une fois TCK-2479 mergé sur `dev`** (le ticket ne dépend que de TCK-2478, mais ce
> plan est écrit contre l'arbre de TCK-2479 : `Disposition.priorites`, bloc des compteurs `isError`,
> `styles-de-la-barre.ts` — cf. « Ce qu'on suppose »). Branche à tirer de `dev` à jour :
> `feat/barre-d-onglets-tck-2481`.
>
> ⚠ **Les arbitrages ci-dessous sont des RECOMMANDATIONS du planificateur**, à valider par la session
> avant l'exécution. Un arbitrage refusé change la tâche qu'il cite, et elle seule.

**But :** au téléphone (sous `md`), une barre fixée en bas porte les quatre destinations du quotidien
du persona actif, avec leurs compteurs, puis « Menu », qui ouvre le tiroir existant ; le burger de la
barre haute disparaît. Rien de la page ne passe sous la barre ; elle est absente en plein écran et à
partir de `md`.

**Architecture :** la disposition de chaque persona reçoit un champ `onglets` (ADR-0089 §3) ; une
fonction pure, `ongletsDuMenu`, les lit dans le menu COMPOSÉ du persona (même accès, même cadenas,
jamais « Aussi … ») et remplace un onglet absent par la destination suivante de la disposition. La
composition du menu et ses compteurs sortent d'`AppSidebar` en deux hooks (`useMenuDeLEspace`,
`useCompteursDuMenu`) que la barre latérale et la barre d'onglets appellent tous deux : une seule
composition, une seule règle de sondage. La barre est un **enfant flex de la coque `h-dvh`**, après la
rangée du contenu — le `<main>` rétrécit de sa hauteur exacte, sans rembourrage recopié.

**Pile :** Next.js 16, React 19, TypeScript 5, vitest 4 + Testing Library, next-intl, Base UI
(`Dialog` sous `Sheet`), TanStack Query, lucide-react, Tailwind 4.

**Références :** [ADR-0089](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) §3, §5 ·
[TCK-2481](../backlog/tickets/done/TCK-2481-barre-d-onglets-mobile.md) ·
plans précédents : [TCK-2478](2026-11-05-tck-2478-dispositions-par-persona.md),
[TCK-2479](2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md) ·
campagne : [`docs/qa/responsive-2026-09-02.md`](../qa/responsive-2026-09-02.md).

## Contraintes globales

- **Aucun droit ne change, aucune entrée ne bouge.** Un onglet est une entrée DÉJÀ rendue par le menu
  du persona : la barre n'ouvre rien que le tiroir n'ouvre. Le tiroir lui-même n'est pas modifié
  (hors périmètre du ticket).
- **Sous `md` seulement** (`md:hidden`). `md:` n'est pas le bureau dans `/app` (TCK-505), mais la
  barre latérale fixe y paraît dès `md` (`AppShell.tsx:120`) : c'est le bon seuil ici, et TCK-2480 ne
  vit qu'au-dessus.
- **Absente en plein écran** (`estPleinEcran`, TCK-631) et hors de `/app`.
- **Aucune requête de compteur neuve** : mêmes hooks, mêmes clés de cache ; la barre ne sonde que
  sous `md` (A8).
- `env(safe-area-inset-bottom)` écrit sur la barre ; **pas** de `viewport-fit=cover` dans ce ticket (A2).
- a11y : `<nav>` nommée, `aria-current="page"`, l'onglet actif lisible sans la couleur seule, nom
  accessible qui CONTIENT le libellé visible (WCAG 2.5.3), cibles ≥ 44 px, lien d'évitement inchangé.
- Chaque clé i18n neuve en `fr`, `en`, `wo` (le `wo` porte le français tel quel, wolof en pause).
  Aucun texte en dur — pas même `99+`.
- React Compiler : pas de `useMemo`/`useCallback` neuf. Aucune dépendance neuve. Aucune Radix.
- Tests : les fichiers touchés, jamais une suite entière (cf. `brief-commun.md`). Ablations dans UN
  script écrit avec Write, lancé par `bash fichier.sh`, puis `git diff` vide de toute mutation.
- Avant chaque commit : `npx tsc --noEmit && npm run lint && npm run check:i18n && npm run check:classes-emises`
  (dans `takussan-web/`). Commits en français, préfixés, citant `TCK-2481`, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Relevés (mesurés le 2026-11-05 sur `feat/bande-a-traiter-tck-2479`, `ac7b91b2e`, TCK-2479 en cours dans l'arbre)

> Re-mesurer avant d'implémenter : TCK-2479 et TCK-2480 touchent les mêmes fichiers. Un écart se
> corrige au plus juste et s'écrit dans les notes du ticket.

### R1 — Le burger et le tiroir

- **Le burger** : `takussan-web/src/components/layout/AppTopbar.tsx:53-65` — un `<button>` `md:hidden`
  (`aria-label={t('openMenu')}`, `aria-expanded={menuOpen}`, cible 44 px par `after:-inset-1`), seul
  contrôle de la barre haute sous `md` avec le logo. Props `onMenuToggle` / `menuOpen` (`:40-45`).
  Son anneau (`ANNEAU_FOCUS`, `:17-38`) est documenté pour « le hamburger et le logo ».
  Comme il est `md:hidden`, **le retirer sous `md` = le retirer** : il n'existe nulle part ailleurs.
- **Le tiroir** : `AppShell.tsx:129-140` — `Sheet` (Base UI `Dialog`, `ui/sheet.tsx:8-9`) contrôlé par
  `sidebarOpen` (`:56`), basculé par le burger (`:115`), qui rend un second `AppSidebar` avec
  `onNavigate={() => setSidebarOpen(false)}`. `SheetContent` transmet ses props au `Popup`
  (`sheet.tsx:96-116`).
- **Retour du focus** : aucun `finalFocus` dans `src/` (`grep -rn finalFocus src` → rien). Base UI 1.7.0
  (`node_modules/@base-ui/react/dialog/popup/DialogPopup.d.ts:25-34`) rend par défaut le focus au
  « trigger or previously focused element ». Le burger n'est pas un `Dialog.Trigger` : c'est donc
  l'élément focalisé à l'ouverture qui le reçoit. **Au clavier, c'est le bouton ; au doigt sur Safari
  iOS, un appui ne focalise pas un bouton** — l'élément « précédent » est alors `body`, et le focus se
  perd. D'où `finalFocus` explicite (A10).
- **Tests qui ouvrent le tiroir par le burger** : `AppShell.menu-et-credits.test.tsx:74-78` et `:159-168`
  (TCK-1035, `aria-expanded`), `AppSidebar.section-agence.test.tsx:335`. Tests qui le mesurent :
  `AppTopbar.a11y.test.tsx:79-81` et `:114` (anneau). Tests qui passent `onMenuToggle` :
  `AppTopbar.a11y.test.tsx:61`, `AppTopbar.responsive.test.tsx:74`, `src/test/__tests__/portees-sombres.test.tsx:84`.
- `nav.openMenu` reste lu par `home/Navbar.tsx` et `SuperAdminTopbar.tsx` : la clé ne part pas.

### R2 — Le plein écran

- `src/components/layout/plein-ecran.ts:12-16` : `ROUTES_PLEIN_ECRAN = ['/app/properties/new']`,
  égalité stricte. Lu par `AppShell.tsx:61,114,118` (ni barre haute, ni barre latérale, ni tiroir) et
  par `chat-widget/CorpsDuWidget.tsx:149` (le lanceur s'efface).
- **`/publish` (cité par l'AC4) n'est PAS sous `AppShell`** : `src/app/publish/layout.tsx:1-6` n'importe
  que `IntlProvider`, `messagesPour` et le toast. La barre y est absente par construction ; le plein
  écran DANS `/app` est `/app/properties/new`. L'AC4 est éprouvée sur les deux (tâche 3, tâche 5).

### R3 — Le lien d'évitement et l'ordre de tabulation

- `AppShell.tsx:108-109` : `<LienEvitement />` avant les bannières, la barre haute et la barre
  latérale ; il vise `<main id="contenu-principal" tabIndex={-1}>` (`:143-148`,
  `shared/contenu-principal.ts:9`). Gardé par `AppShell.lien-evitement.test.tsx:80-98` (premier
  `a[href], button` de la coque ; focus déplacé dans `<main>`).
- Sous `md`, l'ordre est : lien d'évitement → bannières → logo et grappe de la barre haute → contenu.
  La barre latérale de bureau est `hidden md:block` (`:120`) : `display: none`, hors du parcours.

### R4 — La réserve de hauteur (TCK-503)

- `AppShell.tsx:90-107` : la coque est `flex h-dvh flex-col` ; **le document ne défile jamais**, c'est le
  `<main>` (`relative min-h-0 flex-1 overflow-y-auto`, `:147`) qui absorbe le débord ; le contenu porte
  `px-4 py-6 md:px-6 md:py-8` (`:154`). Gardé par `CoqueHauteur.test.tsx:118-151`.
- Conséquence utile : **un dernier enfant de la colonne `h-dvh` reste collé au bas du viewport visible
  sans `position: fixed`**, et le `<main>` rétrécit d'autant (A1).
- **Couplages qui supposent « `<main>` = 100dvh − barre haute »** :
  - `messages/MessagesPage.tsx:135-147` — sous `lg`, le cadre de la messagerie se cale par
    `h-[calc(100dvh-3.5rem)]` (conversation) et `h-[calc(100dvh-5rem)]` (liste). Avec 56 px de barre
    en plus, le composeur passerait sous le pli du `<main>` (A5). Aucun test ne fige ces classes.
  - `chat-widget/reserve.ts:32` — `RESERVE_SOUS_LANCEUR = 'pb-14 md:pb-16'`, posé par
    `app/properties/(liste)/page.tsx:197` et son `loading.tsx` pour le bouton flottant mobile.
- **Éléments `fixed` en bas, dans `/app`** :
  - le bouton flottant « Messagerie » (`CorpsDuWidget.tsx:313-319`, `fixed right-4 … md:hidden`,
    `bottom` = créneau du dock à 16 px) — monté par le layout RACINE (`src/app/layout.tsx:176`), donc
    hors de la coque : il recouvrirait la barre (A3) ;
  - la barre d'actions groupées de « Mes biens » (`property-dashboard/PropertyList.tsx:674-691`,
    `fixed inset-x-2 z-40`, créneau `bottom-right` du dock) — rendue DANS le `<main>`, à 16 px du bas :
    elle recouvrirait la barre (A4).
  - `property-form/PropertyForm.tsx:572` est `sticky bottom-0` DANS le `<main>` : il reste au-dessus
    d'une barre sœur du `<main>`, et passerait dessous d'une barre `fixed`.
- Le dock : `--floating-dock-base` (`app/globals.css:279-285`, 16 px, 24 px dès 640) lu par
  `floating-dock/useFloatingDockSlot.ts:16`.

### R5 — La zone sûre

- **Aucun `viewport-fit=cover`** : ni `export const viewport` ni `generateViewport` dans `src/app`
  (`grep -rn "viewportFit\|viewport-fit" src` → rien), alors que `manifest.ts:25` déclare
  `display: 'standalone'`. iOS rend donc `env(safe-area-inset-*)` à **0** partout.
- Déjà connu et **tranché par le porteur** : `docs/plans/2026-10-15-pistes-d-amelioration.md:506-514`,
  « refusé — reporté : `viewportFit: 'cover'` et relecture des en-têtes fixes, après un rendu sur un
  iPhone réel » (validation en bloc du 2026-10-25).
- Le dépôt écrit quand même `env(safe-area-inset-bottom)` sur ses barres du bas (18 occurrences ;
  `PropertyMobileBottomBar.tsx:75`, `WizardShell.tsx:99`…) et le type `SafeAreaInsetExpression`
  (`floating-dock/types.ts:26`) l'exige d'un `bottom-full` : la barre suit ce patron (A2).

### R6 — Les quatre onglets du ticket, persona par persona

Mesuré en exécutant `composerMenu` du dépôt (script en lecture seule,
`/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/78e9bbc1-7d90-41d1-9512-3810fd7a8264/scratchpad/releve-onglets-2481.mjs`,
comptes « simples » de `dispositions-validees.test.ts`) — `id[groupe|clé de libellé|href|compteur]` :

| Persona | Onglets proposés → rendus par le menu du persona |
|---|---|
| client | `tableau-de-bord[tete\|dashboard\|/app]` · `favoris[mes-recherches\|myFavorites]` · `visites[mes-demarches\|myVisits\|pendingVisits]` · `messagerie[tete\|messaging\|unreadMessages]` |
| locataire | `tableau-de-bord` · `paiements[mon-logement\|payments]` · `maintenance[mon-logement\|interventions]` · `messagerie` |
| bailleur | `tableau-de-bord` · `mes-biens[mon-patrimoine\|myProperties]` · `demandes[activite\|leads\|unhandledLeads]` · `messagerie` |
| agent | `tableau-de-bord` · `demandes[prospection\|leads\|unhandledLeads]` · `visites[prospection\|visits\|pendingVisits]` · `messagerie` |
| admin-agence | `tableau-de-bord` · `demandes[activite]` · `mes-biens[portefeuille\|allProperties]` · `messagerie` |
| hôte | `tableau-de-bord` · `mes-biens[mes-biens\|myProperties]` · `reservations[mes-biens\|bookings]` · `messagerie` |
| prestataire | `tableau-de-bord` · `maintenance[tete\|interventions]` · `messagerie` · `documents[tete\|documents]` |
| plateforme | comme admin-agence |

- **Les 32 sont accessibles, aucune n'est dans « Aussi … »**, aucune n'est cadenassée
  (`PRO_ROUTES` = `/app/overview/agency`, `/app/owners` seulement, `lib/access/pro-features.ts:35-61`).
  La règle « destination suivante » (A6) est donc une garde pour l'avenir (persona ajouté, prédicat
  resserré, cadenas élargi), éprouvée sur des dispositions synthétiques.
- **Libellés trop longs pour un onglet** (`nav.sidebar` fr) : `dashboard` « Tableau de bord »,
  `leads` « Demandes de contact », `myFavorites` « Mes favoris », `myVisits` « Mes visites »,
  `myBookings` « Mes réservations ». Les autres tiennent : « Messagerie », « Paiements »,
  « Interventions », « Mes biens », « Biens », « Documents » (A7).
- **« Messagerie » est un onglet des huit personas** — c'est ce qui permet de retirer le bouton
  flottant de `/app` (A3) ; une garde le fige (tâche 1).

### R7 — Les compteurs

- Calculés DANS `AppSidebar` (`AppSidebar.tsx:379-408` sur l'arbre relevé ; TCK-2479 les réécrit avec
  `isError`, plan TCK-2479 tâche 4 étape 7) : `countersToPoll` (`:240-248`) n'arme qu'un compteur dont
  l'entrée est rendue et non cadenassée. Libellés accessibles : `nav.sidebar.counters.<clé>`, ou
  `nav.admin.pendingBadge` pour les deux files de modération (`:51-54`, `:137-138`).
- Sous `md`, la barre latérale de bureau est `hidden md:block` mais **montée** : ses compteurs sondent
  déjà. Le tiroir ouvert en ajoute un second jeu d'observateurs (mêmes clés).
- `useUnreadCount` (`chat-widget/useUnreadCount.ts`) et les deux hooks `usePendingVisitsCount`,
  `useUnhandledLeadsCount` portent chacun leur `refetchInterval` (30-60 s) : avec TanStack v5, chaque
  observateur arme SON minuteur — une observation de plus peut doubler la cadence réelle (à mesurer,
  tâche 5).

---

## Ce qu'on suppose (à re-mesurer avant chaque tâche)

**TCK-2479 mergé sur `dev`** (son plan, `docs/plans/2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md`) :

- `Disposition` porte `priorites: readonly NavCounterKey[]` (obligatoire) et `demarrer?: ModeDemarrer` ;
  la disposition d'admin est une `BASE_ADMIN` (`Omit<Disposition, 'priorites' | 'demarrer'>`) étalée
  par `'admin-agence'` et `plateforme` ;
- `AppSidebar` calcule `counters` avec la règle « `isError` → 0 » (`total(q)`, `avisEnErreur`,
  `biensEnErreur`), puis `pastillesATraiter(entrees, counters, menu.priorites)` ; il monte
  `BandeATraiter` et `DemarrerDeLEspace` ;
- `src/components/layout/styles-de-la-barre.ts` exporte `FOCUS_RING` et `STYLE_TITRE` ;
- `nav.sidebar.counters.unhandledLeads` existe dans les trois fichiers (le badge des demandes avait un
  nom accessible manquant, R1 du plan 2479).

Si l'un manque : prendre l'arbre tel qu'il est, déplacer le bloc des compteurs TEL QUEL (tâche 2), et
garder `FOCUS_RING` local à la barre ; l'écrire.

**TCK-2480 (personnalisation), dans un ordre ou dans l'autre** — son plan s'écrit en parallèle :

- il ne vit qu'à partir de `md` (mode icônes seules entre `md` et `lg`, cookie lu par le layout) : la
  barre d'onglets et le tiroir (qui rend l'`AppSidebar` pleine, sous `md`) n'en dépendent pas ;
- ses épingles déplacent des entrées dans un groupe (« Épinglés ») : `ongletsDuMenu` cherche par
  identifiant dans TOUS les groupes du persona, il n'est pas affecté. Les onglets ne suivent pas les
  épingles (choix des onglets par l'utilisateur : hors périmètre du ticket) ;
- **s'il est mergé AVANT** : l'appel à `composerMenu` d'`AppSidebar` porte ses préférences ; la tâche 2
  le déplace tel quel dans `useMenuDeLEspace`, avec `personaDeLaCoque`, `usePreferencesDuMenu` et
  `prefsDe`. `AppSidebar` ne garde que le rendu (épingles, `GroupeDuMenu`, mode icônes). **S'il est
  mergé APRÈS** : il posera ces lignes dans `useMenuDeLEspace` et non plus dans `AppSidebar`. Son plan
  le prévoit (« Croisement avec TCK-2481 », confirmé par `plan-2480` le 2026-11-05).
- **Forme confirmée par `plan-2480`** : `composerMenu(ctx, persona, disposition?, preferences = {})`
  ajoute EN TÊTE un groupe `id: 'epingles'` et un champ `MenuCompose.epingles`. Les entrées épinglées
  quittent leur groupe d'origine ; aucune destination n'est perdue ni ajoutée. Ni le tiroir ni la barre
  sous `md` ne passent jamais en mode icônes.
- **Conséquence sur les onglets, si 2480 est sur `dev`** : sur le menu AVEC préférences, la réserve
  d'`ongletsDuMenu` commencerait par les épingles. Ce ne serait plus « la destination suivante de sa
  disposition » (arbitrage 6), et le remplacement dépendrait des choix de l'utilisateur. Les onglets se
  lisent donc sur le menu SANS préférences : `useMenuDeLEspace` renvoie en plus
  `groupesDeLaDisposition = composerMenu(ctx, persona).groupes` passés au cadenas (fonction pure,
  second appel bon marché), et `BarreDOnglets` passe ceux-là à `ongletsDuMenu`. `entrees` (pour
  `resolveActiveHref`) reste celui du menu rendu : les deux contiennent les mêmes destinations.
  Ajouter alors à `onglets.test.ts` un cas qui épingle `documents` chez le client, retire `favoris`
  de ses onglets déclarés, et attend toujours la destination suivante de la disposition. Ablation :
  passer les groupes avec préférences → le cas rougit. Sans 2480, `groupesDeLaDisposition ===
  groupes` et rien de ceci n'est à faire.

---

## Arbitrages (validés par la session le 2026-11-05, par délégation du porteur)

1. **La barre est un enfant flex de la coque, pas `position: fixed` + rembourrage.** La coque `h-dvh`
   ne défile pas (R4) : le dernier enfant de la colonne reste au bas du viewport visible, et le
   `<main>` rétrécit de la hauteur EXACTE de la barre — aucun nombre recopié dans un `pb-*` qu'un
   changement de hauteur ferait mentir. Les barres `sticky bottom-0` des pages (formulaire de bien)
   restent au-dessus d'elle. Sous `md:hidden`, la barre est `display: none` : ni barre ni réserve à
   768 (AC1).
2. **Zone sûre : `pb-[env(safe-area-inset-bottom)]` écrit maintenant, inerte aujourd'hui.** Aucun
   `viewport-fit=cover` (R5) et le porteur a reporté sa pose à un rendu sur iPhone réel : ce ticket ne
   le pose pas. La hauteur de la barre vit dans UNE variable, `--barre-onglets-hauteur`
   (`calc(3.5rem + env(safe-area-inset-bottom))`), lue par la barre, la messagerie compacte et le dock.
3. **Le bouton flottant « Messagerie » ne se rend plus sur `/app`** (hors `/app/messages` et plein
   écran, où il est déjà absent). La barre porte « Messagerie » chez les huit personas (garde,
   tâche 1) : deux portes vers la même page, l'une posée sur l'autre, n'apportent rien. Le lanceur de
   bureau (dès `md`) ne change pas. Une seule règle, `porteLaBarreDOnglets(pathname)`, à côté
   d'`estPleinEcran`, lue par la coque ET par le widget.
4. **Le dock flottant passe au-dessus de la barre** : sous `md`, la coque qui porte la barre
   (`data-barre-onglets`) redéfinit `--floating-dock-base` à `16px + --barre-onglets-hauteur`. Concerne
   la barre d'actions groupées de « Mes biens » (R4). Une règle CSS, pas de prop.
5. **La messagerie compacte se retire de la hauteur de la barre** (`MessagesPage.tsx:146-147`, sous
   `md` seulement). La barre reste visible dans une conversation ouverte : la masquer demanderait un
   canal page → coque pour un gain discutable ; à revoir si le porteur le demande.
6. **Remplacement d'un onglet** : « la destination suivante de sa disposition » = **la première entrée
   du menu rendu du persona, dans l'ordre de sa disposition (groupes, puis « Plus »), qui n'est pas
   déjà un onglet déclaré** — jamais une entrée de « Aussi … » (un autre profil), jamais une entrée
   cadenassée. Elle prend la PLACE de l'onglet manquant. S'il n'y a plus de candidate : un onglet de
   moins, jamais une case vide ni un cadenas.
7. **Libellés courts** sous `nav.sidebar.onglets.*` pour cinq destinations : `tableau-de-bord` →
   « Accueil », `favoris` → « Favoris », `visites` → « Visites », `demandes` → « Demandes »,
   `reservations` → « Réservations » (les mots du ticket). Les autres gardent le libellé de leur entrée,
   persona compris (« Interventions », « Biens »). Un onglet de remplacement au libellé long est
   tronqué (`truncate`) ; son nom accessible reste entier.
8. **Les compteurs de la barre sont ceux du menu** : la tâche 2 sort leur calcul d'`AppSidebar` dans
   `useCompteursDuMenu` — mêmes hooks, mêmes clés, même règle « 0 sur erreur ». La barre ne sonde que
   sous `md` (`useMatchesMaxWidth(767)`, `actif`) : au-dessus, elle est masquée et ne coûte rien. Sous
   `md`, elle ajoute un observateur par compteur de ses onglets ; le coût réel se MESURE (tâche 5). S'il
   double la cadence, l'écrire et proposer un ticket de suite (un fournisseur de compteurs dans la
   coque) — pas dans ce lot.
9. **Ordre du DOM : la barre APRÈS le `<main>`**, comme à l'écran (WCAG 1.3.2, 2.4.3). Le lien
   d'évitement reste le premier focalisable et vise toujours le `<main>` ; la barre est un repère
   `navigation` nommé (« Accès rapide »), atteignable par la liste des repères.
10. **Retour du focus explicite** : `finalFocus={refMenu}` sur `SheetContent` — au doigt, Safari iOS ne
    focalise pas le bouton touché, et le défaut de Base UI rendrait le focus à `body` (R1).
11. **« Menu » ne porte pas de compteur.** La bande « À traiter » (TCK-2479) est dans le tiroir ; un
    total sur « Menu » dupliquerait les onglets. Hors ticket.
12. **Onglet actif** : `aria-current="page"`, libellé en `font-semibold` et un trait de 2 px en haut de
    l'onglet (une FORME, pas une teinte). Il se résout sur TOUTES les entrées du menu, comme la barre
    latérale (`resolveActiveHref`) : sur une sous-page d'une entrée qui n'est pas un onglet, aucun
    onglet ne s'allume à tort.

---

## AC → preuve

| AC | Tâche | Test | Ablation | Navigateur |
|---|---|---|---|---|
| AC1 — à 390, chaque persona voit ses quatre onglets et « Menu » ; à 768, ni barre ni réserve | 1, 3, 4 | `onglets.test.ts` (table pure) ; `BarreDOnglets.test.tsx` (montée, huit personas) ; `CoqueHauteur.test.tsx` (sœur du contenu, `md:hidden`, `<main>` sans `pb-`) | T1-1..4, T3-3, T4-1 | T5 étape 3 |
| AC2 — à 360 et 390, dernier focalisable de `/app/profile` et pagination de `/app/properties` atteignables au-dessus de la barre | 4, 5 | `CoqueHauteur.test.tsx` (structure) — la preuve est au navigateur | T4-1 | **T5 étape 4** |
| AC3 — aucun burger sous `md` ; « Menu » ouvre le tiroir et rend le focus à l'onglet | 3 | `AppShell.barre-d-onglets.test.tsx` ; `AppTopbar.a11y.test.tsx` | T3-1, T3-2 | T5 étape 5 |
| AC4 — sur `/publish` (et `/app/properties/new`), pas de barre | 3 | `AppShell.barre-d-onglets.test.tsx` ; `plein-ecran.test.ts` | T3-4 | T5 étape 6 |

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| Modifier `takussan-web/src/lib/navigation/dispositions.ts` | champ `onglets` | 1 |
| Créer `takussan-web/src/lib/navigation/onglets.ts` | `ongletsDuMenu`, `LIBELLES_COURTS`, `ONGLETS_AU_PLUS` | 1 |
| Créer `takussan-web/src/lib/navigation/__tests__/onglets.test.ts` | garde + table + remplacement | 1 |
| Modifier `takussan-web/src/lib/navigation/__tests__/composer-menu.test.ts` | `onglets: []` aux littéraux `Disposition` | 1 |
| Créer `takussan-web/src/components/layout/useMenuDeLEspace.ts` | persona, menu composé, cadenas | 2 |
| Créer `takussan-web/src/components/layout/useCompteursDuMenu.ts` | `countersToPoll`, `COMPTEURS_DE_MODERATION`, `useCompteursDuMenu` | 2 |
| Créer `takussan-web/src/components/layout/__tests__/useCompteursDuMenu.test.tsx` | sondage armé par les entrées, `actif` | 2 |
| Modifier `takussan-web/src/components/layout/AppSidebar.tsx` | appelle les deux hooks | 2 |
| Créer `takussan-web/src/components/layout/BarreDOnglets.tsx` | la barre | 3 |
| Modifier `takussan-web/src/components/layout/plein-ecran.ts` | `porteLaBarreDOnglets` | 3 |
| Modifier `takussan-web/src/components/layout/AppShell.tsx` | monte la barre, `finalFocus`, retire le burger | 3 |
| Modifier `takussan-web/src/components/layout/AppTopbar.tsx` | burger et ses props retirés | 3 |
| Modifier `takussan-web/src/components/chat-widget/CorpsDuWidget.tsx` | pas de bouton flottant sur `/app` | 3 |
| Modifier `takussan-web/src/app/globals.css` | `--barre-onglets-hauteur` (3) ; dock (4) | 3, 4 |
| Modifier `takussan-web/src/messages/{fr,en,wo}.json` | `nav.sidebar.onglets.*` | 3 |
| Créer `takussan-web/src/components/layout/__tests__/BarreDOnglets.test.tsx` | AC1, a11y, compteurs, sondage | 3 |
| Créer `takussan-web/src/components/layout/__tests__/AppShell.barre-d-onglets.test.tsx` | AC3, AC4, ordre | 3 |
| Créer `takussan-web/src/components/layout/__tests__/plein-ecran.test.ts` | la règle | 3 |
| Modifier tests : `AppShell.menu-et-credits`, `AppSidebar.section-agence`, `AppTopbar.a11y`, `AppTopbar.responsive`, `src/test/__tests__/portees-sombres`, `AppShell.accueils-vus-une-lecture.tck-1766`, `AppShell.bienvenue`, `chat-widget/__tests__/ChatWidget` | burger → « Menu » ; props retirées ; mocks | 3 |
| Modifier `takussan-web/src/components/messages/MessagesPage.tsx` (+ son test) | cadre compact moins la barre | 4 |
| Modifier `takussan-web/src/components/layout/__tests__/CoqueHauteur.test.tsx` | la réserve, structurelle | 4 |
| Modifier `docs/backlog/tickets/…/TCK-2481-barre-d-onglets-mobile.md` | statut, notes, mesure | 0, 5 |

**Ordre :** séquentiel (1 → 5). Les tâches 2 et 3 touchent `AppSidebar`/`AppShell`, partagés avec
TCK-2480 : relire ces fichiers juste avant.

---

### Tâche 0 : branche et statut

- [ ] **Étape 1 :** `git switch dev && git pull && git switch -c feat/barre-d-onglets-tck-2481`.
- [ ] **Étape 2 :** re-mesurer R1, R4, R6, R7 et « Ce qu'on suppose » (`grep -n priorites
  takussan-web/src/lib/navigation/dispositions.ts`, `ls takussan-web/src/components/layout/styles-de-la-barre.ts`,
  `grep -n "finalFocus\|md:hidden" takussan-web/src/components/layout/App*.tsx`). Écrire les écarts.
- [ ] **Étape 3 :** dans le ticket, `status: doing`, `updated:` du jour ;
  `node docs/backlog/ranger-tickets.mjs`. Commit : `docs(backlog): TCK-2481 en cours`.

---

### Tâche 1 : le champ `onglets`, sa garde et `ongletsDuMenu` (fonction pure)

**Fichiers :** `dispositions.ts`, `onglets.ts` (créé), `__tests__/onglets.test.ts` (créé),
`__tests__/composer-menu.test.ts`.

**Interfaces :**
- Produit : `Disposition.onglets: readonly IdDestination[]` (obligatoire) ;
  `ONGLETS_AU_PLUS = 4` ; `LIBELLES_COURTS: Partial<Record<IdDestination, string>>` ;
  `ongletsDuMenu<E extends EntreeComposee & { readonly locked?: boolean }>(groupes: readonly { readonly id: string; readonly entrees: readonly E[] }[], onglets: readonly IdDestination[]): E[]`.

- [ ] **Étape 1 : écrire le test qui échoue** — `src/lib/navigation/__tests__/onglets.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CATALOGUE, type IdDestination } from '../catalogue';
import { composerMenu } from '../composer-menu';
import { DISPOSITIONS } from '../dispositions';
import { ONGLETS_AU_PLUS, ongletsDuMenu } from '../onglets';
import { PERSONAS, type Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2481 (ADR-0089 §3) — les onglets de la barre mobile, lus dans le menu COMPOSÉ du persona.
 *
 * Les comptes sont RECOPIÉS de `dispositions-validees.test.ts`, pas importés : deux tests qui
 * partagent leurs données se valident l'un l'autre.
 */
const TOUTES_LES_PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

const COMPTES: Record<Persona, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
  plateforme: { roles: ['customer', 'super_admin'], capacites: [], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
};

/** `[id, clé de libellé]` de chaque onglet, lus sur le menu composé. */
function lire(persona: Persona, ctx = COMPTES[persona], onglets: readonly IdDestination[] = DISPOSITIONS[persona].onglets) {
  return ongletsDuMenu(composerMenu(ctx, persona).groupes, onglets).map((o) => [o.id, o.labelKey]);
}

describe('TCK-2481 — la garde des onglets', () => {
  const IDS = new Set<string>(CATALOGUE.map((d) => d.id));

  it.each(PERSONAS)('%s : de un à quatre onglets, existants, sans doublon, « Messagerie » comprise', (persona) => {
    const { onglets } = DISPOSITIONS[persona];
    expect(onglets.length).toBeGreaterThan(0);
    expect(onglets.length).toBeLessThanOrEqual(ONGLETS_AU_PLUS);
    for (const id of onglets) expect(IDS.has(id), `${persona} — ${id}`).toBe(true);
    expect(new Set(onglets).size).toBe(onglets.length);
    // Arbitrage 3 : le bouton flottant « Messagerie » quitte `/app` — la barre doit la porter.
    expect(onglets).toContain('messagerie');
  });
});

describe('TCK-2481 — AC1 : les quatre onglets de chaque persona (table du ticket)', () => {
  const ADMIN: [string, string][] = [
    ['tableau-de-bord', 'onglets.accueil'], ['demandes', 'onglets.demandes'], ['mes-biens', 'allProperties'], ['messagerie', 'messaging'],
  ];
  it.each([
    ['client', [['tableau-de-bord', 'onglets.accueil'], ['favoris', 'onglets.favoris'], ['visites', 'onglets.visites'], ['messagerie', 'messaging']]],
    ['locataire', [['tableau-de-bord', 'onglets.accueil'], ['paiements', 'payments'], ['maintenance', 'interventions'], ['messagerie', 'messaging']]],
    ['bailleur', [['tableau-de-bord', 'onglets.accueil'], ['mes-biens', 'myProperties'], ['demandes', 'onglets.demandes'], ['messagerie', 'messaging']]],
    ['agent', [['tableau-de-bord', 'onglets.accueil'], ['demandes', 'onglets.demandes'], ['visites', 'onglets.visites'], ['messagerie', 'messaging']]],
    ['admin-agence', ADMIN],
    ['hote', [['tableau-de-bord', 'onglets.accueil'], ['mes-biens', 'myProperties'], ['reservations', 'onglets.reservations'], ['messagerie', 'messaging']]],
    ['prestataire', [['tableau-de-bord', 'onglets.accueil'], ['maintenance', 'interventions'], ['messagerie', 'messaging'], ['documents', 'documents']]],
    ['plateforme', ADMIN],
  ] as [Persona, [string, string][]][])('%s', (persona, attendus) => {
    expect(lire(persona)).toEqual(attendus);
  });
});

describe('TCK-2481 — un onglet inaccessible cède sa place, jamais cadenassé', () => {
  it('inaccessible : la première destination de la disposition qui n’est pas déjà un onglet, à SA place', () => {
    // `commissions` n'est pas ouverte au client ; sa disposition commence par tableau de bord,
    // messagerie (déjà onglets), puis « Mes favoris ».
    expect(lire('client', COMPTES.client, ['tableau-de-bord', 'commissions', 'visites', 'messagerie']).map(([id]) => id))
      .toEqual(['tableau-de-bord', 'favoris', 'visites', 'messagerie']);
  });

  it('cadenassé : remplacé, jamais rendu', () => {
    const groupes = composerMenu(COMPTES.agent, 'agent').groupes.map((g) => ({
      ...g,
      entrees: g.entrees.map((e) => ({ ...e, locked: e.href === '/app/leads' })),
    }));
    const onglets = ongletsDuMenu(groupes, DISPOSITIONS.agent.onglets);
    expect(onglets.map((o) => o.id)).toEqual(['tableau-de-bord', 'taches', 'visites', 'messagerie']);
    expect(onglets.some((o) => o.locked)).toBe(false);
  });

  it('jamais pris dans « Aussi … » : la destination d’un autre profil de l’espace ne devient pas un onglet', () => {
    // Admin ET bailleur de la même agence : « Paiements » n'est ouverte que par le profil bailleur.
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] };
    expect(lire('admin-agence', ctx, ['tableau-de-bord', 'paiements', 'mes-biens', 'messagerie']).map(([id]) => id))
      .toEqual(['tableau-de-bord', 'vue-agence', 'mes-biens', 'messagerie']);
  });

  it('moins de destinations que d’onglets : un onglet de moins, aucune case vide', () => {
    const tete = composerMenu(COMPTES.client, 'client').groupes.filter((g) => g.id === 'tete');
    expect(ongletsDuMenu(tete, ['tableau-de-bord', 'commissions', 'visites', 'messagerie']).map((o) => o.id))
      .toEqual(['tableau-de-bord', 'messagerie']);
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec**
  Run : `npx vitest run src/lib/navigation/__tests__/onglets.test.ts` — attendu : FAIL (module
  `../onglets` absent, `onglets` inconnu de `Disposition`).

- [ ] **Étape 3 : `dispositions.ts`** — dans `interface Disposition`, après `priorites` (TCK-2479) :

```ts
  /**
   * TCK-2481 (ADR-0089 §3) — les onglets de la barre mobile (sous `md`), DANS CET ORDRE, suivis de
   * « Menu ». Quatre au plus ; « Messagerie » toujours (le bouton flottant quitte `/app`). Un onglet
   * que le menu du persona ne rend pas cède sa place à la destination suivante de cette disposition
   * (`ongletsDuMenu`). Obligatoire : les onglets d'un persona se décident, ils ne s'oublient pas.
   */
  readonly onglets: readonly IdDestination[];
```

puis une ligne par persona (table du ticket) :

```ts
// BASE_ADMIN (partagée par 'admin-agence' et plateforme) :
  onglets: ['tableau-de-bord', 'demandes', 'mes-biens', 'messagerie'],
// client :
    onglets: ['tableau-de-bord', 'favoris', 'visites', 'messagerie'],
// locataire :
    onglets: ['tableau-de-bord', 'paiements', 'maintenance', 'messagerie'],
// bailleur :
    onglets: ['tableau-de-bord', 'mes-biens', 'demandes', 'messagerie'],
// agent :
    onglets: ['tableau-de-bord', 'demandes', 'visites', 'messagerie'],
// hote :
    onglets: ['tableau-de-bord', 'mes-biens', 'reservations', 'messagerie'],
// prestataire :
    onglets: ['tableau-de-bord', 'maintenance', 'messagerie', 'documents'],
```

(Si `BASE_ADMIN` est typée `as const satisfies Omit<Disposition, 'priorites' | 'demarrer'>`, le champ y
est exigé : c'est voulu.)

- [ ] **Étape 4 : créer `src/lib/navigation/onglets.ts`**

```ts
import type { IdDestination } from './catalogue';
import type { EntreeComposee } from './composer-menu';

/**
 * TCK-2481 (ADR-0089 §3) — les onglets de la barre mobile de `/app`.
 *
 * Un onglet n'est pas une destination de plus : c'est une entrée DÉJÀ rendue par le menu composé du
 * persona (`composerMenu`), donc déjà jugée par le catalogue — même accès, même espace suspendu. La
 * barre n'ouvre rien que le tiroir n'ouvre pas.
 */

/** Quatre onglets au plus, puis « Menu » : cinq cases de 72 px à 360. */
export const ONGLETS_AU_PLUS = 4;

/**
 * Libellés courts, clé sous `nav.sidebar.onglets` — les mots du ticket. Une destination absente garde
 * le libellé de son entrée (persona compris : « Interventions », « Biens »).
 */
export const LIBELLES_COURTS: Partial<Record<IdDestination, string>> = {
  'tableau-de-bord': 'accueil',
  favoris: 'favoris',
  visites: 'visites',
  demandes: 'demandes',
  reservations: 'reservations',
};

/** Le complément « Aussi … » (`composerMenu`) : les destinations d'un AUTRE profil de l'espace. */
const GROUPE_COMPLEMENT = 'aussi';

interface GroupeDEntrees<E> {
  readonly id: string;
  readonly entrees: readonly E[];
}

function abreger<E extends EntreeComposee>(entree: E): E {
  const court = LIBELLES_COURTS[entree.id];
  return court ? { ...entree, labelKey: `onglets.${court}` } : entree;
}

/**
 * Les onglets du persona, dans l'ordre de sa disposition.
 *
 * Candidates : les entrées des groupes rendus, dans l'ordre (groupes de la disposition, puis
 * « Plus »), hors « Aussi … » et hors cadenas. Un onglet déclaré que rien ne rend cède SA place à la
 * première candidate qui n'est pas déjà un onglet déclaré — « la destination suivante de sa
 * disposition » (TCK-2481, arbitrage 6). Plus de candidate : un onglet de moins, jamais une case
 * vide, jamais un cadenas.
 */
export function ongletsDuMenu<E extends EntreeComposee & { readonly locked?: boolean }>(
  groupes: readonly GroupeDEntrees<E>[],
  onglets: readonly IdDestination[],
): E[] {
  const candidates = groupes
    .filter((g) => g.id !== GROUPE_COMPLEMENT)
    .flatMap((g) => g.entrees)
    .filter((e) => !e.locked);
  const parId = new Map<string, E>(candidates.map((e) => [e.id, e]));
  const declares = new Set<string>(onglets);
  const reserve = candidates.filter((e) => !declares.has(e.id));
  return onglets.slice(0, ONGLETS_AU_PLUS).flatMap((id) => {
    const entree = parId.get(id) ?? reserve.shift();
    return entree ? [abreger(entree)] : [];
  });
}
```

- [ ] **Étape 5 : `composer-menu.test.ts`** — ajouter `onglets: []` aux littéraux `Disposition` (l. 55
  et 169 sur l'arbre relevé, à côté de `priorites: []`). `npx tsc --noEmit` liste tout autre littéral
  à compléter de même (tests de TCK-2479 compris).

- [ ] **Étape 6 : lancer, constater le vert** — `npx vitest run src/lib/navigation` : PASS (onglets,
  composer-menu, dispositions-validees, arborescence inchangés).

- [ ] **Étape 7 : ablations** (un script, mutation → test → restauration) :
  1. Retirer `.filter((g) => g.id !== GROUPE_COMPLEMENT)` → « jamais pris dans Aussi » rougit
     (`paiements` devient le 2ᵉ onglet).
  2. Retirer `.filter((e) => !e.locked)` → « cadenassé : remplacé » rougit.
  3. `const entree = parId.get(id);` (sans `?? reserve.shift()`) → « inaccessible : … à SA place »
     rougit (trois onglets).
  4. Donner un 5ᵉ onglet à l'agent, puis retirer `'messagerie'` du prestataire → la garde rougit,
     chaque fois.
  Puis `git diff` : aucune mutation restante.

- [ ] **Étape 8 :** `npx tsc --noEmit && npm run lint`, commit —
  `feat(web): les onglets mobiles de chaque persona et leur garde (TCK-2481)`.

---

### Tâche 2 : le menu de l'espace et ses compteurs sortent d'`AppSidebar` (sans changement visible)

Refactorisation PURE : les tests existants d'`AppSidebar` et d'`AppShell` sont le filet ; aucun ne
change dans cette tâche.

**Fichiers :** `useMenuDeLEspace.ts`, `useCompteursDuMenu.ts` (créés), `AppSidebar.tsx`,
`__tests__/useCompteursDuMenu.test.tsx` (créé).

**Interfaces :**
- Produit : `useMenuDeLEspace(p: ParametresDuMenu): MenuDeLEspace` ; types `EntreeRendue`,
  `GroupeRendu` ; `useCompteursDuMenu(entrees, { agencyIsStandard?, actif? }): Record<NavCounterKey, number>` ;
  `countersToPoll` et `COMPTEURS_DE_MODERATION` déplacés (ré-exportés par `AppSidebar` pour ses tests).

- [ ] **Étape 1 : le test du hook des compteurs** — `src/components/layout/__tests__/useCompteursDuMenu.test.tsx` :

```tsx
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCompteursDuMenu } from '../useCompteursDuMenu';

const appels = vi.hoisted(() => ({
  messages: [] as { enabled?: boolean }[],
  visites: [] as { enabled?: boolean }[],
  demandes: [] as { enabled?: boolean }[],
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (o: { enabled?: boolean }) => {
    appels.messages.push(o);
    return o.enabled ? 3 : 0;
  },
}));
vi.mock('@/lib/queries/visits', () => ({
  usePendingVisitsCount: (o: { enabled?: boolean }) => {
    appels.visites.push(o);
    return { data: { meta: { total: 2 } } };
  },
}));
vi.mock('@/lib/queries/contact-leads', () => ({
  useUnhandledLeadsCount: (o: { enabled?: boolean }) => {
    appels.demandes.push(o);
    return { data: { meta: { total: 5 } } };
  },
}));

const ENTREES = [
  { counterKey: 'unreadMessages' as const },
  { counterKey: 'pendingVisits' as const },
  { counterKey: 'unhandledLeads' as const, locked: true },
];

function enveloppe({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  appels.messages.length = 0;
  appels.visites.length = 0;
  appels.demandes.length = 0;
  vi.stubGlobal('fetch', vi.fn());
});

describe('TCK-2481 — useCompteursDuMenu, la règle de sondage du menu partagée avec la barre d’onglets', () => {
  it('ne sonde que les compteurs des entrées rendues et non cadenassées (TCK-377)', () => {
    const { result } = renderHook(() => useCompteursDuMenu(ENTREES), { wrapper: enveloppe });
    expect(appels.messages.at(-1)).toEqual({ enabled: true });
    expect(appels.visites.at(-1)).toEqual({ enabled: true });
    expect(appels.demandes.at(-1)).toEqual({ enabled: false });
    expect(result.current.unreadMessages).toBe(3);
    expect(result.current.pendingVisits).toBe(2);
  });

  it('`actif: false` (la barre d’onglets, masquée dès md) : aucun sondage', () => {
    renderHook(() => useCompteursDuMenu(ENTREES, { actif: false }), { wrapper: enveloppe });
    expect(appels.messages.at(-1)).toEqual({ enabled: false });
    expect(appels.visites.at(-1)).toEqual({ enabled: false });
    expect(appels.demandes.at(-1)).toEqual({ enabled: false });
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec** — `npx vitest run src/components/layout/__tests__/useCompteursDuMenu.test.tsx`
  → FAIL (module absent).

- [ ] **Étape 3 : créer `src/components/layout/useCompteursDuMenu.ts`** — `COMPTEURS_DE_MODERATION`
  et `countersToPoll` y sont DÉPLACÉS d'`AppSidebar.tsx` avec leurs docblocks (TCK-377, TCK-2478), mot
  pour mot ; le bloc des compteurs est déplacé TEL QUE TCK-2479 l'a mergé (le code mergé fait foi ;
  seul `counted` devient `sondes`). Forme attendue :

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useUnreadCount } from '@/components/chat-widget/useUnreadCount';
import { usePendingVisitsCount } from '@/lib/queries/visits';
import { useUnhandledLeadsCount } from '@/lib/queries/contact-leads';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import {
  AGENCY_QUEUE_REFETCH_INTERVAL_MS,
  AGENCY_QUEUE_STALE_TIME_MS,
  propertyModerationCountQueryOptions,
} from '@/lib/queries/agency-queues';
import type { NavCounterKey } from '@/lib/navigation/types';

/** Compteurs dont le libellé accessible vit sous `nav.admin` (`pendingBadge`), pas `nav.sidebar`. */
export const COMPTEURS_DE_MODERATION: ReadonlySet<NavCounterKey> = new Set([
  'reviewModeration',
  'propertyModeration',
]);

// …docblock TCK-377 / TCK-2478 de `countersToPoll`, déplacé tel quel…
export function countersToPoll(
  entrees: readonly { readonly counterKey?: NavCounterKey; readonly locked?: boolean }[],
): Set<NavCounterKey> {
  const keys = new Set<NavCounterKey>();
  for (const entree of entrees) {
    if (entree.counterKey && !entree.locked) keys.add(entree.counterKey);
  }
  return keys;
}

interface OptionsDesCompteurs {
  readonly agencyIsStandard?: boolean;
  /**
   * TCK-2481 — `false` : aucun sondage. La barre d'onglets est montée à toutes les largeurs mais
   * masquée dès `md` : elle n'y sonde rien. Les valeurs rendues valent alors 0 (ou le cache).
   */
  readonly actif?: boolean;
}

/**
 * TCK-2481 (ADR-0089 §5) — les compteurs du menu, sortis d'`AppSidebar` pour que la barre d'onglets
 * mobile lise LES MÊMES : mêmes hooks, mêmes clés de cache, même cadence, même règle « 0 pendant le
 * chargement ET sur une erreur » (TCK-2479). Un compteur n'est sondé que si une entrée rendue et non
 * cadenassée le porte (TCK-377).
 */
export function useCompteursDuMenu(
  entrees: readonly { readonly counterKey?: NavCounterKey; readonly locked?: boolean }[],
  { agencyIsStandard, actif = true }: OptionsDesCompteurs = {},
): Record<NavCounterKey, number> {
  const { token } = useAuth();
  const sondes = actif ? countersToPoll(entrees) : new Set<NavCounterKey>();
  const unreadMessages = useUnreadCount({ enabled: sondes.has('unreadMessages') });
  const pendingVisits = usePendingVisitsCount({ enabled: sondes.has('pendingVisits') });
  const unhandledLeads = useUnhandledLeadsCount({ enabled: sondes.has('unhandledLeads') });
  // TCK-649 — les deux files de modération : mêmes clés de cache que le tableau de bord d'agence.
  const { data: avisEnAttente, isError: avisEnErreur } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () => fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && sondes.has('reviewModeration'),
    refetchInterval: AGENCY_QUEUE_REFETCH_INTERVAL_MS,
    staleTime: AGENCY_QUEUE_STALE_TIME_MS,
  });
  const optionsBiens = propertyModerationCountQueryOptions(token ?? null, agencyIsStandard);
  const { data: biensEnAttente, isError: biensEnErreur } = useQuery({
    ...optionsBiens,
    enabled: optionsBiens.enabled && sondes.has('propertyModeration'),
  });
  // TCK-2479 — 0 sur une erreur, premier échec ou relecture ratée (react-query garde l'ancien `data`).
  const total = (q: { readonly data?: { readonly meta?: { readonly total?: number } }; readonly isError?: boolean }) =>
    q.isError ? 0 : (q.data?.meta?.total ?? 0);
  return {
    unreadMessages,
    pendingVisits: total(pendingVisits),
    unhandledLeads: total(unhandledLeads),
    reviewModeration: avisEnErreur ? 0 : (avisEnAttente?.pending_count ?? 0),
    propertyModeration: biensEnErreur ? 0 : (biensEnAttente ?? 0),
  };
}
```

- [ ] **Étape 4 : créer `src/components/layout/useMenuDeLEspace.ts`** — le bloc d'`AppSidebar` qui va
  de `useAccesAdminOuRepli` à `const entrees` (l. 348-376 sur l'arbre relevé), déplacé tel quel
  (préférences de TCK-2480 comprises s'il est déjà mergé) :

```ts
'use client';

import { useMyCapabilities } from '@/hooks/useCan';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import { isAdmin, isAgent, isSuperAdmin } from '@/lib/roles';
import { composerMenu, type EntreeComposee, type GroupeCompose, type MenuCompose } from '@/lib/navigation/composer-menu';
import { resoudrePersona, type Persona } from '@/lib/navigation/personas';
import type { ProfileType } from '@/types/profile';
import type { User } from '@/types/user';

/** Une entrée rendue : celle du menu composé, plus le cadenas de l'agence `individual`. */
export type EntreeRendue = EntreeComposee & { readonly locked?: boolean };
export type GroupeRendu = GroupeCompose & { readonly entrees: readonly EntreeRendue[] };

export interface ParametresDuMenu {
  readonly user: User;
  readonly agencyIsStandard?: boolean;
  readonly typeProfilActif?: ProfileType | null;
  readonly agencySuspended?: boolean;
}

export interface MenuDeLEspace {
  readonly persona: Persona;
  readonly menu: MenuCompose;
  readonly groupes: readonly GroupeRendu[];
  readonly entrees: readonly EntreeRendue[];
}

/**
 * TCK-2481 (ADR-0089 §2-4) — le menu de l'espace actif : persona, menu composé, cadenas. Sorti
 * d'`AppSidebar` pour que la barre latérale, le tiroir et la barre d'onglets mobile se dérivent de
 * la MÊME composition : un persona calculé deux fois finit par diverger.
 */
export function useMenuDeLEspace({
  user,
  agencyIsStandard,
  typeProfilActif,
  agencySuspended = false,
}: ParametresDuMenu): MenuDeLEspace {
  const accesAdmin = useAccesAdminOuRepli({ roles: user.roles, agencyId: user.agency_id, agencyIsStandard });
  // P152.03 — les capacités du profil actif, lues pour le seul personnel ; le super-admin passe tout.
  const lireCapacites = (isAgent(user.roles) || isAdmin(user.roles)) && !isSuperAdmin(user.roles);
  const { data: mesCapacites } = useMyCapabilities(undefined, lireCapacites);
  const capacites = lireCapacites ? (mesCapacites?.data.capabilities ?? null) : [];
  const persona = resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeProfilActif ?? null,
    agenceIndividuelle: accesAdmin.espaceIndividuel || agencyIsStandard === false,
  });
  const menu = composerMenu(
    { roles: user.roles, capacites, cheminsAdmin: accesAdmin.chemins, agenceSuspendue: agencySuspended },
    persona,
  );
  const verrouiller = (e: EntreeComposee): EntreeRendue => ({
    ...e,
    locked: isProRouteLocked(user, agencyIsStandard, e.href),
  });
  const groupes = menu.groupes.map((g) => ({ ...g, entrees: g.entrees.map(verrouiller) }));
  return { persona, menu, groupes, entrees: groupes.flatMap((g) => g.entrees) };
}
```

- [ ] **Étape 5 : `AppSidebar.tsx`** — remplacer le bloc déplacé (de `const { token } = useAuth();` à la
  fin de l'objet `counters`) par :

```ts
  // TCK-2481 — la composition du menu et ses compteurs, partagées avec la barre d'onglets mobile
  // (`BarreDOnglets`) : une seule composition, une seule règle de sondage (ADR-0089 §4-5).
  const { persona, menu, groupes, entrees } = useMenuDeLEspace({
    user,
    agencyIsStandard,
    typeProfilActif,
    agencySuspended,
  });
  const counters = useCompteursDuMenu(entrees, { agencyIsStandard });
```

  Le reste (bande de TCK-2479, solde, `activeHref`, rendu) est inchangé. Remplacer la définition locale
  d'`EntreeRendue` par `import { useMenuDeLEspace, type EntreeRendue } from './useMenuDeLEspace';`, celle
  de `COMPTEURS_DE_MODERATION` et de `countersToPoll` par
  `import { COMPTEURS_DE_MODERATION, useCompteursDuMenu } from './useCompteursDuMenu';` et
  `export { countersToPoll } from './useCompteursDuMenu';` (les tests l'importent d'`AppSidebar`).
  Retirer les imports que `npm run lint` déclare inutilisés.

- [ ] **Étape 6 : lancer, constater le vert** — le hook, puis le filet entier de la barre :
  `npx vitest run src/components/layout src/lib/navigation src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx`
  — attendu : PASS, **sans qu'aucun test existant n'ait été modifié**.

- [ ] **Étape 7 : ablations**
  1. Dans `useCompteursDuMenu`, `const sondes = countersToPoll(entrees);` (ignorer `actif`) → « `actif:
     false` … aucun sondage » rougit.
  2. Dans `countersToPoll`, retirer `&& !entree.locked` → « non cadenassées » rougit (ici) ET les tests
     AC6 d'`AppSidebar.test.tsx` (preuve que le filet voit le hook).

- [ ] **Étape 8 :** `npx tsc --noEmit && npm run lint`, commit —
  `refactor(web): le menu de l'espace et ses compteurs sortent de la barre latérale (TCK-2481)`.

---

### Tâche 3 : la barre d'onglets, « Menu », le burger retiré, le focus rendu

**Fichiers :** voir la carte (tâche 3).

**Interfaces :**
- Produit : `porteLaBarreDOnglets(pathname): boolean` (`plein-ecran.ts`) ;
  `BarreDOnglets(props: BarreDOngletsProps)` ; `AppTopbar({ user })` (props `onMenuToggle`, `menuOpen`
  retirées) ; variable CSS `--barre-onglets-hauteur`.

- [ ] **Étape 1 : les tests qui échouent**

`src/components/layout/__tests__/plein-ecran.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { porteLaBarreDOnglets } from '../plein-ecran';

describe('TCK-2481 — où la coque porte la barre d’onglets', () => {
  it.each([
    ['/app', true],
    ['/app/leases', true],
    ['/app/messages/12', true],
    ['/app/properties/new', false], // plein écran (TCK-631)
    ['/application', false],
    ['/publish', false], // hors coque : `src/app/publish/layout.tsx` ne monte pas `AppShell`
    ['/fr/properties', false],
    [null, false],
  ] as [string | null, boolean][])('%s → %s', (chemin, attendu) => {
    expect(porteLaBarreDOnglets(chemin)).toBe(attendu);
  });
});
```

`src/components/layout/__tests__/BarreDOnglets.test.tsx` — la barre seule, huit personas :

```tsx
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { ProfileType } from '@/types/profile';
import type { User, UserRole } from '@/types/user';
import { BarreDOnglets } from '../BarreDOnglets';

const etat = vi.hoisted(() => ({ chemin: '/app', nonLus: 0, appels: [] as { enabled?: boolean }[] }));
vi.mock('next/navigation', () => ({
  usePathname: () => etat.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (o: { enabled?: boolean }) => {
    etat.appels.push(o);
    return o.enabled ? etat.nonLus : 0;
  },
}));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));

/** Simule un viewport (patron de `MessagesPage.test.tsx`) : `(max-width: Npx)` vaut `largeur <= N`. */
function largeurDeFenetre(largeurPx: number): void {
  window.matchMedia = ((query: string) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    return {
      matches: max !== null && largeurPx <= Number(max[1]),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

interface Compte {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType;
  readonly agencyIsStandard?: boolean;
}
const COMPTES: Record<string, Compte> = {
  client: { roles: ['customer'] },
  locataire: { roles: ['customer', 'tenant'] },
  bailleur: { roles: ['customer', 'owner'], typeProfilActif: 'owner' },
  agent: { roles: ['customer', 'agent'] },
  'admin-agence': { roles: ['customer', 'agency_admin'] },
  hote: { roles: ['customer', 'agency_admin', 'owner'], agencyIsStandard: false },
  prestataire: { roles: ['customer', 'service_provider'] },
  plateforme: { roles: ['customer', 'super_admin'] },
};

function monter(persona: string, chemin = '/app') {
  etat.chemin = chemin;
  const compte = COMPTES[persona];
  const user = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles: compte.roles } as unknown as User;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <BarreDOnglets
          user={user}
          agencyIsStandard={compte.agencyIsStandard ?? true}
          typeProfilActif={compte.typeProfilActif ?? null}
          menuOuvert={false}
          onOuvrirMenu={vi.fn()}
          refMenu={createRef<HTMLButtonElement>()}
        />
      </QueryClientProvider>,
    ),
  );
}

const barre = () => screen.getByRole('navigation', { name: 'Accès rapide' });
const onglets = () => within(barre()).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

beforeEach(() => {
  etat.nonLus = 0;
  etat.appels.length = 0;
  largeurDeFenetre(1366);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});

describe('TCK-2481 — AC1 : quatre onglets par persona, puis « Menu »', () => {
  const ADMIN = [['Accueil', '/app'], ['Demandes', '/app/leads'], ['Biens', '/app/properties'], ['Messagerie', '/app/messages']];
  it.each([
    ['client', [['Accueil', '/app'], ['Favoris', '/app/favorites'], ['Visites', '/app/visits'], ['Messagerie', '/app/messages']]],
    ['locataire', [['Accueil', '/app'], ['Paiements', '/app/payments'], ['Interventions', '/app/maintenance'], ['Messagerie', '/app/messages']]],
    ['bailleur', [['Accueil', '/app'], ['Mes biens', '/app/properties'], ['Demandes', '/app/leads'], ['Messagerie', '/app/messages']]],
    ['agent', [['Accueil', '/app'], ['Demandes', '/app/leads'], ['Visites', '/app/visits'], ['Messagerie', '/app/messages']]],
    ['admin-agence', ADMIN],
    ['hote', [['Accueil', '/app'], ['Mes biens', '/app/properties'], ['Réservations', '/app/bookings'], ['Messagerie', '/app/messages']]],
    ['prestataire', [['Accueil', '/app'], ['Interventions', '/app/maintenance'], ['Messagerie', '/app/messages'], ['Documents', '/app/documents']]],
    ['plateforme', ADMIN],
  ] as [string, string[][]][])('%s', (persona, attendus) => {
    monter(persona);
    expect(onglets()).toEqual(attendus);
    const items = within(barre()).getAllByRole('listitem');
    expect(within(items.at(-1)!).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('la barre ne vit que sous md', () => {
    monter('agent');
    expect(barre()).toHaveClass('md:hidden');
  });
});

describe('TCK-2481 — l’onglet actif, lisible sans la couleur seule', () => {
  it('sous-page d’un onglet : il porte aria-current et l’indicateur, les autres rien', () => {
    monter('agent', '/app/leads/12');
    const demandes = within(barre()).getByRole('link', { name: 'Demandes' });
    expect(demandes).toHaveAttribute('aria-current', 'page');
    expect(demandes.querySelector('[data-slot="indicateur-onglet"]')).not.toBeNull();
    expect(barre().querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(barre().querySelectorAll('[data-slot="indicateur-onglet"]')).toHaveLength(1);
  });

  it('page hors onglets (`/app/leases`) : aucun onglet allumé — `/app` est une racine exacte', () => {
    monter('agent', '/app/leases');
    expect(barre().querySelectorAll('[aria-current]')).toHaveLength(0);
  });
});

describe('TCK-2481 — les compteurs, ceux du menu', () => {
  it('sous md : la pastille, et un nom accessible qui CONTIENT le libellé visible', () => {
    largeurDeFenetre(390);
    etat.nonLus = 3;
    monter('agent');
    const messagerie = within(barre()).getByRole('link', { name: 'Messagerie, 3 messages non lus' });
    expect(messagerie.querySelector('[data-slot="pastille-onglet"]')).toHaveTextContent('3');
    expect(messagerie.querySelector('[data-slot="pastille-onglet"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('à zéro : ni pastille ni mot de plus', () => {
    largeurDeFenetre(390);
    monter('agent');
    expect(within(barre()).getByRole('link', { name: 'Messagerie' })).toBeInTheDocument();
    expect(barre().querySelector('[data-slot="pastille-onglet"]')).toBeNull();
  });

  it('dès md (barre masquée) : aucun sondage', () => {
    largeurDeFenetre(1366);
    monter('agent');
    expect(etat.appels.length).toBeGreaterThan(0);
    for (const o of etat.appels) expect(o.enabled).toBe(false);
  });
});
```

`src/components/layout/__tests__/AppShell.barre-d-onglets.test.tsx` — la coque montée. En-tête de mocks
**recopié** d'`AppShell.menu-et-credits.test.tsx` (l. 19-50 : `useCan`, compteurs, solde,
impersonation, assistants, `MinimalProfileTriggerProvider`), sauf `next/navigation`, piloté :

```tsx
const nav = vi.hoisted(() => ({ chemin: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
// … mocks recopiés …

function monter(roles: UserRole[], chemin = '/app') {
  nav.chemin = chemin;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppShell user={user} agencyIsStandard>
            <p>contenu</p>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const boutonMenu = () =>
  within(screen.getByRole('navigation', { name: 'Accès rapide' })).getByRole('button', { name: 'Menu' });

describe('TCK-2481 — AC3 : aucun burger ; « Menu » ouvre le tiroir et rend le focus', () => {
  it('la barre haute ne porte plus « Ouvrir le menu »', () => {
    monter(['customer', 'agent']);
    expect(screen.queryByRole('button', { name: 'Ouvrir le menu' })).toBeNull();
  });

  it('au clavier : Entrée ouvre, `aria-expanded` suit, Échap rend le focus à « Menu »', async () => {
    const user = userEvent.setup();
    monter(['customer', 'agent']);
    const menu = boutonMenu();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('aria-haspopup', 'dialog');
    menu.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    // Le tiroir modal rend la barre `inert` : on relit le même nœud, pas un `getByRole`.
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(menu).toHaveFocus());
  });

  it('au doigt : l’appui ne focalise pas le bouton (Safari iOS), le tiroir lui rend quand même le focus', async () => {
    monter(['customer', 'agent']);
    const menu = boutonMenu();
    fireEvent.click(menu); // ne déplace PAS le focus, comme un appui sur iOS
    expect(menu).not.toHaveFocus();
    await screen.findByRole('dialog');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(menu).toHaveFocus());
  });
});

describe('TCK-2481 — AC4 : pas de barre en plein écran', () => {
  it('/app/properties/new : ni barre, ni réserve du dock', () => {
    const { container } = monter(['customer', 'agent'], '/app/properties/new');
    expect(screen.queryByRole('navigation', { name: 'Accès rapide' })).toBeNull();
    expect(container.querySelector('[data-barre-onglets]')).toBeNull();
  });
});

describe('TCK-2481 — ordre du document (arbitrage 9)', () => {
  it('la barre suit le <main> ; le lien d’évitement reste le premier focalisable', () => {
    const { container } = monter(['customer', 'agent']);
    const main = container.querySelector('main')!;
    const barre = screen.getByRole('navigation', { name: 'Accès rapide' });
    expect(main.compareDocumentPosition(barre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('a[href], button')).toHaveAttribute('href', '#contenu-principal');
  });
});
```

(Imports : `fireEvent, render, screen, waitFor, within` de Testing Library, `userEvent`, `withIntl`,
`ToastProvider`, `AppShell`, types `User`, `UserRole`.)

Dans `chat-widget/__tests__/ChatWidget.test.tsx`, bloc « visibility », après le cas `/app/properties` :

```tsx
  it('TCK-2481 — sur /app, pas de bouton flottant mobile : la barre d’onglets porte la messagerie', () => {
    usePathnameMock.mockReturnValue('/app/leases');
    render(wrap(<ChatWidget />));
    expect(screen.queryByTestId('chat-widget-mobile-fab')).toBeNull();
    expect(screen.getByTestId('chat-widget-launcher')).toBeInTheDocument(); // le lanceur de bureau reste
  });
```

- [ ] **Étape 2 : lancer, constater l'échec**
  `npx vitest run src/components/layout/__tests__/plein-ecran.test.ts src/components/layout/__tests__/BarreDOnglets.test.tsx src/components/layout/__tests__/AppShell.barre-d-onglets.test.tsx src/components/chat-widget/__tests__/ChatWidget.test.tsx`
  → FAIL (export, module, barre absents ; bouton flottant rendu sur `/app`).

- [ ] **Étape 3 : `plein-ecran.ts`** — ajouter sous `estPleinEcran` :

```ts
/**
 * TCK-2481 — les routes où la coque porte la barre d'onglets mobile : `/app` et ses pages, hors plein
 * écran. Lue par `AppShell` (la barre) et par `CorpsDuWidget` (le bouton flottant « Messagerie »,
 * qui ne se rend plus là où la barre porte déjà la messagerie). Une règle, deux lecteurs — comme
 * `estPleinEcran`.
 */
export function porteLaBarreDOnglets(pathname: string | null | undefined): boolean {
  if (pathname == null || estPleinEcran(pathname)) return false;
  return pathname === '/app' || pathname.startsWith('/app/');
}
```

- [ ] **Étape 4 : `globals.css`** — dans le bloc `:root` du dock (après `--floating-dock-base: 16px;`) :

```css
  /* TCK-2481 — la hauteur de la barre d'onglets mobile de `/app`, zone sûre comprise. Une seule
     définition, lue par la barre (`BarreDOnglets`), par la messagerie compacte (`MessagesPage`) et
     par le dock flottant. `env()` vaut 0 tant que le viewport n'est pas `viewport-fit=cover`
     (piste reportée par le porteur, 2026-10-25) : la règle est juste le jour où il le sera. */
  --barre-onglets-hauteur: calc(3.5rem + env(safe-area-inset-bottom));
```

- [ ] **Étape 5 : `messages/{fr,en,wo}.json`** — sous `nav.sidebar.onglets` (le `wo` reprend le `fr`) :

| Clé | fr | en |
|---|---|---|
| `navLabel` | Accès rapide | Quick access |
| `menu` | Menu | Menu |
| `accueil` | Accueil | Home |
| `favoris` | Favoris | Favourites |
| `visites` | Visites | Viewings |
| `demandes` | Demandes | Requests |
| `reservations` | Réservations | Bookings |
| `nomAvecCompteur` | `{libelle}, {compteur}` | `{libelle}, {compteur}` |
| `plafond` | 99+ | 99+ |

- [ ] **Étape 6 : créer `src/components/layout/BarreDOnglets.tsx`**

```tsx
'use client';

import type { RefObject } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { User } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { cn } from '@/lib/utils';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { APP_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { ongletsDuMenu } from '@/lib/navigation/onglets';
import type { NavCounterKey } from '@/lib/navigation/types';
import { FOCUS_RING } from './styles-de-la-barre';
import { useMenuDeLEspace } from './useMenuDeLEspace';
import { COMPTEURS_DE_MODERATION, useCompteursDuMenu } from './useCompteursDuMenu';

/** Le dernier pixel sous `md` (768) : la barre n'existe que dessous (`md:hidden`), et n'y sonde que dessous. */
const SOUS_MD_PX = 767;

/** Une case : 72 px de large à 360 (cinq colonnes), toute la hauteur de la barre (56 px) — cibles ≥ 44 px. */
const STYLE_CASE =
  'relative flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight transition-colors';

interface BarreDOngletsProps {
  readonly user: User;
  readonly agencyIsStandard?: boolean;
  readonly typeProfilActif?: ProfileType | null;
  readonly agencySuspended?: boolean;
  /** Le tiroir est ouvert : rendu en `aria-expanded` sur « Menu ». */
  readonly menuOuvert: boolean;
  readonly onOuvrirMenu: () => void;
  /** Le bouton « Menu », à qui le tiroir rend le focus à sa fermeture (`finalFocus`, AC3). */
  readonly refMenu: RefObject<HTMLButtonElement | null>;
}

/**
 * TCK-2481 (ADR-0089 §3) — la barre d'onglets de `/app` sous `md` : les quatre destinations du
 * quotidien du persona actif, puis « Menu », seule porte du tiroir depuis que le burger a quitté la
 * barre haute.
 *
 * - Les onglets sont des entrées DU MENU du persona (`useMenuDeLEspace` → `ongletsDuMenu`) : la
 *   barre n'ouvre rien que le tiroir n'ouvre pas, et un onglet absent cède sa place, jamais un cadenas.
 * - Ses compteurs sont CEUX du menu (`useCompteursDuMenu`), sondés seulement sous `md`.
 * - Enfant flex de la coque `h-dvh`, après le `<main>` : le `<main>` rétrécit de sa hauteur exacte
 *   (`--barre-onglets-hauteur`), rien de la page ne passe dessous (TCK-503).
 */
export function BarreDOnglets({
  user,
  agencyIsStandard,
  typeProfilActif,
  agencySuspended,
  menuOuvert,
  onOuvrirMenu,
  refMenu,
}: BarreDOngletsProps) {
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const pathname = usePathname();
  const sousMd = useMatchesMaxWidth(SOUS_MD_PX);
  const { menu, groupes, entrees } = useMenuDeLEspace({ user, agencyIsStandard, typeProfilActif, agencySuspended });
  const onglets = ongletsDuMenu(groupes, DISPOSITIONS[menu.persona].onglets);
  const counters = useCompteursDuMenu(onglets, { agencyIsStandard, actif: sousMd });
  // Résolu sur TOUTES les entrées, comme la barre latérale : une sous-page d'une entrée qui n'est
  // pas un onglet n'en allume aucun à tort.
  const activeHref = resolveActiveHref(pathname, entrees.map((e) => e.href), APP_EXACT_ROOTS);
  const libelleCompteur = (cle: NavCounterKey, count: number) =>
    COMPTEURS_DE_MODERATION.has(cle) ? tAdmin('pendingBadge', { count }) : t(`counters.${cle}`, { count });

  return (
    <nav
      aria-label={t('onglets.navLabel')}
      data-slot="barre-onglets"
      className="h-[var(--barre-onglets-hauteur)] shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-full">
        {onglets.map((onglet) => {
          const Icone = onglet.icon;
          const actif = onglet.href === activeHref;
          const compte = onglet.counterKey ? counters[onglet.counterKey] : 0;
          const libelle = onglet.labelSpace === 'nav.admin' ? tAdmin(onglet.labelKey) : t(onglet.labelKey);
          return (
            <li key={onglet.href} className="min-w-0 flex-1 basis-0">
              <Link
                href={onglet.href}
                aria-current={actif ? 'page' : undefined}
                aria-label={
                  onglet.counterKey && compte > 0
                    ? t('onglets.nomAvecCompteur', { libelle, compteur: libelleCompteur(onglet.counterKey, compte) })
                    : undefined
                }
                className={cn(
                  STYLE_CASE,
                  FOCUS_RING,
                  actif ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* L'onglet actif se lit par une FORME (ce trait), un poids et `aria-current` —
                    jamais par la seule teinte. */}
                {actif ? (
                  <span
                    aria-hidden
                    data-slot="indicateur-onglet"
                    className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-primary"
                  />
                ) : null}
                <span className="relative">
                  <Icone className="size-5" aria-hidden />
                  {compte > 0 ? (
                    <span
                      aria-hidden
                      data-slot="pastille-onglet"
                      className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-card"
                    >
                      {compte > 99 ? t('onglets.plafond') : compte}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{libelle}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1 basis-0">
          <button
            ref={refMenu}
            type="button"
            onClick={onOuvrirMenu}
            aria-haspopup="dialog"
            aria-expanded={menuOuvert}
            className={cn(STYLE_CASE, FOCUS_RING, 'text-muted-foreground hover:text-foreground')}
          >
            <Menu className="size-5" aria-hidden />
            <span className="max-w-full truncate">{t('onglets.menu')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
```

  > Si `styles-de-la-barre.ts` n'existe pas (TCK-2479 non mergé), le créer en y déplaçant
  > `FOCUS_RING` d'`AppSidebar` avec son docblock (l'anneau mesure 5,32:1 sur `--card`, la barre
  > d'onglets est sur le même fond), et l'écrire.

- [ ] **Étape 7 : `AppShell.tsx`**
  - `import { useRef, useState } from 'react';`, `import { BarreDOnglets } from './BarreDOnglets';`,
    `import { estPleinEcran, porteLaBarreDOnglets } from './plein-ecran';`.
  - Remplacer `const pleinEcran = estPleinEcran(usePathname());` par :

```ts
  const pathname = usePathname();
  const pleinEcran = estPleinEcran(pathname);
  // TCK-2481 — sous `md`, la barre d'onglets ; « Menu » y ouvre le tiroir, qui lui rend le focus.
  const barreDOnglets = porteLaBarreDOnglets(pathname);
  const boutonMenu = useRef<HTMLButtonElement>(null);
```

  - La coque : `<div className="flex h-dvh flex-col bg-background" data-barre-onglets={barreDOnglets ? '' : undefined}>`.
  - La barre haute : `{pleinEcran ? null : <AppTopbar user={user} />}`.
  - Le tiroir : `<SheetContent side="left" className="p-0" aria-label={t('navLabel')} finalFocus={boutonMenu}>`,
    avec, au-dessus, ce commentaire :

```tsx
              {/* TCK-2481 — `finalFocus` explicite : au doigt, Safari iOS ne focalise pas le bouton
                  touché, et le défaut de Base UI (« l'élément focalisé à l'ouverture ») rendrait le
                  focus à `body`. */}
```

  - Après la `</div>` de la rangée `flex min-h-0 flex-1 overflow-hidden` (donc APRÈS le `<main>`),
    avant les assistants :

```tsx
        {/* TCK-2481 (ADR-0089 §3) — la barre d'onglets, sous `md`. Enfant flex de la coque `h-dvh`
            et non `fixed` : le `<main>` rétrécit de sa hauteur exacte, et rien de la page ne passe
            dessous (TCK-503). Après le `<main>` dans le document comme à l'écran ; le lien
            d'évitement reste le premier focalisable. */}
        {barreDOnglets ? (
          <BarreDOnglets
            user={user}
            agencyIsStandard={agencyIsStandard}
            typeProfilActif={typeProfilActif}
            agencySuspended={agencySuspended}
            menuOuvert={sidebarOpen}
            onOuvrirMenu={() => setSidebarOpen(true)}
            refMenu={boutonMenu}
          />
        ) : null}
```

- [ ] **Étape 8 : `AppTopbar.tsx`** — retirer le `<button>` du burger (`:53-65`), l'import `Menu`, les
  props `onMenuToggle` et `menuOpen` (`AppTopbarProps` = `{ user: User }`). Récrire le docblock
  d'`ANNEAU_FOCUS` : il ne reste qu'un contrôle écrit à la main, le logo ; retirer la ligne « hamburger
  survolé » du tableau des contrastes, et ajouter :
  « TCK-2481 — le hamburger a quitté la barre : sous `md`, « Menu » de la barre d'onglets
  (`BarreDOnglets`) est la seule porte du tiroir. »

- [ ] **Étape 9 : `CorpsDuWidget.tsx`** — importer `porteLaBarreDOnglets` avec `estPleinEcran`, puis :

```ts
  // TCK-2481 — sous `md`, la barre d'onglets de `/app` porte « Messagerie » chez les huit personas
  // (garde : `lib/navigation/__tests__/onglets.test.ts`) : le bouton flottant mobile se posait sur
  // elle. Il ne se rend plus sur `/app` et ne réclame aucun créneau du dock ; le lanceur de bureau
  // ne change pas.
  const sansBoutonMobile = porteLaBarreDOnglets(pathname);
```

  `enabled: isVisible && isMobile && !sansBoutonMobile` dans le créneau `chat-widget-mobile-fab`, et
  le `<Link … data-testid="chat-widget-mobile-fab">` rendu sous `{sansBoutonMobile ? null : (…)}`.

- [ ] **Étape 10 : tests existants à reprendre** (le changement est voulu ; chaque reprise garde sa garde)
  - `AppShell.menu-et-credits.test.tsx` : `ouvrirLeTiroir` clique `within(screen.getByRole('navigation', { name: 'Accès rapide' })).getByRole('button', { name: 'Menu' })` ;
    le bloc TCK-1035 vise ce même bouton (`aria-expanded`), titre « TCK-1035, repris par TCK-2481 —
    « Menu » dit si le tiroir est ouvert ».
  - `AppSidebar.section-agence.test.tsx:335` : même cible.
  - `AppTopbar.a11y.test.tsx` : retirer la ligne `hamburger` de l'`it.each` et `'Ouvrir le menu'` de
    la boucle « décalage SORTANT » ; ajouter `expect(screen.queryByRole('button', { name: 'Ouvrir le menu' })).toBeNull()`
    (« TCK-2481 — AC3 »). Relire l'en-tête du fichier (« le hamburger, SEUL moyen d'ouvrir le tiroir »).
  - `AppTopbar.responsive.test.tsx:74`, `src/test/__tests__/portees-sombres.test.tsx:84` : retirer
    `onMenuToggle={vi.fn()}`.
  - `AppShell.accueils-vus-une-lecture.tck-1766.test.tsx` et `AppShell.bienvenue.test.tsx` mocquent
    `AppSidebar` pour ne compter que leurs lectures : y ajouter
    `vi.mock('../BarreDOnglets', () => ({ BarreDOnglets: () => null }));`, même motif en commentaire.
  - Un `getByRole('navigation')` SINGULIER dans un test qui monte `AppShell` rougira (deux repères) :
    le viser par son nom.

- [ ] **Étape 11 : lancer, constater le vert**

```bash
npx vitest run src/components/layout src/components/chat-widget src/lib/navigation src/test/__tests__/portees-sombres.test.tsx src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx
npx tsc --noEmit && npm run lint && npm run check:i18n && npm run check:classes-emises && npm run check:i18n-namespaces
```

  Attendu : tout vert, sortie 0. (`nav` est déjà servi par la frontière `(dashboard)/app` : la table des
  espaces ne doit pas bouger ; si `check:i18n-namespaces` rougit, suivre son en-tête.)

- [ ] **Étape 12 : ablations**
  1. Retirer `finalFocus={boutonMenu}` → « au doigt : … rend quand même le focus » rougit. ⚠ Si elle
     reste verte (Base UI retrouverait le bouton par un autre chemin), l'écrire : la variante clavier
     reste la preuve de l'AC3, et l'arbitrage 10 se re-mesure au navigateur (tâche 5, étape 5).
  2. Remettre le burger dans `AppTopbar` → « la barre haute ne porte plus … » et `AppTopbar.a11y` rougissent.
  3. Forcer `aria-current={undefined}` et retirer l'indicateur → « sous-page d'un onglet » rougit.
  4. Rendre la barre sans condition (`{true ? <BarreDOnglets …/> : null}`) → AC4 rougit.
  5. `actif: true` en dur dans `BarreDOnglets` → « dès md : aucun sondage » rougit.
  6. Retirer `sansBoutonMobile ? null :` dans `CorpsDuWidget` → le cas TCK-2481 de `ChatWidget.test.tsx` rougit.
  Puis `git diff` : aucune mutation restante.

- [ ] **Étape 13 : commit** —
  `feat(web): la barre d'onglets mobile remplace le burger sous md (TCK-2481)`.

---

### Tâche 4 : la réserve de hauteur, le dock et la messagerie compacte

La réserve est STRUCTURELLE (arbitrage 1) : cette tâche la garde, et fait céder les deux couplages
qui supposaient « `<main>` = 100dvh − barre haute » (R4).

**Fichiers :** `globals.css`, `MessagesPage.tsx` (+ test), `CoqueHauteur.test.tsx`.

- [ ] **Étape 1 : les tests qui échouent**

`CoqueHauteur.test.tsx`, nouveau bloc (la coque `AppShell` de `COQUES`, `usePathname` → `/app` déjà
moqué) :

```tsx
describe('TCK-2481 — la barre d’onglets réserve sa hauteur en sœur du contenu', () => {
  /**
   * AC1/AC2 — la barre n'est pas `fixed` : dernier enfant de la colonne `h-dvh`, elle prend sa hauteur
   * au `<main>`, qui ne porte aucun rembourrage recopié. Dès `md`, `md:hidden` : ni barre ni réserve.
   * La preuve au pixel est au navigateur (tâche 5) ; ceci garde la STRUCTURE qui la rend vraie.
   */
  it('AppShell : la barre suit la rangée du contenu, ne rétrécit pas, et le <main> ne réserve rien', () => {
    const coque = monter(COQUES[0][1]);
    const barre = coque.querySelector('[data-slot="barre-onglets"]');
    const main = coque.querySelector('main')!;
    const rangee = main.parentElement!;
    expect(barre).not.toBeNull();
    expect(barre!.parentElement).toBe(coque);
    expect(rangee.parentElement).toBe(coque);
    expect(rangee.compareDocumentPosition(barre!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(barre).toHaveClass('shrink-0', 'md:hidden');
    expect(barre!.className).toContain('h-[var(--barre-onglets-hauteur)]');
    expect(barre!.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(main.className).not.toMatch(/(^|\s)([a-z-]+:)*pb-/);
    expect(coque).toHaveAttribute('data-barre-onglets');
  });
});
```

`MessagesPage.test.tsx`, dans le bloc « sous le point de rupture lg » (`largeurDeFenetre(390)` déjà posé) :

```tsx
  // TCK-2481 — sous `md`, la barre d'onglets prend le bas du `<main>` : le cadre s'en retire, sans
  // quoi le composeur passe sous le pli. Dès `md`, pas de barre : la hauteur ne bouge pas.
  it.each([
    ['liste', () => null],
    ['conversation', (cle: string) => (cle === 'conversation' ? '42' : null)],
  ] as [string, (cle: string) => string | null][])('cadre (%s) : moins la barre sous md, inchangé dès md', (_cas, lecture) => {
    searchParamsGet.mockImplementation(lecture);
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    const classes = screen.getByTestId('messagerie').className.split(/\s+/);
    expect(classes.find((c) => c.startsWith('h-[calc('))).toContain('var(--barre-onglets-hauteur)');
    expect(classes.find((c) => c.startsWith('md:h-[calc('))).not.toContain('barre-onglets');
  });
```

- [ ] **Étape 2 : lancer, constater l'échec** —
  `npx vitest run src/components/layout/__tests__/CoqueHauteur.test.tsx src/components/messages/__tests__/MessagesPage.test.tsx`
  → la coque est déjà verte (tâche 3 l'a posée : c'est attendu, l'ablation de l'étape 6 la prouve) ;
  la messagerie rougit.

- [ ] **Étape 3 : `MessagesPage.tsx:146-147`**

```ts
  const cadre = enConversation
    ? '-mx-4 -my-6 h-[calc(100dvh_-_3.5rem_-_var(--barre-onglets-hauteur))] md:-mx-6 md:-my-8 md:h-[calc(100dvh-3.5rem)]'
    : '-mx-4 -mb-6 h-[calc(100dvh_-_5rem_-_var(--barre-onglets-hauteur))] md:-mx-6 md:-mb-8 md:h-[calc(100dvh-5.5rem)]';
```

  et compléter le « ⚠ Couplage assumé » du docblock : « … et la barre haute en `h-14` ; sous `md`, la
  barre d'onglets de la coque (`--barre-onglets-hauteur`, TCK-2481), sœur du `<main>`. »
  (Soulignés = espaces dans une valeur arbitraire Tailwind ; `check:classes-emises` confirme l'émission.)

- [ ] **Étape 4 : `globals.css`** — après le bloc `@media (min-width: 640px)` du dock :

```css
/* TCK-2481 — sous `md`, dans la coque qui porte la barre d'onglets (`AppShell`, `data-barre-onglets`),
   le dock flottant se pose AU-DESSUS d'elle : la barre d'actions groupées de « Mes biens »
   (`PropertyList`, créneau `bottom-right`) se posait dessus, à 16 px du bas. Le bouton flottant de
   la messagerie, lui, ne se rend plus sur `/app` (TCK-2481, arbitrage 3). */
@media (width < 48rem) {
  [data-barre-onglets] {
    --floating-dock-base: calc(16px + var(--barre-onglets-hauteur));
  }
}
```

- [ ] **Étape 5 : lancer, constater le vert** — commande de l'étape 2, puis
  `npx tsc --noEmit && npm run lint && npm run check:classes-emises`.

- [ ] **Étape 6 : ablations**
  1. Déplacer `<BarreDOnglets …/>` DANS le `<main>` (après le contenu) → « la barre suit la rangée »
     rougit.
  2. Retirer `pb-[env(safe-area-inset-bottom)]` de la barre → même test rougit.
  3. Rétablir `h-[calc(100dvh-5rem)]` dans `MessagesPage` → « cadre (liste) » rougit.
  Puis `git diff` : aucune mutation restante.

- [ ] **Étape 7 : commit** —
  `feat(web): la barre d'onglets réserve sa hauteur — dock flottant et messagerie compacte (TCK-2481)`.

---

### Tâche 5 : mesure au navigateur (AC1 à AC4) et livraison

**Banc** — celui de TCK-2478 (notes du ticket, « Mesure au navigateur (AC8) ») : `./dev.sh`, front sur
**`localhost:3000`** (pas `127.0.0.1` : CORS, artefact payé par 2478), Chrome headless à profil jetable
en CDP direct (WebSocket de Node 24), un contexte par compte, session par jeton Sanctum posé par
`fetch('/api/auth/set-token')` (jetons nommés `mesure-2481`, supprimés à la fin), lignes
`welcome_views` insérées pour passer les tours puis supprimées. Comptes : client 86, locataire 104,
agent 3, admin-agence 2, prestataire 17, hôte 62, bailleur 7 (plateforme : 2FA, non mesurable —
l'écrire). `Emulation.setDeviceMetricsOverride` en `mobile: false`, plus un témoin `mobile: true` qui
relève `innerWidth` (viewport élargi). Sonde lancée sur page stable (plus de squelette, quatre
lectures identiques, ≥ 5 s). **Version figée** : HEAD et empreinte du diff relevés avant ET après chaque
passage ; un passage qui voit le code changer est jeté. Charge (`uptime`, `sysctl -n hw.ncpu`) au début
et à la fin. Les scripts vivent dans le scratchpad, jamais dans le dépôt.

- [ ] **Étape 1 :** relever la version, la charge, les comptes (rôles, agence) et, pour
  `/app/properties`, le nombre de pages du compte mesuré (la pagination doit EXISTER : sinon choisir un
  autre compte ou `?per_page=10`, et l'écrire).

- [ ] **Étape 2 :** `docOverflow = scrollWidth − innerWidth` = 0 sur `/app` à 360, 390 et 768 pour les
  sept comptes (la barre ne doit pas élargir le document).

- [ ] **Étape 3 — AC1.** À 390, pour chaque compte, sur `/app` :

```js
(() => {
  const barre = document.querySelector('[data-slot="barre-onglets"]');
  return {
    onglets: [...barre.querySelectorAll('a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
    menu: barre.querySelector('button')?.textContent.trim(),
    hauteur: barre.getBoundingClientRect().height,
    basBarre: barre.getBoundingClientRect().bottom,
    innerHeight,
    tronques: [...barre.querySelectorAll('a > span:last-child, button > span')].filter((s) => s.scrollWidth > s.clientWidth).map((s) => s.textContent),
  };
})()
```

  Attendu : la table de la tâche 3 (étape 1), « Menu », `hauteur` 56, `basBarre === innerHeight`. Les
  libellés tronqués sont relevés (pas un critère). À **768** :
  `getComputedStyle(barre).display === 'none'` et `main.getBoundingClientRect().bottom === innerHeight`
  (ni barre ni réserve).

- [ ] **Étape 4 — AC2.** À **360 et 390**, `/app/profile` (client 86 et agent 3) et `/app/properties`
  (agent 3, admin 2) :

```js
(async () => {
  const main = document.getElementById('contenu-principal');
  const barre = document.querySelector('[data-slot="barre-onglets"]');
  const focalisables = [...main.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const cible = location.pathname === '/app/properties'
    ? main.querySelector('nav[aria-label="Pagination"]')
    : focalisables.at(-1);
  if (!cible) return { absente: true };
  main.scrollTop = main.scrollHeight;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const r = cible.getBoundingClientRect();
  const b = barre.getBoundingClientRect();
  const centre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    cible: cible.outerHTML.slice(0, 100),
    bas: r.bottom, hautBarre: b.top,
    auDessus: r.bottom <= b.top + 0.5,
    nonRecouverte: cible.contains(centre),
    docDefile: document.scrollingElement.scrollHeight - innerHeight,
    innerWidth, innerHeight,
  };
})()
```

  Attendu : `auDessus` et `nonRecouverte` vrais, `docDefile` = 0 (TCK-503). Puis au CLAVIER (vraies
  frappes `Input.dispatchKeyEvent`) : focaliser la cible (dernier focalisable / bouton « Suivant » de la
  pagination), relire `elementFromPoint` au centre (non recouverte), une frappe Tab → `document.activeElement`
  est le premier onglet de la barre (ordre du DOM, arbitrage 9).

- [ ] **Étape 5 — AC3.** À 390 (agent 3) : aucun `header button[aria-label="Ouvrir le menu"]` ; depuis
  le lien d'évitement, Tab jusqu'à « Menu », Entrée → `[role=dialog]` présent, `aria-expanded="true"` ;
  Échap → dialogue absent, `document.activeElement` = « Menu ». Puis la même chose ouverte par un
  `PointerEvent`/`MouseEvent` émis dans la page sur « Menu » SANS focus préalable (la voie tactile ;
  `Input.dispatchMouseEvent` n'agit pas sur Base UI dans ce headless, mémoire du dépôt) : le focus
  revient à « Menu ».

- [ ] **Étape 6 — AC4.** À 390 : `/publish` (client 86) et `/app/properties/new` (agent 3) → aucun
  `[data-slot="barre-onglets"]`, aucun `[data-barre-onglets]`.

- [ ] **Étape 7 — ce que le ticket exige sans AC** (« rien de la page n'est caché dessous ») :
  1. `/app/properties` à 390 (agent 3), une ligne cochée (`.click()` sur sa case) : le bas de la barre
     d'actions groupées ≤ le haut de la barre d'onglets.
  2. `/app/messages?conversation=<id>` à 390 : le composeur (`textarea`) au-dessus de la barre, et
     `main.scrollHeight − main.clientHeight` relevé (attendu 0 ou proche : le cadre tient le `<main>`).
  3. Bouton flottant : absent de `/app`, `/app/leases` à 390 ; présent sur `/fr/properties` à 390.
  4. **Coût des compteurs (arbitrage 8)** : `Network.enable` pendant 130 s sur `/app` (agent 3), à 390
     puis à 1366 : compter les requêtes `property-visits` et `contact-leads` à `per_page=1`. Attendu :
     ≤ 3 par minute et par compteur à 390, ≤ 1,5 à 1366. Un doublement à 390 s'écrit dans les notes,
     avec le ticket de suite proposé (fournisseur de compteurs dans la coque).

- [ ] **Étape 8 :** nettoyage (jetons `mesure-2481`, lignes `welcome_views`), puis `git status` propre.

- [ ] **Étape 9 : notes du ticket** — les relevés R1-R7 qui ont servi, les écarts au plan, les douze
  arbitrages (validés ou refusés), les tests ajoutés et repris (burger → « Menu »), les ablations et
  leur résultat, la mesure (tableaux par compte et par largeur, version, charge, artefacts jetés).
  Cocher AC1-AC4 et le delta. Commit : `docs(backlog): mesure au navigateur de TCK-2481`.

- [ ] **Étape 10 :** les gardes du dépôt (`for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`,
  `node docs/backlog/gen-index.mjs --check`, `node docs/gen-features-by-actor.mjs --check`), puis
  **demander au porteur l'accord de push** ; avec l'accord : push, PR vers `dev`, la CI joue les
  suites. Après merge : `status: done`, `ranger-tickets.mjs`. La spec
  (`docs/features.md#navigation-de-la-console-selon-le-profil-actif`) porte déjà la ligne de TCK-2481 :
  `/sync-specs` seulement si un arbitrage refusé la contredit.
