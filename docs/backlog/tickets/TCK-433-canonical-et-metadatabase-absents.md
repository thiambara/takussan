---
id: TCK-433
title: "Aucune URL canonique nulle part : `/properties` se démultiplie en autant de doublons qu'il y a de combinaisons de filtres"
status: todo
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, seo, public, metadata]
---

## Objectif utilisateur

Une même page de biens ne se présente qu'une fois aux moteurs, quelle que soit l'URL par laquelle
on y arrive.

## Contexte

Mesuré le 2026-08-27 sur `takussan-web/src` :

```
$ grep -rn "metadataBase\|alternates\|canonical" src/ | grep -v "docblock\|// "
  → aucune occurrence dans un objet `Metadata`
```

Aucune page publique ne déclare `alternates.canonical`, et le projet ne pose pas de
`metadataBase`.

`/properties` porte vingt clés de filtre (`CLES_DE_RECHERCHE`), la pagination, le tri et le
nombre par page — toutes sérialisées dans l'URL par `useSearch`, par construction (TCK-340). Les
combinaisons sont donc explorables et, pour un moteur, chacune est une page distincte servant
essentiellement le même catalogue. La `generateMetadata` de la route est statique : le même
`<title>` et la même `<meta description>` pour toutes.

Le `metadataBase` absent touche un second point, plus discret : les `openGraph.images` des trois
pages qui en déclarent (`properties/[slug]`, `agencies/[slug]`, `agents/[slug]`) reposent sur des
URL rendues par l'API. Le jour où l'une d'elles arrive relative, la carte sociale se casse en
silence — un avertissement de build, aucune erreur.

## Contrat de données

Aucun nouvel endpoint. Les données nécessaires — filtres actifs, page courante, total — sont déjà
celles que `useSearch` et `generateMetadata` manipulent.

## Direction UX / Artistique

Sans objet — rien de visible ne change, hormis le `<title>` de l'onglet sur une recherche filtrée,
qui doit dire ce que la page montre plutôt que rester générique.

## Contraintes strictes (métier)

- **La canonique se décide, elle ne se recopie pas.** Ce ticket doit trancher explicitement, pour
  `/properties`, ce qui est canonique et ce qui ne l'est pas : quelles clés de filtre méritent
  leur propre URL indexable, lesquelles se replient sur la page nue, et ce que devient la
  pagination. Poser `canonical = URL courante` partout reviendrait à ne rien décider.
- Les libellés de titre viennent du dictionnaire next-intl — l'API émet des codes, le front
  possède le texte affiché (principe non négociable n°5).
- La décision doit rester cohérente avec le sitemap de
  [TCK-431](TCK-431-sitemap-et-robots-absents.md) : une URL déclarée non canonique n'entre pas
  dans le sitemap.

## Delta à produire

- [ ] `metadataBase` posé une fois, à partir de la variable d'URL publique de TCK-431
- [ ] Règle de canonicité de `/properties`, écrite dans le code à l'endroit qui l'applique
- [ ] `alternates.canonical` sur les pages publiques indexables (`/`, `/properties`,
      `/properties/[slug]`, `/agencies/[slug]`, `/agents/[slug]`)
- [ ] `<title>` / `<meta description>` de `/properties` dérivés des filtres actifs
- [ ] Tests : la canonique d'une URL filtrée non retenue pointe vers la page canonique ; la
      canonique d'une fiche pointe vers elle-même

## Critères d'acceptation

- [ ] AC1 — `/properties?type=villa&page=3&sort=-created_at&per_page=48` rend une
      `<link rel="canonical">` conforme à la règle tranchée, et le test **nomme la règle** :
      il échouerait aussi bien si la canonique disparaissait que si elle recopiait l'URL demandée.
- [ ] AC2 — `/properties/<slug>` rend une canonique absolue vers elle-même, sur l'hôte configuré.
- [ ] AC3 — le `<title>` de `/properties?type=villa&city=Dakar` diffère de celui de `/properties`
      nu et nomme le filtre, dans les trois langues servies.
