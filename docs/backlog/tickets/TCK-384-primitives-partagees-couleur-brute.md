---
id: TCK-384
title: "Primitives partagées — la couleur brute que la console rend sans pouvoir la garder"
status: doing
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

**Trois affirmations du ticket ont été contredites par la re-mesure du 2026-08-27, avant tout
correctif :**

1. **`ui/warning-banner.tsx` ne « rendait » PAS l'ambre de palette.** Son RENDU (l. 28) était déjà
   sur `bg-warning/10 text-warning ring-warning/20` depuis TCK-358 ; les 3 occurrences comptées
   étaient dans son DOCBLOCK, qui citait encore les classes qu'il racontait avoir éteintes. Le
   point 1 des « notes » de ce ticket — « le plus facile et le plus significatif » — portait donc
   sur zéro ligne de rendu. Corrigé en réécrivant le récit en toutes lettres, comme les trois
   docblocks du point 2.
2. **Le tableau comptait 78 fichiers ; la garde en compte 80.** Et `ui/sheet.tsx` y valait 3
   occurrences pour **4** réellement mesurées (2 textes + 1 voile + 1 ombre). Le total de 46 était
   juste ; sa répartition ne l'était pas.
3. **`layout/UserMenu.tsx` n'est pas portable en l'état**, et c'est le seul fichier du tableau qui
   ne l'est pas. Sa variante `dark` sert deux barres hautes qui fabriquent « sombre » par des
   mécanismes OPPOSÉS — `AppTopbar` pose `bg-foreground` en portée claire, `SuperAdminTopbar` pose
   `dark` + `bg-background`. L'encre lisible est `--background` sur l'une et `--foreground` sur
   l'autre : aucun jeton ne convient aux deux. Le correctif porte sur `AppTopbar`, que le cliquet
   de `/app` met explicitement hors de portée. **Le point 4 du delta (« quand le reste atteint 0 »)
   ne peut donc pas être atteint par ce ticket.**

**Deux défauts de CONTRASTE trouvés en portant, invisibles en thème clair** — le gain réel du lot,
qu'aucun critère ne demandait :

- `ui/sheet.tsx` : titre en pierre 900 sur `bg-card`, soit **1,10:1 en thème sombre**. Un titre à
  1,10:1 n'est pas peu contrasté, il est absent. Devenu 15,16:1.
- `ui/dropdown-menu.tsx` : popup en blanc littéral avec `text-foreground` par-dessus, soit
  **1,07:1 en sombre**. Devenu 15,16:1.

