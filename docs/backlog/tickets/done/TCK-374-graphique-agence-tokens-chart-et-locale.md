---
id: TCK-374
title: "Graphique agence — palette `--chart-*` et locale active au lieu de `'fr'`"
status: done
phase: P2
family: front
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#28-internationalisation--préférences
tags: [front, admin, charts, i18n, design-system]
---

## Objectif utilisateur

L'admin d'agence lit un graphique aux couleurs de son produit, et voit ses montants et ses nombres dans la langue qu'il a choisie.

## Contexte

**La palette.** `BarChart.tsx:128` — le seul graphique du tableau de bord agence :

```js
const palette = ['fill-emerald-500', 'fill-sky-500', 'fill-amber-500', 'fill-rose-500'];
```

Le dépôt définit `--chart-1` … `--chart-5`, en Lin, **déclinés en clair et en sombre**. Ils ne
sont pas employés. Contraste des barres sur la carte blanche, calculé le 2026-08-26 :
**amber-500 → 2,15:1**, **emerald-500 → 2,54:1**, **sky-500 → 2,77:1** — sous le seuil de 3:1
que WCAG 1.4.11 pose pour un objet graphique porteur de sens. L'axe est par ailleurs figé en
`toLocaleString('fr-FR')`.

**La locale.** 12 appels `formatNumber` / `formatCurrency` / `formatPercent(…, 'fr')` et 9
`'fr-FR'` sur la surface `/admin`. Le cas le plus parlant est `AgencyRevenueSnapshot.tsx` : il
porte un long commentaire TCK-292 expliquant pourquoi les mois de l'axe ont été rebranchés sur
`useLocale()` — et **six lignes plus bas**, `formatCurrency(total, 'fr')`. La correction s'est
arrêtée à l'axe qu'elle regardait.

## Contrat de données

Aucun. Les séries sont déjà servies par `/api/dashboard/agency`.

## Direction UX / Artistique

Un graphique de back-office n'a pas besoin de quatre couleurs vives : il a besoin d'une série
lisible. La charte fournit déjà l'échelle ; la suivre suffit, et elle règle le contraste par la
même occasion.

## Contraintes strictes (métier)

- Les couleurs de série passent par `--chart-*`, en clair **et** en sombre.
- Le formatage suit la locale active, jamais une locale écrite dans le code — la règle vaut
  pour l'axe comme pour les totaux, les montants, les pourcentages et les dates.
- Le composant est partagé : il sert aussi `/app/overview/*`. Le changement se propage, et
  c'est voulu.

## Delta à produire

- [x] Palette des séries et de la légende sur `--chart-*`
      <br>Ordre des séries `1, 2, 4, 5` : `--chart-3` est **écarté**, pas corrigé — il rend 2,57:1 sur `--card` clair, *moins bien* que l'`emerald-500` qu'il devait remplacer → **[TCK-404](TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md)**.
- [x] Axe, totaux et libellés du graphique sur la locale active
- [x] Les 12 `'fr'` et 9 `'fr-FR'` de la surface `/admin` remplacés par la locale active
      <br>Les **12 `'fr'` y étaient exactement** et sont remplacés — `grep -rnE "'fr'|'fr-FR'"` sur `src/app/(dashboard)/admin`, `src/components/dashboard/admin` et `src/components/charts` hors `__tests__`, exécuté le 2026-08-27 : **aucun appel de formatage**. Les **9 `'fr-FR'` sont introuvables sous cette forme** : la surface admin d'agence en portait **0** (les 63 du dépôt sont ailleurs, dont 18 en console super-admin → TCK-364).
- [x] Tests : au moins un qui rend dans une locale non française et **échouerait** si `'fr'`
      revenait
      <br>Deux mutations sont passées VERTES au premier tour et ont fait ajouter deux cas — dont « rétablir une locale figée dans `AgencyKpis` », c'est-à-dire **dix des douze sites que le ticket nomme**, qu'aucun test ne rendait ailleurs qu'en `fr`.

## Critères d'acceptation

