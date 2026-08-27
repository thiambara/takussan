---
id: TCK-359
title: "Console super-admin — accessibilité du shell : contraste, focus clavier, lien d'évitement"
status: done
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, a11y, super-admin, navigation]
---

## Objectif utilisateur

Un super-admin qui navigue au clavier, ou dont l'écran est mal éclairé, lit les intitulés de la barre latérale et voit toujours où se trouve le focus.

## Contrat de données

- Ticket purement frontend. Aucun changement d'API.

## Direction UX / Artistique

Trois défauts mesurés le 2026-08-26 sur `SuperAdminSidebar` / `SuperAdminShell` :

| Constat | Mesure |
|---|---|
| Libellés de groupe de la sidebar : `text-stone-500` sur `bg-stone-900`, 11 px en majuscules espacées | **3,65:1** — sous le seuil AA (4,5) |
| Style `focus-visible` sur les liens de navigation | **0 occurrence** dans les 53 fichiers de la console — au clavier, sur fond sombre, seul le contour par défaut du navigateur subsiste |
| Lien d'évitement vers le contenu principal | absent — la tabulation traverse 24 entrées de menu avant d'atteindre la page |

Deux contrastes voisins sont marginaux et méritent d'être remontés dans le même passage : en-têtes de table (`stone-500` sur `stone-50` → 4,59:1) et onglet actif de Reporting (`amber-700` sur `amber-500/15` → 4,56:1).

## Contraintes strictes (métier)

- Texte courant ≥ 4,5:1, texte large ≥ 3:1 — vérifié **par calcul**, pas à l'œil.
- L'anneau de focus passe par le token `--ring`, jamais par une couleur en dur.
- `<main>` porte un `id` stable, cible du lien d'évitement, visible uniquement au focus.
- Ce ticket peut être livré avant ou après TCK-358 : s'il passe avant, il utilise les classes en place ; s'il passe après, il utilise les tokens. Les deux ordres sont valides, aucune dépendance n'est déclarée.

## Delta à produire

- [x] Libellés de groupe de `SuperAdminSidebar` remontés à ≥ 4,5:1 (`stone-400` mesure 6,93:1, ou son équivalent en token)
  - livré en **jeton** et non en `stone-400` : `--sidebar-foreground` @70 % sur `--sidebar` → **8,0781:1** (3,64:1 avant).
- [x] `focus-visible:ring-2 focus-visible:ring-ring` explicite sur les liens de navigation, les sous-items et le lien « retour au personnel »
- [x] Lien d'évitement dans `SuperAdminShell`, `id` sur `<main>`
- [x] En-têtes de table et onglet actif de Reporting remontés au-dessus de 4,5:1
  - moitié **en-têtes de table : sans objet** — `DataTable.tsx` les porte déjà à 5,20:1 depuis TCK-373, fusionné le jour même de la rédaction. Rien n'a été touché là-bas.
  - moitié **onglet de Reporting : livrée après la revue adverse**, qui a montré que le « déjà conforme » de l'implémenteur était mesuré contre `--background` alors que `<main>` porte `bg-muted` : la vraie valeur était **4,35:1**, sous AA. `tabs.tsx` passe de `text-foreground/60` à `/70` → **5,99:1**.
- [x] Tests : présence du lien d'évitement et de l'`id` cible ; parcours clavier sur la sidebar

## Critères d'acceptation

- [x] AC1 — chaque paire couleur/fond de `SuperAdminSidebar`, `SuperAdminTopbar` et des en-têtes de table mesure ≥ 4,5:1, **le calcul étant reporté dans les notes d'implémentation paire par paire** (une capture ou un avis visuel ne coche pas cet AC)
  - les deux moitiés sont tenues, mais la seconde ne l'a été **qu'après la revue** : le relevé livré d'abord décrivait la palette `stone-*`/`amber-*` d'avant la résolution de conflit avec TCK-358, donc un état du composant qui n'existait plus. Le tableau ci-dessous est refait sur les jetons réellement livrés (25 paires, contexte indiqué).
