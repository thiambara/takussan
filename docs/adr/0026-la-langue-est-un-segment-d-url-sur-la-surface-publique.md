# ADR-0026 — La langue est un segment d'URL, toujours présent, et seulement sur la surface publique

- **Statut** : Accepté
- **Date de la décision** : 2026-08-27
- **Tickets** : TCK-434 (implémente), TCK-431 (sitemap : consomme les alternatives), TCK-433
  (canonical / `metadataBase` : consomme la forme d'URL)
- **ADR liés** : [ADR-0022](0022-le-dictionnaire-i18n-est-decoupe-par-groupe-de-routes.md) (le
  découpage du dictionnaire, dont cet ADR déplace une frontière),
  [ADR-0017](0017-deploiement-du-front-pilote-par-vercel.md) (les URL déjà publiques sont servies
  en production)

## Contexte

### Ce qui était mesuré

Le 2026-08-27, dans `takussan-web/src/i18n/request.ts` : la langue active est résolue par le cookie
`NEXT_LOCALE`, à défaut par l'en-tête `Accept-Language`, à défaut par `DEFAULT_LOCALE = 'fr'`.
**La langue n'apparaît nulle part dans l'URL.** Trois conséquences, toutes tenues :

1. Un lien envoyé par un visiteur qui lisait en wolof s'ouvre en français chez le destinataire.
   `PropertyShareDialog` est livré, et il partage une URL qui ne dit pas sa langue.
2. Un robot n'envoie pas de cookie : il n'obtient jamais que `fr`. Les versions `en` et `wo` du
   catalogue n'ont **aucune URL propre à indexer**, et `hreflang` n'a aucune alternative à nommer.
3. La même URL rend trois contenus selon le demandeur — la situation qu'un cache partagé ne peut
   pas servir sans le savoir.

### Deux affirmations du ticket que la mesure a contredites, et elles changent la décision

**a) Le garde de route ne voit pas les routes publiques — FAUX.** Le ticket lit
`export const proxyConfig = { matcher: ['/app/:path*', '/admin/:path*', '/auth/:path*'] }` dans
`src/proxy.ts` et en conclut que le proxy ne s'exécute pas sur les routes publiques. Or Next
n'extrait la configuration que d'un export nommé **`config`** :

```
$ grep -n "extractExportedConstValue(ast, 'config')" \
    node_modules/next/dist/build/analysis/get-page-static-info.js
469:    const configResult = (0, _extractconstvalue.extractExportedConstValue)(ast, 'config');
$ grep -rn "proxyConfig" node_modules/next/            # → aucune occurrence
```

Mesuré par exécution — `proxy.ts` instrumenté d'un en-tête `x-mesure-proxy`, `next dev -p 3998` :

```
/                → 200  x-mesure-proxy: /
/properties      → 200  x-mesure-proxy: /properties
/api/auth/me     → 401  x-mesure-proxy: /api/auth/me
/favicon.ico     → 200  x-mesure-proxy: /favicon.ico
/app             → 307  location: /auth/login?redirect=%2Fapp
```

Le proxy tourne donc déjà **sur tout**, `/api` et les fichiers statiques compris. *Un `matcher`
qu'aucun outil ne lit n'est pas une restriction, c'est une croyance* — et c'est la forme la plus
coûteuse de fausseté, parce qu'elle rassure. Conséquence pour cette décision : rien n'était à
« ouvrir », il y avait au contraire à **fermer** — le proxy doit cesser de s'exécuter sur `/api` et
sur les fichiers statiques, faute de quoi les route handlers BFF entrent dans le champ du schéma
d'URL.

**b) Le wolof est un dictionnaire partiel — FAUX.** Le ticket demande à cet ADR de trancher si `wo`
mérite une URL propre « ou seulement quand sa couverture le justifie ». Mesuré sur les trois
dictionnaires de `src/messages/` :

| | clés | valeurs identiques au français |
|---|---|---|
| `fr` | 5 338 | — |
| `en` | 5 338 | 398 (7,5 %) |
| `wo` | 5 338 | 247 (4,6 %) |