- [x] AC1 — `grep -rnE "'fr'|'fr-FR'"` sur la surface `/admin` et sur `src/components/charts`
      ne renvoie aucun appel de formatage
      <br>Exécuté le 2026-08-27 : **une seule ligne**, et c'est un **commentaire** (`AgencyQueues.tsx:213`) — devenu faux, il affirme que « les six tuiles KPI d'à côté figent encore `'fr'` en dur ». Voir « Ce qui reste ouvert ».
- [x] AC2 — `grep -rE '(fill|bg|stroke)-(emerald|sky|amber|rose)-[0-9]+' src/components/charts`
      ne renvoie aucun résultat
      <br>Exécuté le 2026-08-27 : **zéro ligne**. Et l'AC est désormais **structurelle** : `ChartSeries.color` n'est plus un `string` mais l'union des jetons admis, donc `tsc` refuse une couleur brute **au point d'appel** — nécessaire, puisque aucune garde du dépôt ne couvrait `src/components/charts`.
- [x] AC3 — le contraste de chaque couleur de série sur `--card` est **calculé et reporté dans
      la PR**, en clair et en sombre, et atteint 3:1
      <br>Recalculé par **deux implémentations indépendantes** qui se retrouvent au centième, puis remplacé par une garde qui le **recalcule à chaque exécution** au lieu de le reporter une fois : `node scripts/check-chart-contrast.mjs` → exit 0, **28 mesures** (14 formes × 2 thèmes) sur 14 fichiers, minimum **3,59:1** (vérifié par moi le 2026-08-27). Branchée dans `repo-ci.yml`.
- [x] AC4 — un test rend le tableau de bord en `en` et vérifie un nombre formaté à l'anglaise ;
      il échoue si on rétablit `'fr'` (vérification par ablation)
      <br>⚠ Vert pour `en`, et **aveugle à `wo`** jusqu'à la reprise — c'est exactement là que vivait la régression (cf. reprise). Trois cas neufs mesurent désormais `wo`.
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      <br>**Deux tiers exécutés.** `npx tsc --noEmit` → exit 0 sur l'arbre fusionné (2026-08-27, vérifié par moi) ; `npm run lint` → 0 erreur, 37 avertissements dont aucun sur les fichiers du ticket ; `check-chart-contrast`, `check-locale-figee` (cliquets 1 et 48 tenus), `check-super-admin-tokens` et `npm run check:i18n` verts (les deux derniers vérifiés par moi). Périmètres joués : 173 fichiers / 949 tests (revue), 120 fichiers / 922 tests (correctif). **`npm run test` en ENTIER : non lancé** — et **`npm run build` non plus**, qui est le SEUL passage compilant réellement Tailwind : *rien de ce qui a été joué ne prouve que `border-chart-4` ou `bg-chart-1/80` produisent du CSS.* Le raisonnement du littéral entier est solide, mais reste un raisonnement. **Se coche par le rituel de fin de branche, machine au repos.**

## Hors périmètre

- Enrichir le graphique (infobulles, comparaison de période, second axe) — le tableau de bord
  agence relève de TCK-375, et les rapports plateforme de TCK-361.
- Les locales codées en dur ailleurs que sur la surface `/admin` et les graphiques.

## Notes d'implémentation

**Quatre affirmations du ticket ont été contredites par la mesure du 2026-08-27.**

1. **« Les jetons `--chart-*` ne sont pas employés » — faux.** Six points d'appel les passaient
   déjà explicitement (`color: 'stroke-chart-1'`, `'fill-chart-2'`) dans les trois pages
   `/app/overview/{agency,agent,owner}`. C'est le **défaut** de `BarChart`/`LineChart` — la
   couleur choisie quand l'appelant n'en passe pas — qui restait sur la palette brute. Le seul
   écran réellement atteint est donc celui du ticket : `AgencyRevenueSnapshot`, série unique et
   sans `color`, donc `fill-emerald-500` à 2,54:1.

2. **« Suivre la charte règle le contraste par la même occasion » — faux d'un jeton sur cinq.**
   `--chart-3` (`#c89a4a`) rend **2,57:1** sur `--card` clair, *moins bien* que l'`emerald-500`
   qu'il devait remplacer — et 8,17:1 en sombre. Le défaut n'existe que dans un thème, ce qu'une
   vérification faite dans un seul aurait conclu à l'envers. Le jeton est **écarté de l'ordre des
   séries** (`1, 2, 4, 5`), pas corrigé : changer sa valeur est une décision de charte →
   **TCK-404**.

