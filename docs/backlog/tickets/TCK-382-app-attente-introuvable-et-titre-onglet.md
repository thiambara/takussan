---
id: TCK-382
title: "Tableau de bord /app — l'attente, l'introuvable et le titre d'onglet : trois états que quarante écrans ne rendent pas"
status: todo
phase: P2
family: front
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#28-internationalisation--préférences
tags: [front, dashboard, ux, i18n, seo]
---

## Objectif utilisateur

Pendant que la page charge, l'utilisateur voit qu'elle charge. Quand l'objet n'existe pas, il le
lit dans son tableau de bord et dans sa langue. Et l'onglet de son navigateur lui dit sur quelle
page il se trouve.

## Contexte

Trois conventions de Next que `/app` n'a jamais posées, mesurées le 2026-08-26.

**1 — L'attente.** Un seul `loading.tsx` existe sous `src/app/(dashboard)`, sur
`/app/properties`. Or **dix pages de `/app` attendent une donnée côté serveur** avant de rendre
quoi que ce soit :

| Page | Ce qu'elle attend |
|---|---|
| `/app` | `fetchDashboardMe` **et** `fetchAgencyAction` |
| `/app/properties/[id]` | 2 requêtes |
| `/app/overview/owner`, `/app/overview/agency` | 2 requêtes chacune |
| `/app/overview/agent`, `/app/overview/tenant`, `/app/overview`, `/app/overview/alerts`, `/app/properties/new` | 1 requête |

`/app/properties` est la seule des dix à avoir son `loading.tsx`. Les neuf autres — dont **la page
d'atterrissage après connexion**, qui enchaîne deux requêtes — laissent l'écran précédent en place
sans aucun signe. Les listes montées en client sont couvertes par `QueryBoundary` ; c'est le
rendu serveur qui n'a rien.

**2 — L'introuvable.** `notFound()` n'est appelé que par `/app/properties/[id]`
(l. 43), et **il n'existe aucun `not-found.tsx`** — ni sous `(dashboard)`, ni à la racine de
`src/app`. Un bien inexistant rend donc la page 404 **par défaut de Next** : hors du shell, sans
barre latérale, sans traduction, sans chemin de retour. Les six autres détails de `/app`
(`leases`, `bookings`, `visits`, `maintenance`, `documents`, `inventories`, `customers`) ne
distinguent même pas l'introuvable de l'erreur : `leases/[id]` rend un `ErrorState` générique sur
un identifiant invalide.

**3 — Le titre d'onglet.** **17 pages sur 46 n'ont pas de `generateMetadata`** et héritent donc
du titre générique du groupe `(dashboard)` : `/app` elle-même, `/app/customers`, `/app/payments`,
`/app/overview` et ses cinq vues, `/app/crm/pipeline`, `/app/profile/reviews`,
`/app/maintenance/[id]`, `/app/visits/[id]`, `/app/documents/[id]`, `/app/inventories/new`,
`/app/payments/return`, `/app/crm`. Un utilisateur avec six onglets ouverts les voit tous
identiques.

Et là où le titre existe, il est parfois **écrit en français dans le code** :
`leases/[id]/page.tsx` rend `` `Bail #${leaseId}` `` à trois endroits (l. 26, 32, 34). C'est une
violation directe du principe 5 — *« Le front possède le texte affiché »* — dans un dépôt dont
les trois dictionnaires sont pourtant **complets à 5038 clés chacun** (fr, en, wo : 0 clé
manquante, mesuré). Un lecteur anglophone ou wolophone lit « Bail #7 » dans son onglet.

Un quatrième point, mineur mais du même chantier : **14 pages déclarent `generateMetadata` au
milieu de leur bloc d'imports**, avant l'import de `getTranslations` qu'elle appelle. Le hissage
le rend fonctionnel ; c'est de la trace d'outil, et elle se lit comme une erreur à chaque
ouverture du fichier.

## Contrat de données

Aucun endpoint à créer ni à modifier. `generateMetadata` de `/app/leases/[id]` fait déjà sa
requête de résolution de référence avec son propre `fields[leases]` — cette forme est conservée.

## Direction UX / Artistique

- **Le squelette a la forme de ce qui arrive.** Un squelette de tableau de bord n'est pas un
  squelette de fiche : chaque `loading.tsx` esquisse la disposition de sa page, sinon il ne fait
  que remplacer une attente par un clignotement. Pas de roue de chargement centrée en plein écran
  (`docs/design-guidelines.md`).
