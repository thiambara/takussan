---
id: TCK-359
title: "Console super-admin — accessibilité du shell : contraste, focus clavier, lien d'évitement"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-26
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

- [ ] Libellés de groupe de `SuperAdminSidebar` remontés à ≥ 4,5:1 (`stone-400` mesure 6,93:1, ou son équivalent en token)
- [ ] `focus-visible:ring-2 focus-visible:ring-ring` explicite sur les liens de navigation, les sous-items et le lien « retour au personnel »
- [ ] Lien d'évitement dans `SuperAdminShell`, `id` sur `<main>`
- [ ] En-têtes de table et onglet actif de Reporting remontés au-dessus de 4,5:1
- [ ] Tests : présence du lien d'évitement et de l'`id` cible ; parcours clavier sur la sidebar

## Critères d'acceptation

- [ ] AC1 — chaque paire couleur/fond de `SuperAdminSidebar`, `SuperAdminTopbar` et des en-têtes de table mesure ≥ 4,5:1, **le calcul étant reporté dans les notes d'implémentation paire par paire** (une capture ou un avis visuel ne coche pas cet AC)
- [ ] AC2 — `grep -r 'focus-visible' takussan-web/src/components/layout/SuperAdminSidebar.tsx` renvoie au moins une occurrence par type de lien (item, sous-item, retour)
- [ ] AC3 — à la première tabulation depuis le haut de `/super-admin`, l'élément focalisé est le lien d'évitement, et l'activer déplace le focus dans `<main>`
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

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
| en-têtes de table `stone-500` sur `stone-50` → 4,59:1 | `DataTable.tsx:197` porte `text-muted-foreground` (`#6e655a`) → **5,72:1** sur `--card`, **5,44:1** sur `--background` |
| onglet actif de Reporting `amber-700` sur `amber-500/15` → 4,56:1 | `ReportingShell` monte le `Tabs` partagé en `variant="line"` : actif `text-foreground` → **16,69:1**, inactif `text-foreground/60` → **4,53:1** |

La paire obsolète du ticket mesure d'ailleurs **4,30:1** et non 4,56:1 (`amber-700` composé sur
`amber-500` à 15 % au-dessus de `--background`) — elle était *sous* le seuil, pas marginale. Elle
n'existe plus. **Rien n'a donc été touché sur ces deux points** : les remonter aurait consisté à
modifier des primitives partagées déjà conformes, hors du delta de ce ticket.

