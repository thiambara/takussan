---
id: TCK-358
title: "Console super-admin — éteindre la palette Tailwind brute, et poser le cliquet qui l'empêche de revenir"
status: done
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, super-admin, tokens, garde-ci]
---

## Objectif utilisateur

Le super-admin voit une console qui parle **une** langue de couleur — celle du produit — et le dépôt refuse mécaniquement d'en réintroduire une deuxième.

## Contrat de données

- Ticket purement frontend. Aucun changement d'API, aucun changement de comportement.

## Direction UX / Artistique

**Ce ticket ne rejoue pas TCK-245 : il corrige la raison pour laquelle TCK-245 est `done` alors que le défaut est intact.**

TCK-245 a fait porter son codemod — et son AC1 — sur `src/app/(super-admin)/**`, c'est-à-dire les *wrappers* de page. L'UI réelle vit un répertoire à côté. Relevé du 2026-08-26 :

| Périmètre | Classes `stone-*` |
|---|---|
| `src/app/(super-admin)/**` — le périmètre de l'AC1 de TCK-245 | **11** (l'AC exigeait 0 ; elles sont revenues avec `/agency-upgrade-requests` et `/super-admins`, créés après) |
| `src/components/admin/super/**` | **218** |
| `src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx` | **12** |
| `src/components/super-admin/**` | **1** |

Sur l'ensemble de la console : 348 utilitaires de palette brute (`stone`, `amber`, `emerald`, `red`…) contre 109 tokens, plus 25 tokens `app-*` — **trois vocabulaires**, dont six fichiers en mélangent deux.