- [x] AC2 — `grep -r 'focus-visible' takussan-web/src/components/layout/SuperAdminSidebar.tsx` renvoie au moins une occurrence par type de lien (item, sous-item, retour)
  - mesuré le 2026-08-27 : **5** occurrences, ≥ 1 par type (entrée, sous-entrée, retour perso).
- [x] AC3 — à la première tabulation depuis le haut de `/super-admin`, l'élément focalisé est le lien d'évitement, et l'activer déplace le focus dans `<main>`
  - ⚠ **substitution assumée** : sous jsdom, le test relève les focalisables dans l'ordre du DOM plutôt que d'appeler `userEvent.tab()`, dont le calcul dépend d'une visibilité que jsdom ne rend pas. La seconde moitié (« l'activer déplace le focus ») est exécutée pour de vrai (`click` puis `document.activeElement === <main>`). **Aucune tabulation dans un vrai navigateur.**
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **reste décochée.** `npx tsc --noEmit` (exit 0) et `npm run lint` (0 erreur) sont exécutés ; `npm run test` **en entier** ne l'a été par personne — rituel de fin de branche de la session. Joué à la place : les deux suites du périmètre **plus les 12 consommateurs de `tabs.tsx`** trouvés par grep, soit 46 fichiers / 209 tests, 45 fichiers verts (le seul rouge, `TimeSeriesChart.test.tsx`, appartenait au correcteur de TCK-361 en cours d'édition et n'importe pas `tabs`).

## Hors périmètre

- L'accessibilité des tables (`scope`, `caption`) : TCK-357.
- L'audit d'accessibilité du reste du site.
- Le contraste des surfaces de contenu, qui bouge avec la palette : TCK-358.

## Notes d'implémentation

### Deux constats du ticket étaient PÉRIMÉS au moment d'implémenter (re-mesuré le 2026-08-27)

Le ticket a été rédigé le 2026-08-26 ; **TCK-373 a été fusionné sur `dev` le même jour** et a
déplacé les deux contrastes « marginaux » vers les primitives partagées. Les deux ont donc été
mesurés à nouveau, et **aucun des deux n'existe encore sous la forme décrite** :

| Ce que le ticket décrit | Ce qui est là aujourd'hui |
|---|---|
| en-têtes de table `stone-500` sur `stone-50` → 4,59:1 | `DataTable.tsx:197` porte `text-muted-foreground` (`#6e655a`) sur un `TableHeader` en `bg-muted/60` posé sur `bg-card` → **5,20:1** (fond réel, composé) |
| onglet actif de Reporting `amber-700` sur `amber-500/15` → 4,56:1 | `ReportingShell` monte le `Tabs` partagé en `variant="line"` : actif `text-foreground` → **14,87:1**, inactif `text-foreground/70` → **5,99:1** |

La paire obsolète du ticket mesure d'ailleurs **4,30:1** et non 4,56:1 (`amber-700` composé sur
`amber-500` à 15 % au-dessus de `--background`) — elle était *sous* le seuil, pas marginale. Elle
n'existe plus.

⚠ **La première version de ces notes concluait « rien n'a donc été touché sur ces deux points » —
et se trompait sur le second.** Elle mesurait l'onglet inactif contre `--background`, obtenait
4,53:1, et déclarait l'item du Delta livré vide à dessein. Mais `/super-admin/reports` monte
`ReportingShell` directement dans le `<main>` du shell, qui porte `bg-muted` depuis TCK-358 — et
`variant="line"` rend la `TabsList` **transparente**, donc rien ne repeint le fond entre le
déclencheur et ce `<main>`. Le chiffre réel de cette page était **4,35:1**, sous le plancher AA.
*Un contraste ne se mesure pas contre le fond du thème, mais contre le fond que la page peint.*

`tabs.tsx` a donc été touché, d'**une seule valeur** : `text-foreground/60` → `/70`, mesurée sur
les trois fonds où cette primitive partagée est montée (cf. le relevé ci-dessous), dans les deux
thèmes. Les en-têtes de table, eux, restent inchangés : leur paire réelle tient à 5,20:1.