**Décisions tranchées** (les trois que les contraintes strictes demandaient d'expliciter) :

- **Le VOILE** (`dialog` 10 %, `sheet` 30 %) n'est pas une surface et ne suit pas le thème : aucun
  jeton ne pouvait le porter (`--foreground` devient clair sous `.dark`, `--background` est clair
  en clair). Nouveau jeton **`--scrim`**, opaque, dans `globals.css` — l'alpha reste chez
  l'appelant. C'est le raisonnement de `.qr-surface` à l'autre bout de l'échelle ; les deux sont
  désormais documentées ensemble dans `docs/design-guidelines.md`.
- **Le blanc du cadre de `PdfViewer`** relève de `bg-card`, PAS de `.qr-surface` : le blanc
  fonctionnel existe pour ce qu'une MACHINE doit lire (un QR code), et rien ne lit à la machine le
  cadre d'un `<object>` que le greffon du navigateur repeint entièrement. ⚠ Non vérifié dans un
  navigateur.
- **Les deux ombres ambiantes** gardent leur géométrie et lisent le jeton :
  `color-mix(in srgb, var(--foreground) 4%, transparent)` rend en clair exactement le noir-brun à
  4 % qu'elles écrivaient en dur, et devient une lueur claire sous `.dark`. Vérifié compilable par
  Tailwind v4 avant emploi.

**Le ton `error` de `ui/toast.tsx` n'a PAS été aligné sur `/10` par symétrie** : mesuré, cela
ferait passer `--destructive` de 4,36:1 à 4,01:1, sous AA. Une régression mesurée n'est pas un prix
acceptable pour de la symétrie.

**Quatre répertoires entiers sont entrés dans `PERIMETRES`** — `ui`, `forms`, `files`, `shared` —
plutôt que dix entrées `file`. Un fichier neuf déposé dedans est couvert d'office, ce que la forme
`file` ne fait pas. Quatre témoins ont été ajoutés avec eux : sans témoin, retirer
`{ type: 'dir', … 'ui' }` — un geste — laissait 90 primitives hors de toute exigence de zéro.

**Suite de la revue du lead (2026-08-27) — la dérogation du voile, éprouvée.**

`.qr-surface` et `--scrim` se lisent désormais ENSEMBLE : un renvoi croisé les relie dans
`globals.css`, et `docs/design-guidelines.md` porte la ligne qui dit *pourquoi* ce rôle ne
s'inverse pas — sans quoi quelqu'un « corrigera » l'anomalie apparente dans six mois.

**La dérogation porte sur le JETON, pas sur la couleur — vérifié par mutation, dans les deux
sens**, sur un fichier du périmètre gardé :

| forme | verdict |
|---|---|
| fond noir littéral, à 5 / 10 / 30 / 40 % et sans opacité, sous `hover:` et `dark:` | **refusé** (6 formes) |
| encre noire littérale, anneau noir littéral, fond blanc à 20 % | **refusé** (3 formes) |
| `bg-scrim/10`, `bg-scrim/30`, `bg-scrim/55` | accepté |

⚠ **Trou résiduel, mesuré et NON fermé — et ma première description en était trop flatteuse.**
`text-scrim` et `ring-scrim/20` passent eux aussi. J'avais écrit « la garde sait qu'un jeton est
déclaré dans `globals.css`, pas quels utilitaires il a le droit de prendre » : **elle ne sait
RIEN des jetons.** Mesuré à la revue adverse — `bg-jeton-qui-nexiste-pas`, `border-zzz` et
`text-inventé` passent les six contrôles et rendent transparent à l'exécution. La garde refuse une
liste FERMÉE de formes et laisse passer tout le reste ; `bg-scrim/30` entre par la même porte que
`border-zzz`. Le trou est donc bien plus large que « quels utilitaires un jeton peut prendre » :
c'est « aucune vérification qu'un utilitaire de couleur désigne quelque chose ». *Décrire une
garde comme plus savante qu'elle n'est, c'est fabriquer la confiance qu'elle ne mérite pas.*

⚠ **La garde a fait rougir le docblock que j'écrivais pour la documenter**, parce qu'il citait la
classe noire en toutes lettres — le contrôle B lit `globals.css`, commentaires compris. C'est la
meilleure preuve que la dérogation est étroite, et la classe y est décrite plutôt que citée.

**REFUS DE LA REVUE ADVERSE, ET LE TROU QU'IL A OUVERT (2026-08-27).**

Le lot a été REFUSÉ sur un trou de garde, reproduit puis fermé. **Toute PROPRIÉTÉ ARBITRAIRE
Tailwind v4 portant une couleur littérale traversait la garde** dans un fichier du périmètre
gardé — `[background-color:#f5f5f4]`, `[color:red]`, `[fill:#a85332]`, `[--pastille:#a85332]`,
sous `hover:` et `dark:` compris. Le contrôle D exige un PRÉFIXE (`bg-[`, `text-[`) ; cette
seconde syntaxe de Tailwind n'en a aucun.

Reproduit avant de corriger : **12 formes déposées une à une, 12 fois exit 0**, dont deux de mon
invention que la revue n'avait pas listées (`[outline-color:#fff]`, `[caret-color:hsl(…)]`). Et
elles compilent — vérifié avec le Tailwind 4.2.2 du projet.

**`[fill:#a85332]` est le cas qui fait le plus mal** : c'est exactement ce que le contrôle E
venait d'être ajouté pour attraper, écrit en classe plutôt qu'en attribut. Deux syntaxes frères,
une seule gardée — et mon lot ÉTENDAIT cette garde à quatre répertoires en annonçant « 0 classe
de couleur hors jetons sur 130 fichiers gardés ».

Fermé par un **contrôle F**, plus un regard arrière `(?<!url\()` sur le motif hexadécimal qui
sert D, E et F d'un coup (`url(#degrade-lin)` est une référence, pas une couleur). Éprouvé dans
les deux sens : **14 formes attrapées, 13 ignorées** — dont `supports-[display:grid]`,
`[&>svg]:size-3`, `[--pastille:var(--chart-1)]`, `[transition:color_120ms_ease]` et
`[background:url(#degrade-lin)]`. Les 27 sont dans `EPREUVE`. Zéro faux positif sur les 404
fichiers gardés.

**Un trou de plus est DÉCLARÉ plutôt que fermé, T9** : une déclaration CSS ordinaire
(`background-color: #f5f5f4;`) dans un fichier `.css` d'un répertoire gardé n'est vue par aucun
contrôle. Réel et VIDE — mesuré : zéro `.css` sous un périmètre gardé, les deux du dépôt étant
`globals.css` (contrôlé à part) et `playground.css` (hors périmètre). Le fermer demanderait à
`analyser()` de connaître le type des fichiers, un mécanisme neuf pour un ensemble vide.

**Et deux chiffres de docblock étaient FAUX**, tous deux annoncés plus bas que la réalité :
`FormError` sur `--card` sombre valait **5,16:1** et non 4,78, `FormSuccess` **6,91:1** et non
6,26 — dans les deux cas j'avais mesuré la bonne couleur sur la MAUVAISE OPACITÉ (`/10` pour une
classe en `/5`), et le second docblock nommait même « success/10 ». *Se tromper dans le sens
prudent reste se tromper : c'est sur ces nombres-là qu'on resserre un seuil.*

L'en-tête de `scripts/check-super-admin-tokens.mjs` porte le raisonnement complet : pourquoi le
périmètre n'est pas l'écran, pourquoi la clôture d'import se trompe toujours du côté prudent, et
pourquoi le compte du reste est imprimé même quand la garde est verte. Le lire avant de toucher à
`PERIMETRES`.