3. **« 9 `'fr-FR'` sur la surface `/admin` » — introuvable sous cette forme.** La surface admin
   d'agence (`src/app/(dashboard)/admin` + `src/components/dashboard/admin`) en portait **0** ; les
   12 `'fr'`, eux, y étaient exactement. Les 63 `'fr-FR'` du dépôt sont ailleurs, et les 18 de la
   console super-admin relèvent de TCK-364. Périmètre retenu : surface admin d'agence + `charts`.

4. **`BarChart.tsx:128` — c'est la ligne 127** (`const palette`), 128 étant le `return`. Sans
   conséquence, noté pour que le prochain relevé ne se croie pas décalé.

**Deux décisions de forme, toutes deux payées par une mesure.**

- **Les classes de couleur sont des littéraux entiers**, jamais `` `fill-chart-${n}` `` : Tailwind
  v4 ne compile que les chaînes complètes trouvées en source. Une classe assemblée à l'exécution
  laisse le `<rect>` avec son `fill` par défaut — du noir — sans erreur ni avertissement, et
  invisible à `tsc` comme à ESLint.
- **`ChartSeries.color` n'est plus un `string`** mais l'union des jetons admis. C'est ce qui rend
  l'AC2 structurelle : aucune garde du dépôt ne couvre `src/components/charts`
  (`check-super-admin-tokens` s'arrête à la console super-admin, `check-app-tokens` ne connaît que
  le dialecte `--app-*`), donc une couleur brute écrite dans une page serait passée. `tsc` la
  refuse maintenant au point d'appel.

**`scripts/check-chart-contrast.mjs`** recalcule l'AC3 au lieu de la reporter une fois : elle lit
les jetons de série dans `charts/palette.ts` et les valeurs dans `globals.css`, **dans les deux
thèmes**, et échoue sous 3:1. Branchée dans `repo-ci.yml`. Vérifiée par ablation (3 mutations,
3 rouges).

**Vérification par ablation : 10 mutations, 10 rouges.** Deux d'entre elles sont passées vertes au
premier tour et ont fait ajouter deux cas — ce sont les deux qui comptent :

- mettre `bg-chart-1` sur **toutes** les pastilles de légende ne rougissait rien : les tests
  vérifiaient qu'une pastille porte *un* jeton, pas qu'elle porte *le même* que sa barre. Une
  légende qui donne une couleur à trois séries est pire qu'absente ;
- rétablir une locale figée dans `AgencyKpis` (dix des douze sites du ticket) ne rougissait rien
  non plus : aucun test n'y rendait autre chose que `fr`.

**Constat ouvert en ticket, pas corrigé :** `BarChart` ancre `min = 0` et rend une valeur négative
à `height="0"` — invisible, sans erreur, là où `LineChart` ouvre son domaine. Hors delta →
**TCK-405**, avec les deux sondes qui le documentent déjà dans
`charts/__tests__/palette-et-locale.test.tsx`.


## Reprise après revue adverse — 2026-08-27

La revue a rendu **accepté sous réserve** : les cinq AC tenus sous son exécution, y compris l'AC5
que l'implémenteur déclarait non exécutée, et **ses sept contradictions du ticket confirmées** —
les huit contrastes recalculés par une implémentation indépendante se retrouvent au centième. Mais
elle a trouvé ce que les tests ne pouvaient pas voir : **une régression utilisateur réelle sur la
locale `wo`, la troisième langue du produit, qu'aucun test ne rendait jamais**, et une garde aveugle
à **six formes de contournement sur neuf**. **Cinq défauts corrigés, plus un sixième trouvé par
mesure.**

