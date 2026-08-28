---
id: TCK-431
title: "Le catalogue public n'est déclaré à aucun crawler : ni sitemap, ni robots, et un POC de design indexable"
status: todo
phase: P1
family: front
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#3-property
tags: [front, seo, public, indexation, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur qui cherche « villa à louer Dakar » sur un moteur trouve les biens de la plateforme.

## Contexte

Mesuré le 2026-08-27 sur `takussan-web/` :

```
$ find src -name "sitemap*" -o -name "robots*"     → aucun résultat
$ ls src/middleware.ts                             → No such file or directory
```

Ni `src/app/sitemap.ts`, ni `src/app/robots.ts`, ni `public/robots.txt`. Le front de production
est **public et en ligne** (`https://www.takussan.com/` → 200, cf. `CLAUDE.md` § Workflow git) :
un catalogue de biens y est servi sans qu'aucun fichier ne dise à un moteur qu'il existe, ni
quelles URL sont canoniques, ni quelles URL ne doivent pas l'être.

La découverte du catalogue repose donc entièrement sur le maillage interne — et
[TCK-432](TCK-432-accueil-et-liste-sans-rendu-serveur.md) mesure que ce maillage n'existe pas non
plus dans le HTML servi : les cartes de la home et de `/properties` arrivent après hydratation.
**Les deux défauts se couvrent l'un l'autre** : tant que le HTML ne porte aucun lien vers une
fiche, un sitemap est le seul chemin entrant possible ; et tant qu'aucun sitemap n'existe, le
rendu serveur ne suffit pas à faire découvrir les fiches profondes.

⚠️ **Et une surface qui ne devrait pas être publique l'est.** `src/app/(public)/playground/page.tsx`
est un POC de design system (7 palettes commutables, photos `picsum.photos`, les fontes
alternatives que `docs/design-guidelines.md` dit de ne **jamais** voir en production). Il vit dans
le groupe `(public)`, dont le `layout.tsx` déclare `robots: { index: true, follow: true }`, et
aucune page ne l'écrase. Il est donc servi et indexable sur le domaine de production.

## Contrat de données

Endpoints publics existants, tous en place (`takussan-api/routes/api/public.php`) :

- `GET /api/public/properties` — liste paginée des biens publiés (source des URL de fiches).
- `GET /api/public/property-types` — types et comptes, pour les URL de facettes retenues.

⚠️ Il n'existe **aucun** endpoint d'index d'agences ni d'agents (`/public/agencies/{slug}` et
`/public/agents/{slug}` sont les seules routes de ces deux ressources). Les URL de profils publics
ne peuvent donc pas encore entrer dans un sitemap : c'est l'objet de
[TCK-436](TCK-436-index-agences-et-agents.md), dont ce ticket dépend pour ce périmètre-là
seulement.

## Direction UX / Artistique

Sans objet — aucune surface visible n'est produite, hormis le retrait de `/playground` de la
surface publique.

## Contraintes strictes (métier)

- Un sitemap ne liste que ce qui est **réellement indexable** : biens publiés, pages qui ne
  portent pas déjà `robots: { index: false }`. Les écrans personnels (`/favorites`, `/compare`,
  `/bookings`) en sont exclus — ils déclarent déjà `index: false` dans leur `generateMetadata`.
- Le sitemap se **dérive** de l'API, jamais d'une liste écrite à la main. Une liste maintenue à la
  main est juste le jour où on l'écrit.
- Un catalogue au-delà de 50 000 URL exige un index de sitemaps : la forme retenue doit tenir la
  croissance sans réécriture.
- `robots.txt` doit nommer l'URL du sitemap et interdire les surfaces non publiques
  (`/app`, `/admin`, `/super-admin`, `/api`, `/onboarding`, `/auth`, `/publish`).
- **L'hôte du sitemap et des URL absolues ne se devine pas** : il vient d'une variable
  d'environnement, et son absence doit être bruyante, pas silencieuse.

## Delta à produire

- [ ] `src/app/sitemap.ts` — pages statiques + fiches de biens, dérivées de l'API
- [ ] `src/app/robots.ts` — règles + renvoi vers le sitemap
- [ ] Variable d'environnement d'URL publique, ajoutée aux **deux** fichiers gardés par
      `scripts/check-env-parity.mjs`
- [ ] Trancher le sort de `/playground` : retrait, déplacement hors du groupe `(public)`, ou
      `robots: { index: false }` explicite — la décision s'écrit dans le fichier
- [ ] Tests : le sitemap contient une fiche de bien publiée ; il ne contient aucune URL portant
      `index: false` ; `robots.txt` interdit `/app` et `/super-admin`

## Critères d'acceptation

- [ ] AC1 — `GET /sitemap.xml` rend un XML valide contenant l'URL d'un bien publié, en absolu, sur
      l'hôte configuré. Un test le vérifie **par le contenu**, pas par le code HTTP : une réponse
      200 portant un sitemap vide le cocherait aussi.
- [ ] AC2 — `GET /robots.txt` rend une directive `Sitemap:` et interdit `/app`, `/admin`,
      `/super-admin`, `/api`. Un test échouerait si l'une des quatre disparaissait.
- [ ] AC3 — aucune URL déclarant `robots: { index: false }` n'apparaît dans le sitemap. Le test
      est écrit de façon à rougir si `/favorites` y était ajouté.
- [ ] AC4 — `/playground` n'est plus servi indexable sur le domaine de production, et un test le
      constate depuis la métadonnée ou depuis l'absence de la route — pas depuis un commentaire.
- [ ] AC5 — l'hôte manquant fait échouer bruyamment la génération, avec un message qui nomme la
      variable. Un sitemap contenant des URL relatives ou `undefined` fait rougir le test.

## Hors périmètre

- Les URL de profils publics d'agence et d'agent dans le sitemap — dépend de
  [TCK-436](TCK-436-index-agences-et-agents.md).
- Le rendu serveur de la home et de `/properties` — [TCK-432](TCK-432-accueil-et-liste-sans-rendu-serveur.md).
- Les URL canoniques — [TCK-433](TCK-433-canonical-et-metadatabase-absents.md).
- Les pages de facettes SEO par ville / type (`/louer/dakar`…) : surface produit non spécifiée.

## Notes d'implémentation

### Ce que la re-mesure a contredit dans ce ticket

Le ticket a été écrit **avant** TCK-434. Quatre de ses affirmations ne tenaient plus le 2026-08-27 :

1. **« Variable d'environnement […] ajoutée aux deux fichiers gardés par
   `scripts/check-env-parity.mjs` ».** Cette garde compare `takussan-api/.env.example` et
   `takussan-api/.env.docker` — **côté API uniquement**. La variable d'URL publique est lue par le
   FRONT (`NEXT_PUBLIC_SITE_URL`, `src/lib/alternates.ts`), dont le seul fichier d'environnement
   suivi par git est `takussan-web/.env.example` : `takussan-web/.gitignore` n'excepte que celui-là.
   L'y déclarer côté API aurait été un mensonge de plus.

2. **La garde qui manquait existait déjà, et elle était ROUGE.** Le job `variables` de
   `.github/workflows/front-deploy-map.yml` exige que toute `NEXT_PUBLIC_*` lue par
   `takussan-web/src` soit déclarée dans `.env.example` **et** relevée dans
   `docs/infra/frontend-deploiement.json`. TCK-434 a introduit `NEXT_PUBLIC_SITE_URL` sans faire ni
   l'un ni l'autre. Reproduit localement avant correctif : deux écarts. Elle vit désormais dans
   `scripts/check-front-env-keys.mjs`, que le workflow appelle — *une garde qui ne se déclenche
   qu'en `pull_request` ne peut pas être jouée avant de pousser, et c'est exactement l'intervalle
   pendant lequel la clé est passée.*

3. **`src/app/(public)/playground/page.tsx` n'existe plus** : la page vit sous
   `src/app/[locale]/(public)/`, et TOUTES les URL publiques portent un préfixe de langue. Le
   playground était donc indexable sur **trois** URL, pas une.

4. **Le sort du playground est le RETRAIT DE L'INDEXABILITÉ, pas le retrait de la page.** Le ticket
   ouvrait la porte à sa suppression ; `docs/design-guidelines.md` § « Outils de dev » et TCK-129
   (« à conserver comme outil de dev ») l'interdisent. La page est scindée en un composant SERVEUR
   qui porte `robots: { index: false }` et un `PlaygroundClient.tsx` qui garde le POC — un
   composant client ne peut pas déclarer de métadonnée, et c'était la seule raison du découpage.
   ⚠ Il n'est **pas** interdit dans `robots.txt` : un moteur qui a l'interdiction de charger l'URL
   ne lit jamais le `noindex` qu'elle porte.

### La garde de `NEXT_PUBLIC_SITE_URL` — tranchée, et ce qu'elle NE couvre pas

**La question est posée ici plutôt que supposée réglée ailleurs.** Trois issues étaient ouvertes :
étendre `check-env-parity.mjs` au front, écrire une garde dédiée, ou assumer l'absence de garde.

**Issue retenue : une garde dédiée**, `scripts/check-front-env-keys.mjs`.

**`check-env-parity.mjs` n'a PAS été étendu**, délibérément. Il compare deux fichiers **entre
eux** ; côté front il n'y en a qu'un seul suivi par git (`takussan-web/.gitignore` n'excepte que
`.env.example`, et `takussan-web/.env.docker` n'existe pas). Une « parité » à un fichier n'a pas de
sens, et élargir la garde à un troisième fichier lui ferait porter deux relations différentes sous
un seul nom.

**Ce que la garde retenue vérifie**, à chaque exécution et sans liste écrite à la main :

| | |
|---|---|
| Dérivé | les clés `NEXT_PUBLIC_*` **lues** par `takussan-web/src` + `next.config.ts` |
| Exigé | chacune déclarée dans `takussan-web/.env.example` **et** relevée dans `docs/infra/frontend-deploiement.json` |
| Non-vacuité | plancher de fichiers balayés, refus de trouver zéro clé, refus d'un relevé vide |

**Ce qu'elle NE couvre PAS, et qu'il ne faut pas croire gardé :**

- **la VALEUR** servie en Production ou en Preview. Le dépôt ne détient aucun jeton Vercel
  (ADR-0017) : il ne peut vérifier que la DÉCLARATION ;
- **les variables non préfixées `NEXT_PUBLIC_`.** `VERCEL_ENV` et `VERCEL_URL`, que
  `resoudreOrigineSite` lit, sont posées par la plateforme — ni à déclarer, ni à relever, ni
  gardables d'ici ;
- **`Repo CI` ne la joue pas.** Elle est appelée par le job `variables` de
  `.github/workflows/front-deploy-map.yml`, dont le déclencheur inclut `takussan-web/**` — donc
  tout ajout d'une lecture `NEXT_PUBLIC_*` la déclenche par construction. Elle se joue aussi en
  local : `node scripts/check-front-env-keys.mjs`.

⚠️ **Une garde existait déjà et elle était ROUGE.** Le job `variables` portait cette vérification
**en ligne, en bash**. Rejoué à l'identique sur la base `912d654e` :

```
· lues (src/lib/alternates.ts) : NEXT_PUBLIC_SITE_URL
· manquantes → .env.example    : NEXT_PUBLIC_SITE_URL
· manquantes → relevé          : NEXT_PUBLIC_SITE_URL
```

Elle n'a rien attrapé parce qu'elle ne se déclenche qu'en `pull_request` et sur un cron
hebdomadaire : **personne ne pouvait la JOUER avant de pousser.** C'est la raison du déplacement
vers `scripts/`, où la commande d'inventaire du `CLAUDE.md` racine
(`for g in scripts/check-*.mjs`) la trouve.

### Passe 2 — la garde de l'AC3 ne connaissait qu'UNE des deux formes de `robots`

`sitemap-couverture.test.ts` décidait de l'indexabilité par `/index\s*:\s*false/` sur le texte du
fichier de route. Next accepte **deux** formes, toutes deux dans son typage
(`robots?: null | string | Robots`) et résolues par `resolve-basics.js` :

```ts
robots: { index: false, follow: false }     // objet
robots: 'noindex, nofollow'                 // chaîne
```

Une page écrite sous la seconde était classée **indexable**, donc RÉCLAMÉE dans
`PAGES_STATIQUES_INDEXABLES` — et une fois ajoutée, les 57 tests passaient avec trois `<loc>`
`noindex` dans le sitemap.

⚠️ **Le défaut n'était pas la forme manquante, c'était le REPLI SUR « indexable ».** Le classement
rend désormais trois états, et `'inconnu'` **fait rougir en nommant le fichier**. Une troisième
forme (`robots: FONCTION()`, un objet importé) ne se rangera pas du côté qui ouvre l'indexation.

Deux effets de bord traités au passage : le classement **retire les commentaires** avant de lire
(`playground/page.tsx` cite `robots: { index: true }` dans sa prose, AVANT sa propre déclaration),
et un test éprouve les deux formes sur des sources littérales — aucune page du dépôt ne porte
aujourd'hui la forme chaîne, donc l'arborescence seule ne pourrait pas le montrer.

**Et le lien qui manquait entre les deux tickets** : rien n'obligeait une page entrée dans
`PAGES_STATIQUES_INDEXABLES` à déclarer des `alternates`. Elle serait entrée au sitemap avec ses
trois `<loc>` et ses quatre `xhtml:link` sans émettre ni canonique ni `hreflang`. La liste de
pages d'`alternates.test.ts`, écrite à la main sur cinq chemins, ne pouvait pas voir la sixième :
elle est désormais **dérivée** des deux tables que `sitemap-couverture.test.ts` confronte déjà à
l'arborescence.

### Passe 3 — le repli sur « indexable » avait SURVÉCU à sa correction

Il avait simplement reculé d'un cran : `indexabiliteDe` rendait `'indexable'` dès que le jeton
`robots:` était absent du fichier. Une page dont la métadonnée est **importée**
(`export { META as metadata } from './meta'`) n'en porte aucun — elle passait donc pour indexable,
était réclamée dans le sitemap, et 60 tests passaient avec elle dedans alors qu'elle sert
`noindex`. C'est le cas que le docblock prétendait déjà couvrir.

La règle est désormais **positive** : *on ne classe que ce qu'on peut lire sur place.* Une
métadonnée réexportée, affectée depuis un identifiant importé, ou absente, rend `'inconnu'` — et
`'inconnu'` fait rougir en nommant le fichier. Mesuré : les **neuf** pages publiques déclarent leur
métadonnée sur place, donc exiger la déclaration ne coûte aucun faux positif.

Second point du même correctif : l'objet `robots` était lu par `\{([^}]*)\}`, qui s'arrête à la
PREMIÈRE accolade fermante. `robots: { googleBot: { index: false }, index: true }` — une page
indexable pour tous les moteurs sauf Google — en sortait `noindex`. L'erreur allait dans le sens
sûr, mais elle aurait produit une « page indexable absente du sitemap » que rien d'autre ne
signale. La lecture est maintenant à accolades équilibrées, et ne juge que le PREMIER NIVEAU.

### `/sitemap.xml` et `/robots.txt` face au proxy

Les deux vivent à la RACINE et non sous `[locale]`. Ce n'est pas une préférence : ils portent une
extension, et `estCheminLocalisable` exclut du proxy tout chemin dont le DERNIER segment en porte
une. **C'est une propriété d'un fichier qui n'appartient pas à ce ticket** (`src/i18n/routing.ts`,
TCK-434) — la resserrer casserait les deux d'un coup, en silence, comme elle l'a déjà fait pour
`/opengraph-image` et `/icon`, servis eux sur des URL racine SANS extension.

Elle est donc éprouvée sur la RÈGLE (`src/app/__tests__/robots.test.ts`) : les deux chemins ne sont
pas localisables, le `proxy()` ne les redirige pas, et l'URL que la directive `Sitemap:` **annonce**
n'est pas redirigée non plus. Ablation jouée : retirer la règle d'extension de
`estCheminLocalisable` fait rougir les quatre assertions.

Mesuré par HTTP en plus, sur `next start` le 2026-08-27 :

```
/sitemap.xml     → 200  application/xml   (aucune redirection)
/robots.txt      → 200  text/plain        (aucune redirection)
/fr/sitemap.xml  → 404                    (correct : rien ne le référence)
```

### Décisions non évidentes

- **Un endpoint dédié, `GET /api/public/properties/sitemap`.** Le ticket désignait
  `/public/properties` comme source. Re-mesuré : il rend `PropertyResource` (47 clés + `address` +
  `media`), n'accepte aucun `fields[properties]` (il n'est pas bâti sur spatie) et n'a **aucun**
  plafond de `per_page`. Énumérer le catalogue par cette route reviendrait à le télécharger en
  entier pour en extraire deux colonnes. Le nouvel endpoint émet `slug` + `updated_at`, plafonne
  `per_page` à 1000 et trie par `id` — un ordre **total**, sans quoi deux pages successives d'un
  tri sur colonnes non uniques peuvent rendre deux fois la même ligne sous PostgreSQL.

