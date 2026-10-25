# ADR-0022 — Le dictionnaire i18n est découpé par groupe de routes, et une clé manquante lève

- **Statut** : **Accepté**
- **Date** : 2026-08-21
- **Tickets** : TCK-337 (le découpage), TCK-335 (l'audit d'où il sort)
- **Frère** : [ADR-0017](0017-deploiement-du-front-pilote-par-vercel.md) pour ce qui touche au
  document servi

## Contexte

`src/app/layout.tsx` appelait `getMessages()` puis passait **le dictionnaire entier** à
`<NextIntlClientProvider>` : **60 espaces de noms** pour toutes les pages du produit, y compris
celles qui en emploient douze.

**Trois mesures décident, et deux d'entre elles contredisent le ticket qui a ouvert le sujet.**

1. **Le poids n'est pas dans le bundle JS, il est dans le DOCUMENT.** TCK-337 prescrivait de
   mesurer « le poids d'un `next build` ». Le dictionnaire y pèse **zéro** : il vit dans la charge
   RSC du document, servi `no-store`, donc **repayé à chaque chargement**. Mesuré sur
   `next start` : `/properties` = 368 658 o bruts / **76 182 o gzip**, dont le dictionnaire
   **207 163 o bruts, soit 83,1 % des octets gzippés**. Sur l'accueil, 87,8 %.
   *Un poste optimisable qui se mesure au mauvais endroit paraît négligeable.*
2. **Le sous-ensemble EST décidable statiquement.** Le ticket affirmait le contraire (« 3 sites de
   clé dynamique, 2 traducteurs racine »), et cette phrase autorisait l'implémenteur à renoncer à
   toute garde — c'est-à-dire à livrer la version dangereuse. Mesuré : **26 sites dynamiques,
   0 irrésolu** après repli sur les constantes. L'angle mort réel tient en **deux noms**, `errors`
   et `validation`, atteints par des traducteurs racine à clé dynamique.
3. **Le grain de la PAGE ne vaut pas son coût.** Par groupe de routes : **9 frontières, 8 layouts
   édités**. Par page : 113 éditions pour **8 % de gain supplémentaire**.

## Décision

**Le dictionnaire est découpé par GROUPE DE ROUTES, la table des espaces est DÉRIVÉE du graphe
d'imports, et une clé manquante LÈVE hors production.**

Les trois pièces sont indissociables, et c'est le cœur de cette décision : le découpage seul est
un correctif dont la **pire** implémentation donne le **meilleur** chiffre.

- **Découpage** — chaque frontière (`.`, `(public)`, `(auth)`, `(dashboard)`, `(dashboard)/app`,
  `(dashboard)/admin`, `(super-admin)/super-admin`, `onboarding`, `publish`) monte un provider avec
  `messagesPour('<identifiant exact>')`. Les ensembles sont **cumulés** : un provider imbriqué
  hérite du parent quand on omet `messages`, ce qui ne casse rien mais annule le gain en silence.
- **Dérivation** — `takussan-web/scripts/i18n-namespaces-scan.mjs` marche le graphe d'imports
  (`@/…`, relatifs, `import()`, `require`) depuis les fichiers du routeur et relève les espaces par
  trois règles : littéral, repli de constantes, et récolte bornée pour les fichiers à traducteur
  racine. `src/i18n/namespaces.json` en est le **produit**, jamais une liste écrite à la main.
- **Levée** — `surErreurIntl` lève sur `MISSING_MESSAGE` hors production et journalise en
  production.

Le **plancher** `{errors, validation}` est codé en dur et commenté : c'est la part que le graphe ne
peut pas dériver, et elle est nommée plutôt que devinée.

## Pourquoi pas autrement

- **`next-intl/extractor`** — évalué, présent en 4.13.6, **rejeté** : c'est un flux d'extraction
  vers catalogues. Aucune API de next-intl ne découpe par route.
- **Une table écrite à la main** — c'est exactement le défaut que la moitié des gardes de ce dépôt
  existent pour attraper ailleurs. *Une liste écrite à la main est juste le jour où on l'écrit* ;
  ici elle serait fausse au premier composant qui change d'import, et **sans rien casser** : la clé
  absente se peindrait à l'écran.
- **Découper par page** — 8 % de gain pour 105 éditions de plus, et autant d'occasions d'oublier
  un espace. Rouvrable sur mesure pour `(dashboard)/app`, qui reste à 66,1 % du dictionnaire.

## Conséquences

**Ce que ça rapporte, mesuré** : `/properties` passe de **76 182 à 34 139 octets gzippés**
(−55,2 %), et le document sert **23 espaces au lieu de 60** — 34 absents vérifiés un par un
(`superAdmin`, `crm`, `admin`, `dashboard`, `lease`, `payments`…). Le socle ne pèse plus que
**8,0 %** du dictionnaire complet.