Les trois autres constats sont **confirmés** : libellés de groupe à 3,64:1 (le ticket dit 3,65 —
écart d'arrondi oklch→sRGB, même conclusion), `focus-visible` à **0 occurrence** dans les fichiers
propres de la console, lien d'évitement absent. Les **24 entrées de menu** annoncées sont exactes
(21 de premier niveau + 3 sous-entrées de `system`).

### AC1 — le relevé, paire par paire

Calculé sur les valeurs `oklch` exactes de `tailwindcss/theme.css` (4.2.2) et les hex de
`globals.css`, converties en sRGB linéaire puis en luminance relative WCAG 2.x. Les fonds
translucides (`amber-500/15`, `amber-500/10`) et le texte translucide (`foreground/60`) sont
**composés avant** le calcul — un ratio pris sur la couleur nominale d'un `/15` ne mesure rien.

| Paire | Ratio | Seuil |
|---|---|---|
| Sidebar · texte de base `stone-200` / `stone-900` | 13,92:1 | 4,5 |
| Sidebar · eyebrow `amber-300` / `stone-900` | 12,10:1 | 4,5 |
| Sidebar · titre `white` / `stone-900` | 17,49:1 | 4,5 |
| **Sidebar · libellé de groupe `stone-400` / `stone-900`** (était `stone-500` → 3,64:1) | **6,76:1** | 4,5 |
| Sidebar · item inactif `stone-300` / `stone-900` | 11,75:1 | 4,5 |
| Sidebar · item survolé `white` / `stone-800` | 15,20:1 | 4,5 |
| Sidebar · item actif `amber-200` / `amber-500`@15 % sur `stone-900` | 10,68:1 | 4,5 |
| Sidebar · sous-item inactif `stone-400` / `stone-900` | 6,76:1 | 4,5 |
| Sidebar · sous-item survolé `white` / `stone-800` | 15,20:1 | 4,5 |
| Sidebar · sous-item actif `amber-200` / `amber-500`@10 % sur `stone-900` | 11,83:1 | 4,5 |
| Sidebar · badge en attente `stone-900` / `amber-500` | 8,15:1 | 4,5 |
| Sidebar · retour perso `stone-400` / `stone-900` | 6,76:1 | 4,5 |
| Sidebar · retour perso survolé `white` / `stone-800` | 15,20:1 | 4,5 |
| Topbar · texte de base `stone-100` / `stone-950` | 18,11:1 | 4,5 |
| Topbar · bouton menu `stone-200` / `stone-950` | 15,72:1 | 4,5 |
| Topbar · bouton menu survolé `stone-200` / `stone-800` | 12,09:1 | 4,5 |
| Topbar · marque `amber-200` / `stone-950` (18 px gras → texte large) | 15,85:1 | 3 |
| Topbar · switcher `stone-100` / `stone-800` | 13,93:1 | 4,5 |
| Topbar · switcher survolé `stone-100` / `stone-700` | 9,43:1 | 4,5 |
| Table · en-tête `--muted-foreground` / `--card` | 5,72:1 | 4,5 |
| Table · en-tête `--muted-foreground` / `--background` | 5,44:1 | 4,5 |
| Reporting · onglet actif `--foreground` / `--background` | 16,69:1 | 4,5 |
| Reporting · onglet inactif `--foreground`@60 % / `--background` | 4,53:1 | 4,5 |
| Lien d'évitement `--primary-foreground` / `--primary` | 5,32:1 | 4,5 |
| **Anneau de focus `--ring` (`#a85332`) / `stone-900`** | **3,29:1** | 3 (non-texte, 1.4.11) |

**Zéro échec.** Deux marges sont minces et méritent d'être nommées plutôt que noyées :

- **L'anneau de focus à 3,29:1** ne passe le seuil non-texte que de 0,29. Le ticket impose le jeton
  `--ring` et jamais un hex — la contrainte est tenue, mais elle *plafonne* le contraste : `--ring`
  vaut `#a85332` (l'ocre de la palette Lin), choisi pour un fond clair, pas pour un `stone-900`.
  ⚠ **Le fond qui gouverne n'est pas celui de l'élément mais celui du parent** : en Tailwind v4,
  `ring-2` est un `box-shadow` sans `inset`, donc peint **hors** de la border-box, sur l'`<aside>`
  (`stone-900`) et jamais sur le `hover:bg-stone-800` de l'item. Mesuré contre `stone-800` par
  erreur, le même anneau donne **2,86:1** — sous le seuil. La géométrie décide du fond à mesurer.
  Si TCK-358 introduit un jeton d'anneau propre à la console sombre, c'est là qu'il faut le poser.
- **L'onglet inactif de Reporting à 4,53:1** tient de 0,03. Il vient de la primitive partagée
  (`text-foreground/60`), hors périmètre ici, mais tout assombrissement futur de `--background` le
  fait basculer.

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
- **Aucun `ring-offset`** : l'offset aurait exigé une couleur de fond en dur (`ring-offset-stone-900`),
  que la garde de TCK-358 refuse. Sans offset, l'anneau reste lisible — cf. la géométrie ci-dessus.

### Ce que la vérification n'a PAS couvert

Le rendu n'a pas été ouvert dans un navigateur : tout ci-dessus est **calculé** (ce qu'AC1 exige
explicitement) ou **exécuté sous jsdom**. Les quatre assertions clés ont été vérifiées **par
ablation** — anneau du sous-item retiré, `stone-500` remis, `tabIndex` retiré, lien d'évitement
déplacé après la topbar : rouge à chaque fois, vert au retour.