La parité de clés est **totale**, et le wolof diverge du français **plus** que l'anglais. Le
mécanisme `mergeMessages` existe bien, mais il n'a plus rien à combler : il ne couvre aujourd'hui
que des libellés légitimement identiques (noms propres, symboles, nombres). *La question posée
n'avait pas lieu d'être ; elle n'a survécu que parce que personne n'avait compté.*

## Décision

**La langue est le premier segment du chemin, elle y est toujours présente, et elle ne l'est que sur
la surface publique.**

### 1. Le schéma — préfixe de chemin, `always`

| Page | URL |
|---|---|
| Accueil | `/fr` · `/en` · `/wo` |
| Liste des biens | `/fr/properties` · `/en/properties` · `/wo/properties` |
| Fiche d'un bien | `/fr/properties/<slug>` · `/en/properties/<slug>` · `/wo/properties/<slug>` |
| Agence, agent | `/<locale>/agencies/<slug>`, `/<locale>/agents/<slug>` |
| Comparateur, favoris, réservations, playground | `/<locale>/compare`, `/favorites`, `/bookings`, `/playground` |

**Le français est préfixé comme les autres.** L'alternative — préfixer les seules langues non par
défaut (`localePrefix: 'as-needed'`) — évite de déplacer les URL déjà publiques, et c'est son seul
avantage. Elle est écartée pour trois raisons :

- Une URL sans préfixe est **exactement l'ambiguïté qu'on supprime** : elle continuerait de rendre
  trois contenus selon le demandeur pour qui n'a pas de cookie. Corriger deux langues sur trois,
  c'est garder le défaut en le rendant plus difficile à voir.
- `x-default` doit pointer vers une URL qui existe. En `as-needed`, `x-default` et `hreflang="fr"`
  désignent la même URL, ce qui prive `x-default` de son sens (« la version à servir quand aucune
  langue ne convient »).
- La règle de redirection devient **une seule règle**, sans exception : « pas de préfixe → on en
  ajoute un ». En `as-needed` il faudrait distinguer « pas de préfixe parce que c'est du français »
  de « pas de préfixe parce que c'est une URL héritée », et les deux ont la même forme.

Le sous-domaine (`fr.takussan.com`) est écarté sans hésitation : trois certificats, trois origines
CORS, trois jeux de cookies, et une isolation d'origine qui casserait le cookie d'authentification
partagé avec la console.

### 2. La surface non localisée, nommée et non déduite

Ces préfixes **ne portent jamais de langue**, et le proxy ne les touche pas :

`/app`, `/admin`, `/super-admin`, `/auth`, `/onboarding`, `/publish`, `/maintenance`, `/api/**`,
`/_next/**`, `/_vercel/**`, et tout chemin portant une extension (`/robots.txt`, `/sitemap.xml`,
`/favicon.ico`).

Raison : aucune n'est indexable, toutes sont derrière un choix déjà exprimé (on est connecté, ou on
suit un lien de service), et le coût de les déplacer — gardes d'authentification, redirections
`?redirect=`, appels BFF depuis le navigateur — serait payé pour un bénéfice nul. La console lit sa
langue dans le cookie, comme aujourd'hui.

⚠ `/api/**` est nommé **en premier** dans cette liste et exclu du `matcher` : un route handler BFF
préfixé d'une langue est un 404 pour tout le produit, y compris la console. C'est le mode de
défaillance le plus large que cette décision peut produire.

### 3. Les URL héritées redirigent en **307**, jamais en 308

`/properties/<slug>` → `307` vers `/<locale>/properties/<slug>`, avec
`Vary: Cookie, Accept-Language`. La locale de destination est choisie par : **cookie `NEXT_LOCALE`
→ `Accept-Language` → `fr`**.

**Le permanent (308) est refusé, et c'est le point le plus contre-intuitif de cet ADR.** Une
redirection permanente affirme que la cible est une propriété de l'URL source. Ici elle est une
propriété du **demandeur** : la même URL héritée doit mener à `/fr/…` pour l'un et `/en/…` pour
l'autre. Un 308 est mis en cache par le navigateur et par tout cache partagé — il épinglerait la
langue du premier visiteur sur tous les suivants. Ce serait le défaut qu'on corrige, remonté d'une
couche et rendu persistant.