**1. La locale `wo` rendait deux conventions de nombre dans le même écran.** Le module partagé
`lib/format.ts` portait **deux tables** — l'une envoyait `wo` à `['wo', 'fr-SN']`, l'autre à
`fr-SN` — et un tableau n'est pas une chaîne de repli : c'est une liste de préférences, dont la
première prise est la bonne. Mesuré sur Node v24.18.0 : `Intl.supportedLocalesOf(['wo'])` rend
**`["wo"]`**, donc le second élément n'est **jamais** atteint, et `wo` groupe par « . »
(`1.234.567,89`) là où `fr-SN` groupe par espace fine (`1 234 567,89`). Le docblock décrivait un
mécanisme inexistant. **Le défaut est antérieur au ticket** (`git diff origin/dev -- src/lib/format.ts`
est vide) ; ce que TCK-374 a fait, c'est le rendre **atteignable**, en portant les dix sites
d'`AgencyKpis` de `'fr'` en dur à la locale active — un dormant réveillé.

Une table unique (`ETIQUETTES_INTL = { fr: 'fr-SN', en: 'en-GB', wo: 'fr-SN' }`), `toCurrencyLocale`
supprimée. Le choix de `fr-SN` plutôt que du `wo` réel est **mesuré, pas préféré** : date-fns ne
fournit aucune locale wolof (`wo: fr`, écrit et daté depuis TCK-292), donc un `wo` réel côté `Intl`
produirait une incohérence de plus ; les données CLDR de `wo` ne sont pas sénégalaises sur ce qui
compte (séparateur « . », date `medium` de forme anglaise `14 Mar, 2026`), et `wo-SN` n'y change
rien ; et `wo` n'est **pas garanti par le runtime** — sa présence dépend de la build ICU, or Next
rend serveur puis hydrate client : deux ICU qui ne s'accordent pas sur `wo` produisent une
divergence d'hydratation sur un montant, *le genre de défaut qu'on ne reproduit jamais sur la
machine qui l'a écrit.* Ce qui n'est **pas** réglé et est nommé dans le docblock neuf : un
utilisateur wolophone lit des noms de mois français (TCK-347).

⚠ Le correctif fait rougir **exactement 3 cas** ailleurs, tous dans `useFormatteurs.test.tsx`, tous
de la forme `expect(new Set(rendus).size).toBe(3)` : **la propriété « trois chaînes différentes »
posée par TCK-364 reposait sur le défaut lui-même.** Elle a été **resserrée, pas affaiblie** — elle
vise toujours « toutes les locales rendent la même chose », que deux chaînes distinctes falsifient
déjà. Aucun des 62 autres importateurs de `@/lib/format` ne bouge.

**2. La garde de contraste laissait passer six formes sur neuf.** `stroke-chart-1/50` sortait en 0
**sans même changer le compte affiché**, alors que le trait composé rend 2,11:1 ; idem
`fill-chart-10` et `fill-[#c89a4a]`. Une quatrième, non listée par la revue, a été trouvée :
`style={{ fill: 'var(--chart-3)' }}` — déjà employée par `CohortHeatmap.tsx:109`. Le déplacement de
fond : la lecture est **large puis classée**, et une queue **ininterprétable fait échouer au lieu
d'être omise**. La première version n'attrapait un jeton que s'il avait la forme attendue, *donc
toute forme inattendue devenait invisible.*