**Ce que ça coûte** : ajouter un espace de noms à un écran n'est plus gratuit — il faut que le
graphe le voie. Un composant atteint par une indirection que les trois règles ne couvrent pas fait
**échouer la garde** au lieu de passer inaperçu. C'est délibéré : le mode de défaillance
d'origine — un `MISSING_MESSAGE` sur un chemin rare, en production — est bien pire qu'une CI rouge.

**Ce que ça interdit** : `getMessages()` hors de `src/i18n/messages.ts`, et un provider de
frontière sans `messagesPour('<identifiant exact>')`.

**Le piège que ça laisse ouvert** : `src/test/intl.tsx` monte `NextIntlClientProvider` **sans**
`onError`. Un test dont une clé manque reste donc vert. Y brancher `surErreurIntl` est un gain
net — c'est une suite à ouvrir, pas un oubli.

## Application

- `takussan-web/src/i18n/` — `messages.ts` (`messagesPour`, `PLANCHER`), `erreurs.ts`
  (`surErreurIntl`), `IntlProvider.tsx`, `namespaces.json` (**généré**).
- Les 8 layouts de frontière + `src/app/publish/layout.tsx`.
- **Gardes** : `takussan-web/scripts/check-i18n-namespaces.mjs`, rejouée par `web-ci.yml` à côté de
  sa sœur `check-i18n.mjs` — elle compare la table dérivée et la table déclarée **dans les deux
  sens**, échoue sur tout site dynamique irrésolu, et applique un **cliquet en points de
  pourcentage** du dictionnaire gzippé, pour qu'un provider écrit sans `messages` soit rattrapé.
- Tests : `src/i18n/__tests__/i18n-namespaces-scan.test.ts` (18 cas) et
  `decoupage-du-dictionnaire.test.tsx` (14 cas).

Les trois pièces ont été vérifiées **par ablation**, et deux ablations valent d'être retenues :
retirer la levée d'erreur laisse `messages={{}}` — le pire correctif possible, celui qui donne le
meilleur chiffre — passer au vert ; et rendre la règle de repli **silencieuse** plutôt
qu'échouante fait sortir l'espace `property` de la frontière `(super-admin)`, ce qui casserait
l'écran des filtres sans qu'aucun test ne rougisse.

## Amendement du 2026-10-25 — des frontières par section, une table différentielle, des lecteurs client seuls (P105.01, P105.02, P105.04, P69.05)

Décision du porteur du 2026-10-25, sur les pistes P105.01, P105.02 et P105.04 (angle 105) et P69.05
(angle 69) du fichier de pistes, `docs/plans/2026-10-15-pistes-d-amelioration.md`. Ticket :
TCK-2345. Relu sur `pre-dev` aba6693c7.

### Constat chiffré

Sauf mention contraire, les tailles sont des tailles **dérivées** : l'ensemble d'espaces que la
garde attribue à une frontière ou à un écran, sérialisé puis compressé (`gzip` niveau 6) par le
chemin de `check-i18n-namespaces.mjs`. Elles ne mesurent pas un document servi.

1. **Sous `/app`, la frontière sert le double de ce qu'un écran lit** (P105.01). `(dashboard)/app`
   sert 50 espaces, 73,1 Ko gzip, soit 66,3 % du dictionnaire. `(dashboard)/app/agency` en sert 55,
   85,9 Ko (77,8 %). Un écran de `/app` atteint 24 à 32 espaces, soit 33,2 à 58,1 Ko, en comptant
   sa page et la chaîne de ses layouts, `loading` et `error` jusqu'à la racine, plancher compris.
   La coque seule (les layouts de la racine à `/app`) en atteint 24, soit 33,2 Ko : le tableau de
   bord locataire lit **45 %** de ce qu'on lui sert. Les documents servis par `next start` sont
   relevés par l'explorateur le 2026-10-21 : les dictionnaires y pèsent 82 à 88 % de chaque document
   `/app` compressé. Le « 8 % » du § Contexte 3 valait pour l'ensemble des routes, et non pour `/app`.
2. **Une navigation renvoie ce que le navigateur a déjà** (P105.02). Un provider imbriqué
   remplace le dictionnaire de son parent, donc la table était cumulée. La requête RSC de
   `/app/properties` vers `/app/agency` portait les 55 espaces de la section, dont 50 déjà reçus :
   283,5 Kio bruts, 86,4 gzip (explorateur, mesuré). Les 5 espaces propres à la section pèsent
   14,0 Ko.