Ce que le 307 coûte : les moteurs ne transfèrent pas le signal de l'URL héritée aussi franchement
qu'avec un 308. Le compenser n'est pas le rôle de la redirection — c'est celui du `canonical`
(TCK-433) et du `hreflang` posés sur la cible, qui disent la vérité complète là où la redirection ne
peut dire qu'une moitié.

Aucune URL publique existante ne rend 404 : la règle est totale, elle s'applique à tout chemin
localisable dépourvu de préfixe, y compris `/`.

### 4. `wo` est une langue de première classe, indexable dès maintenant

`/wo/…` existe, est déclarée dans `hreflang`, entrera dans le sitemap (TCK-431), et n'est pas
`noindex`. Décidé sur la mesure du §Contexte b : 5 338/5 338 clés, 95,4 % des valeurs distinctes du
français. Rien ne justifie un régime d'exception.

### 5. L'URL gagne sur le cookie ; le cookie gagne sur `Accept-Language` ; aucune détection
n'écrase un choix

Deux préséances distinctes, et les confondre est l'erreur à éviter :

| Question | Ordre |
|---|---|
| **Quelle langue rendre** sur une URL préfixée ? | le préfixe, **seul** — ni cookie ni en-tête ne peuvent le contredire |
| **Où envoyer** une requête sans préfixe ? | cookie `NEXT_LOCALE` → `Accept-Language` → `fr` |

Sur une surface non localisée (console), l'ordre reste cookie → `Accept-Language` → `fr`.

**Une URL déjà préfixée n'est jamais redirigée.** C'est ce qui garantit qu'un choix explicite —
suivre un lien `/en/properties/x`, ou cliquer « English » — survit à un `Accept-Language: fr`.
Aucune bannière, aucune fenêtre de suggestion : conformément au ticket, une détection qui écraserait
un choix exprimé reproduirait le défaut corrigé.

Le commutateur de langue **navigue** : il change l'URL (donc l'historique du navigateur : le retour
arrière ramène à la langue précédente) *et* écrit le cookie, pour que les entrées ultérieures sans
préfixe et la console suivent le même choix.

**Et l'URL écrit le cookie elle aussi — c'est la moitié de la décision qui manquait.** Servir une
URL préfixée reporte sa langue dans `NEXT_LOCALE`. Sans ce report, l'objectif du ticket ne tient pas
un clic : le destinataire d'un lien `/en/properties/x` n'a AUCUN cookie, il lit la fiche en anglais,
clique un lien interne non préfixé — l'immense majorité des liens du produit — et le §3 l'envoie en
français. *Le lien partagé n'aurait servi qu'une seule page.*

Ce n'est pas une détection qui écrase un choix : suivre un lien dans une langue **est** le choix le
plus explicite qui soit, et le tableau ci-dessus le place déjà au-dessus du cookie. Rien dans ce
report ne lit `Accept-Language`.

C'est aussi ce qui rend la migration des liens internes **facultative plutôt que bloquante** : un
lien qui ne porte pas la langue coûte un aller-retour, jamais la mauvaise langue.

## Conséquences

**Ce que ça coûte.**

- Toutes les URL publiques déjà en ligne changent de forme. Le 307 les rattrape ; le coût réel est
  un aller-retour de plus au premier accès, et des signaux d'indexation à reconstruire.
- Le groupe de routes `(public)` descend sous `src/app/[locale]/`. La frontière de dictionnaire
  d'ADR-0022 change donc d'identifiant : `(public)` → `[locale]/(public)`. `namespaces.json` est
  régénéré, il ne se corrige pas à la main.
- Tout lien interne vers une page publique gagne à porter la langue. Un lien qui ne la porte pas
  **fonctionne encore et dans la bonne langue** (le report au cookie du §5, puis le 307), mais coûte
  un aller-retour : la dégradation est douce, ce qui est délibéré — le contraire aurait fait dépendre
  la justesse du produit d'une exhaustivité impossible à garantir sur ~50 fichiers, dont plusieurs
  sont tenus par d'autres chantiers en cours. 26 fichiers de la surface publique sont passés à
  `LienLocalise` ; le reste suit le chemin doux et n'est pas urgent.

