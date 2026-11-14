---
id: TCK-2795
title: "Les nombres formatés par next-intl (crédits, panneaux IA, pluriels « # ») groupent comme les montants : U+00A0"
status: done
phase: P2
family: front
estimate: M
wave: 91
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2714]
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  models: []
tags: [front, formatting, intl, i18n, typographie, suite-de-tck-2714, decision-porteur]
---

## Objectif utilisateur

Un utilisateur qui lit « 1 250 crédits » dans le menu, « 1 250 biens » dans une phrase et
« 1 482 166 F » sur la même page voit les groupes de milliers séparés par la même espace : jamais deux
espaces différentes pour des chiffres affichés côte à côte.

## Contexte

TCK-2714 (décision n° 11 (a), validée le 2026-11-11) a porté les groupes de milliers de `lib/format`
(`formatNumber`, `formatMontant`, `useFormatteurs`, la saisie) sur l'insécable U+00A0, par un seul point
de passage : `lib/format/groupes.ts`. **Ce qui passe par next-intl n'y passe pas** et garde l'espace fine
U+202F d'`Intl` au-delà de 999 — relevé du 2026-11-13 (base a78c5752e), mesuré avec `intl-messageformat`
en `fr-SN` : `{n, plural, … # …}` avec 1250 → « 1 250 » en U+202F ; `{n, number}` avec 10000 →
« 10 000 » en U+202F. Un argument nu (`{n}`) n'est pas groupé du tout.

**Les lecteurs** :

- `useFormatter().number()` — le solde de crédits : `components/layout/AppSidebar.tsx:848`,
  `components/layout/MenuDuCompte.tsx:182`, `components/layout/FeuilleDuCompte.tsx:92`,
  `components/navigation-publique/MenuMonEspace.tsx:172`,
  `components/navigation-publique/EcranDuCompte.tsx:301` ; les nombres à deux décimales des panneaux IA
  du super-admin : `components/admin/super/ai/AiDashboardPanel.tsx:42`,
  `AiEvaluationSuitePanel.tsx:65`, `AiChainDialog.tsx:82`.
- `{x, number}` dans les messages : `dashboard.exports.rowCap` (`{max, number}`, `{pdf, number}`) et
  `dashboard.exports.truncated` (`{count, number}`).
