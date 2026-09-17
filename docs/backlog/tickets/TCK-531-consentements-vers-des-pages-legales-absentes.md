---
id: TCK-531
title: "Trois cases de consentement obligatoires renvoient à des pages légales qui n'existent pas (404)"
status: review
phase: P1
family: bug
estimate: M
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#210-pages-légales-publiques
    - docs/features.md#21-authentification--comptes
    - docs/features.md#13-réservations-courte-durée--visites
  models: []
tags: [front, public, légal, consentement, décision-produit]
---

## Objectif utilisateur

Qu'une personne à qui l'on demande d'accepter les conditions générales et la politique de
confidentialité puisse les lire avant de cocher.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupes B et C), par `curl -L` sur `next dev` :
`/terms` → `/fr/terms` **404**, `/privacy` → `/fr/privacy` **404**, `/legal/cgu` →
`/fr/legal/cgu` **404**. Aucune route de `takussan-web/src/app` ne porte ces pages (la seule
« privacy » est `/app/account/privacy`, des réglages de compte).

Liens qui y pointent, chacun dans le libellé d'une case **obligatoire** :

- `takussan-web/src/app/(auth)/auth/register/page.tsx` — inscription ;
- `takussan-web/src/components/onboarding/HostIndividualWizard.tsx` — récapitulatif de
  `/onboarding/host` ;
- `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx`
  — demande de réservation depuis la fiche.

Les trois cibles ne concordent même pas entre elles (`/terms`, `/legal/cgu`, `/privacy`).
TCK-437 avait déjà écarté ces pages faute de spec (« une surface produit à spécifier avant d'être
ticketée ») ; elles ne sont toujours pas décrites dans `docs/features.md`.

## Contraintes strictes (métier)

1. **Aucun texte juridique n'est rédigé par un agent.** Les textes (CGU, politique de
   confidentialité, mentions légales) sont fournis par le porteur du produit, en fr — et en
   décidant si en/wo sont des traductions faisant foi ou de courtoisie.
2. Une seule URL canonique par document, localisée (`/[locale]/…`), citée par les trois cases.
3. Retirer un lien ou décocher l'obligation n'est pas une correction : cela change la nature du
   consentement.

## Delta à produire

- [x] `docs/features.md` : décrire les pages légales publiques (section et URLs) — §2.10, avant le
      code ; `docs/features-by-actor.md` régénéré.
- [x] Pages publiques sous la coque publique, en mode lecture (charte « Ancrage Local
      Contemporain ») — ⚠ *texte fourni* : non, état « à fournir » (cf. § Reste sur dev).
- [x] Les trois liens pointent vers les URL canoniques ; le pied de page public les porte.
- [x] Une garde ou un test qui rougit si un lien de consentement vise une route inexistante.

## Critères d'acceptation

- [ ] AC1 — Chacune des trois cases mène à une page **200** qui rend le texte fourni, dans les
      trois locales. ⚠ **Partiel, ne peut pas être vert** : les neuf pages répondent 200 (relevé
      ci-dessous), mais **aucun texte n'est fourni** — elles rendent l'état « document en cours de
      rédaction ». Se coche quand le porteur a déposé les textes.
- [x] AC2 — Les trois cases citent les **mêmes** URL canoniques (`ROUTES_LEGALES`).
- [x] AC3 — Le test ou la garde de fraîcheur rougit si l'on remet `/terms` (ablation notée).

## Reste sur dev

**Rien à coder.** Le porteur du produit :

1. dépose les trois textes **français** dans `takussan-web/src/content/legal/` — `terms.ts`
   (CGU), `privacy.ts` (confidentialité), `notice.ts` (mentions légales), dans l'export `fr`, entre
   les accents graves (mode d'emploi : `takussan-web/src/content/legal/README.md`) ;
2. décide du statut de l'anglais et du wolof — traductions de courtoisie (hypothèse retenue,
   `docs/features.md` §2.10) ou faisant foi — et remplit `en` / `wo` s'il en fournit ;
3. vérifie AC1 : `/{fr,en,wo}/legal/{terms,privacy,notice}` rendent le texte, puis coche.

S'il décide qu'une traduction fait foi, la mention « seule la version française fait foi »
(`legal.notices.translation`) est à revoir — c'est la seule ligne de code que ce choix touche.

## Hors périmètre

- La conservation de la preuve de consentement (version du texte acceptée, horodatage) — à
  spécifier séparément si elle est exigée.
- Les pages institutionnelles (à propos, contact).

## Notes d'implémentation

**Relevé du 2026-09-16, `next dev` sur :3000** (`curl -s -o /dev/null -w '%{http_code}'`) :

```
/{fr,en,wo}/legal/{terms,privacy,notice}  → 200 ×9, <meta name="robots" content="noindex, follow">,
                                            h1 = titre traduit, état « en cours de rédaction »
/legal/terms  → 307 /fr/legal/terms        /fr/terms → 404 (plus aucun lien ne la vise)
/auth/register (cookie NEXT_LOCALE=en)     → href="/en/legal/terms", href="/en/legal/privacy"
grep -rnE "['\"`]/(fr/|en/|wo/)?(terms|privacy|cgu|legal…)" src (hors tests)
                                           → seulement src/lib/legal-routes.ts