- **Next n'échappe RIEN dans `<loc>`.** Mesuré dans
  `node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js` :
  `content += \`<loc>${item.url}</loc>\``. Un `&` dans un slug rendrait le sitemap **entier**
  invalide. `cheminDeFiche()` encode le slug ; c'est à la fois l'URL juste et du XML valide.

- **Le dépassement de 50 000 URL ÉCHOUE, il ne tronque pas.** Une troncature rendrait un sitemap
  valide, plus court, et muet sur ce qu'il laisse dehors. La forme retenue accueille le découpage
  par `generateSitemaps()` sans réécriture : `construireSitemap` prend une liste de pages.

- **La seule dégradation admise est l'API injoignable**, et elle est journalisée en nommant la
  source. `https://api.takussan.com` rend 404 (D-04, TCK-288) alors que le front est en
  production : faire échouer la génération bloquerait le déploiement du front sur une panne
  d'infrastructure qu'aucun commit de ce dépôt ne peut corriger. Constaté au build : la source
  `catalogue` échoue, le message sort, `/sitemap.xml` est produit avec ses pages statiques.

- **Le point d'extension de TCK-436 est nommé**, pas laissé en `TODO` : `SOURCES` dans
  `src/app/sitemap.ts` et `ROUTES_DYNAMIQUES_PUBLIQUES` dans `src/lib/sitemap.ts`. Un test de
  couverture (`src/lib/__tests__/sitemap-couverture.test.ts`) marche l'arborescence réelle de
  `src/app/[locale]/(public)/` et rougit sur toute route dynamique publique non tranchée.

### Vérification de bout en bout

API servie sur 8002 (251 biens publics), `npm run build` : **759 `<loc>`** = (251 + 2) × 3 langues,
XML bien formé (`xml.dom.minidom`), une fiche présente dans les trois langues avec ses quatre
`xhtml:link`. `robots.txt` porte **huit** interdictions (`/api /app /admin /super-admin /auth /onboarding /publish /maintenance` — le rapport de la passe 1 en annonçait sept, comptées à la main) et la directive `Sitemap:` absolue.
