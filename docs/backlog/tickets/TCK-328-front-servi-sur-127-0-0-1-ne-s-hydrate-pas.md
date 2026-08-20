---
id: TCK-328
title: "Le front servi sur `127.0.0.1` ne s'hydrate pas — Next 16 bloque ses ressources de dev, en silence"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-08-17
updated: 2026-08-20
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, infra, onboarding, dev-experience, dette, next16]
---

## Objectif utilisateur

Qu'un développeur — ou un agent — qui ouvre le front sur `http://127.0.0.1:<port>` obtienne soit une
application qui marche, soit une phrase qui lui dit pourquoi elle ne marche pas. Aujourd'hui il
obtient une page qui s'affiche normalement et dont **rien** ne répond.

## Contrat de données

Aucune donnée, aucun endpoint. Deux fichiers seulement :

- `takussan-web/next.config.ts` — ne déclare **aucun** `allowedDevOrigins` (vérifié : `grep -rn
  "allowedDevOrigins"` sur tout le dépôt, hors `node_modules`, rend **0 résultat**).
- `dev.sh:794` — la ligne qui annonce l'URL du front au développeur.

## Contraintes strictes (métier)

- **Le correctif ne doit pas élargir la surface au-delà de la boucle locale.** `allowedDevOrigins`
  existe « for safety » selon le message de Next lui-même ; y inscrire `127.0.0.1` est le geste que
  ce message recommande, mais c'est une décision à écrire, pas à glisser.
- **Le mode `dev` uniquement.** `allowedDevOrigins` ne gouverne que les ressources du serveur de
  développement (`/_next/hmr`, `/__nextjs_font/…`). Rien de ce ticket ne touche à un build de
  production.
- **Ne rien changer au comportement nominal** : `./dev.sh` fonctionne aujourd'hui et doit continuer.

## Delta à produire

- [x] `takussan-web/next.config.ts` : déclarer `allowedDevOrigins` couvrant la boucle locale
      (`127.0.0.1`), avec un commentaire qui dit **ce que le silence coûtait** — pas seulement ce
      que l'option fait.
- [x] `dev.sh` : commentaire sur la ligne 794 expliquant pourquoi le lien du front est en
      `localhost` quand ceux de l'API, Meilisearch, MySQL et Redis sont en `127.0.0.1` (lignes 795
      et 801-802). Aujourd'hui rien ne dit que cette différence est porteuse.
- [x] `./dev.sh doctor` : nommer le cas, sur le modèle exact de ce que TCK-301 a fait pour D-48 —
      la sonde ne corrige rien, elle affiche. Ici elle peut faire mieux que pour D-48, cf. « une
      différence avec D-48 » ci-dessous.
- [x] `takussan-web/CLAUDE.md` : ajouter le piège au § *Environnement*, **à côté** de la note
      d'incohérence d'hôte existante et non dedans — ce sont deux défauts distincts (cf. ⑵).
- [x] Entrée d'ardoise ~~**D-56**~~ → **D-57** — **ÉCRITE le 2026-08-20**, `docs/ardoise.md:907`,
      dans la section *🟠 Environnement, CI et gardes*, juste après D-48 dont elle se distingue.
      Elle n'avait pas pu l'être à l'implémentation, pour deux raisons consignées dans les Notes :
      le numéro D-56 était déjà pris (TCK-322, `docs/ardoise.md:1985`) et `docs/ardoise.md` était
      tenu par un autre agent au même moment. Vérifié après écriture :
      `grep -n '^### D-57' docs/ardoise.md` → une ligne, et `node scripts/check-doc-links.mjs`
      sort en 0.
- [x] Vérification par **ablation** : retirer `allowedDevOrigins`, recharger sur `127.0.0.1`,
      constater le retour des 403 et de la non-hydratation. Un correctif d'environnement qu'on n'a
      pas vu échouer sans lui n'est pas vérifié.

## Critères d'acceptation