- [ ] AC4 — `metadataBase` est posé et une image OG relative produit une URL absolue ; un test
      l'éprouve sur une valeur relative, pas sur la valeur absolue que l'API rend aujourd'hui.
- [ ] AC5 — aucune URL déclarée non canonique n'entre dans le sitemap de TCK-431.

## Hors périmètre

- Les alternatives de langue (`hreflang`) — [TCK-434](TCK-434-trois-langues-une-seule-url.md).
- La génération du sitemap elle-même — [TCK-431](TCK-431-sitemap-et-robots-absents.md).
- Les pages de facettes SEO dédiées par ville ou par type : surface produit non spécifiée.

## Notes d'implémentation

### Ce que la re-mesure a contredit dans ce ticket

Le ticket a été écrit **avant** TCK-434.

1. **« aucune occurrence de `metadataBase`, `alternates` ou `canonical` ».** Faux pour
   `alternates` : TCK-434 en a posé sur **cinq** pages publiques (accueil, liste, fiche, agence,
   agent) — des `hreflang`, en URL absolues. `metadataBase` et `canonical`, eux, étaient bien
   absents. La conséquence pratique est que la canonique ne s'ajoute pas *à côté* des `hreflang` :
   les deux doivent se dériver du **même** chemin, sinon ils se contredisent et Google ignore le
   groupe entier. D'où `alternatesPubliques(chemin, locale)`, un seul point qui rend les deux.

2. **Toute canonique doit porter un PRÉFIXE DE LANGUE.** Il n'existe plus aucune URL publique sans
   préfixe : `/properties/x` rend 307. Une canonique non préfixée désignerait donc une redirection
   comme version de référence.

3. **`metadataBase` ne dispense PAS les `hreflang` d'être absolus** — et les repasser en relatif
   « pour en profiter » serait une régression : sans `metadataBase`, Next replie **en silence** sur
   `http://localhost:3000`. C'est écrit dans le docblock de `src/lib/alternates.ts`.

### La règle de canonicité, et pourquoi celle-là

Trois clés gardent leur URL indexable — `contract_type`, `type`, `city` — sur un critère unique :
**leur ensemble de valeurs est fini et énumérable** (2, 16, les villes du catalogue), elles nomment
une intention de recherche, et elles ont déjà un libellé traduit. Les dix-sept autres filtres se
replient sur la page nue.

**`page`, `sort` et `per_page` se replient aussi**, ce qui est le point le plus discutable et
mérite d'être relu :

- la liste est rendue **côté client** (`PropertiesDiscoveryPage` lit `useSearchParams`) : un
  explorateur reçoit la même coque HTML sur `?page=1` et sur `?page=42`. Les déclarer distinctes
  affirmerait une différence que le document servi ne porte pas ;
- **aucune fiche n'en dépend pour être découverte** depuis TCK-431 : `/sitemap.xml` liste chaque
  bien publié, dans les trois langues.

⚠ **TCK-432 fera tomber la première de ces deux raisons.** La décision doit être reprise le jour où
la liste passera en rendu serveur. C'est écrit dans `src/lib/canonique.ts`, à l'endroit qui applique
la règle.

`CLES_ECARTEES` est **dérivée** de `CLES_DE_RECHERCHE` moins les retenues, et un test vérifie que la
partition couvre les 23 clés : une clé ajoutée à `SEARCH_FILTER_KEYS` sans décision de canonicité
fait rougir.

### Décisions non évidentes

- **`metadataBase` est posé à la RACINE** (`src/app/layout.tsx`), pas sous `[locale]/(public)` :
  la `metadata` d'un layout imbriqué ne couvre que ses descendants, et la console, `/auth` et
  `/onboarding` en resteraient privés.

- **Le titre est composé de DEUX gabarits ICU** (`titleContract`, `titleCity`) et non concaténé :
  chaque langue décide de son ordre et de sa préposition. Une concaténation
  `${type} ${contrat} à ${ville}` aurait figé la syntaxe française dans les trois.

