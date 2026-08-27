---
id: TCK-384
title: "Primitives partagées — la couleur brute que la console rend sans pouvoir la garder"
status: todo
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-358]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, tokens, garde-ci, dette]
---

## Objectif utilisateur

Un `<Toast>` de succès, un message d'erreur de formulaire, un menu déroulant ou une visionneuse
de PDF ont **la même couleur partout** — console super-admin, tableau de bord, site public — et
cette couleur vient de `globals.css`, pas du fichier qui l'affiche.

## Contexte

TCK-358 a éteint la palette Tailwind brute de la console super-admin et posé
`scripts/check-super-admin-tokens.mjs`. Sa revue adverse a montré que la garde mesurait **quatre
répertoires** alors que l'écran est un **graphe de rendu** : elle sortait en 0 pendant que
`/super-admin/payouts` affichait six pastilles de statut en palette brute, deux maillons plus
loin, dans `src/components/billing`.

Le correctif de ce défaut a fait deux choses. Il a porté sur les jetons les fichiers que la
console est seule à rendre (`billing/PayoutTable.tsx`, `kyc/kyc-components.tsx`, et il a mis
`src/components/billing` et `src/components/reporting` sous garde). Et il a fait **calculer à la
garde la clôture des imports** depuis `src/app/(super-admin)/**`, pour compter — et plafonner —
ce qui reste dehors.

**Ce qui reste dehors, mesuré le 2026-08-27 : 46 défauts de couleur dans 78 fichiers.** Il ne
s'agit pas d'oublis : ce sont des **primitives partagées avec `/app` et le site public**. Les
porter demande de les redessiner pour *tous* leurs appelants, et le faire depuis un ticket de
console l'aurait fait sans revoir un seul de ces autres écrans.

| Fichier | Occ. | Ce que la couleur dit |
|---|---|---|
| `components/files/PdfViewer.tsx` | 11 | chrome de visionneuse, un `bg-white` de page |
| `components/ui/toast.tsx` | 12 | succès / avertissement, avec leurs variantes sombres |
| `components/layout/UserMenu.tsx` | 4 | avatar et pastille, blanc littéral |
| `components/ui/sheet.tsx` | 3 | voile, titre, description |
| `components/ui/dropdown-menu.tsx` | 3 | surface, anneau, une ombre en `rgba()` |
| `components/forms/FormError.tsx` | 3 | l'erreur de formulaire, en rouge de palette |
| `components/forms/FormSuccess.tsx` | 3 | le succès de formulaire, en vert de palette |
| `components/ui/warning-banner.tsx` | 3 | l'ambre du bandeau, alors que `--warning` existe depuis TCK-358 |
| `components/shared/LanguageSwitcher.tsx` | 2 | voile et anneau |
| `components/ui/dialog.tsx` | 1 | voile |

⚠ **Ce tableau a compté 54 défauts dans 89 fichiers pendant une demi-journée du 2026-08-27, et il
avait tort dans le sens qui fait travailler pour rien.** Huit de ces 54 étaient des DOCBLOCKS de
`console/StatusBadge.tsx`, `console/DataState.tsx` et `feedback/ErrorState.tsx` — du récit de
migration écrit en classes copiables, pas du rendu. Réécrits en toutes lettres le jour même, ces
deux répertoires sont **entrés dans `PERIMETRES`** et ne relèvent plus de ce ticket.

**Ils sont donc dans le PÉRIMÈTRE GARDÉ, et nulle part ailleurs** — pas dans ce tableau, pas dans
le compte de 46. Un fichier ne peut pas être dans les deux : `resteNonGarde()` retire le périmètre
de la clôture avant de compter, et le point 2 des « notes » ci-dessous, qui les annonçait comme le
lot le moins cher, est **déjà fait**.

Le compte exact ne se recopie pas d'ici — il se prend :

```bash
node scripts/check-super-admin-tokens.mjs --report   # section « reste NON GARDÉ »
```

Trois points valent d'être notés avant de commencer :

1. **`ui/warning-banner.tsx` est le plus facile et le plus significatif** : TCK-358 a posé
   `--warning` / `--warning-foreground` dans `globals.css` précisément pour ce cas, et
   `console/StatusBadge` s'en sert déjà. Le bandeau, lui, est resté en ambre de palette. *Un jeton
   posé pour un usage et adopté par un seul de ses deux appelants est un jeton à moitié posé.*
2. ~~Les trois docblocks~~ — **FAIT le 2026-08-27, dans TCK-358.** Réécrits en toutes lettres
   (« ambre 100 », « pierre 200 », « rouge 600 »), sans toucher une ligne de code ;
   `src/components/console` et `src/components/feedback` sont entrés dans `PERIMETRES` et le
   plafond est passé de 54 à 46. La leçon reste écrite ici parce qu'elle vaut pour la suite : un
   docblock qui montre une classe est la documentation périmée qui fait repousser le motif, et
   c'est la seule raison pour laquelle ces deux répertoires étaient restés dehors. Vérifié par
   ablation — remettre le récit en classes fait rougir la garde.