- [x] AC1 — Le front servi par `npm run dev` et ouvert sur `http://127.0.0.1:<port>` **s'hydrate** :
      un formulaire soumis déclenche le gestionnaire React, pas une navigation GET native.
- [x] AC2 — Aucun `Blocked cross-origin request to Next.js dev resource` dans la sortie du serveur
      de développement, et aucun 403 sur `/_next/*` dans la console du navigateur, pour cet hôte.
- [x] AC3 — Le comportement sur `http://localhost:<port>` est inchangé.
- [x] AC4 — `./dev.sh doctor` nomme l'écart quand il subsiste, et **ne bruite pas** le cas nominal
      (0 ligne quand tout va bien) — même exigence que la vérification par ablation de TCK-301.
- [x] AC5 — L'ablation d'AC1 est constatée et consignée : sans le correctif, la panne revient.

## Hors périmètre

- **L'incohérence d'hôte de l'API** (`APP_URL=localhost:8002` / `SANCTUM_STATEFUL_DOMAINS` contre
  `NEXT_PUBLIC_API_URL=127.0.0.1:8002`, `takussan-web/CLAUDE.md` § *Environnement*). C'est un
  **autre** défaut, sur un autre axe — cf. ⑵. Le traiter ici mélangerait deux causes.
- Le choix du port du front (`port_libre 3000` dans `dev.sh`) et l'avertissement
  `SANCTUM_STATEFUL_DOMAINS` qui l'accompagne.
- Toute configuration de production ou de préproduction.
- La dette D-48 elle-même (`takussan-api/.env` visant les services natifs) — voisine, déjà traitée
  par TCK-301.

---

## Ce qui a été mesuré, et dans quelles conditions

Relevé le **2026-08-17**, pendant la vérification en navigateur de TCK-279 (AC11), sur une pile
montée pour l'occasion : `PORT=3010 npm run dev`, Chrome via DevTools.

**Sur `http://127.0.0.1:3010`** — sortie du serveur de développement :

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1".
  Cross-origin access to Next.js dev resources is blocked by default for safety.
  To allow this host in development, add it to "allowedDevOrigins" in next.config.js
⚠ Blocked cross-origin request to Next.js dev resource /__nextjs_font/geist-latin.woff2 from "127.0.0.1".
```

Console du navigateur : `403 (Forbidden)` × 13, plus l'échec du WebSocket HMR. Sonde d'hydratation —
« l'élément `<form>` porte-t-il une clé interne React ? » :

```js
Object.keys(document.querySelector('form')).some(k => k.startsWith('__react'))
→ false      // sur 127.0.0.1
→ true       // sur localhost, même serveur, même instant
```

Conséquence observée : le formulaire de connexion **se soumet en GET natif**
(`/auth/login?email=…&password=…`), le mot de passe part dans l'URL, et l'écran se recharge vierge.

⚠️ **Le port 3010 est incident, pas causal** : le message de Next nomme l'**hôte**
(`from "127.0.0.1"`), jamais le port. La re-mesure demandée par AC1 se fera sur le port nominal.

## ⑴ Pourquoi c'est sérieux : la panne est muette

Rien ne casse visiblement. Le HTML arrive, la page s'affiche, le CSS est là. C'est
l'**interactivité** qui manque, et elle manque partout à la fois — ce qui la fait ressembler à tout
sauf à une question d'hôte. Le premier symptôme utile est un formulaire qui « ne fait rien », ou
qui recharge la page ; le premier réflexe est de chercher dans le composant.

Et le dépôt oriente vers l'hôte fautif. `dev.sh` annonce **`127.0.0.1`** pour l'API (`:795`),
Meilisearch (`:801`), MySQL et Redis (`:802`) ; `takussan-web/.env.example` livre
`NEXT_PUBLIC_API_URL=http://127.0.0.1:8002`. **Seuls le front (`:794`) et Mailpit sont en
`localhost`**, et aucun commentaire ne dit que cette exception est porteuse. Un développeur qui
tape l'hôte majoritaire du dépôt tombe dans le piège ; un outil de test end-to-end, qui vise
`127.0.0.1` par défaut, y tombe aussi.