3. **Trois espaces lus par le seul serveur partaient vers le navigateur** (P105.04). Le
   dérivateur comptait `getTranslations` comme `useTranslations`. Or `getTranslations` résout
   contre le dictionnaire entier de la requête, jamais contre le sous-ensemble sérialisé. La
   frontière racine servait ainsi `meta`, `serverActions` et `publicLeadErrors` : 7 615 o, dont
   1 468 o pour ces trois-là. Sous `(public)`, `legal` s'y ajoute. Sous `invitations` et `publish`,
   c'est `onboarding`. Chacun a été relu : aucun `useTranslations` ne les lit.
4. **Sous `(public)`, une sous-frontière ne peut que compléter son parent** (P69.05).
   `[locale]/(public)` sert 30 espaces, 33,9 Ko. La page légale en atteint 16, soit 25,2 Ko : chaque
   page publique monte sa barre de navigation et son pied de page, qui lisent `property`, `search`,
   `favorites`, `footer` et `nav`. Avec trois sous-frontières seules (fiche, liste, pages légales),
   `(public)` sert encore l'union de toutes les autres pages, soit 26 espaces et 33,0 Ko, et la page
   légale passe à 33,2 Ko : **−2 %**. Pour la ramener à 25,5 Ko, il faut aussi des frontières pour
   `agencies`, `agents`, `bookings`, `pay` et `share`.

### Décision

1. **Seuls les lecteurs CLIENT nourrissent la table** (P105.04). Un site `getTranslations`
   (littéral, dynamique ou racine) est un lecteur serveur. Il ne fait entrer aucun espace dans la
   table, et le rapport nomme à part les espaces lus par le seul serveur. `useTranslations` reste
   compté côté client, même dans un composant serveur. Le distinguer demanderait de suivre la
   frontière `'use client'` à travers le graphe, et une erreur de ce côté-là peindrait une clé à
   l'écran.
2. **`IntlProvider` fusionne, et la table est différentielle** (P105.02). Le provider d'une
   frontière imbriquée lit le dictionnaire de son parent (`useMessages()`) et lui ajoute le sien,
   dans le navigateur. `namespaces.json` ne porte plus, pour chaque frontière, que son
   **différentiel** : les espaces que son sous-arbre lit et qu'aucun parent ne sert. La racine porte
   le plancher, que toutes les frontières héritent. Hériter devient la règle, et non plus le
   piège : c'est un provider qui **remplace** le dictionnaire de son parent qui devient le défaut.
3. **Sous `/app`, une frontière par section** (P105.01). `(dashboard)/app` devient une frontière
   **à sections**. Toute section de premier niveau (`crm/`, `leases/`, `properties/`, …) dont les
   fichiers atteignent un espace que la coque ne sert pas monte sa propre frontière : un
   `layout.tsx` qui rend `<IntlProvider messages={await messagesPour('<identifiant>')}>`. La règle
   est dérivée, pas énumérée : 22 sections la remplissent le 2026-10-25, dont 7 qui avaient déjà
   un layout de garde (TCK-426). `messages`, `notifications`, `settings` et `[...introuvable]`
   n'en ont pas besoin, car elles ne lisent rien hors de la coque. Le grain de la page reste écarté :
   la section suffit, puisqu'un écran y lit en médiane 99 % de ce qu'on lui sert.
4. **Sous `(public)`** (P69.05) : voir « Ce qui n'est pas tranché ici ».

### Règles et contrat de la garde, réécrits

`takussan-web/scripts/check-i18n-namespaces.mjs` :

- **A — dérivation.** Inchangée, sauf qu'elle ne retient que les lecteurs client (décision 1).
  La table déclarée est comparée **à l'identique** à la table dérivée, dans les deux sens. Un espace
  déclaré qu'un parent sert déjà est refusé, avec son propre message : la table est
  différentielle.
- **B — sites dynamiques.** Inchangée côté client. Un site `getTranslations(<expression>)` n'a plus
  à se résoudre, car il ne nourrit pas le provider.
- **C — aucune frontière ne sert le dictionnaire entier, et aucune ne remplace celui de son
  parent.** `getMessages()` reste interdit hors de `src/i18n/messages.ts`. Tout `layout.tsx`
  frontière appelle `messagesPour('<son identifiant exact>')` : sans cet appel, son sous-arbre
  n'aurait pas son différentiel. **Nouveau** : `NextIntlClientProvider` est refusé hors de
  `src/i18n/IntlProvider.tsx` (et du harnais `src/test/intl.tsx`), et `IntlProviderRacine` hors de
  `src/app/layout.tsx`. Un provider qui remplace ne recevrait que le différentiel de sa frontière.