- **L'introuvable reste dans le tableau de bord** : même shell, même barre latérale, même langue,
  et un chemin de retour vers la liste dont l'objet manquant relève.
- L'introuvable et l'erreur ne se disent pas pareil : *« ce bail n'existe pas ou ne vous est pas
  accessible »* n'est pas *« une erreur est survenue »*. La seconde propose de réessayer, la
  première non.
- Le titre d'onglet nomme la page, pas le produit : il est ce qui permet de retrouver un onglet
  parmi dix.

## Contraintes strictes (métier)

- **Un `not-found.tsx` ne doit pas dire ce qu'il ne sait pas.** L'API rend 404 aussi bien pour un
  objet absent que pour un objet hors périmètre d'agence : le message couvre les deux sans
  affirmer lequel — c'est exactement la leçon que `(dashboard)/error.tsx` porte dans son docblock
  (*« Une frontière large qui affirme une cause étroite se trompe partout sauf à un endroit »*).
- Le `noindex` posé par le layout `(dashboard)` reste : aucun titre ajouté ne le contredit.
- **Aucun libellé neuf en dur.** Tout texte ajouté passe par next-intl, en fr/en/wo, et les trois
  chaînes françaises de `leases/[id]` sont converties.
- Un `loading.tsx` ne fait aucune requête et ne lit aucune session.

## Delta à produire

- [ ] `loading.tsx` pour les neuf pages de `/app` qui attendent une donnée serveur et n'en ont pas
- [ ] `not-found.tsx` sous `src/app/(dashboard)`, rendu dans le shell, traduit
- [ ] Les détails de `/app` distinguent l'introuvable (404 de l'API, identifiant invalide) de
      l'erreur, et appellent `notFound()` dans le premier cas
- [ ] `generateMetadata` sur les 17 pages qui n'en ont pas, titres tirés du dictionnaire
- [ ] Les trois chaînes `Bail #…` de `leases/[id]` passent en clés fr/en/wo
- [ ] Les 14 déclarations de `generateMetadata` insérées au milieu du bloc d'imports sont
      remises après les imports
- [ ] i18n fr/en/wo pour tout libellé neuf
- [ ] Tests : introuvable contre erreur sur au moins deux détails ; présence des titres

## Critères d'acceptation

- [ ] AC1 — chaque page de `src/app/(dashboard)/app` qui `await` une requête de données possède
      un `loading.tsx` dans son segment ou un segment parent ; un test parcourt l'arbre et
      échouerait sur une page ajoutée sans
- [ ] AC2 — `/app/properties/999` (bien inexistant) rend l'écran « introuvable » **dans le shell
      du tableau de bord**, barre latérale comprise, dans la langue active
- [ ] AC3 — un identifiant invalide et une erreur réseau rendent **deux** écrans distincts sur au
      moins deux pages de détail ; un test l'éprouve et échouerait si les deux chemins
      retombaient sur le même
- [ ] AC4 — aucune page de `src/app/(dashboard)/app` n'est dépourvue de `generateMetadata`, et
      deux pages différentes ne rendent pas le même titre
- [ ] AC5 — `grep -rnE "['\`]Bail " "src/app/(dashboard)/app"` ne renvoie plus rien, et
      `npm run check:i18n` passe
- [ ] AC6 — dans chaque page de `/app`, `export async function generateMetadata` apparaît
      **après** la dernière ligne `^import`
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Les espaces `(public)`, `(auth)`, `/admin` et `/super-admin`.
- Le préchargement (`prefetch`), le rendu partiel en flux (`Suspense` par section) et toute
  optimisation de performance : ce ticket rend l'attente **visible**, il ne la raccourcit pas.
- Le contenu des pages, leurs primitives (TCK-380) et leur palette (TCK-381).

## Notes d'implémentation

### Ce que la re-mesure a contredit dans ce ticket