- **Le `#` des pluriels ICU : 569 messages `fr`** portent un `{…, plural|selectordinal, …}` qui l'emploie
  (« {count, plural, one {# bien} other {# biens}} »). Chacun rend U+202F dès 1 000.

⚠ `AppSidebar.tsx` est hors du périmètre de l'agent qui a écrit ce ticket (fichier de la coque, tenu par
la session) : son lecteur se change avec l'accord de celle-ci.

## Contrat de données

Aucun endpoint, aucune donnée neuve. Les clés de messages ne changent pas de texte.

## Direction UX / Artistique

Rien ne change à l'œil hors de la largeur des groupes : la même espace que les montants (0,266 em en
DM Sans, contre 0,133 em pour U+202F).

## Contraintes strictes (métier)

- **Une seule convention dans tout l'écran** (le défaut de TCK-374 et de TCK-2714) : un nombre et un
  montant affichés ensemble groupent de la même façon.
- **Insécable, toujours** : jamais U+0020 entre deux groupes.
- **Le texte reste aux messages** (principe 5) : on ne remplace pas un pluriel par une concaténation
  écrite dans le composant.
- `en` (« 1,250 ») ne change pas ; `wo` suit `fr` (le wolof est en pause : aucun texte `wo` neuf).

## Delta à produire

Le moyen est à choisir à l'implémentation, et à écrire en Notes d'implémentation avant le code — par
exemple : passer à next-intl des nombres DÉJÀ formatés par `useFormatteurs().nombre()` là où le message
les interpole (au prix des pluriels, qui ont besoin du nombre brut), ou réécrire les groupes à la sortie
du formateur de next-intl s'il en offre le point d'entrée. Un seul point de passage, comme TCK-2714.

- [x] Les huit lecteurs de `format.number()` ci-dessus — et deux de plus relevés à l'implémentation
      (`credits/PastilleCredits.tsx`, `share/ShareReception.tsx`) : tous par `useFormatteurs().nombre`.
- [x] Les trois `{x, number}` des exports — et le quatrième, `rapports.exports.pied` : `{x}` reçoit la
      chaîne de `useFormatteurs().nombre` (texte affiché inchangé).
- [x] Le `#` des pluriels — décision écrite (cf. Notes) : il garde U+202F. Ou, si aucun moyen ne le tient sans casser la règle des pluriels, la
      décision écrite (et ce qu'elle laisse) avant de fermer.
- [x] Une garde qui rougit sur un nouveau `format.number(` ou `{x, number}` hors du point de passage.
      *Fait* : `src/test/__tests__/nombres-par-lib-format.tck-2795.test.tsx` — listes fermées (vides) ;
      rougit sur un `.number(` de `useFormatter()`/`getFormatter()` et sur un `{x, number}` de `fr`/`wo`.

## Critères d'acceptation

- [x] AC1 — Le solde de crédits 1 250 s'affiche « 1 250 » en U+00A0 dans le menu du compte (test sur
      le DOM rendu) ; une sortie en U+202F échoue.
      *Preuve* : `AppShell.menu-et-credits.test.tsx` (ligne `solde-du-compte`, `'1\u00a0250'`) ; rouge
      avec `MenuDuCompte.tsx` ramené à `format.number` (ablation).
- [x] AC2 — `dashboard.exports.truncated` avec 10 000 rend « 10 000 » en U+00A0.
      *Preuve* : `ExportForm.coupure.test.tsx` (`5\u00a0000 lignes`, même message) et
      `ExportForm.plafond.test.tsx` (`rowCap`) ; rouges avec `{x, number}` rétabli (ablation).
- [x] AC3 — Un pluriel « # » rendu avec 1 250 groupe en U+00A0 (ou la décision écrite, cf. Delta).
      *Décision écrite* (Notes) : le `#` garde U+202F. Épinglé par la garde (`nav.propertiesCount` →
      `1\u202f250 biens`) pour que le jour où use-intl change, le test le dise.
- [x] AC4 — Mesuré au navigateur : un écran qui montre à la fois un solde de crédits ≥ 1 000 et un
      montant n'a qu'un seul caractère de groupe (relevé des points de code sur le DOM rendu).
      *Preuve* (2026-11-14, `next dev`, persona `admin`, 1280 × 900) : solde réel ≤ 500 en base, porté
      à 1250 à la RÉPONSE de `/api/credits/balance` (Fetch CDP, aucune écriture en base).
      `/app/leases` : 76 groupes visibles, **tous U+00A0** — « Crédits 1 250 » et « 338 250 F » ;
      `/app` : 6, tous U+00A0.

## Hors périmètre

- Les montants de `lib/format` (faits, TCK-2714) et ceux que rend l'API (TCK-2794).
- Les dates et les plages de dates (U+2009, U+202F d'`Intl.DateTimeFormat`) : TCK-347.

## Notes d'implémentation

**Moyen retenu (décision de la session, 2026-11-14) : les nombres passent par `lib/format`.**

- Mesuré dans use-intl 4.13.6 : `format.number`, `{x, number}` et `#` finissent dans `getNumberFormat`
  de `createIntlFormatters`, un chunk interne. Aucun point public n'y mène : `IntlProvider` n'a pas de
  prop `formatters`, `getConfig` (serveur) pose `_formatters` après la configuration de la requête, et
  les `formats` ne portent que des `NumberFormatOptions` (aucune option d'`Intl` ne fixe le caractère
  de groupe).
- Écartés : remplacer `Intl.NumberFormat` par une enveloppe globale (prototypé, puis refusé par la
  session : il toucherait toutes les bibliothèques et ferait diverger `format` de `formatToParts`,
  pour un séparateur où rien ne se coupe — U+202F et U+00A0 sont tous deux insécables) ; un correctif
  de `node_modules` (le Dockerfile copie `package.json` et le lockfile seuls avant `npm ci`).
- Les lecteurs de `format.number` passent à `useFormatteurs().nombre` (U+00A0, `wo` → `fr-SN`). Les
  `{x, number}` deviennent `{x}`, et l'appelant passe la chaîne déjà formatée : le texte affiché ne
  change pas. Aucun pluriel n'est concerné.

**Décision sur le `#` des pluriels : il garde U+202F.** 569 messages `fr` (576 au relevé du
2026-11-14) le portent. Le `#` a besoin du nombre BRUT (la règle du pluriel se lit dessus) et use-intl
ne laisse pas remplacer son formateur. U+202F est insécable : aucune coupure n'est en jeu, seule la
cohérence l'est — un « 1 250 biens » au-delà de 999 garde l'espace fine à côté d'un montant en U+00A0.
**Voie de retour**, posée dans la garde : (1) un test épingle le rendu U+202F d'un `#` réel ; il
rougit le jour où use-intl change ce rendu ; (2) un `@ts-expect-error` sur une prop `formatters` de
`NextIntlClientProvider` fait rougir `tsc` le jour où next-intl type une telle prop. Dans les deux cas :
brancher `formaterGroupesLisibles` (`lib/format/groupes.ts`) sur ce formateur, et refermer cette
décision.

**Tests qui figeaient U+202F venu de next-intl : aucun** (73 fichiers lancés : lecteurs, exports, coque, `lib/format`). Assertions
ajoutées au caractère près : 3 (menu du compte, coupure et plafond des exports).
