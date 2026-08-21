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