| Le ticket écrivait | Mesuré le 2026-08-27 |
|---|---|
| « **dix pages** de `/app` attendent une donnée côté serveur » | **43 sur 46.** Toutes appellent `getMeAction()`, qui est un vrai aller-retour vers `/api/users/me`. Même en ne comptant que les pages qui font une requête *au-delà* de l'authentification, il y en a **16**, pas 10 : le tableau du ticket oublie `customers`, `customers/[id]`, `maintenance/providers`, `overview/kpis`, `owners` et `settings/agency/upgrade`. Les trois pages qui n'attendent rien sont `account/privacy`, `crm` (redirection nue) et `payments/return` (module client). |
| « `notFound()` n'est appelé que par `properties/[id]` » | Exact. Et `app/properties/loading.tsx` — le seul repli qui existait — se trouve **précisément au-dessus** de ce seul `notFound()` : ce 404 était donc déjà servi en 200. Personne ne l'avait mesuré (→ TCK-426). |
| « **17 pages sur 46** n'ont pas de `generateMetadata` et héritent du titre générique » | 17 sur 46 est exact au fichier près, mais **deux d'entre elles ont bien un titre** : `customers/page.tsx` portait `export const metadata = { title: 'Clients (CRM)' }` et `visits/[id]` `{ title: 'Visite' }`. Ce ne sont pas des titres manquants, ce sont **deux libellés français de plus écrits en dur** — le défaut que le ticket n'attribuait qu'à `leases/[id]`. Les pages qui héritent réellement du titre générique sont **15**. |
| « les trois dictionnaires sont complets à **5038 clés** chacun » | **5028** avant ce ticket (`node scripts/check-i18n.mjs`). La parité, elle, était bien de 0/0. |
| « **14 pages** déclarent `generateMetadata` au milieu de leur bloc d'imports » | **14**, exact. |

### Trois décisions, chacune prise sur une mesure et non sur une lecture

**1 — Le `not-found.tsx` est sous `app/`, pas sous `(dashboard)`.** Le *Delta à produire* demandait
`(dashboard)` ; l'AC2 exigeait la barre latérale. Les deux ne sont conciliables que sous `app/`,
dont le `layout.tsx` monte `AppShell`. Vérifié par sonde jetable (`next dev`, Next 16.3.1) : un
`not-found.tsx` de segment est rendu **à l'intérieur du `layout.tsx` de son segment**, et des
layouts plus profonds le sont aussi.

**2 — « Segment propre », et non « segment ou parent ».** L'AC1 écrite au ticket est
**invérifiable** : `app/loading.tsx` étant l'ancêtre de tout `/app`, aucune page ne peut jamais
manquer de repli une fois qu'il existe — le test qu'elle décrit serait vert quoi qu'on ajoute.
La règle tenue est donc plus étroite (repli dans le segment de la page, ou dans un ancêtre
**strictement sous** `app/`) et elle rougit réellement : vérifié par ablation, retirer
`payments/loading.tsx` — pourtant enfant direct d'`app/` — fait échouer le test.

**3 — Deux pages sont exemptées de titre, par une règle DÉRIVÉE.** `crm/page.tsx` et
`overview/page.tsx` ne rendent aucun JSX : ce sont des aiguilleurs qui redirigent toujours. Un
titre y serait du code mort, et celui d'`overview` aurait dupliqué un libellé existant. Le test
ne porte pas une liste d'exemptions : il détecte l'absence de rendu, et **fige la taille** de
l'ensemble ainsi obtenu à deux.

### L'échange assumé sur les statuts HTTP

Un `loading.tsx` fait partir la coque **et le code de réponse** avant que la page n'ait décidé.
Mesuré par ablation : `notFound()` passe de 404 à 200, `redirect()` de 307 à 200 + coque. L'écran
final reste juste dans les deux cas ; seul le statut change. L'échange est acceptable ici — `/app`
est `noindex`, derrière authentification, et la redirection d'authentification vit dans le layout
du groupe, donc **au-dessus** de toute frontière posée ici (`GET /app` non authentifié rend
toujours 307). Il ne l'est pas ailleurs : le catalogue public est tenu par TCK-335. Le détail, et
la question laissée ouverte, sont dans **TCK-426**.

### Le retour de paiement a dû être scindé

`payments/return/page.tsx` est `'use client'`, et Next interdit à un module client d'exporter
`generateMetadata`. Un `layout.tsx` de segment aurait suffi — mais
`scripts/check-i18n-namespaces.mjs` traite tout `layout.tsx` comme une frontière de dictionnaire :
mesuré, elle aurait dû déclarer **38 espaces de noms**, c'est-à-dire recopier celui de son parent
pour un provider imbriqué n'ajoutant rien. Le corps client est donc déplacé tel quel
(`git mv`, aucune ligne du corps touchée) et `page.tsx` ne fait plus que porter le titre et le
monter.

### Un défaut trouvé par un test et corrigé

`listePour('/admin/properties/9')` rendait `/app/properties` : la fonction ne vérifiait pas
l'espace de tête. Sans effet en production — la frontière ne voit que `/app` — mais une fonction
exportée finit ailleurs.