*Le chemin nominal est sûr — `./dev.sh` imprime le bon lien. Ce ticket porte sur tous les autres
chemins, et sur le fait que rien ne dit qu'ils n'en sont pas.*

## ⑵ L'hypothèse « c'est la cause de l'incohérence d'hôte déjà notée » a été VÉRIFIÉE, et elle est FAUSSE

Elle méritait d'être posée, et elle ne tient pas. Ce sont **deux défauts sur deux axes différents** :

| | Note existante (`takussan-web/CLAUDE.md` § *Environnement*) | Ce ticket |
|---|---|---|
| Axe | l'origine de l'**API** appelée par le front | l'origine à laquelle le **front lui-même** est servi |
| Valeurs | `APP_URL=localhost:8002` + `SANCTUM_STATEFUL_DOMAINS=localhost:3000` contre `NEXT_PUBLIC_API_URL=127.0.0.1:8002` | l'URL tapée dans le navigateur : `127.0.0.1:<port>` contre `localhost:<port>` |
| Symptôme | cookies non partagés entre deux origines | ressources `/_next/*` en 403, **aucune hydratation** |
| Port | 8002 | 3000 |

**Ce qui tranche** : `dev.sh:794` imprime `http://localhost:$WEB_PORT` pour le front. Si l'hypothèse
tenait, le chemin nominal serait cassé — il ne l'est pas. Les deux notes se ressemblent parce
qu'elles citent la même paire de mots (`localhost` / `127.0.0.1`) ; elles ne décrivent pas le même
mécanisme, et les fusionner ferait perdre les deux.

*C'est la raison pour laquelle le delta ajoute la note **à côté** de l'existante, et pas dedans.*

## ⑶ Une différence avec D-48 qui change le delta

D-48 et TCK-301 portent sur `takussan-api/.env`, **ignoré par git** : aucun fichier du dépôt ne peut
le corriger, seulement l'afficher. C'est ce qui a limité TCK-301 à un diagnostic dans
`./dev.sh doctor`.

**Ici, le dépôt peut corriger.** `next.config.ts` est versionné, et `allowedDevOrigins` y suffit à
faire disparaître la panne pour tout le monde, sur tous les postes, sans qu'aucun développeur n'ait
à toucher un fichier local. La sonde `doctor` reste utile — elle couvre le cas d'un
`allowedDevOrigins` retiré ou d'un hôte tiers — mais elle est ici le **second** filet, pas le seul.

## Entrée d'ardoise proposée — ~~D-56~~ **D-57**