**3. La garde ne se gardait pas elle-même** : trois amputations sortaient en 0, dont une qui ne
changeait même pas le compte. Une auto-épreuve en 5 volets — les constantes, l'**arithmétique**
(valeurs de contrôle connues : blanc/noir = 21:1, `--chart-3` sur blanc = 2,57:1, la composition à
50 % = 2,11:1 ; *une luminance amputée rend des chiffres, pas une erreur — le mode d'échec qu'aucun
cliquet de comptage n'attrape*), la lecture, les sorties du système, et le dépouillement des
commentaires dans les deux sens — plus un cliquet `MESURES_ATTENDUES = 28` qui échoue **dans les
deux sens**, et des exemptions **vivantes** : une entrée qui ne correspond plus à aucune occurrence
fait échouer. *Une porte ouverte que plus personne ne franchit reste une porte ouverte.*

**4. Le nom de l'étape CI promettait plus que la lecture ne tenait** — 11 classes vivaient hors de
`palette.ts`. La lecture est **élargie** (`components/charts` **et** `components/reporting`, 14
fichiers) plutôt que le nom rétréci. Mais élargir naïvement casse : `bg-chart-3/15` rend 1,13:1 et
`fill-chart-1/10` 1,14:1 — **aucun des deux n'est une couleur de série**, ce sont des fonds, et
1.4.11 ne s'y applique pas. Le classement **ne se déduit pas d'une chaîne de classe : il se
déclare**, avec sa mesure et sa raison écrites. Le minimum du dépôt passe de 4,48 à 3,59:1 — non
parce que quelque chose s'est dégradé, mais parce que la garde mesure enfin ce qui existait.

**5. Une série à zéro rendait un axe qui se répète.** Série `[0, 0]` → axe `['0', '1', '1']`. Ce
n'est pas un cas limite : c'est **un mois de revenus à zéro, l'état ordinaire d'une agence neuve**.
Les étiquettes se calculent désormais sur l'étendue réelle ; le plancher à 1 reste pour ce qu'il est
— la protection de la division par zéro de la *hauteur*. Second filet : deux graduations qui, une
fois arrondies, portent le même texte sont réduites à une (une série de taux entre 0 et 1
reproduisait le même défaut avec des valeurs non nulles). **`LineChart` portait le même défaut en
pire** — cinq graduations, `['0','0','1','1','1']`, quatre doublons — trouvé par sonde, corrigé du
même geste. Un cas de non-régression garde le nominal : le risque exact d'une déduplication est de
manger l'axe quand il est juste.

### Ce qui reste ouvert

- **[TCK-404](TCK-404-chart-3-sous-le-seuil-de-contraste-en-clair.md)** — `--chart-3` vaut toujours
  `#c89a4a` (2,57:1 en clair, 8,17:1 en sombre). Vérifié : `globals.css` n'a pas été touché par ce
  ticket. La garde en porte désormais le chiffre, dans les deux thèmes, prêt pour l'arbitrage.
- **[TCK-405](TCK-405-barchart-avale-les-valeurs-negatives.md)** — `BarChart` ancre `min = 0` et
  rend une valeur négative à `height="0"`, invisible et sans erreur. **À y verser aussi** : une
  valeur `NaN` dans la série fait disparaître l'axe entier (`['','','']`) sans erreur, et un
  correctif **partiel serait pire** — filtrer les non-finis rendrait l'axe correct pendant que les
  `<rect>` porteraient `y="NaN"`, *un graphique cassé qui a l'air sain*.
- **Un commentaire devenu faux**, mesuré le 2026-08-27 : `AgencyQueues.tsx:213` affirme que « les
  six tuiles KPI d'à côté figent encore `'fr'` en dur ». C'était vrai avant ce ticket ; les dix
  sites d'`AgencyKpis` sont portés à la locale active. Fichier de code, hors du périmètre de cette
  clôture — à corriger au prochain passage.
- **Une série de comparaison plus courte que la principale** : `LineChart` rend un `moveto` sans
  `lineto` (tracé vide) et la légende annonce quand même la série avec sa pastille. Décision de
  produit — masquer ou annoncer comme vide — plutôt que correctif.
- **Deux implémentations du calcul WCAG cohabitent** dans le dépôt : celle-ci
  (`scripts/check-chart-contrast.mjs`, jetons **parsés** depuis `globals.css`, fond `--card`
  déclaré, exécutable en CI) et `src/test/contraste-wcag.ts` posée par TCK-371 (jetons **recopiés**,
  fond remonté du DOM, pour les tests). Elles ne mesurent pas la même chose et ce n'est pas un
  défaut — mais **leurs tables de jetons peuvent diverger, ce qui est le motif du défaut n°1
  transposé.** À verser dans un ticket de convergence.
- **La garde ne mesure que `--card`**, pas `--background` ni `--muted` — limite **déclarée et
  chiffrée** dans l'en-tête (clair sur `--background` : 5,06 / 5,25 / 5,44 / 16,69 ; `--muted`
  sombre : minimum 3,70), aucun échec vivant. La fermer demande de savoir sur quelle surface chaque
  graphique est posé, ce qui ne se lit pas dans le composant mais dans son appelant. *Un trou
  déclaré et chiffré vaut mieux qu'une garde qui prétend le couvrir.*