3. **`ui/toast.tsx`, `ui/sheet.tsx` et `ui/dialog.tsx` portent des variantes `dark:`** qui
   basculent aujourd'hui sur des échelles Tailwind. Les porter sur les jetons n'est pas une
   substitution ligne à ligne : il faut vérifier que `.dark` de `globals.css` publie l'équivalent,
   et le poser sinon.

## Contraintes strictes (métier)

- **Aucun de ces fichiers n'appartient à la console.** Chaque substitution doit être revue sur au
  moins un écran de `/app` **et** un écran public, pas seulement sur `/super-admin`.
- **Traduire par RÔLE, jamais par teinte proche.** Le tableau de correspondance est imprimé par
  `scripts/check-super-admin-tokens.mjs` quand elle rougit.
- **`.qr-surface` reste la forme du blanc FONCTIONNEL** (un fond de QR code doit rester blanc en
  thème sombre). `PdfViewer`, dont le `bg-white` peut relever du même cas, se tranche
  explicitement — pas par défaut.
- Le voile d'un `dialog` / `sheet` en `bg-black/xx` est un cas à trancher, pas à substituer : un
  voile n'est pas une surface, et `--foreground` n'est pas noir.

## Delta à produire

1. Porter les fichiers du tableau ci-dessus sur les jetons, par ordre de coût croissant : les
   `ui/warning-banner.tsx` d'abord (le jeton `--warning` existe déjà pour lui), puis les
   formulaires, puis les primitives à variantes sombres, `ui/toast.tsx` et `files/PdfViewer.tsx`
   en dernier — ils portent à eux deux 23 des 46.
2. Faire entrer chaque fichier porté dans `PERIMETRES` de
   `scripts/check-super-admin-tokens.mjs` — un fichier porté qui n'entre dans aucun périmètre
   revient au premier commit venu, c'est la leçon de TCK-245.
3. **Descendre `RESTE_PLAFOND` d'autant, avec sa date**, à chaque lot. Le plafond ne descend pas
   tout seul et la garde ne le lui demande pas : elle refuse qu'il monte, rien de plus.
4. Quand le reste atteint 0 : supprimer le plafond et faire de la clôture un périmètre gardé de
   plein droit. C'est là seulement que « la console parle une langue de couleur » devient une
   phrase mesurée.

## Critères d'acceptation

- **AC1** — `node scripts/check-super-admin-tokens.mjs --report` imprime un « reste NON GARDÉ »
  strictement inférieur à **46** (valeur au 2026-08-27, après la descente 54 → 46 opérée par
  TCK-358), et `RESTE_PLAFOND` vaut **exactement** ce nouveau compte — pas une estimation arrondie
  au-dessus. *Un plafond posé plus haut que la mesure laisse rentrer la différence sans rien dire.*
- **AC2** — chaque fichier porté figure dans `PERIMETRES` ; le vérifier par ablation : y
  réintroduire la classe brute retirée doit faire sortir la garde en 1 **en nommant ce fichier**.
- **AC3** — `src/components/ui/warning-banner.tsx` ne cite plus aucune famille Tailwind et rend
  `--warning` / `--warning-foreground`. Le contraste du texte sur le fond est mesuré et écrit
  dans le fichier, avec sa date.
- **AC4** — pour chaque primitive touchée, au moins un test de rendu d'un écran de `/app` **et**
  d'un écran public reste vert ; les nommer dans le rapport, pas seulement les compter.
- **AC5** — `npm run lint`, `npx tsc --noEmit` et `npm run test` verts.

## Hors périmètre

- `src/components/kyc/KycUploader.tsx` (une pastille en vert de palette, l. 161). Mesuré le
  2026-08-27 : il n'est monté que par les trois assistants d'onboarding, **jamais par la console
  super-admin**. Il ne fait donc pas partie de la clôture de rendu de ce ticket et relève du
  chantier d'onboarding.
- Le style INLINE (`style={{ color: '#…' }}`). C'est le trou T1 déclaré par l'en-tête de la
  garde ; le fermer demande d'analyser un objet JS et non plus de lire du texte, ce qui est une
  décision à part.
- `/app` dans son ensemble — c'est TCK-381, qui porte le même chantier sur un autre périmètre et
  croisera celui-ci sur `ui/toast.tsx`. **Se coordonner : les deux tickets veulent porter le même
  fichier, et le porter deux fois différemment coûte plus que de le porter une fois.**

## Notes d'implémentation

L'en-tête de `scripts/check-super-admin-tokens.mjs` porte le raisonnement complet : pourquoi le
périmètre n'est pas l'écran, pourquoi la clôture d'import se trompe toujours du côté prudent, et
pourquoi le compte du reste est imprimé même quand la garde est verte. Le lire avant de toucher à
`PERIMETRES`.