> **À insérer dans `docs/ardoise.md`. Ce ticket ne l'écrit pas : `writing-specs` produit une fiche,
> pas une modification de l'ardoise — et l'implémentation ne l'a pas écrite non plus, `ardoise.md`
> étant hors de son périmètre et tenu par un autre agent (cf. Notes d'implémentation).**
>
> ⚠️ **Le numéro a changé.** Ce ticket proposait `D-56` le 2026-08-17 ; `docs/ardoise.md:1985` porte
> depuis un `D-56` (TCK-322, exécutions `--parallel` simultanées). Le bloc ci-dessous est renuméroté
> **D-57**, et récrit à l'état SOLDÉ — le correctif est livré, mesuré et ablaté.

```markdown
### D-57 — Le front servi sur `127.0.0.1` ne s'hydratait pas, et rien ne le disait ✅ *mesurée le 2026-08-17 (vérification navigateur de TCK-279), soldée le 2026-08-20* → [TCK-328](backlog/tickets/TCK-328-front-servi-sur-127-0-0-1-ne-s-hydrate-pas.md)

Next 16 bloque par défaut ses ressources de développement (`/_next/*`, `/__nextjs*`) quand la page
est servie depuis un hôte absent d'`allowedDevOrigins`, dont la valeur par défaut ne contient que
`localhost` et `**.localhost`. `takussan-web/next.config.ts` n'en déclarait aucun. Ouvert sur
`http://127.0.0.1:<port>`, le front rendait son HTML, puis **React ne s'hydratait jamais** : les
formulaires se soumettaient en GET natif — le mot de passe de connexion partait dans l'URL.

| Ce que le dépôt dit majoritairement | Ce qui marchait réellement |
|---|---|
| `dev.sh` annonce `127.0.0.1` pour l'API, Meilisearch, MySQL, Redis ; `.env.example` livre `NEXT_PUBLIC_API_URL=http://127.0.0.1:8002` | le front n'était joignable que sur `localhost`, et **rien ne disait pourquoi** |

**Preuve, re-jouée le 2026-08-20** : sortie `npm run dev` → **14** `Blocked cross-origin request to
Next.js dev resource … from "127.0.0.1"` · console → **403 × 13** + WebSocket HMR en échec · sonde
d'hydratation `Object.keys(document.querySelector('form')).some(k => k.startsWith('__react'))` →
`false` sur `127.0.0.1`, `true` sur `localhost`, même serveur, même instant · soumission réelle du
formulaire → `Page navigated to /auth/login?email=…&password=motdepasse-sonde`.

**Correctif** : `allowedDevOrigins: ['127.0.0.1', '[::1]']` dans `takussan-web/next.config.ts` —
versionné, donc valable pour tout poste sans geste local. Après : 0 message bloqué, 36 requêtes
`/_next/*` en 200, hydratation `true`, URL propre après soumission. Le LAN
(`192.168.1.181`) et un hôte tiers restent **403** : la surface n'est pas élargie.

⚠ **`[::1]` s'écrit avec ses crochets.** Next compare `new URL(origin).hostname`, qui rend `"[::1]"`.
La première version écrivait `'::1'` et laissait l'IPv6 en 403 — trouvé par sonde `Origin`, pas par
lecture.

**Second filet** : `./dev.sh doctor` nomme l'écart si la ligne disparaît, et se tait quand elle est
là (ablation jouée). Sa première version restait verte pendant sa propre ablation — elle lisait le
bloc de commentaire qui cite `allowedDevOrigins` et `127.0.0.1`, et mesurait donc sa propre
documentation.

**À ne pas confondre avec** l'incohérence d'hôte du § *Environnement* de `takussan-web/CLAUDE.md`,
qui porte sur l'origine de l'**API** (port 8002) et sur les cookies. Axes différents, symptômes
différents. L'hypothèse « même cause » a été posée puis **écartée** : `dev.sh` imprime bien
`localhost` pour le front, donc le chemin nominal n'était pas atteint par ce défaut-ci.

**Différence avec D-48** : cette dette-là, le dépôt **pouvait** la corriger — `next.config.ts` est
versionné. D-48 vivait dans un fichier ignoré par git et ne pouvait qu'être affichée.
```

## Notes d'implémentation

_Implémenté le 2026-08-20. Toutes les mesures ci-dessous ont été prises sur cette machine
(8 cœurs, `load average` ~6 au départ), serveur de développement `PORT=3021 npm run dev`, Chrome
piloté par CDP. **Le serveur a été tué à la fin** — aucune commande longue n'a été laissée en vie._

### Prémisse : TENUE, et re-mesurée avant d'écrire une ligne

```
$ grep -rn "allowedDevOrigins" --include='*.ts' --include='*.js' --include='*.mjs' . | grep -v node_modules
(aucun résultat hors docs/ et docs/backlog/)
$ node -p "require('./takussan-web/node_modules/next/package.json').version"
16.3.1
```

**Panne reproduite avant tout correctif**, sur le même serveur et au même instant :

| URL | sonde `Object.keys(document.querySelector('form')).some(k => k.startsWith('__react'))` |
|---|---|
| `http://127.0.0.1:3021/auth/login` | **`false`** |
| `http://localhost:3021/auth/login` | **`true`** |

Console : `403 (Forbidden)` **× 13**, plus `WebSocket connection to 'ws://127.0.0.1:3021/_next/hmr…'
failed`. Sortie du serveur : **14** `Blocked cross-origin request to Next.js dev resource … from
"127.0.0.1"`.

### La panne, montrée plutôt que décrite (formulaire réellement soumis)

Sans le correctif, formulaire de connexion rempli puis « Sign in » cliqué — le navigateur navigue :

```
Page navigated to http://127.0.0.1:3021/auth/login?email=sonde-tck328%40example.test&password=motdepasse-sonde
```

**Le mot de passe est dans l'URL.** Avec le correctif, même geste : `location.href` reste
`http://127.0.0.1:3021/auth/login`, `location.search` vide, `motDePasseDansURL: false`.

### Ce que la mesure a corrigé dans le correctif lui-même : `[::1]`, pas `::1`

Première version écrite : `allowedDevOrigins: ['127.0.0.1', '::1']`. Sonde par en-tête `Origin`
sur `/_next/*` (403 = bloqué, 404 = laissé passer jusqu'au routeur) :

```
http://127.0.0.1:3021        -> 404
http://localhost:3021        -> 404
http://[::1]:3021            -> 403     ← l'entrée '::1' ne matchait RIEN
http://192.168.1.181:3021    -> 403
http://evil.example          -> 403
```

Cause, lue dans le code de Next et non déduite
(`node_modules/next/dist/server/app-render/csrf-protection.js`) : la comparaison porte sur
`new URL(origin).hostname`, et `node -e "new URL('http://[::1]:3021').hostname"` rend `"[::1]"`,
crochets compris. Corrigé en `'[::1]'` :

```
http://127.0.0.1:3021        -> 404
http://localhost:3021        -> 404
http://[::1]:3021            -> 404
http://192.168.1.181:3021    -> 403     ← surface NON élargie : le LAN reste bloqué
http://evil.example          -> 403
```

### Ablation d'AC1/AC5 — deux cycles complets, les deux sens constatés

| | `allowedDevOrigins` | `formHydrated` sur `127.0.0.1` | `Blocked cross-origin` (serveur) | `Origin: http://127.0.0.1:3021` sur `/_next/*` |
|---|---|---|---|---|
| avant correctif | absent | **`false`** | 14 | 403 |
| après correctif | `['127.0.0.1', '[::1]']` | **`true`** | **0** | 404 |
| ablation ① | ligne retirée | **`false`** | 15 | **403** |
| restauration ① | restaurée (`diff` vide) | **`true`** | 0 | 404 |
| ablation ② | ligne retirée | soumission → **mot de passe dans l'URL** | — | — |
| restauration ② | restaurée (`diff` vide) | **`true`**, URL propre | 0 | 404 |

Toutes les requêtes `/_next/static/chunks/*` et `/_next/static/media/*.woff2` rendent **200** après
correctif (36 requêtes listées, aucune en 403) → **AC2**.

### AC3 — `localhost` inchangé

`formHydrated: true` sur `http://localhost:3021/auth/login` **avant** comme **après** le correctif,
et `Origin: http://localhost:3021` n'est jamais bloqué (404, jamais 403) dans les deux états.

### AC4 — la sonde `doctor`, et le piège qu'elle a failli reproduire

```
=== 1. NOMINAL (correctif en place) ===
▸ Front
  ✓ takussan-web/node_modules présent
                                            ← 0 ligne de la nouvelle sonde

=== 2. ABLATION (ligne allowedDevOrigins retirée) ===
▸ Front
  ✓ takussan-web/node_modules présent
  ! takussan-web/next.config.ts ne déclare pas 127.0.0.1 dans allowedDevOrigins.
  !   Next 16 bloquera alors ses ressources de dev (/_next/*) pour cet hôte : la page
  !   s'affichera SANS S'HYDRATER, et le formulaire de connexion se soumettra en GET
  !   natif — le mot de passe dans l'URL. Le chemin nominal (l'URL imprimée par
  !   ./dev.sh, en localhost) n'est pas touché : c'est ce qui rend l'écart muet.

=== 3. RESTAURATION ===
▸ Front
  ✓ takussan-web/node_modules présent
```

⚠ **La première version de cette sonde est restée VERTE pendant sa propre ablation.** Elle lisait
`awk '/allowedDevOrigins/,/\]/' next.config.ts | grep 127.0.0.1` — or le bloc de commentaire qui
documente l'option, juste au-dessus, cite `allowedDevOrigins` **et** `127.0.0.1` en toutes lettres.
La sonde mesurait sa propre documentation. Le `grep -v '^[[:space:]]*//'` ajouté devant n'est donc
pas une élégance : c'est le correctif d'un faux vert que **seule l'ablation** pouvait montrer.
*Une garde qu'on n'a pas vue rougir n'est pas une garde.*

### Ce qui n'a PAS été fait, et pourquoi

- **L'entrée d'ardoise.** Deux obstacles, aucun contournable depuis ce périmètre :
  1. **Le numéro D-56 proposé par ce ticket est déjà pris** — `docs/ardoise.md:1985` porte
     « D-56 — Deux exécutions `--parallel` simultanées se cassent l'une l'autre au démarrage »
     (TCK-322, 2026-08-17), écrit *après* la rédaction de ce ticket. Le prochain libre est **D-57**
     (`grep -c '^### D-' docs/ardoise.md` → 50, plus haut numéro → 56). Le texte proposé plus haut
     s'insère tel quel en changeant `D-56` → `D-57`.
  2. `docs/ardoise.md` était **modifié par un autre agent** au moment de l'implémentation
     (TCK-326 y solde D-34bis, TCK-327 y soldera D-36bis) : hors périmètre, non touché.
- **Les numéros de ligne du « Contrat de données »** (`dev.sh:794`) ont bougé : le lien du front est
  désormais à `dev.sh:839`, précédé de son commentaire. *(Corrigé en vérification : la première
  rédaction annonçait `807`, obtenu en n'ajoutant que les 13 lignes du commentaire aux 794 d'origine
  et en oubliant les 32 lignes de la sonde `doctor` insérées plus haut dans le MÊME diff. Mesuré :
  `grep -n 'lien "Front (Next.js)"' dev.sh` → 839. Un numéro de ligne recalculé de tête est faux dès
  qu'il y a deux hunks.)*

### Deux constats de côté, mesurés au passage (aucun n'est traité ici)

1. **`babel-plugin-react-compiler` manquait de `takussan-web/node_modules`** alors qu'il est déclaré
   en `devDependency` et présent dans `package-lock.json`. Conséquence mesurée : `npm run dev` rendait
   **500 sur toutes les pages** (`Failed to resolve package babel-plugin-react-compiler`), pendant que
   `./dev.sh doctor` imprimait `✓ takussan-web/node_modules présent`. Installé pour la mesure par
   `npm install --no-save babel-plugin-react-compiler@1.0.0` — `package.json` et `package-lock.json`
   sont inchangés.
2. **`next dev` ÉCRIT dans `takussan-web/CLAUDE.md`** : il y appose un bloc
   `<!-- BEGIN:nextjs-agent-rules -->` à chaque démarrage
   (`node_modules/next/dist/server/lib/generate-agent-files.js`). Tout `./dev.sh` salit donc l'arbre
   de travail. `agentRules: false` dans `next.config.ts` le désactive — c'est une décision à prendre,
   pas à glisser dans ce ticket-ci.