- **D — cliquet.** Il porte sur l'ensemble **cumulé** de chaque frontière, c'est-à-dire sur ce
  qu'un document transporte, et non plus sur l'entrée de la table, qui n'en est que le
  différentiel. La marge reste à 5 points. Les plafonds sont régénérés, donc resserrés par
  construction : `(dashboard)/app` passe de 72 à 34 %, `(dashboard)/app/agency` de 83 à 64 %.
- **E — nouvelle : une frontière à sections ne sert que sa coque.** La coque, ce sont les fichiers
  du routeur posés dans le répertoire même de la frontière, plus ce que servent ses parents. Une
  section sans frontière qui atteint un espace hors de la coque fait échouer la garde, même après
  `--update`. Sans cette règle, une section neuve écrite sans `layout.tsx` ferait entrer ses
  espaces dans le document de tous les écrans de `/app`, et `--update` la rendrait conforme. La
  liste des frontières à sections est `FRONTIERES_A_SECTIONS`, aujourd'hui `(dashboard)/app` seule.
- **`--report`** imprime, par frontière, le différentiel (ce qu'une navigation vers elle coûte) et
  le cumul (ce que son document porte), puis les espaces lus par le seul serveur. Il imprime
  ensuite, **par écran**, l'ensemble servi et l'ensemble atteint.

### Ce que ça rapporte — dérivé, le 2026-10-25

- Document des 64 écrans de `/app` : 31,9 à 64,5 Ko servis au lieu de 73,1 ou 85,9, soit −22 à
  −56 % selon l'écran, et −41 % en somme. Le tableau de bord locataire passe de 73,1 à 31,9 Ko.
- Navigation vers `/app/agency` : son différentiel compte 10 espaces, soit 33,9 Ko au lieu de 85,9.
  Avant les frontières de section, il en comptait 5 (14,0 Ko) ; il porte maintenant aussi
  `property`, `documents`, `payments`… que `/app` ne sert plus à tous ses écrans.
- Racine : 6 147 o au lieu de 7 615.

### Ce qui n'est pas gardé

- **Le document servi.** Aucune garde ne mesure les octets d'un `next start`. Le cliquet porte
  sur la part dérivée.
- **Un `useTranslations` dans un composant serveur** compte comme un lecteur client. C'est une
  sur-approximation assumée, voir la décision 1.
- **Une clé écrite dans un fichier serveur et traduite côté client.** Un littéral `'x.y'` qu'un
  fichier serveur à `getTranslations()` racine passerait en donnée à un traducteur racine client
  ne serait plus récolté. Les deux cas connus, `errors` et `validation`, sont au plancher. Pour
  le reste, `surErreurIntl` lève hors production.
- **La forme objet `namespace: '…'`** compte côté client, quel que soit l'appel qui l'entoure.
- **Deux sections sœurs** se partagent des espaces hors de la coque (`property` entre
  `properties/` et `documents/`). Une navigation de l'une à l'autre les renvoie : le différentiel
  se calcule par rapport au parent, pas à l'historique du navigateur.
- **La fusion a lieu dans le navigateur.** Un test qui monte `IntlProvider` sans provider racine
  au-dessus lève (`useMessages()`), comme il levait déjà sur `useLocale()`.
- **L'identité des objets** (TCK-1489) reste gardée par `toBe`. Les différentiels ne se recouvrent
  plus, mais un espace servi deux fois par une erreur future ne serait alors pas dédupliqué.

### Ce qui n'est pas tranché ici

**P69.05 (`(public)`)** : la décision nomme trois frontières (fiche, liste, pages légales).
Appliquées seules, elles ne rapportent que −2 % sur la page légale (constat 4), parce que
`(public)` continue de servir l'union des autres pages. La règle E rendrait la page légale à
25,5 Ko si `[locale]/(public)` entrait dans `FRONTIERES_A_SECTIONS`, au prix de cinq frontières
de plus (`agencies`, `agents`, `bookings`, `pay`, `share`). La piste est rendue au porteur avec
ces chiffres.

### Application

- `takussan-web/scripts/i18n-namespaces-scan.mjs` : `releveFichier` (champs `…Serveur`) et
  `espacesAtteignables` (`serveurSeul`).
- `takussan-web/scripts/check-i18n-namespaces.mjs` : la table différentielle, les règles C et D
  réécrites, la règle E et `--report`.
- `takussan-web/src/i18n/IntlProvider.tsx` (la fusion) et `src/i18n/namespaces.json`, régénéré :
  32 frontières.
- 22 `layout.tsx` de section sous `src/app/(dashboard)/app/`.
- Tests : `src/i18n/__tests__/i18n-namespaces-scan.test.ts` et
  `decoupage-du-dictionnaire.test.tsx`.