- **Le test de titre emploie `createTranslator` de next-intl, pas un double.** Le double naïf
  employé ailleurs dans ce dépôt (`gabarit.replace(/\{(\w+)\}/g, …)`) ne comprend pas `select` :
  il rendrait le gabarit brut et le test serait vert sur un titre illisible.

- **AC4 est éprouvé avec le résolveur de Next lui-même**
  (`next/dist/lib/metadata/resolvers/resolve-url`), sur une image **relative**, et l'ablation est
  écrite dans le test : la même image sans `metadataBase` ne devient pas absolue. Réimplémenter
  `new URL(a, b)` aurait donné un test vert quel que soit le comportement réel du framework.

### Passe 2 — le critère de la règle est désormais APPLIQUÉ, pas seulement écrit

**La revue adverse a trouvé le défaut central : la propriété qui porte toute la règle n'était
vérifiée nulle part.** Ce document affirmait que `contract_type`, `type` et `city` méritent leur
URL indexable *parce que leur ensemble de valeurs est fini et énumérable*. Aucun contrôle
d'appartenance n'existait. Mesuré sur un build de production le 2026-08-27 :

```
curl '…/fr/properties?type=zzznexistepas'
  <title>property.types.zzznexistepas — Takussan</title>     ← une clé d'i18n servie au moteur
  <link rel="canonical" href="…?type=zzznexistepas">
  <meta name="robots" content="index, follow">

curl '…/fr/properties?city=Zzzinventee'
  <title>Biens immobiliers à Zzzinventee — Takussan</title>  ← canonique d'elle-même, indexable
```

L'espace d'URL indexables n'était donc borné par rien — le défaut que ce ticket existe pour
fermer, ramené d'un cran. *Un ensemble énumérable dont personne ne vérifie l'appartenance n'est pas
un ensemble fini, c'est une intention.*

**Les trois domaines, et d'où ils viennent :**

| Facette | Domaine | Source |
|---|---|---|
| `type` | 16 valeurs | `propertyTypeValues` (`src/lib/schemas/property.ts`), déjà employé par les formulaires |
| `contract_type` | 2 valeurs | `contractTypeValues`, même fichier |
| `city` | les villes du catalogue | `GET /api/public/properties/cities`, **endpoint neuf**, jumeau de `property-types` |

Une valeur hors domaine **se replie sur la page nue** — le même geste que le `other {}` du gabarit
ICU du titre. Elle ne fait pas échouer : l'URL reste servie, elle cesse seulement d'être une
facette indexable.

⚠ **`tsc` garde l'exhaustivité des deux domaines statiques** : `canonique.ts` porte une preuve de
type qui casse dans les deux sens si `propertyTypeValues` et `PropertyType` divergent. Sans elle,
un type de bien ajouté à l'union et oublié dans la liste cesserait silencieusement d'être une
facette.

⚠ **La validation NORMALISE en plus de vérifier.** `?city=dakar` et `?city=Dakar` se replient tous
deux sur `?city=Dakar`. Sans ce repli, on aurait fermé un espace non borné pour en rouvrir un plus
petit : une URL indexable par variante de casse.

⚠ **Domaine des villes inconnaissable → on replie.** API injoignable, ou domaine tronqué côté
serveur (`meta.truncated`) : `villesDuCatalogue()` rend `null`, toute facette de ville se replie, et
l'échec est journalisé. *Un domaine tronqué n'est pas un domaine* — s'en servir reviendrait à
déclarer non canoniques les villes qui n'ont pas tenu dans le plafond, c'est-à-dire à décider par
un effet de bord.

Un autre défaut de la même passe, qui touchait ce ticket et TCK-435 à la fois : le fil d'Ariane
émettait un `item` vers `/properties?location=<quartier>`, or `location` est l'une des dix-sept
clés ÉCARTÉES — cette URL rend `canonical=…/properties`. Le quartier est devenu un **libellé non
cliquable des deux côtés** ; l'invariant « tout `item` du fil est canonique de lui-même » est
désormais éprouvé.