Les trois autres constats sont **confirmés** : libellés de groupe à 3,64:1 (le ticket dit 3,65 —
écart d'arrondi oklch→sRGB, même conclusion), `focus-visible` à **0 occurrence** dans les fichiers
propres de la console, lien d'évitement absent. Les **24 entrées de menu** annoncées sont exactes
(21 de premier niveau + 3 sous-entrées de `system`).

### AC1 — le relevé, paire par paire

⚠ **Ce relevé a été refait intégralement le 2026-08-27.** La version précédente mesurait 26 paires
`stone-*` / `amber-*` — la palette d'AVANT la résolution de conflit avec TCK-358, qui a éteint
**toute** couleur brute de la console (`node scripts/check-super-admin-tokens.mjs` → « 0 classe de
couleur hors jetons »). 20 de ses 26 lignes portaient donc sur des paires qui n'apparaissent plus
nulle part dans le code, et sa ligne la plus commentée (l'anneau à 3,29:1, avec tout le
raisonnement sur la géométrie du `box-shadow`) mesurait `#a85332` sur `stone-900` alors que la
barre est désormais en contexte `dark`, où `--ring` vaut `#c87a52`. *Un AC qui commande un document
et se contente d'un document faux ne garde rien.*

Méthode : hex de `src/app/globals.css`, sRGB → linéaire → luminance relative WCAG 2.x. Les encres
et fonds translucides (`/70`, `/85`, `bg-muted/60`, `bg-sidebar-primary/90`) sont **composés avant**
le calcul — un ratio pris sur la couleur nominale d'un `/70` ne mesure rien. Tailwind v4 émet ces
opacités en `color-mix(in oklab, <hex> N%, transparent)`, soit une couleur d'alpha N que le
navigateur compose ensuite en sRGB : la composition ci-dessous est bien celle du rendu.

**Le contexte compte, et il est indiqué.** `SuperAdminSidebar`, `SuperAdminTopbar` et le
`SheetContent` mobile portent la classe `dark` en permanence (TCK-358) : leurs jetons se lisent sur
la rampe **sombre**. Le `<main>`, le lien d'évitement, les tables et les onglets sont dans le thème
de l'utilisateur, ici mesuré en **clair**.

| Paire | Contexte | Ratio | Seuil |
|---|---|---|---|
| Sidebar · eyebrow `--sidebar-primary` / `--sidebar` | dark | 4,83:1 | 4,5 |
| Sidebar · titre `--sidebar-foreground` / `--sidebar` | dark | 15,16:1 | 4,5 |
| **Sidebar · libellé de groupe `--sidebar-foreground`@70 % / `--sidebar`** (était `stone-500` → 3,65:1) | dark | **8,0781:1** | 4,5 |
| Sidebar · item inactif `--sidebar-foreground`@85 % / `--sidebar` | dark | 11,27:1 | 4,5 |
| Sidebar · item survolé `--sidebar-accent-foreground` / `--sidebar-accent` | dark | 12,53:1 | 4,5 |
| Sidebar · item actif `--sidebar-primary-foreground` / `--sidebar-primary` | dark | 5,31:1 | 4,5 |
| Sidebar · sous-item inactif `--sidebar-foreground`@80 % / `--sidebar` | dark | 10,13:1 | 4,5 |
| Sidebar · sous-item actif idem / `--sidebar-primary`@90 % aplati sur `--sidebar` | dark | 4,60:1 | 4,5 |
| Sidebar · badge en attente `--sidebar-primary-foreground` / `--sidebar-primary` | dark | 5,31:1 | 4,5 |
| Sidebar · retour perso `--sidebar-foreground`@80 % / `--sidebar` | dark | 10,13:1 | 4,5 |
| Sidebar · retour perso survolé `--sidebar-accent-foreground` / `--sidebar-accent` | dark | 12,53:1 | 4,5 |
| Topbar · texte de base et bouton menu `--foreground` / `--background` | dark | 16,69:1 | 4,5 |
| Topbar · bouton menu survolé `--foreground` / `--muted` | dark | 12,53:1 | 4,5 |
| Topbar · marque `--primary` / `--background` (18 px gras → texte large) | dark | 5,31:1 | 3 |
| Topbar · switcher `--foreground` / `--muted` | dark | 12,53:1 | 4,5 |
| Shell · lien d'évitement `--primary-foreground` / `--primary` | clair | 5,06:1 | 4,5 |
| Table · en-tête `--muted-foreground` / `bg-muted/60` aplati sur `--card` (le fond RÉEL) | clair | 5,20:1 | 4,5 |
| Table · en-tête `--muted-foreground` / `--card` (si l'en-tête perdait son voile) | clair | 5,72:1 | 4,5 |
| Onglets · actif `--foreground` / `--muted` (fond réel du `<main>`) | clair | 14,87:1 | 4,5 |
| **Onglets · inactif `--foreground`@70 % / `--muted`** (était `@60 %` → **4,3520:1**, ÉCHEC) | clair | **5,9902:1** | 4,5 |
| Onglets · inactif `--foreground`@70 % / `--background` (était `@60 %` → 4,5278:1) | clair | 6,3280:1 | 4,5 |
| Onglets · inactif `--foreground`@70 % / `--card` (était `@60 %` → 4,6038:1) | clair | 6,4766:1 | 4,5 |
| Onglets · inactif `--muted-foreground` / `--muted` (bascule `dark:`, opaque) | dark | 5,79:1 | 4,5 |
| Onglets · inactif `--muted-foreground` / `--card` | dark | 7,01:1 | 4,5 |
| Onglets · inactif `--muted-foreground` / `--background` | dark | 7,71:1 | 4,5 |

**Anneaux de focus** — non-texte, seuil 3 de SC 1.4.11. Ils sont sortis du tableau parce qu'un
anneau ne se mesure pas contre le fond de l'élément qu'il entoure : en Tailwind v4, `ring-2` est un
`box-shadow` **sans `inset`**, peint HORS de la border-box. Le fond qui gouverne est celui du
parent — ou, quand il y a un `ring-offset`, la bande d'offset elle-même.

| Paire | Contexte | Ratio | Seuil |
|---|---|---|---|
| `--ring` / `--sidebar` (entrée inactive) | dark | 4,83:1 | 3 |
| `--ring` / `--sidebar-accent` (entrée survolée) | dark | 3,99:1 | 3 |
| **`--ring` / `--sidebar-primary` (entrée ACTIVE, sans offset)** | dark | **1,00:1** — ÉCHEC | 3 |
| liseré `ring-offset-sidebar` / `--sidebar-primary` (entrée ACTIVE, avec offset) | dark | 4,83:1 | 3 |
| `--ring` / liseré `ring-offset-sidebar` (entrée ACTIVE, avec offset) | dark | 4,83:1 | 3 |
| `--ring` / `--background` (topbar) | dark | 5,31:1 | 3 |
| `--ring` / `--muted` (anneau du lien d'évitement sur le `<main>`) | clair | 4,51:1 | 3 |

**Deux échecs, tous deux corrigés, et aucun des deux ne se voyait depuis le code :**

- **L'onglet inactif à 4,3520:1** — le fond mesuré n'était pas celui de la page. Corrigé par une
  seule valeur d'opacité dans la primitive partagée, `/60` → `/70`, qui tient sur les six mesures
  (trois fonds × deux thèmes) avec 1,29 de marge au minimum. `/65` aurait suffi (5,0940 au pire),
  mais n'aurait laissé que 0,59 — et c'est une marge de cet ordre qui a produit le premier défaut.
- **L'anneau de focus sur l'entrée ACTIVE à 1,00:1** — en contexte `dark`, `--ring` et
  `--sidebar-primary` sont le **même octet** `#c87a52`. L'entrée active étant une pastille pleine
  `bg-sidebar-primary` (choix TCK-358), la focaliser peignait un anneau de la couleur exacte de la
  pastille : elle grossissait de 2 px, sans jamais se lire comme un focus. C'est précisément
  l'entrée que l'utilisateur clavier atteint en premier (`aria-current="page"`). Corrigé par
  `ring-offset-2 ring-offset-sidebar`, qui rétablit 4,83:1 des deux côtés. *Deux jetons distincts
  peuvent rendre la même couleur : un relevé qui ne mesure que des NOMS ne l'attrape jamais.*

**Ce que le relevé précédent ne mesurait pas, et qu'il fallait mesurer :** la paire anneau/entrée
active (elle n'y figurait sous aucune forme), le fond réel des en-têtes de table (`bg-muted/60`
composé, et non `--card` nu), et les trois fonds de l'onglet inactif au lieu d'un seul.

### Décisions non évidentes

- **Le `onClick` du lien d'évitement n'est pas une redondance du `href`.** La navigation par
  fragment ne déplace le focus que vers une cible focalisable — d'où le `tabIndex={-1}` sur
  `<main>` — et Safari ne le déplace pas du tout, quelle que soit la cible. Le handler rend le
  comportement identique partout. Effet de bord utile : c'est lui qui rend l'AC3 **exécutable**,
  jsdom n'implémentant aucune navigation par fragment (un `click()` sur un `href="#…"` n'y déplace
  jamais rien, même sur du code juste).
- **`SUPER_ADMIN_MAIN_ID` est exporté** plutôt que recopié : un `id` écrit à deux endroits est un
  `id` qui divergera, et un lien d'évitement qui pointe dans le vide est silencieux.
- **Les classes `focus-visible:` sont écrites en toutes lettres sur les trois liens**, sans
  constante partagée. AC2 se lit par un `grep` qui compte des LIGNES : une constante utilisée trois
  fois n'en rendrait qu'une, et l'AC serait coché sans que la garde qu'il décrit existe.
- **Le `ring-offset` de la sidebar est REVENU, et la raison de son absence a changé de vrai à faux.**
  La première version écrivait : « aucun `ring-offset` — il aurait exigé une couleur de fond en dur
  (`ring-offset-stone-900`), que la garde de TCK-358 refuse ». C'était juste tant que la barre
  parlait `stone-*` ; depuis que TCK-358 l'a passée aux jetons, **`ring-offset-sidebar` EST un
  jeton** et la garde l'accepte. Vérifié en compilant la feuille réelle avec `@tailwindcss/cli`
  (v4.3.3) sur une sonde portant la chaîne exacte : `.focus-visible\:ring-offset-sidebar:focus-visible
  { --tw-ring-offset-color: #2a2018 }`. Sans le second utilitaire, `ring-offset-2` seul retombe sur
  le blanc par défaut de Tailwind — un liseré blanc de 2 px sur une barre sombre.
  ⚠ L'offset est posé sur les **trois** types de liens, pas seulement sur l'entrée active : sur une
  entrée non active, sa couleur EST celle du fond, il est donc invisible par construction. Le poser
  conditionnellement aurait fait dépendre l'affordance de focus de l'état `active`.
- **`SuperAdminTopbar` est traité aussi, bien qu'AC2 ne le nomme pas.** AC2 ne cite que
  `SuperAdminSidebar`, et la barre du haut est restée à `grep -c focus-visible` → **0** — alors que
  l'objectif utilisateur du ticket porte sur le *shell* et que le bouton de menu est le premier
  focalisable après le lien d'évitement en viewport mobile. Traiter la moitié d'un shell, c'est ne
  pas le traiter. Pas d'offset ici : rien dans cette barre n'est rempli de `--primary`, l'anneau ne
  peut pas se confondre avec ce qu'il entoure.
- **Le lien d'évitement est gardé par son affordance, plus par deux sous-chaînes de classe.** Les
  assertions `sr-only` / `focus:not-sr-only` gardaient sa VISIBILITÉ et rien d'autre : deux
  ablations mesurées restaient vertes sur les 7 tests — retirer tout son anneau de focus, et
  retirer tout son positionnement (`focus:absolute focus:left-4 focus:top-4 focus:z-50`, sans quoi
  le focus le remet dans le FLUX d'un `h-screen flex-col` et pousse la topbar et le `<main>` vers le
  bas). Les deux moitiés sont désormais assertées classe par classe, et les deux ablations rougissent.
- **Le test des onglets RECALCULE le contraste, il ne fige pas une chaîne.** Il lit l'opacité
  réellement rendue par le composant et refait la mesure sur les trois fonds : rabaisser l'opacité
  rougit avec le chiffre qui la condamne (`--foreground @60 % sur --muted (#f1ece0) = 4.3520:1`), et
  un déplacement futur de `--muted` dans `globals.css` le dirait aussi. Un test qui n'aurait figé
  que la chaîne `text-foreground/70` aurait accepté n'importe quel `--muted` plus clair.

### Ce que la vérification n'a PAS couvert

Le rendu n'a pas été ouvert dans un navigateur : tout ci-dessus est **calculé** (ce qu'AC1 exige
explicitement) ou **exécuté sous jsdom**. Restent donc non couverts : l'apparence de l'anneau en
pixels, et le comportement de la sidebar mobile (`SheetContent`) au clavier.

**Onze ablations, toutes rouges, toutes restaurées (`md5` vérifié à chaque retour).** Quatre au
premier passage — anneau du sous-item retiré, `stone-500` remis, `tabIndex` retiré, lien d'évitement
déplacé après la topbar — puis sept après la revue adverse, dont **les deux qu'elle avait mesurées
VERTES** :

| Ablation | Résultat |
|---|---|
| `text-foreground/70` → `/60` dans `tabs.tsx` | rouge : `--foreground @60 % sur --muted (#f1ece0) = 4.3520:1` |
| `ring-offset-sidebar` retiré des trois liens (l'offset retombe sur le blanc de Tailwind) | rouge ×2 |
| `ring-offset` retiré de la SEULE entrée de premier niveau (celle qui porte `aria-current`) | rouge ×2 |
| lien d'évitement privé de `focus:outline-none focus:ring-2 focus:ring-ring` *(était VERTE)* | rouge |
| lien d'évitement privé de `focus:absolute focus:left-4 focus:top-4 focus:z-50` *(était VERTE)* | rouge |
| anneau retiré du bouton de menu de la topbar | rouge |
| anneau retiré du lien de marque de la topbar | rouge |

### Ce que la revue adverse a imposé de reprendre

La revue a **refusé** le premier livrable sur deux points, tous deux mesurés — et aucun ne portait
sur ce qui avait été écrit, mais sur ce qui ne l'avait pas été :

1. **Un échec AA réel** sur l'onglet inactif de Reporting (4,35:1), livré « vide à dessein » sur une
   mesure prise contre un fond que la page n'utilise pas. Corrigé dans `tabs.tsx` — **primitive
   partagée par 12 consommateurs** : l'onglet inactif devient plus sombre partout, prix assumé d'une
   valeur unique qui tient sur les trois fonds dans les deux thèmes (marge minimale 1,29).
2. **Le relevé paire par paire qu'AC1 commande nommément était périmé** : 20 lignes sur 26
   mesuraient des paires supprimées par la résolution de conflit avec TCK-358. *Un AC qui commande
   un document et se contente d'un document faux ne garde rien.*

Quatre défauts mineurs de plus, tous corrigés : la contradiction 8,08 / 7,91 (les huit mesures de la
barre vivent désormais à **un seul endroit**), l'anneau de focus **indiscernable** sur l'entrée
active (`--ring` et `--sidebar-primary` sont le même octet en contexte sombre : 1,00:1, rétabli à
4,83:1 par `ring-offset-2 ring-offset-sidebar`, jeton vérifié en compilant la feuille Tailwind
réelle), le lien d'évitement gardé par sa seule visibilité (deux ablations que la revue avait
mesurées **vertes**, désormais rouges), et la topbar sans aucun `focus-visible` (0 → 3).

**Aucun défaut n'est resté ouvert.** Ce qui n'est pas couvert reste ce que dit la section
ci-dessus : aucun rendu navigateur, et la sidebar mobile (`SheetContent`) au clavier.