```

Non vérifié au navigateur : la case de `/onboarding/host` (exige un compte) — couverte par son test
de composant, `tsc` et la garde.

**Décisions.**

- **URL** : `/[locale]/legal/{terms,privacy,notice}` — aucune convention préexistante dans le dépôt.
  **Trois pages statiques, pas un `[document]` dynamique** : un segment dynamique fait accepter
  `/legal/cgu` par `routeExiste()`, c'est-à-dire aveugle la garde sur le défaut même du ticket.
- **Source des textes** : modules TS (`src/content/legal/*.ts`, exports `fr`/`en`/`wo`), pas des
  `.md` lus par `fs` — l'image `output: 'standalone'` (ADR-0028) n'embarque que ce que le graphe
  d'imports atteint ; un fichier lu par chemin calculé serait servi en dev et absent en production.
- **Rendu** : `components/legal/TexteJuridique.tsx`, sous-ensemble markdown (titres, paragraphes,
  listes, gras) rendu en éléments React, sans `dangerouslySetInnerHTML` — aucune dépendance
  ajoutée (le dépôt n'en a aucune de markdown), et une balise collée s'affiche comme du texte.
- **Règle de langue** (`lib/legal-content.ts`) : `fr` vide → « à fournir » dans les trois
  langues, même si une traduction existe ; traduction vide → français + mention « disponible
  qu'en français » ; traduction remplie → elle + mention de courtoisie.
- **`noindex, follow` inconditionnel**, écrit en clair dans chaque `page.tsx`. Conditionnel
  (« tant que le texte manque »), `sitemap-couverture.test.ts` aurait classé les pages
  `conditionnel` et exigé leur présence au sitemap pendant qu'elles servent `noindex` — deux
  signaux contradictoires et une bascule à ne pas oublier. Ce ne sont pas des pages d'entrée de
  recherche. Décision reportée dans la spec (§2.10), révisable par le porteur.
- **Garde** : un test vitest, `src/lib/__tests__/legal-routes.test.ts`, plutôt que
  `scripts/check-legal-links.mjs` — il réutilise l'inventaire de routes dérivé
  (`src/test/routes-publiques.ts`) au lieu d'en écrire un second. Deux propriétés : chaque
  `ROUTES_LEGALES` est une page ; aucun littéral de forme juridique (`/terms`, `/privacy`,
  `/legal/…`, `/cgu`, `/cgv`, `/mentions…`…) hors de `legal-routes.ts`.
- **Liens de consentement ouverts dans un nouvel onglet** (`target="_blank"`, via
  `LienLocalise`) — défaut corrigé au passage : sur `/auth/register` et dans le dialogue de
  réservation, le lien remplaçait la page et **perdait le formulaire en cours**. Le wizard le
  faisait déjà, avec un `<a>` nu qui ne portait pas la langue.
- **Pied de page** : colonne `footerLinks.legal` (dérivée de `ROUTES_LEGALES`), rendue dans la
  barre du bas plutôt qu'en cinquième piste de grille ; les tests du pied de page la comptent sans
  modification (plancher dérivé de `footerLinks`).

**Ablations (copie dans le scratchpad, restauration par `cp`, `md5` identique avant/après).**

- `register/page.tsx` : `href={ROUTES_LEGALES.terms}` → `href="/terms"` → **rouge** :
  `aucun chemin juridique n'est écrit en dur…` → `"app/(auth)/auth/register/page.tsx → « /terms »"`.
  md5 `8780472538c72d11b0c2906318b96c02` avant et après.
- suppression de `legal/notice/page.tsx` → **rouge** : `ROUTES_LEGALES.notice mène à une page
  servie par src/app`. md5 `8c28d008e9d3490e22108e8e30e8a402` avant et après.

**Effets de bord mesurés.**

- `sitemap-couverture.test.ts` figeait le nombre de pages publiques : 11 → 14 (les trois pages
  sont classées `jamais`).
- `src/i18n/namespaces.json` régénéré (`check-i18n-namespaces.mjs --update`) : `legal` entre dans
  la frontière `[locale]/(public)` ; la même commande a resserré deux plafonds de part
  (`(auth)` 18 → 17, `onboarding` 42 → 41), effet du dictionnaire total agrandi.

**Vérification adverse (2026-09-16) — trois angles morts de la garde, fermés.** Un fichier de
consentement NEUF (hors des trois du ticket, donc hors de la propriété « cite `ROUTES_LEGALES` »)
passait au vert avec :

- `` href={`/${locale}/terms`} `` — langue interpolée en tête ;
- `` href={`${base}/privacy`} `` — base interpolée ;
- `href="https://www.takussan.com/terms"` — URL absolue.

`CHEMIN_JURIDIQUE` accepte désormais ces trois préfixes et `LITTERAL` lit toute chaîne ; relevé
sur `src/` avant le changement : aucun faux positif (seul `lib/legal-routes.ts`, exempté). Ablation
rejouée après : les trois → **rouge**. Restent **déclarés, non fermés** (en-tête du test) : la
concaténation (`'/' + 'terms'`), le chemin relatif sans `/`, le segment juridique qui ne vient que
d'une valeur interpolée.

Ajouts : un test `javascript:` / `<script>` / `<iframe>` sur `TexteJuridique` (ablation :
`dangerouslySetInnerHTML` sur les paragraphes → rouge), et
`src/components/legal/__tests__/PageLegale.test.tsx`, qui rend la page avec un texte **simulé dans
un mock** — branche « publié », mention de traduction, repli en → fr, `lang` de l'article
(ablation : `lang={locale}` → rouge). Les fichiers de `src/content/legal/` restent vides.
