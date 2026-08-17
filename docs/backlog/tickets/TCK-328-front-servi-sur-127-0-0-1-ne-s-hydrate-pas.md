---
id: TCK-328
title: "Le front servi sur `127.0.0.1` ne s'hydrate pas — Next 16 bloque ses ressources de dev, en silence"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-08-17
updated: 2026-08-17
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

- [ ] `takussan-web/next.config.ts` : déclarer `allowedDevOrigins` couvrant la boucle locale
      (`127.0.0.1`), avec un commentaire qui dit **ce que le silence coûtait** — pas seulement ce
      que l'option fait.
- [ ] `dev.sh` : commentaire sur la ligne 794 expliquant pourquoi le lien du front est en
      `localhost` quand ceux de l'API, Meilisearch, MySQL et Redis sont en `127.0.0.1` (lignes 795
      et 801-802). Aujourd'hui rien ne dit que cette différence est porteuse.
- [ ] `./dev.sh doctor` : nommer le cas, sur le modèle exact de ce que TCK-301 a fait pour D-48 —
      la sonde ne corrige rien, elle affiche. Ici elle peut faire mieux que pour D-48, cf. « une
      différence avec D-48 » ci-dessous.
- [ ] `takussan-web/CLAUDE.md` : ajouter le piège au § *Environnement*, **à côté** de la note
      d'incohérence d'hôte existante et non dedans — ce sont deux défauts distincts (cf. ⑵).
- [ ] Entrée d'ardoise **D-56**, texte proposé en bas de ce ticket.
- [ ] Vérification par **ablation** : retirer `allowedDevOrigins`, recharger sur `127.0.0.1`,
      constater le retour des 403 et de la non-hydratation. Un correctif d'environnement qu'on n'a
      pas vu échouer sans lui n'est pas vérifié.

## Critères d'acceptation

- [ ] AC1 — Le front servi par `npm run dev` et ouvert sur `http://127.0.0.1:<port>` **s'hydrate** :
      un formulaire soumis déclenche le gestionnaire React, pas une navigation GET native.
- [ ] AC2 — Aucun `Blocked cross-origin request to Next.js dev resource` dans la sortie du serveur
      de développement, et aucun 403 sur `/_next/*` dans la console du navigateur, pour cet hôte.
- [ ] AC3 — Le comportement sur `http://localhost:<port>` est inchangé.
- [ ] AC4 — `./dev.sh doctor` nomme l'écart quand il subsiste, et **ne bruite pas** le cas nominal
      (0 ligne quand tout va bien) — même exigence que la vérification par ablation de TCK-301.
- [ ] AC5 — L'ablation d'AC1 est constatée et consignée : sans le correctif, la panne revient.

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

## Entrée d'ardoise proposée — D-56

> **À insérer dans `docs/ardoise.md`, à la suite de D-55. Ce ticket ne l'écrit pas :
> `writing-specs` produit une fiche, pas une modification de l'ardoise.**

```markdown
### D-56 — Le front servi sur `127.0.0.1` ne s'hydrate pas, et rien ne le dit 🟠 *mesurée le 2026-08-17 (vérification navigateur de TCK-279)* → [TCK-328](backlog/tickets/TCK-328-front-servi-sur-127-0-0-1-ne-s-hydrate-pas.md)

Next 16 bloque par défaut ses ressources de développement (`/_next/hmr`, `/__nextjs_font/…`) quand
la page est servie depuis un hôte absent d'`allowedDevOrigins`. `takussan-web/next.config.ts` n'en
déclare aucun. Ouvert sur `http://127.0.0.1:<port>`, le front rend son HTML, puis **React ne
s'hydrate jamais** : les formulaires se soumettent en GET natif — le mot de passe de connexion part
dans l'URL.

| Ce que le dépôt dit majoritairement | Ce qui marche réellement |
|---|---|
| `dev.sh` annonce `127.0.0.1` pour l'API, Meilisearch, MySQL, Redis ; `.env.example` livre `NEXT_PUBLIC_API_URL=http://127.0.0.1:8002` | le front n'est joignable que sur `localhost` (`dev.sh:794`), et **rien ne dit pourquoi** |

**Preuve** : sortie `npm run dev` → `Blocked cross-origin request to Next.js dev resource /_next/hmr
from "127.0.0.1"` · console → 403 × 13 · sonde d'hydratation
`Object.keys(document.querySelector('form')).some(k => k.startsWith('__react'))` → `false` sur
`127.0.0.1`, `true` sur `localhost`, même serveur · `grep -rn allowedDevOrigins` sur le dépôt → 0.

**À ne pas confondre avec** l'incohérence d'hôte du § *Environnement* de `takussan-web/CLAUDE.md`,
qui porte sur l'origine de l'**API** (port 8002) et sur les cookies. Axes différents, symptômes
différents. L'hypothèse « même cause » a été posée puis **écartée** : `dev.sh:794` imprime bien
`localhost` pour le front, donc le chemin nominal n'est pas atteint par ce défaut-ci.

**Différence avec D-48** : cette dette-là, le dépôt **peut** la corriger — `next.config.ts` est
versionné. D-48 vivait dans un fichier ignoré par git et ne pouvait qu'être affichée.
```

## Notes d'implémentation

_(à remplir par implementing-specs)_