- **Direction retenue : les tokens Lin existants**, ceux que `docs/design-guidelines.md` impose déjà (« la palette Tailwind brute n'est pas la palette du produit »). L'ambre d'accent (56 occurrences) redevient `--primary` ; l'ambre d'avertissement obtient enfin son token.
- **Une console sombre entière est une décision distincte** qui demanderait un ADR et des tokens `.dark` complétés : hors de ce ticket.
- La distinction visuelle « cross-tenant » que la sidebar revendique n'est aujourd'hui pas tenue : `bg-stone-100` (fond de contenu) contre `#fcf9f3` (fond Lin) mesure **1,04:1**. Porter ce signal par un élément assumé — liseré `--primary` permanent en haut de fenêtre, ou fond de contenu franchement décalé — plutôt que par un gris que l'œil ne distingue pas.

## Contraintes strictes (métier)

- Substitutions : `bg-white` → `bg-card` · `ring-stone-200` / `border-stone-200|300` → `ring-border` / `border-border` · `bg-stone-50|100` → `bg-muted` · `text-stone-500|600|700` → `text-muted-foreground` · `text-stone-900|950` → `text-foreground` · ambre d'**accent** → `primary` · ambre d'**avertissement** → nouveau token.
- **Créer le token `--warning`** dans `globals.css` (`:root` et `.dark`) et un composant `WarningBanner` : le bandeau ambre est aujourd'hui copié à l'identique dans `/enums` et `/settings`, chacun portant le même commentaire d'exception TCK-245. L'exception disparaît avec sa cause.
- Les tokens `app-*` (`text-app-ink`, `text-app-ink-muted`) sont un troisième vocabulaire : les deux fichiers concernés (`/super-admins`, `SuperAdminOnboardingWizard`) passent sur les tokens shadcn.
- `text-red-600` de `/super-admins` passe sur `ErrorState`.
- **Un cliquet, sinon rien.** Le motif est déjà revenu une fois faute de garde. `scripts/check-super-admin-tokens.mjs` doit couvrir **les quatre répertoires du tableau ci-dessus**, être rejouée par `.github/workflows/repo-ci.yml`, et porter dans son en-tête le motif et la mesure du 2026-08-26.

## Delta à produire

- [x] Token `--warning` / `--warning-foreground` dans `src/app/globals.css` (`:root` + `.dark`) et exposition `@theme inline`
- [x] Composant `WarningBanner` sous `src/components/ui/`, appliqué à `/enums` et `/settings` (suppression des deux commentaires d'exception TCK-245)
- [x] Codemod sur `src/components/admin/super/**` (218 occurrences)
  - le compte réel était **85** au 2026-08-27, pas 218 : TCK-357 est passé entre la rédaction et l'implémentation.
- [x] Codemod sur `src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx` (12) — la sidebar sombre garde une surface sombre, mais par tokens
- [x] Codemod sur `src/app/(super-admin)/**` (11 résiduelles) et `src/components/super-admin/**` (1)
- [x] `/super-admins` + `SuperAdminOnboardingWizard` : tokens `app-*` → tokens shadcn ; `text-red-600` → `ErrorState`
  - moitié `app-*` **sans objet** : `grep -rn 'text-app-ink'` sur les quatre périmètres → 0 avant le ticket (éteint par TCK-372). Moitié `text-red-600` livrée, et sur **9** occurrences dans 5 fichiers, pas une seule.
- [x] Signal cross-tenant assumé dans `SuperAdminShell` (liseré `--primary` ou surface de contenu distincte)
  - `SuperAdminShell.tsx:53` — `<div className="h-1 shrink-0 bg-primary" aria-hidden />`, plus la surface de contenu en `bg-muted`.
- [x] Garde `scripts/check-super-admin-tokens.mjs` + branchement dans `.github/workflows/repo-ci.yml`

## Critères d'acceptation

- [x] AC1 — sur **les quatre répertoires** (`src/app/(super-admin)`, `src/components/admin/super`, `src/components/layout/SuperAdmin*`, `src/components/super-admin`), hors `__tests__` : `grep -rE '(text|bg|border|ring|divide|from|to)-(stone|amber|emerald|red|green|blue|slate|gray|zinc|neutral)-[0-9]{2,3}'` ne renvoie **aucun** résultat
- [x] AC2 — aucune occurrence de `bg-white` ni de `text-app-ink`/`text-app-ink-muted` dans ces quatre répertoires
- [x] AC3 — `node scripts/check-super-admin-tokens.mjs` sort en 0 sur le dépôt propre, et **sort en échec** quand on réintroduit volontairement `bg-stone-200` dans `src/components/admin/super/scheduler.tsx` (vérification par ablation : la garde doit être prouvée capable d'échouer, pas seulement de passer)
- [x] AC4 — la garde est rejouée par `repo-ci.yml` et son en-tête porte le motif + le relevé chiffré du 2026-08-26
  - `.github/workflows/repo-ci.yml:372` → `node scripts/check-super-admin-tokens.mjs --report`. L'en-tête porte les **deux** relevés datés (2026-08-26 du ticket, 2026-08-27 re-mesuré).
- [x] AC5 — le token `--warning` existe dans `:root` **et** `.dark`, et aucun commentaire d'exception TCK-245 ne subsiste
  - `grep -c -- '--warning' globals.css` → 9 (`:root`, `@theme inline`, `.dark`) ; `grep -rn 'documented exception (TCK-245)' src/` → 0.
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **reste décochée.** `npm run lint` (0 erreur) et `npx tsc --noEmit` (0 sortie) sont exécutés et verts ; `npm run test` **en entier** ne l'a été par personne — c'est le rituel de fin de branche de la session, interdit à un agent délégué. Ce qui a été joué à la place : `npx vitest run src/components src/app` → 135 fichiers / 677 tests, 0 échec. La case se coche quand la suite entière aura tourné.

## Hors périmètre

- La bascule de la console en thème sombre intégral (décision structurelle : ADR requis).
- Les primitives de rendu (table, en-tête, badge) : TCK-357, dont ce ticket dépend.
- Le reste du dépôt : ce ticket ne touche que la console super-admin.

## Notes d'implémentation

**Les comptes du ticket étaient périmés — TCK-357 était passé entre-temps.** Re-mesuré le
2026-08-27 avec le grep exact de l'AC1, hors `__tests__` : 18 / 85 / 16 / 9 = **128**, contre
11 / 218 / 12 / 1 = 242 au 2026-08-26. Les deux relevés, avec leurs dates, sont dans l'en-tête de
la garde. `text-app-ink` valait déjà **0** (éteint par TCK-372) : la moitié `app-*` du delta était
sans objet, et `scripts/check-app-tokens.mjs` la garde déjà sur `src` entier.

**Le chrome sombre passe par la classe `dark`, pas par un jeu de jetons parallèle.** `globals.css`
déclare déjà la rampe sombre (`--sidebar`, `--sidebar-primary`, `--background`…) ; en inventer une
seconde (`--console-sidebar-*`) aurait rouvert le doublon de vocabulaire que `check-app-tokens`
vient de fermer. Effet de bord bienvenu : toute primitive shadcn montée dans la barre hérite
désormais du thème sombre au lieu de rendre en clair sur fond sombre.

**Deux traductions littérales auraient introduit un défaut de contraste**, et la mesure les a
attrapées avant la revue :

| | traduction littérale | mesuré | retenu | mesuré |
|---|---|---|---|---|
| entrée de nav active | `bg-sidebar-primary/20` + `text-sidebar-primary` | **3,59:1** | pastille pleine | **5,31:1** |
| bouton du bandeau d'usurpation | `bg-warning-foreground/15` | **4,32:1** | plein inversé | **5,95:1** |

*Traduire une couleur par « le jeton de même rôle » ne conserve pas le contraste : le voile qui
marchait sur `amber-500` ne marche pas sur terracotta.*

**`.qr-surface` — le blanc fonctionnel.** L'AC2 exigeait zéro `bg-white` ; le 14ᵉ était le fond du
QR code TOTP, qui doit rester blanc en thème sombre sous peine d'être illisible par le téléphone.
`bg-card` l'aurait cassé. Une classe nommée pour ce qu'elle fait, dans `globals.css`, plutôt qu'un
`bg-white` que rien ne distingue plus d'un blanc décoratif.

**Deux docblocks issus de TCK-357 citaient les classes brutes qu'ils avaient remplacées** et
faisaient rougir l'AC1 depuis un commentaire. Réécrits en toutes lettres (« ambre 100 », « pierre
200 »). La garde ne retire pas les commentaires avant analyse, délibérément, pour la même raison
que `check-app-tokens.mjs` : un docblock qui montre une classe copiable est de la documentation
périmée qui fait repousser le motif.

**Le ton `attention` de `StatusBadge` a repris `--warning`** d'une ligne, comme son propre docblock
l'avait annoncé pour ce ticket.

**Deux mentions de TCK-245 subsistent dans le code** — dans `globals.css` et `warning-banner.tsx`.
Ce ne sont plus des commentaires d'exception mais le récit de leur disparition ; l'AC5 visait
l'exception, pas la trace.

### Ce que la revue adverse a trouvé, et ce qui a été corrigé (2026-08-27)

La revue a **refusé** le livrable : les 6 AC passaient, mais le cliquet — le seul livrable que le
ticket déclare non négociable — avait **deux trous démontrés par mutation**, dont un que son propre
en-tête déclarait inexistant.

- **D1 — la garde ne voyait aucune valeur arbitraire de couleur.** `bg-[#f5f5f4]`, `text-[#a85332]`,
  `bg-[rgb(…)]`, `border-[oklch(…)]` : quatre mutations, quatre verts. Corrigé par un **contrôle D**
  qui prend en plus les 148 couleurs **nommées** de CSS Color 4 et `color-mix(`/`color(`, avec des
  bornes `(?<![a-zA-Z0-9-])` et non `\b` (dans une valeur arbitraire les séparateurs sont des `_`).
  L'en-tête menteur est remplacé par une section « les trois trous qu'elle déclare ».
- **D2 — le périmètre était quatre répertoires, pas l'écran** : `billing/PayoutTable.tsx` rendait
  cinq familles de palette brute **dans** la console, garde verte — le défaut de TCK-245 reproduit
  d'un cran plus haut. Corrigé sur les deux plans : les pastilles de `PayoutTable` et de
  `kyc/kyc-components.tsx` passent sur le `StatusBadge` partagé, le périmètre s'étend à `billing`,
  `reporting`, `console`, `feedback` et `kyc/kyc-components.tsx` (58 → 88 fichiers gardés), **et**
  la garde calcule désormais la **clôture transitive des imports** depuis `src/app/(super-admin)/**`
  pour compter ce que la console rend sans pouvoir l'exiger à zéro : **46** défauts dans 78 fichiers,
  sous plafond (`RESTE_PLAFOND`). La sortie verte imprime les deux nombres.
- **D3 et D4 — le docblock de contrastes de `SuperAdminSidebar`** portait trois valeurs non
  reproductibles et une contradiction interne (8,08 / 7,91 pour la même paire). Corrigés dans le
  passage de TCK-359 : les huit mesures vivent maintenant à **un seul endroit** (docblock du
  composant), et le sous-item actif à **4,60:1** — que D4 signalait comme non documenté — y figure.

**Vérifié une dernière fois dans l'arbre fusionné, le 2026-08-27** : garde exit 0 ; grep AC1 → 0 ;
grep AC2 → 0 ; ablation `bg-stone-200` dans `scheduler.tsx` → exit **1**, restauration md5 identique.

**Ce qui reste ouvert :** [TCK-384](TCK-384-primitives-partagees-couleur-brute.md) (les 46 défauts
des primitives partagées que la console rend, avec l'obligation de faire descendre le plafond à
chaque lot) et [TCK-385](TCK-385-kyc-uploader-palette-brute-onboarding.md) (`KycUploader.tsx`, hors
clôture, couvert par **aucune** garde). Aucune vérification navigateur n'a été faite : l'aspect —
équilibre du liseré de 4 px, rendu de l'ocre `--warning` à côté du terracotta — reste non vu.
