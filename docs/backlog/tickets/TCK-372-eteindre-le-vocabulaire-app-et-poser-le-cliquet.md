---
id: TCK-372
title: "Éteindre le vocabulaire `app-*` et poser le cliquet — la correction de TCK-244"
status: todo
phase: P2
family: front
estimate: L
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: [TCK-373]
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
tags: [front, design-system, admin, dashboard, codemod, dette-ac]
---

## Objectif utilisateur

L'utilisateur connecté perçoit une seule identité visuelle, et l'équipe n'a plus qu'un endroit où changer une couleur.

## Contexte — TCK-244 est `done`, et son AC1 est fausse aujourd'hui

[TCK-244](TCK-244-dashboard-admin-legacy-tokens-migration.md) — *« Dashboard /app + /admin —
migration tokens legacy → tokens DS Lin »*, vague 27 — est marqué `done`. Ses critères
rejoués **verbatim** le 2026-08-26 :

```
$ grep -RE "text-app-ink|bg-app-surface|text-app-accent|border-app-surface" 'src/app/(dashboard)'
7          ← AC1 exigeait « aucun résultat ». Elle échoue dans son propre périmètre.

$ grep -RE "stroke-(emerald|sky|red|blue)-[0-9]+" 'src/app/(dashboard)'
0          ← AC2 passe.
$ grep -RnE "(fill|bg)-(emerald|sky|red|blue|rose|amber)-[0-9]+" src/components/charts
6          ← les mêmes couleurs, en `fill-`, dans un répertoire que l'AC ne regardait pas.
```

**Trois échappatoires, toutes structurelles, aucune due à un travail bâclé :**

1. **Le périmètre.** L'AC greppe `src/app/(dashboard)` — les *pages*, qui sont des enveloppes
   serveur de quelques dizaines de lignes. Le vocabulaire vit dans les composants qu'elles
   montent : **1049 occurrences dans `src/components`**, dont **183 sur la seule surface
   `/admin`**, pour 15 dans le répertoire audité. *Un grep qui ne suit pas les imports mesure
   le répertoire, pas l'écran.*
2. **Le préfixe.** AC2 cherchait `stroke-`. `BarChart.tsx:128` écrit `fill-emerald-500`,
   `fill-sky-500`, `fill-amber-500`, `fill-rose-500`. La palette hors charte a survécu à un
   caractère près.
3. **Le « ou ».** AC3 acceptait « utilisent `<PageHeader>` **ou** appliquent `font-display` au
   `h1` ». C'est la branche de droite qui a été prise : 3 pages de `/admin` montent le
   composant, **9 recopient son balisage** (12 occurrences). Une AC alternative n'oblige à
   rien : elle nomme la sortie de secours et l'autorise.

**Et rien ne l'a rattrapé depuis, parce qu'aucune garde ne le rejoue.** C'est le même motif que
[TCK-245 sur la console super-admin](TCK-358-console-super-admin-tokens-et-cliquet.md) : sans
cliquet, un `done` mesuré une fois redevient faux sans que personne le voie.

**Le fond du problème n'est pas l'usage, c'est le doublon.** `--app-bg`, `--app-ink`,
`--app-ink-muted`, `--app-surface-1/2/3`, `--app-accent` sont définis dans `globals.css` avec
**exactement** les valeurs de `--background`, `--foreground`, `--muted-foreground`, `--card`,
`--muted`, `--border`, `--primary` — et n'apparaissent **dans aucune** table de
[`docs/design-guidelines.md`](../../design-guidelines.md). Deux mots pour une couleur, c'est
deux endroits où la changer, et un seul qui sera trouvé.

Ils portent en outre une divergence silencieuse : le bloc `.dark` de `globals.css` redéfinit
`--background`, `--card`, `--sidebar` et leurs voisins, **et pas un seul `--app-*`**. Le mode
sombre n'est atteignable nulle part aujourd'hui — c'est donc une dette latente, pas un défaut
vivant. Mais elle se réveillera au premier commutateur de thème, et elle se réveillera sur le
shell entier de `/admin`, qui est bâti dessus.

## Contrat de données

Aucun. Ticket purement visuel : aucun endpoint, aucun contrat de réponse, aucun comportement.

## Direction UX / Artistique

**Le rendu ne doit pas bouger d'un pixel.** Les valeurs sont identiques des deux côtés : c'est
un renommage, et toute différence visible est une erreur de traduction, pas un choix.

La fin de course est nette et se vérifie d'un grep : **les déclarations `--app-*` disparaissent
de `globals.css`**. Tant qu'elles existent, la garde doit énumérer des usages ; une fois
retirées, l'absence se prouve toute seule.

## Contraintes strictes (métier)

- Aucune valeur hex écrite en dur ne réapparaît : la règle fondamentale des guidelines est
  « zéro valeur hex arbitraire dans le code ».
- Chaque `--app-*` se traduit par le token documenté de **même rôle**, pas de même valeur : si
  deux rôles partagent aujourd'hui un hex, c'est le rôle qui tranche, pas la couleur.
- Les tokens de cible existent déjà en clair **et** en sombre : ne pas en créer de nouveaux
  pour ce ticket.
- La garde vit sous `scripts/check-*.mjs`, porte son motif et son relevé chiffré dans son
  propre en-tête, et est rejouée par `.github/workflows/repo-ci.yml`.

## Delta à produire

- [ ] Traduction de `app-*` vers les tokens documentés sur toute la surface qui les emploie
      (1083 occurrences relevées, dont 183 sur `/admin`)
- [ ] Suppression des déclarations `--app-*` et de leurs alias `@theme inline` dans
      `src/app/globals.css`
- [ ] Garde `scripts/check-*.mjs` refusant toute réapparition, avec motif et relevé daté en
      en-tête
- [ ] Branchement de la garde dans `repo-ci.yml`
- [ ] Vérification visuelle sur au moins 5 écrans représentatifs de `/app` et `/admin`

## Critères d'acceptation

- [ ] AC1 — `grep -rE '\-\-app-(bg|ink|ink-muted|surface-[123]|accent|topbar)' src/app/globals.css`
      ne renvoie **aucun** résultat : le doublon n'existe plus à la source
- [ ] AC2 — `grep -rEc '\b(bg|text|border|ring|divide|fill|stroke)-app-[a-z0-9-]+' src/`
      renvoie **0**, contre 1083 le 2026-08-26
- [ ] AC3 — la garde **sort en échec** quand on réintroduit volontairement `text-app-ink` dans
      `src/components/admin/AuditTrail.tsx` — vérification **par ablation** : une garde qui n'a
      jamais échoué n'est pas prouvée, elle est supposée
- [ ] AC4 — la garde couvre `src/` **entier**, pas un répertoire de pages : c'est la leçon de
      l'AC1 de TCK-244, et un correctif qui la répéterait serait le même défaut sous un
      nouveau numéro
- [ ] AC5 — aucune valeur hex nouvelle n'apparaît dans un fichier `.tsx` du diff
- [ ] AC6 — comparaison avant/après sur 5 écrans : **aucune différence de rendu**
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` passent

## Hors périmètre

- La palette du graphique et les locales codées en dur — TCK-374.
- L'adoption de `PageHeader` et des primitives partagées — TCK-373.
- Les quatre répertoires de la console super-admin — TCK-358 (les deux gardes peuvent
  fusionner le jour où les deux tickets sont livrés ; ce n'est pas une condition ici).
- Brancher un commutateur de thème sombre : décision structurelle, ADR requis.
- Rouvrir TCK-244 : son statut ne change pas, ce ticket porte la correction.

## Notes d'implémentation

_(à remplir par implementing-specs)_