- ⚠️ **`NEXT_PUBLIC_SITE_URL` doit être posée sur chaque environnement déployé qui n'est pas la
  production.** Les `hreflang` sont des URL **absolues** bâties sur `ORIGINE_SITE`
  (`src/lib/alternates.ts`), dont le défaut est `https://www.takussan.com`. Une prévisualisation
  Vercel qui n'a pas cette variable déclare donc des alternatives **vers la production** : elle
  s'annonce comme la version anglaise/wolof d'un autre site. C'est une sortie vers l'extérieur, pas
  une gêne de développement — un robot qui atteint une preview (elles sont publiques par défaut chez
  Vercel) reçoit des signaux de langue qui désignent des URL qu'elle ne sert pas.

  Où poser la variable, exactement :

  | Où | Quoi |
  |---|---|
  | Vercel, environnement *Preview* | `NEXT_PUBLIC_SITE_URL = https://$VERCEL_URL` (ou l'URL de la preview) |
  | Vercel, environnement *Production* | `NEXT_PUBLIC_SITE_URL = https://www.takussan.com` — explicite plutôt que par défaut |
  | `takussan-web/.env.example` **et** `.env.docker` | la clé doit exister dans **les deux**, sinon `scripts/check-env-parity.mjs` ne voit rien : *une clé absente des DEUX fichiers est en parité parfaite* |

  Le défaut retenu est celui de la production **et non `http://localhost:3000`** : un `hreflang`
  faux vers la production est un défaut d'indexation ; un `hreflang` vers `localhost` en serait un
  aussi, et il serait absurde. Aucune des deux valeurs par défaut n'est bonne — c'est pourquoi la
  variable doit être posée, pas héritée.

**Ce que ça interdit.**

- Rendre une page publique sur une URL sans préfixe. Il n'y en a plus.
- Ajouter un préfixe de langue à `/api/**` ou à une surface authentifiée.
- Une redirection automatique sur une URL déjà préfixée, quelle qu'en soit la raison.

**Ce que ça rend possible.**

- Un lien partagé transporte sa langue (l'objectif utilisateur de TCK-434).
- `hreflang` + `x-default` ont des cibles réelles ; le sitemap de TCK-431 peut déclarer trois
  alternatives par page.
- Un cache partagé peut servir une page publique sur la seule clé d'URL.

## Application

| Où | Quoi |
|---|---|
| `takussan-web/src/i18n/routing.ts` | Le schéma, en fonctions pures : `estCheminLocalisable`, `decouperLocale`, `cheminLocalise`, `SEGMENTS_NON_LOCALISES` |
| `takussan-web/src/proxy.ts` | La redirection 307, le `Vary`, le report de la langue au cookie, la garde d'authentification inchangée, et le `matcher` **renommé `config`** (§Contexte a) |
| `takussan-web/src/i18n/request.ts` | La préséance de rendu : `requestLocale` (le segment) d'abord |
| `takussan-web/src/app/[locale]/(public)/**` | Le groupe public déplacé |
| `takussan-web/src/i18n/navigation.ts` + `src/components/shared/LienLocalise.tsx` | Le `Link` qui préfixe les seuls chemins localisables (26 fichiers migrés) |
| `takussan-web/src/components/shared/LanguageSwitcher.tsx` | Le commutateur qui NAVIGUE en plus d'écrire le cookie |
| `takussan-web/src/lib/alternates.ts` | `hreflang` + `x-default` |

Ce qui l'empêche de régresser : `src/i18n/__tests__/routing.test.ts`,
`src/__tests__/proxy.test.ts`, `src/i18n/__tests__/request-locale.test.ts` et
`src/lib/__tests__/alternates.test.ts`, `src/i18n/__tests__/navigation.test.ts` et
`src/i18n/__tests__/entete-locale-next-intl.test.ts` — **six ablations rejouées**, chacune rougissant
sans son correctif (redirection retirée, en-tête de langue retiré, préséance de l'URL retirée,
`x-default` retiré, groupe public remonté hors de `[locale]`, report au cookie retiré).
`scripts/check-i18n-namespaces.mjs` casse si la frontière déplacée n'est pas déclarée.