**Motif faux corrigé.** Le docblock d'`alternatesLangues` affirmait que, sans `metadataBase`, les
`hreflang` sortent en `http://localhost:3000`. Re-mesuré avec le résolveur de Next : **un alternate
relatif reste RELATIF** (`const result = metadataBase ? resolveUrl(url, metadataBase) : url;`). Le
repli localhost n'est atteint que par `resolveUrl`, donc par les **images** `openGraph`/`twitter`.
La règle ne change pas, sa justification si.

### Passe 3 — une garde qui ne pouvait pas échouer, et trois surfaces non éprouvées

**La « preuve de type » de la passe 2 ne prouvait rien.** Elle s'écrivait
`const _preuve: [A, B, C][] = [];` — et **un littéral de tableau vide est assignable à n'importe
quel type de tableau**. Que les `Exclude<>` rendent `never` ou un littéral de chaîne n'y changeait
rien. Mesuré sur les deux sens que son propre docblock annonçait :

```
'chalet' AJOUTÉ à propertyTypeValues, absent de l'union   → npx tsc --noEmit  exit 0
'garage' RETIRÉ de propertyTypeValues, resté dans l'union → npx tsc --noEmit  exit 0
```

Le second est exactement le cas promis. *Une garde qui ne peut pas échouer est pire qu'une garde
absente : elle occupe la place et se relit comme une preuve.* La forme retenue —
`type Verifie<T extends never> = T` — **a été vérifiée par les deux mêmes ablations avant d'être
écrite comme mesure** : elles rendent maintenant `TS2344 … does not satisfy the constraint 'never'`
sur `canonique.ts` lui-même, et non sur un fichier tiers.

**`src/lib/queries/facettes.ts` n'avait aucun test** — et c'est le module qui DÉCIDE « domaine
inconnaissable ». Le seul test qui le touchait le REMPLAÇAIT par un double : aucune de ses lignes
ne s'exécutait. Ce qui était éprouvé, c'était la RÉACTION du consommateur à `villes: null`, pas la
DÉCISION de le rendre. Le rapport de passe 2 affirmait le contraire ; il avait tort.
`src/lib/queries/__tests__/facettes.test.ts` couvre les dix cas, et trois ablations le confirment.

**Le plafond des villes est devenu pilotable** (`config/catalogue.php`), et son BORD est éprouvé
avec **trois biens** : exactement le plafond → `truncated` faux ; plafond + 1 → `truncated` vrai
ET `data` plafonnée. L'arbitrage de la passe 2 — « éprouver le plafond coûterait 501 insertions » —
était juste sur le coût et faux sur la conclusion : le coût n'était pas 501 insertions, c'était une
ligne de configuration. ⚠ Le fichier de config ne lit **aucun** `env()` : c'est une décision de
produit, pas d'environnement.

**L'isolement de la jointure polymorphe est éprouvé.** Quatre modèles sont adressables (`User`,
`Agency`, `Property`, `Customer`) ; retirer
`->where('addresses.addressable_type', '=', Property::class)` laissait les sept tests VERTS. Le
test force la coïncidence d'id plutôt que d'espérer qu'elle survienne — les séquences sont
indépendantes et `nextval()` n'est pas transactionnel (piège PostgreSQL n°6), donc « les ids se
croisent parfois » aurait été un test qui passe au hasard.

### Vérification de bout en bout

`next start`, HTML servi :

```
/fr/properties?type=villa&page=3&sort=-created_at&per_page=48
  <title>Villa — Takussan</title>
  <link rel="canonical" href="https://www.takussan.com/fr/properties?type=villa"/>
  4 × <link rel="alternate" hrefLang=…> vers la MÊME canonique, par langue
/en/properties?city=Dakar   → <title>Properties in Dakar — Takussan</title>
/wo/playground              → <meta name="robots" content="noindex, nofollow"/>
```
