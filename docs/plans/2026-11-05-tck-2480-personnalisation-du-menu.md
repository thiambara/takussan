# TCK-2480 — Personnaliser son menu : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`). Règles communes :
> `brief-commun.md` de la session (tests ciblés seulement, ablations dans un script, rapport au fil de l'eau).
>
> ⚠ **Ne démarre qu'une fois TCK-2479 mergé sur `dev`** (le ticket dit `depends_on: [TCK-2478]`, mais ce
> plan est écrit contre l'état que TCK-2479 laisse : bande « À traiter », « Démarrer », `priorites`,
> `styles-de-la-barre.ts`). Branche à tirer de `dev` à jour : `feat/personnalisation-du-menu-tck-2480`.
> **Avant la tâche 3, vérifier chaque point de la section « Ce qu'on suppose de TCK-2479 ».**
>
> ⚠ **Les arbitrages sont des RECOMMANDATIONS du planificateur**, à valider par la session avant
> l'exécution. Un arbitrage refusé change la tâche qu'il cite, et elle seule.

**But :** chacun épingle les entrées qu'il ouvre tous les jours (« Épinglés », juste sous la bande « À
traiter »), replie les groupes qui ne le concernent pas, retrouve ce réglage sur tous ses appareils et
séparément pour chacun de ses personas — et réduit la barre aux icônes (64 px), ce qui est le défaut
entre `md` et `lg`.

**Architecture :**
- **Compte** : `preferences.navigation = { v: 1, personas: { <persona>: { epingles, replies, ouverts,
  demarrer_masque } } }`, écrit par `PATCH /api/me` (clé remplacée en bloc). L'API n'en valide que la
  FORME ; une fixture commune (`takussan-api/tests/fixtures/preferences-navigation.json`) est jouée par
  le test Laravel ET par le test du schéma zod.
- **Composition** : `composerMenu(ctx, persona, disposition?, preferences?)` applique les préférences du
  persona — groupe « Épinglés » en tête, replis, « Démarrer » masqué — sans jamais perdre ni ajouter
  une destination.
- **État client** : `PreferencesDuMenuProvider` (monté dans `AppShell`) tient la navigation lue par zod,
  l'écrit de façon optimiste après 800 ms, rétablit l'état confirmé sur échec (toast). Il tient aussi le
  mode icônes de l'appareil.
- **Appareil** : cookie `menu_icones` (absent → `auto`, `1` → icônes, `0` → complète), lu par le layout
  serveur de `/app`, posé en `data-menu` sur la barre ; une variante CSS `icones:` (Tailwind
  `@custom-variant`) décide de la largeur **en CSS**, `auto` compris (le serveur ne connaît pas l'écran) :
  juste au premier octet, rien ne saute à l'hydratation.

**Pile :** Laravel 13 / PHP 8.4 (API) ; Next.js 16, React 19.2, TypeScript 5, zod 4.4, Tailwind 4.2,
vitest 4 + Testing Library, next-intl, Base UI (`Tooltip`, `Popover`, `Select`, toasts), lucide-react.

**Références :** [ADR-0089](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) §4 et §6 ·
[TCK-2480](../backlog/tickets/done/TCK-2480-personnalisation-du-menu.md) (contrat backend PRESCRIPTIF) ·
plans précédents : [TCK-2478](2026-11-05-tck-2478-dispositions-par-persona.md),
[TCK-2479](2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md).

## Contraintes globales

- **Le menu ne bouge que sous un geste de l'utilisateur** (ADR-0089 §5) : épingler, replier. Rien ne
  dépend d'un compteur ni d'un usage.
- **Aucun droit ne change.** Une épingle ne vise qu'une destination que le persona ouvre déjà
  (`estOuverte`) ; un identifiant inconnu ou fermé est ignoré au rendu. `composerMenu` ne perd ni
  n'ajoute aucune destination, préférences ou non (garde de la tâche 3).
- **Le catalogue appartient au front** (ADR-0089 §6, principe 5 du `CLAUDE.md` racine) : l'API ne
  connaît que la forme (personas, plafonds, motif des identifiants).
- **Rendu juste au premier octet** : la disposition personnelle vient de `user.preferences` (lu par le
  layout serveur), la largeur du cookie + CSS. Aucun `useEffect` ne change ni l'une ni l'autre après
  l'hydratation ; seules les infobulles s'activent après (elles n'occupent aucune place).
- **Rangement par persona** : un geste n'écrit que sous `personas.<persona affiché>`.
- Chaque clé i18n neuve en `fr`, `en`, `wo` (le `wo` porte le français tel quel, wolof en pause). Aucun
  texte en dur, pas même `99+` (une clé ICU le rend).
- `md:` n'est pas le bureau dans `/app` (TCK-505) : rien ne passe en colonnes ; la plage `md`–`lg` est
  exactement celle où la barre se réduit par défaut.
- Pas de `useMemo`/`useCallback` neuf (React Compiler). Aucune dépendance neuve. Aucune Radix.
- Tests : les fichiers touchés, jamais une suite entière. Ablations dans UN script écrit avec Write,
  lancé par `bash fichier.sh`, puis `git diff` vide de toute mutation.
- Commits en français, préfixés, citant `TCK-2480`, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. API : `./vendor/bin/pint` sur les fichiers
  touchés ; front : `npx tsc --noEmit && npm run lint && npm run check:i18n` avant chaque commit.

---

## Relevés (mesurés le 2026-11-05 sur `feat/bande-a-traiter-tck-2479`, ac7b91b2e — TCK-2478 mergé, TCK-2479 en cours)

> Re-mesurer avant d'implémenter : le code a pu bouger. Un écart se corrige au plus juste et s'écrit.

### R1 — La fusion de `preferences` dans `MeController::update` : par clé, superficielle

`takussan-api/app/Http/Controllers/Api/Me/MeController.php:52-66` : pour chaque clé de
`UpdateMeRequest::PREFERENCE_FIELDS` (`UpdateMeRequest.php:35`, aujourd'hui `city`, `search_intent`,
`entry_intent`) présente dans la requête, `$value = $request->input($field)` (l. 58) ; `null` ou `''`
→ `unset` (l. 59-60), sinon `$current[$field] = $value` (l. 62) ; `preferences = null` si plus rien
(l. 65). **Une clé est donc déjà remplacée en bloc, sans fusion profonde** : ajouter `navigation` à
`PREFERENCE_FIELDS` suffit, le contrôleur ne change pas (le docblock de la constante, l. 21-34, existe
précisément pour qu'on n'ait rien à recopier).

⚠ La valeur stockée est `input()`, **pas** `validated()` : une sous-clé que les règles ne refusent pas
serait enregistrée telle quelle. D'où l'arbitrage A1 (chaque niveau liste ses clés).

### R2 — La normalisation de Laravel avant la validation

`UpdateMeRequest` étend `FormRequest` (pas `BaseFormRequest`), mais `TrimStrings` et
`ConvertEmptyStringsToNull` sont des middlewares GLOBAUX qui traversent les tableaux imbriqués
(`takussan-api/CLAUDE.md`, § Validation) : `""` → `null`, `" baux"` → `"baux"`. Conséquence pour la
fixture : « identifiant vide » est refusé des deux côtés (null n'est pas `string`), mais un identifiant
à espace EN BORD serait accepté par Laravel (trimé) et refusé par zod — la fixture n'en porte pas
(l'espace INTÉRIEUR, lui, est refusé des deux côtés).

### R3 — Ce que l'API rend

- `User::$casts['preferences'] = 'array'` (`app/Models/User.php:126`) ; `UserResource.php:125` rend
  `(object) []` quand rien n'est posé.
- ⚠ **PHP encode un tableau associatif vide en `[]`** : `personas: {}` (ou `agent: {}`) revient de l'API
  sous la forme `"personas": []`. Le schéma zod doit l'accepter (A3) — la fixture le porte.
- `GET /api/auth/me` rend la ressource **sans enveloppe `data`** (`AuthController::me`,
  `Api/Auth/AuthController.php:160-163` ; les tests écrivent `assertJsonPath('id', …)`,
  `tests/Feature/Admin/Platform/ImpersonationReadOnlyTest.php:42`). `PATCH /api/me` rend `{ data: … }`
  (`MeController.php:81`).

### R4 — Le front : aucun schéma de préférences

- `UserPreferences` n'est qu'un type (`takussan-web/src/types/user.ts:52-68`), `preferences?:` l. 111.
  Aucun schéma zod ne le lit. zod **4.4.3** installé : `z.strictObject`, `z.partialRecord` disponibles.
- `PERSONAS` est un tuple `as const` (`src/lib/navigation/personas.ts:12-21`) : `z.enum(PERSONAS)` le prend.
- Le persona de la barre : `resoudrePersona({ roles, typeProfilActif, agenceIndividuelle:
  accesAdmin.espaceIndividuel || agencyIsStandard === false })` (`AppSidebar.tsx:362-366`).

### R5 — L'écriture `PATCH /api/me`

- Relais BFF `src/app/api/me/route.ts:22-47` : relaie le corps JSON tel quel, avec
  `jetonEspaceApplicatif` (le jeton d'IMPERSONATION pendant une session — que
  `EnforceImpersonationReadOnly` refuse en écriture).
- Patron d'appel : `fetch('/api/me', { method: 'PATCH', credentials: 'include', headers, body })`
  (`src/components/onboarding/QuestionDIntention.tsx:52`, `src/components/profile/ProfileTimezoneSection.tsx:42`).
- Témoin d'impersonation lisible côté client : `relaisImpersonationActif()` (`src/lib/impersonation.ts:35-40`).

### R6 — Le `user` de la coque est rendu par le serveur

Le layout `src/app/(dashboard)/app/layout.tsx:31` lit `getMeAction()` et le passe à `AppShell` : `user.
preferences.navigation` est connu AU RENDU SERVEUR. Le layout survit aux navigations client : un état
tenu sous `AppShell` survit aussi.

### R7 — La largeur de la barre et où elle se décide

- `AppSidebar.tsx:460` : `<aside className={cn('flex h-full w-64 flex-col bg-card', className)}>` →
  **256 px**, dans les deux montages.
- `AppShell.tsx:120` : la barre fixe est montée dans `<div className="hidden md:block md:h-full">` ;
  `AppShell.tsx:129-140` : le tiroir (`Sheet`) remonte le MÊME `AppSidebar`, sous `md`.
- `src/app/globals.css` : aucun `--breakpoint-*` redéfini (seule variante maison : `@custom-variant dark`,
  l. 19) → `md` = 48rem (768 px), `lg` = 64rem (1024 px).

### R8 — La largeur juste au PREMIER OCTET

- Le serveur ne connaît pas la largeur de l'écran : le défaut « icônes entre `md` et `lg` » ne peut se
  décider qu'en **CSS**. Mesuré (Tailwind 4.2.2, `@tailwindcss/node`, essai dans le scratchpad) : une
  `@custom-variant icones { &:where([data-menu="icones"], [data-menu="icones"] *) { @slot; } @media
  (width >= 48rem) and (width < 64rem) { &:where([data-menu="auto"], [data-menu="auto"] *) { @slot; } } }`
  émet bien les DEUX blocs pour `icones:sr-only`.
- Le cookie se lit dans le layout par `cookies()` de `next/headers`, sur le patron de
  `getActiveProfileId` (`src/lib/session.ts:28-32`), et descend en prop jusqu'à `data-menu` : l'attribut
  et donc la largeur sont dans le HTML serveur.
- ⚠ Quatre tests de layout moquent `@/lib/session` avec une liste FERMÉE d'exports : un export neuf
  lu par le layout les ferait tomber (« No export defined on the mock ») :
  `src/app/(dashboard)/app/__tests__/{bandeau-suspension,layout.acces-admin,layout.profil-actif,marqueur-accueil-agence.tck-1766}.test.tsx`.
- Les infobulles dépendent de l'état EFFECTIF (réduite ou non) : `useSyncExternalStore` sur
  `matchMedia`, avec un instantané serveur `false` — aucune différence d'hydratation, et l'infobulle
  n'occupe aucune place. `vitest.setup.ts:68-80` polyfille `matchMedia` (toujours `false`).

### R9 — Toasts

`ToastProvider` est monté par `src/app/(dashboard)/layout.tsx:71`, au-dessus de `/app`. `useToast()`
(`src/components/ui/toast.tsx:36-38`) lit le contexte Base UI et **lève sans fournisseur**. Deux tests
montent `AppShell` sans `ToastProvider` : `src/components/layout/__tests__/AppShell.bienvenue.test.tsx`
et `AppShell.accueils-vus-une-lecture.tck-1766.test.tsx` (les quatre autres, et `CoqueHauteur.test.tsx`,
l'ont déjà).

### R10 — Où poser la fixture de parité

Patron existant : `takussan-api/tests/fixtures/cout-d-entree.json`, lu par
`tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php:20` (`__DIR__.'/../../../fixtures/…'`) ET
par `takussan-web/src/lib/__tests__/cout-d-entree.concordance.test.ts:19-22` (`ROOT/takussan-api/tests/fixtures/…`).
- API CI se déclenche sur `takussan-api/**` : la fixture la réveille.
- Web CI ne se déclenche que sur les fichiers de l'API NOMMÉS dans ses `paths`
  (`.github/workflows/web-ci.yml:64-65` pour `pull_request`, `:91-92` pour `push`) : la fixture neuve
  doit y être ajoutée **aux deux endroits**, et `UpdateMeRequest.php` aussi (le test zod ne le lit pas,
  mais une PR qui ne touche que les règles doit réveiller le côté front qui leur répond — même logique
  que `TagCatalog.php`). La clé d'attestation du front couvre déjà tout `takussan-api/` (`web-ci.yml:100-105`).

### R11 — Les replis aujourd'hui

`GroupeDuMenu` (`AppSidebar.tsx:274-328`) tient l'état ouvert/replié en `useState` LOCAL, et seuls les
groupes repliés par défaut se basculent (`const bascule = groupe.replie && groupe.titre !== null`, l. 284).
L'AC4 de TCK-2478 (un groupe qui contient la page active s'ouvre de lui-même) est un ajustement pendant
le rendu (l. 277-282).

### R12 — Primitives disponibles

`src/components/ui/tooltip.tsx` (Base UI ; `Tooltip.Root` a `disabled`, `TooltipTrigger` prend `render`,
patron `src/components/favorites/SaveSearchButton.tsx:89-108`) ; `src/components/ui/popover.tsx`
(`Popover`, `PopoverTrigger`, `PopoverContent side=…`) ; `Select` (patron `ProfileTimezoneSection.tsx:72-89`).

### R13 — Le sélecteur de profil reste atteignable si l'en-tête d'espace se cache

`ProfileSwitcher.tsx:155-158` (TCK-505 #1) : le déclencheur multi-profils de la BARRE HAUTE garde point
et chevron dès 768 px. Cacher l'en-tête d'espace en mode icônes ne retire donc pas le changement de profil.

---

## Ce qu'on suppose de TCK-2479 (à vérifier avant la tâche 3)

Lu dans `docs/plans/2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md`. Chaque écart se corrige au plus
juste dans la tâche qui le touche, et s'écrit dans le rapport.

| # | Supposition | Où ce plan s'en sert |
|---|---|---|
| S1 | `Disposition.priorites: readonly NavCounterKey[]` (obligatoire) et `Disposition.demarrer?: ModeDemarrer` (`dispositions.ts`) ; `ModeDemarrer` exporté de `src/lib/navigation/demarrer.ts` ; l'admin d'agence a `demarrer: 'espace'`. | T3 |
| S2 | `MenuCompose` porte `priorites` et `demarrer: ModeDemarrer \| null` ; le `return` de `composerMenu` vaut `{ persona, action, carte, groupes: groupes.filter(…), priorites: disposition.priorites, demarrer: ctx.agenceSuspendue ? null : (disposition.demarrer ?? null) }`. | T3 |
| S3 | `EntreeComposee.hrefATraiter?: string`. | T3 (inchangé) |
| S4 | `src/components/layout/styles-de-la-barre.ts` exporte `FOCUS_RING` et `STYLE_TITRE` ; `AppSidebar.tsx` les importe. | T5, T6 |
| S5 | `BandeATraiter({ visibles, autres, onNavigate })` (`src/components/layout/BandeATraiter.tsx`), rendue HORS du `<nav>`, entre l'action principale et le menu, `null` sans pastille ; racine `<section aria-label=… data-slot="a-traiter" className="px-3 pb-3">` ; un `pastille(p)` interne ; clés `nav.sidebar.aTraiter.{titre, noms.*, pastilles.*, autres, plusCourt}`. | T6 |
| S6 | `DemarrerDeLEspace({ mode, onNavigate })` (`src/components/layout/DemarrerDeLEspace.tsx`), PREMIER bloc du `<nav>`, avec un `useState(masque)` local et un bouton `aria-label={t('masquer')}` ; son test `DemarrerDeLEspace.test.tsx` a un cas « un geste le masque, … il revient au remontage tant que TCK-2480 ne l'enregistre pas ». | T5 |
| S7 | Dans `AppSidebar`, l'objet `counters: Record<NavCounterKey, number>` et `const bande = pastillesATraiter(entrees, counters, menu.priorites)`. | T6 |
| S8 | Les deux littéraux `Disposition` de `composer-menu.test.ts` portent `priorites: []`. | T3 (nouveaux littéraux pareils) |

### Croisement avec TCK-2481 (barre d'onglets mobile)

Le plan de TCK-2481 ([`2026-11-05-tck-2481-barre-d-onglets-mobile.md`](2026-11-05-tck-2481-barre-d-onglets-mobile.md))
extrait d'`AppSidebar` deux hooks : `src/components/layout/useMenuDeLEspace.ts` (persona,
`composerMenu`, cadenas → `{ persona, menu, groupes, entrees }`) et `useCompteursDuMenu.ts`
(`countersToPoll`, `COMPTEURS_DE_MODERATION`).

- **Si TCK-2481 est sur `dev` avant ce ticket** : `personaDeLaCoque` (tâche 4) et le quatrième
  argument de `composerMenu` (`prefsDe(prefs.navigation, persona)`, tâche 5) se posent dans
  `useMenuDeLEspace`, plus dans `AppSidebar`. Le hook appelle `usePreferencesDuMenu()` lui-même.
  `AppSidebar` ne garde que le RENDU : épingles, `GroupeDuMenu`, ordre « Épinglés » → « Démarrer »,
  mode icônes. La barre d'onglets passe alors elle aussi par les préférences, ce qui est sans risque :
  une épingle ne retire aucune destination, et les onglets se cherchent par id dans TOUS les groupes.
- **Si ce ticket est mergé avant TCK-2481** : TCK-2481 déplace ces lignes telles quelles dans le hook.
- **Dans les deux cas** :
  - le groupe « Épinglés » ne gêne pas la barre d'onglets, qui ne vit que sous `md` ;
  - ce plan ne réduit jamais ni le tiroir ni la barre sous `md` ;
  - avant la tâche 3, relever lequel des deux est sur `dev`, et l'écrire dans le rapport.

---

## Arbitrages (validés par la session le 2026-11-05, par délégation du porteur)

1. **A1 — L'API refuse ce que zod refuse.** Les règles du ticket sont gardées mot pour mot, et
   resserrées là où Laravel accepterait ce que zod refuse (sinon la fixture rougit, c'est son rôle) :
   `navigation` → `array:v,personas` + `required_array_keys:v,personas` (sinon `{}` passerait :
   `required_with` ne se déclenche pas sur un tableau vide) ; `navigation.v` → `integer:strict` (sinon
   `"1"` passe) ; `navigation.personas` → `array:<les huit>` (c'est « clés parmi les huit personas ») ;
   `navigation.personas.*` → `array:epingles,replies,ouverts,demarrer_masque` (R1 : `input()` stockerait
   une clé de plus) ; listes → `list` au lieu d'`array` (sinon `{"x":"baux"}` passe) ;
   `demarrer_masque` → `boolean:strict` (sinon `1`, `"1"` passent). Les huit noms vivent dans
   `UpdateMeRequest::PERSONAS_DU_MENU`, et la fixture les porte : les deux tests les comparent à leur liste.
2. **A2 — La fixture** : `takussan-api/tests/fixtures/preferences-navigation.json`, patron
   `cout-d-entree.json` (R10) ; ajoutée aux deux listes `paths` de `web-ci.yml`, avec `UpdateMeRequest.php`.
3. **A3 — `[]` vaut `{}` en lecture** (R3) : le schéma zod accepte `[]` pour `personas` et pour un
   persona, et le transforme en `{}`. Côté écriture, le front n'envoie jamais un persona vide (il le
   retire), et envoie `navigation: null` quand plus aucun persona ne porte rien.
4. **A4 — L'écriture** : le corps est la navigation ENTIÈRE (la clé est remplacée en bloc, R1), 800 ms
   après le dernier geste ; plusieurs gestes rapprochés partent en UNE requête. Échec (HTTP ≠ 2xx ou
   réseau) → retour au dernier état ACCEPTÉ par l'API + toast d'erreur ; si un geste plus récent attend
   déjà, on ne rétablit pas (il porte l'état entier et sera jugé à son tour). Envoi immédiat
   (`keepalive`) au `pagehide` et au démontage. Entre deux appareils : le dernier qui écrit l'emporte
   (accepté : un geste rare, et le persona voisin est réécrit tel qu'on l'a lu au chargement).
5. **A5 — Sous impersonation, rien ne s'écrit** (R5 : l'API refuse en lecture seule) : les gestes
   restent dans l'onglet, sans requête ni toast. L'opérateur ne modifie pas le compte qu'il observe.
6. **A6 — « Épinglés » est le premier bloc du `<nav>`, AVANT « Démarrer »** : le ticket le veut
   « juste sous la bande À traiter », et « Démarrer » est transitoire (un espace neuf a rarement des
   épingles). Son titre paraît toujours, même seul groupe titré : l'utilisateur doit voir où va l'entrée.
7. **A7 — Qui s'épingle** : les entrées des groupes du persona et de « Plus ». Jamais l'action
   principale (même identifiant qu'une entrée : « Paiements » du locataire), jamais la carte, jamais le
   complément « Aussi … » (ce qu'ouvre un AUTRE profil : on l'épingle depuis ce profil-là), jamais une
   ligne cadenassée. À cinq épingles, le bouton des autres lignes est `aria-disabled` et dit pourquoi.
   Une écriture repart des épingles RENDUES : une épingle inconnue ou devenue inaccessible est oubliée
   au premier geste suivant (elle n'était déjà plus affichée).
8. **A8 — Les replis** : avec le fournisseur, tout groupe dont le titre paraît se bascule d'un clic sur
   son titre. Seuls les ÉCARTS au défaut de la disposition s'enregistrent (`replies` : ouverts par défaut
   et repliés ; `ouverts` : l'inverse), vingt au plus chacun (le plus ancien sort). L'ouverture
   automatique sur la page active (TCK-2478 AC4) ne s'enregistre jamais.
9. **A9 — « Démarrer » masqué** (`demarrer_masque`) : la croix l'enregistre pour le persona ; il ne
   revient que par la section « Menu » du profil (« Revenir au menu par défaut » efface TOUT le persona :
   épingles, replis, masquage).
10. **A10 — Trois modes d'appareil** : sans cookie `auto` ; `menu_icones=1|0` explicites ; cookie
    `path=/app`, un an, `SameSite=Lax`, `Secure` en https. Le bouton du pied de barre bascule vers le
    mode explicite OPPOSÉ à l'état effectif. La section « Menu » du profil offre les trois choix — c'est
    le seul chemin de retour à « Automatique » (il efface le cookie). Le tiroir n'est jamais réduit.
11. **A11 — Barre réduite** : l'en-tête d'espace se cache (le sélecteur reste dans la barre haute, R13) ;
    l'action principale devient un carré plein ; la bande « À traiter » devient une icône portant le
    total, qui ouvre les mêmes pastilles dans un `Popover` ; les titres de groupe deviennent un
    séparateur (un groupe repliable garde son chevron, qui reste le bouton) ; la `ProUpgradeCard` se
    cache ; la carte « Mettre un bien en location » devient une icône ; le pied garde la console,
    la bascule et l'avatar. Les variantes compactes ne sont RENDUES que si la barre peut se réduire
    (`auto` ou `icones`) — jamais en `complet` ni dans le tiroir : pas de doublon dans l'arbre
    d'accessibilité là où le CSS ne les cacherait pas.
12. **A12 — Le fournisseur vit dans `AppShell`** (client, sous le `ToastProvider` du groupe
    `(dashboard)`) ; sans fournisseur, `usePreferencesDuMenu()` rend un repli inerte (`actif: false`,
    mode `complet`) : les tests existants d'`AppSidebar` gardent leur DOM. Le persona se calcule par UNE
    formule, `personaDeLaCoque`, appelée par `AppSidebar` et par `AppShell` avec les mêmes entrées.
13. **A13 — Sur écran tactile** (`hover: none`), l'épingle reste visible à 60 % : sans survol, elle
    serait introuvable.
14. **A14 — Spécifications** : `docs/models-spec.md#1-user` (ligne `preferences`) se met à jour par
    `/sync-specs` APRÈS le merge (règle 3 du backlog), pas dans ce ticket.

---

## AC → preuve

| AC | Tâches | Tests | Ablations |
|---|---|---|---|
| AC1 — « Commissions » épinglée chez l'agent : dans « Épinglés », hors de « Gestion », après rechargement et sur un autre navigateur | 3, 5, 8 | `composer-menu.preferences.test.ts` « AC1 » ; `AppSidebar.personnalisation.test.tsx` « AC1 — au clavier » ; `NavigationPreferencesTest` (enregistrée et relue) ; mesure au navigateur (rechargement, second navigateur) | T3-1 ; T5-1 |
| AC2 — le même compte, persona bailleur, n'a pas l'épingle | 2, 3, 5 | `preferences.test.ts` (`prefsDe`, `avecPersona`) ; `AppSidebar.personnalisation.test.tsx` « AC2 » | T4-4 |
| AC3 — six épingles → 422 ; retirer `max:5` rougit | 1 | `NavigationPreferencesTest::test_six_epingles_sont_refusees` + cas « six épingles » de la fixture | T1-1 |
| AC4 — épingle vers une destination devenue inaccessible : non rendue | 3, 5 | `composer-menu.preferences.test.ts` « AC4 » ; `AppSidebar.personnalisation.test.tsx` « AC4 » | T3-3 |
| AC5 — 900 px sans réglage : 64 px dès le HTML serveur ; `menu_icones=0` : 256 px ; sans saut | 6, 8 | `layout.mode-icones.test.tsx` ; `mode-icones.test.ts` (plage CSS ≡ plage JS) ; `AppSidebar.personnalisation.test.tsx` « rendu serveur » (HTML + hydratation sans écart) ; mesure CDP JavaScript COUPÉ puis actif | T6-1..3 ; T8 (bloc `@media` retiré) |
| AC6 — la fixture passe des deux côtés ; élargir une règle d'un côté rougit | 1, 2 | `NavigationPreferencesTest` (fournisseur de données) ; `preferences.parite.test.ts` | T1-2, T1-3 ; T2-1..3 |
| AC7 — pint, lint, tsc, check:i18n ; suites par la CI | toutes | — | — |

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| Créer `takussan-api/tests/fixtures/preferences-navigation.json` | la fixture de parité | 1 |
| Modifier `takussan-api/app/Http/Requests/Api/Me/UpdateMeRequest.php` | `navigation`, `PERSONAS_DU_MENU`, règles | 1 |
| Créer `takussan-api/tests/Feature/Api/Me/NavigationPreferencesTest.php` | | 1 |
| Modifier `.github/workflows/web-ci.yml` | `paths` (deux endroits) | 1 |
| Créer `takussan-web/src/lib/navigation/preferences.ts` | schéma zod, lecture, gestes purs | 2 |
| Créer `takussan-web/src/lib/navigation/__tests__/preferences.test.ts`, `preferences.parite.test.ts` | | 2 |
| Modifier `takussan-web/src/types/user.ts` | `UserPreferences.navigation?: unknown` | 2 |
| Modifier `takussan-web/src/lib/navigation/composer-menu.ts` | préférences appliquées | 3 |
| Créer `takussan-web/src/lib/navigation/__tests__/composer-menu.preferences.test.ts` | | 3 |
| Créer `takussan-web/src/lib/navigation/mode-icones.ts`, `use-icones-effectives.ts` | le mode de l'appareil | 4 |
| Modifier `takussan-web/src/lib/navigation/personas.ts` | `personaDeLaCoque` | 4 |
| Créer `takussan-web/src/components/layout/PreferencesDuMenu.tsx` | fournisseur, écriture optimiste | 4 |
| Modifier `takussan-web/src/components/layout/AppShell.tsx` | monte le fournisseur ; prop `modeIcones` ; `tiroir` | 4 |
| Modifier `AppShell.bienvenue.test.tsx`, `AppShell.accueils-vus-une-lecture.tck-1766.test.tsx` | + `ToastProvider` | 4 |
| Modifier `takussan-web/src/components/layout/AppSidebar.tsx` | épingles, replis enregistrés ; puis mode icônes | 5, 6 |
| Modifier `takussan-web/src/components/layout/DemarrerDeLEspace.tsx` (+ son test) | `onMasquer` | 5 |
| Modifier `takussan-web/src/components/layout/styles-de-la-barre.ts` | `STYLE_EPINGLE`, `LIBELLE_DE_LIGNE` | 5, 6 |
| Créer `takussan-web/src/components/layout/__tests__/AppSidebar.personnalisation.test.tsx` | | 5, 6 |
| Modifier `takussan-web/src/app/globals.css` | `@custom-variant icones` | 6 |
| Modifier `takussan-web/src/lib/session.ts` | `getModeIconesDuMenu` | 6 |
| Modifier `takussan-web/src/app/(dashboard)/app/layout.tsx` (+ 4 mocks de tests, + 1 test neuf) | lit le cookie | 6 |
| Modifier `BandeATraiter.tsx`, `EnTeteDEspace.tsx` | variantes réduites | 6 |
| Créer `takussan-web/src/components/profile/ProfileMenuSection.tsx` (+ test) ; modifier `src/app/(dashboard)/app/profile/page.tsx` | section « Menu » | 7 |
| Modifier `takussan-web/src/messages/{fr,en,wo}.json` | libellés | 4, 5, 6, 7 |

**Ordre :** la tâche 1 (API + fixture) est indépendante — un agent à part peut la mener pendant les
tâches front. La tâche 2 ne lit que la fixture : elle démarre dès que l'étape 1 de la tâche 1 l'a écrite
(le contenu est dans ce plan — **ne pas la réécrire** dans la tâche 2). Les tâches 3 à 7 sont
SÉQUENTIELLES (mêmes fichiers : `AppSidebar.tsx`, `messages/*.json`). Le front ne dépend de l'API que
par le contrat, moqué dans ses tests.

---

### Tâche 1 (API) : la forme de `preferences.navigation`, et la fixture de parité (AC3, AC6)

**Fichiers :** voir la carte. Lire d'abord `takussan-api/CLAUDE.md` (« Validation », « Tests »).

- [ ] **Étape 1 : la fixture** — créer `takussan-api/tests/fixtures/preferences-navigation.json` :

```json
{
  "_": "TCK-2480 (ADR-0089 §6) — la FORME de preferences.navigation. Lue par tests/Feature/Api/Me/NavigationPreferencesTest.php (règles de UpdateMeRequest, par PATCH /api/me) ET par takussan-web/src/lib/navigation/__tests__/preferences.parite.test.ts (schéma zod SCHEMA_NAVIGATION). Chaque cas est accepté, ou refusé, des DEUX côtés : un cas qui ne vaut que d'un côté est un écart de contrat. Pas d'identifiant à espace en bord : Laravel le trime avant de valider (TrimStrings), zod non.",
  "personas": ["client", "locataire", "bailleur", "agent", "admin-agence", "hote", "prestataire", "plateforme"],
  "valides": [
    { "nom": "null efface la clé", "navigation": null },
    { "nom": "aucun persona (objet)", "navigation": { "v": 1, "personas": {} } },
    { "nom": "aucun persona (tableau vide, tel que PHP le rend)", "navigation": { "v": 1, "personas": [] } },
    { "nom": "persona vide, tel que PHP le rend", "navigation": { "v": 1, "personas": { "agent": [] } } },
    { "nom": "agent complet", "navigation": { "v": 1, "personas": { "agent": { "epingles": ["commissions", "baux"], "replies": ["prospection"], "ouverts": ["plus"], "demarrer_masque": true } } } },
    { "nom": "cinq épingles", "navigation": { "v": 1, "personas": { "bailleur": { "epingles": ["baux", "paiements", "visites", "demandes", "calendrier"] } } } },
    { "nom": "vingt replis et vingt ouverts", "navigation": { "v": 1, "personas": { "admin-agence": { "replies": ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13", "g14", "g15", "g16", "g17", "g18", "g19", "g20"], "ouverts": ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9", "o10", "o11", "o12", "o13", "o14", "o15", "o16", "o17", "o18", "o19", "o20"] } } } },
    { "nom": "identifiant de 64 caractères", "navigation": { "v": 1, "personas": { "client": { "epingles": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] } } } },
    { "nom": "démarrer non masqué", "navigation": { "v": 1, "personas": { "hote": { "demarrer_masque": false } } } },
    { "nom": "les huit personas", "navigation": { "v": 1, "personas": { "client": {}, "locataire": {}, "bailleur": {}, "agent": {}, "admin-agence": {}, "hote": {}, "prestataire": {}, "plateforme": {} } } }
  ],
  "invalides": [
    { "nom": "navigation en chaîne", "navigation": "menu" },
    { "nom": "objet vide", "navigation": {} },
    { "nom": "version absente", "navigation": { "personas": {} } },
    { "nom": "version 2", "navigation": { "v": 2, "personas": {} } },
    { "nom": "version en chaîne", "navigation": { "v": "1", "personas": {} } },
    { "nom": "personas absent", "navigation": { "v": 1 } },
    { "nom": "personas null", "navigation": { "v": 1, "personas": null } },
    { "nom": "clé inconnue à la racine", "navigation": { "v": 1, "personas": {}, "theme": "sombre" } },
    { "nom": "persona inconnu", "navigation": { "v": 1, "personas": { "courtier": {} } } },
    { "nom": "persona en chaîne", "navigation": { "v": 1, "personas": { "agent": "commissions" } } },
    { "nom": "clé inconnue dans un persona", "navigation": { "v": 1, "personas": { "agent": { "favoris": ["baux"] } } } },
    { "nom": "six épingles", "navigation": { "v": 1, "personas": { "agent": { "epingles": ["baux", "visites", "demandes", "clients", "calendrier", "commissions"] } } } },
    { "nom": "vingt et un replis", "navigation": { "v": 1, "personas": { "agent": { "replies": ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13", "g14", "g15", "g16", "g17", "g18", "g19", "g20", "g21"] } } } },
    { "nom": "vingt et un ouverts", "navigation": { "v": 1, "personas": { "agent": { "ouverts": ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9", "o10", "o11", "o12", "o13", "o14", "o15", "o16", "o17", "o18", "o19", "o20", "o21"] } } } },
    { "nom": "identifiant en majuscules", "navigation": { "v": 1, "personas": { "agent": { "epingles": ["Commissions"] } } } },
    { "nom": "identifiant à espace intérieur", "navigation": { "v": 1, "personas": { "agent": { "epingles": ["mes biens"] } } } },
    { "nom": "identifiant vide", "navigation": { "v": 1, "personas": { "agent": { "epingles": [""] } } } },
    { "nom": "identifiant de 65 caractères", "navigation": { "v": 1, "personas": { "agent": { "epingles": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] } } } },
    { "nom": "identifiant non textuel", "navigation": { "v": 1, "personas": { "agent": { "epingles": [5] } } } },
    { "nom": "épingles en objet", "navigation": { "v": 1, "personas": { "agent": { "epingles": { "x": "baux" } } } } },
    { "nom": "démarrer masqué en entier", "navigation": { "v": 1, "personas": { "agent": { "demarrer_masque": 1 } } } },
    { "nom": "démarrer masqué en chaîne", "navigation": { "v": 1, "personas": { "agent": { "demarrer_masque": "true" } } } }
  ]
}
```

Vérifier la longueur des deux identifiants longs (`node -e` sur le fichier : 64 et 65).

- [ ] **Étape 2 : écrire le test qui échoue** — `takussan-api/tests/Feature/Api/Me/NavigationPreferencesTest.php` :

```php
<?php

namespace Tests\Feature\Api\Me;

use App\Http\Requests\Api\Me\UpdateMeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2480 (ADR-0089 §6) — `preferences.navigation` : les épingles et replis du menu de `/app`, PAR
 * PERSONA, écrits par `PATCH /api/me`. L'API n'en valide que la FORME — le catalogue des destinations
 * appartient au front.
 *
 * La fixture `tests/fixtures/preferences-navigation.json` est lue ICI et par le test du schéma zod du
 * front (`takussan-web/src/lib/navigation/__tests__/preferences.parite.test.ts`) : élargir une règle
 * d'un seul côté fait rougir ce côté-là.
 *
 * Rouge avant TCK-2480 : `navigation` n'était pas une clé de préférence (200, rien d'enregistré).
 */
class NavigationPreferencesTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NAVIGATION_AGENT = ['v' => 1, 'personas' => ['agent' => ['epingles' => ['commissions']]]];

    /** @return array<string, mixed> */
    private static function fixture(): array
    {
        return json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/preferences-navigation.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    /** @return iterable<string, array{mixed}> */
    public static function valides(): iterable
    {
        foreach (self::fixture()['valides'] as $cas) {
            yield $cas['nom'] => [$cas['navigation']];
        }
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalides(): iterable
    {
        foreach (self::fixture()['invalides'] as $cas) {
            yield $cas['nom'] => [$cas['navigation']];
        }
    }

    private function compte(?array $preferences = null): User
    {
        $user = User::factory()->create(['preferences' => $preferences]);
        $this->actingAsApi($user);

        return $user;
    }

    public function test_une_forme_valide_est_enregistree_et_relue_par_auth_me(): void
    {
        $user = $this->compte();

        $this->apiPatch('/api/me', ['navigation' => self::NAVIGATION_AGENT])
            ->assertOk()
            ->assertJsonPath('data.preferences.navigation.personas.agent.epingles', ['commissions']);

        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
        // `GET /api/auth/me` rend la ressource SANS enveloppe `data` (AuthController::me).
        $this->apiGet('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('preferences.navigation.personas.agent.epingles', ['commissions']);
    }

    public function test_un_persona_inconnu_est_refuse(): void
    {
        $user = $this->compte(['navigation' => self::NAVIGATION_AGENT]);

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['courtier' => ['epingles' => ['baux']]]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['navigation.personas']);

        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
    }

    /** AC3 — ablation : retirer `max:5` de `navigation.personas.*.epingles` fait rougir ce test. */
    public function test_six_epingles_sont_refusees(): void
    {
        $this->compte();
        $six = ['baux', 'visites', 'demandes', 'clients', 'calendrier', 'commissions'];

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['agent' => ['epingles' => $six]]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['navigation.personas.agent.epingles']);
    }

    public function test_un_identifiant_hors_motif_est_refuse(): void
    {
        $this->compte();

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['agent' => ['epingles' => ['Commissions']]]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['navigation.personas.agent.epingles.0']);
    }

    public function test_null_efface_la_cle(): void
    {
        $user = $this->compte(['city' => 'Dakar', 'navigation' => self::NAVIGATION_AGENT]);

        $this->apiPatch('/api/me', ['navigation' => null])->assertOk();

        $this->assertSame(['city' => 'Dakar'], $user->fresh()->preferences);
    }

    public function test_les_autres_cles_de_preferences_sont_intactes(): void
    {
        $user = $this->compte(['city' => 'Dakar', 'entry_intent' => 'search']);

        $this->apiPatch('/api/me', ['navigation' => self::NAVIGATION_AGENT])->assertOk();
        $this->assertSame(
            ['city' => 'Dakar', 'entry_intent' => 'search', 'navigation' => self::NAVIGATION_AGENT],
            $user->fresh()->preferences,
        );

        // Et l'inverse : une autre clé écrite ne touche pas au menu.
        $this->apiPatch('/api/me', ['city' => 'Thiès'])->assertOk();
        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
    }

    /** ADR-0089 §6 — la clé est remplacée EN BLOC : aucune fusion profonde entre personas. */
    public function test_la_cle_est_remplacee_en_bloc(): void
    {
        $user = $this->compte(['navigation' => ['v' => 1, 'personas' => [
            'agent' => ['epingles' => ['commissions']],
            'bailleur' => ['replies' => ['activite']],
        ]]]);

        $this->apiPatch('/api/me', ['navigation' => ['v' => 1, 'personas' => ['bailleur' => ['epingles' => ['baux']]]]])
            ->assertOk();

        $this->assertSame(['v' => 1, 'personas' => ['bailleur' => ['epingles' => ['baux']]]], $user->fresh()->preferences['navigation']);
    }

    public function test_la_fixture_porte_les_huit_personas_de_la_requete(): void
    {
        $this->assertSame(UpdateMeRequest::PERSONAS_DU_MENU, self::fixture()['personas']);
        $this->assertGreaterThanOrEqual(8, count(iterator_to_array(self::valides())));
        $this->assertGreaterThanOrEqual(20, count(iterator_to_array(self::invalides())));
    }

    #[DataProvider('valides')]
    public function test_un_cas_valide_de_la_fixture_est_accepte(mixed $navigation): void
    {
        $this->compte();

        $this->apiPatch('/api/me', ['navigation' => $navigation])->assertOk();
    }

    #[DataProvider('invalides')]
    public function test_un_cas_invalide_de_la_fixture_est_refuse(mixed $navigation): void
    {
        $user = $this->compte(['navigation' => self::NAVIGATION_AGENT]);

        $reponse = $this->apiPatch('/api/me', ['navigation' => $navigation])->assertStatus(422);

        $champs = array_keys($reponse->json('errors') ?? []);
        $this->assertNotEmpty(array_filter($champs, fn (string $c) => str_starts_with($c, 'navigation')), implode(', ', $champs));
        $this->assertSame(self::NAVIGATION_AGENT, $user->fresh()->preferences['navigation']);
    }
}
```

> ⚠ Les clés exactes de `assertJsonValidationErrors` (`navigation.personas`,
> `navigation.personas.agent.epingles.0`) sont celles que Laravel nomme : si l'erreur tombe sur un
> autre niveau (ex. `navigation.personas` au lieu de `navigation.personas.courtier`), corriger
> l'attente au niveau RÉEL et l'écrire — pas la règle.

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `cd takussan-api && php artisan test tests/Feature/Api/Me/NavigationPreferencesTest.php`
Attendu : FAIL (`PERSONAS_DU_MENU` absent ; navigation non enregistrée ; cas invalides en 200).

- [ ] **Étape 4 : `UpdateMeRequest`** — remplacer la constante et ajouter les deux voisines :

```php
    public const PREFERENCE_FIELDS = ['city', 'search_intent', 'entry_intent', 'navigation'];

    /**
     * TCK-2480 (ADR-0089 §6) — les huit personas du menu de `/app`. Le persona est un concept du
     * FRONT (`takussan-web/src/lib/navigation/personas.ts`) : l'API n'en connaît que les noms, pour
     * refuser une clé inconnue. `tests/fixtures/preferences-navigation.json` les porte, et les deux
     * tests de parité (Laravel et zod) les comparent chacun à leur liste.
     *
     * @var list<string>
     */
    public const PERSONAS_DU_MENU = ['client', 'locataire', 'bailleur', 'agent', 'admin-agence', 'hote', 'prestataire', 'plateforme'];

    /** TCK-2480 — un identifiant de destination ou de groupe du menu : court, en kebab-case ASCII. */
    private const IDENTIFIANT_DU_MENU = ['string', 'max:64', 'regex:/^[a-z0-9-]+$/'];
```

et, dans `rules()`, après `entry_intent` :

```php
            // TCK-2480 (ADR-0089 §6) — épingles et replis du menu de `/app`, PAR PERSONA. L'API n'en
            // valide que la FORME : le catalogue des destinations appartient au front. Chaque niveau
            // liste ses clés (`array:…`) et les scalaires sont stricts : le contrôleur stocke
            // `input()`, pas `validated()` — une clé de plus serait enregistrée —, et Laravel
            // accepterait sinon ce que zod refuse (`"1"`, `1` pour un booléen, `{}`), ce que la
            // fixture de parité dirait.
            'navigation' => ['sometimes', 'nullable', 'array:v,personas', 'required_array_keys:v,personas'],
            'navigation.v' => ['required_with:navigation', 'integer:strict', 'in:1'],
            'navigation.personas' => ['array:'.implode(',', self::PERSONAS_DU_MENU)],
            'navigation.personas.*' => ['array:epingles,replies,ouverts,demarrer_masque'],
            'navigation.personas.*.epingles' => ['list', 'max:5'],
            'navigation.personas.*.epingles.*' => self::IDENTIFIANT_DU_MENU,
            'navigation.personas.*.replies' => ['list', 'max:20'],
            'navigation.personas.*.replies.*' => self::IDENTIFIANT_DU_MENU,
            'navigation.personas.*.ouverts' => ['list', 'max:20'],
            'navigation.personas.*.ouverts.*' => self::IDENTIFIANT_DU_MENU,
            'navigation.personas.*.demarrer_masque' => ['boolean:strict'],
```

`MeController::update` ne change pas (R1) : vérifier seulement que son commentaire l. 49-51 reste vrai.

- [ ] **Étape 5 : lancer, constater le vert** — commande de l'étape 3. Attendu : PASS. Puis les voisins :
  `php artisan test tests/Feature/Api/Me/MeUpdateTest.php`.

- [ ] **Étape 6 : `web-ci.yml`** — dans les DEUX listes `paths` (`pull_request` après la ligne
  `cout-d-entree.json` l. 64, `push` après l. 91), ajouter :

```yaml
      # TCK-2480 — `src/lib/navigation/__tests__/preferences.parite.test.ts` ↔ la fixture de la forme de
      # `preferences.navigation`, jouée aussi par `NavigationPreferencesTest` ; et les règles qui lui
      # répondent côté API : une PR qui ne touche qu'elles doit réveiller le côté front.
      - 'takussan-api/tests/fixtures/preferences-navigation.json'
      - 'takussan-api/app/Http/Requests/Api/Me/UpdateMeRequest.php'
```

  (au déclencheur `push`, le commentaire se réduit à « TCK-2480 — la garde décrite au déclencheur
  `pull_request` », comme ses voisins). Lancer `for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`
  depuis la racine : aucune garde rouge (`check-ci-attestation.mjs` confronte des motifs).

- [ ] **Étape 7 : ablations** (un script) — rejouer le test après chaque mutation, puis rétablir :
  1. Retirer `'max:5'` → `test_six_epingles_sont_refusees` ET le cas fixture « six épingles » rougissent (AC3).
  2. `'navigation.personas' => ['array']` → « persona inconnu » (test nommé + fixture) rougit.
  3. `'boolean'` au lieu de `'boolean:strict'` → « démarrer masqué en entier » rougit.
  4. Retirer `'navigation'` de `PREFERENCE_FIELDS` → `test_une_forme_valide_est_enregistree…` rougit (200, rien d'enregistré).

- [ ] **Étape 8 : `./vendor/bin/pint` sur les deux fichiers PHP**, puis commit —
  `feat(api): preferences.navigation, la forme du menu personnalisé, et sa fixture de parité (TCK-2480)`.

---

### Tâche 2 : le schéma zod et les gestes purs (AC2, AC6)

**Fichiers :** créer `takussan-web/src/lib/navigation/preferences.ts`,
`src/lib/navigation/__tests__/preferences.test.ts`, `src/lib/navigation/__tests__/preferences.parite.test.ts` ;
modifier `src/types/user.ts`.

**Interfaces :**
- Produit : `EPINGLES_MAX = 5`, `REPLIS_MAX = 20` ; `PreferencesDuPersona`, `PreferencesDeNavigation`,
  `NAVIGATION_VIDE`, `SCHEMA_NAVIGATION` ; `lirePreferencesDeNavigation(brut: unknown)`,
  `prefsDe(nav, persona)`, `nettoyer(p)`, `estParDefaut(p)`, `avecPersona(nav, persona, p)`,
  `versLeCorps(nav)`, `epinglesApresBascule(rendues, id)`, `prefsApresRepli(p, groupe, replie, replieParDefaut)`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/lib/navigation/__tests__/preferences.parite.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../personas';
import { SCHEMA_NAVIGATION } from '../preferences';

/**
 * TCK-2480 (ADR-0089 §6, AC6) — parité avec l'API : `takussan-api/tests/fixtures/preferences-navigation.json`
 * est lue par CE test et par `tests/Feature/Api/Me/NavigationPreferencesTest.php`. Ce que le front lit
 * (et écrit) est exactement ce que `UpdateMeRequest` accepte.
 */
interface Cas {
  readonly nom: string;
  readonly navigation: unknown;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const fixture = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'preferences-navigation.json'), 'utf8'),
) as { personas: readonly string[]; valides: readonly Cas[]; invalides: readonly Cas[] };

/** `navigation: null` efface la clé côté API ; le schéma, lui, décrit une navigation PRÉSENTE. */
const SCHEMA_DU_CORPS = SCHEMA_NAVIGATION.nullable();

describe('preferences.navigation — parité avec UpdateMeRequest (TCK-2480)', () => {
  it('la fixture porte les huit personas du front, dans leur ordre', () => {
    expect(fixture.personas).toEqual([...PERSONAS]);
    expect(fixture.valides.length).toBeGreaterThanOrEqual(8);
    expect(fixture.invalides.length).toBeGreaterThanOrEqual(20);
  });

  it.each(fixture.valides.map((c) => [c.nom, c] as const))('accepte : %s', (_nom, cas) => {
    expect(SCHEMA_DU_CORPS.safeParse(cas.navigation).success).toBe(true);
  });

  it.each(fixture.invalides.map((c) => [c.nom, c] as const))('refuse : %s', (_nom, cas) => {
    expect(SCHEMA_DU_CORPS.safeParse(cas.navigation).success).toBe(false);
  });
});
```

> ⚠ Compter les `..` : le fichier est à `takussan-web/src/lib/navigation/__tests__/` (cinq niveaux
> jusqu'à la racine du dépôt, contre quatre pour `src/lib/__tests__/cout-d-entree.concordance.test.ts`).

`src/lib/navigation/__tests__/preferences.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_VIDE,
  avecPersona,
  epinglesApresBascule,
  estParDefaut,
  lirePreferencesDeNavigation,
  prefsApresRepli,
  prefsDe,
  versLeCorps,
} from '../preferences';

const AGENT = { v: 1, personas: { agent: { epingles: ['commissions'] } } } as const;

describe('lirePreferencesDeNavigation — lu, jamais cru (TCK-2480)', () => {
  it('rend la navigation valide telle quelle', () => {
    expect(lirePreferencesDeNavigation(AGENT)).toEqual(AGENT);
  });

  it.each([undefined, null, 'menu', { v: 2, personas: {} }, { v: 1, personas: { courtier: {} } }])(
    'une forme inconnue vaut la disposition par défaut : %j',
    (brut) => {
      expect(lirePreferencesDeNavigation(brut)).toEqual(NAVIGATION_VIDE);
    },
  );

  it('`[]` (objet vide encodé par PHP) vaut `{}`, pour personas comme pour un persona', () => {
    expect(lirePreferencesDeNavigation({ v: 1, personas: [] })).toEqual(NAVIGATION_VIDE);
    expect(lirePreferencesDeNavigation({ v: 1, personas: { agent: [] } })).toEqual({ v: 1, personas: { agent: {} } });
  });
});

describe('le rangement par persona (AC2)', () => {
  it('le bailleur du même compte ne lit pas les épingles de l’agent', () => {
    expect(prefsDe(AGENT, 'agent').epingles).toEqual(['commissions']);
    expect(prefsDe(AGENT, 'bailleur')).toEqual({});
  });

  it('un geste chez le bailleur ne touche pas à l’agent', () => {
    const apres = avecPersona(AGENT, 'bailleur', { replies: ['activite'] });
    expect(apres).toEqual({ v: 1, personas: { agent: { epingles: ['commissions'] }, bailleur: { replies: ['activite'] } } });
  });

  it('un persona revenu au défaut quitte la navigation ; plus aucun persona → `null` envoyé', () => {
    const apres = avecPersona(AGENT, 'agent', { epingles: [], replies: [], demarrer_masque: false });
    expect(apres).toEqual(NAVIGATION_VIDE);
    expect(versLeCorps(apres)).toBeNull();
    expect(versLeCorps(AGENT)).toBe(AGENT);
  });

  it('estParDefaut', () => {
    expect(estParDefaut({})).toBe(true);
    expect(estParDefaut({ epingles: [], ouverts: [] })).toBe(true);
    expect(estParDefaut({ demarrer_masque: true })).toBe(false);
  });
});

describe('les gestes', () => {
  it('épingler ajoute en fin, désépingler retire ; à cinq, rien ne s’ajoute', () => {
    expect(epinglesApresBascule(['baux'], 'commissions')).toEqual(['baux', 'commissions']);
    expect(epinglesApresBascule(['baux', 'commissions'], 'baux')).toEqual(['commissions']);
    const cinq = ['a', 'b', 'c', 'd', 'e'];
    expect(epinglesApresBascule(cinq, 'f')).toEqual(cinq);
    expect(epinglesApresBascule(cinq, 'c')).toEqual(['a', 'b', 'd', 'e']);
  });

  it('un repli n’enregistre que l’ÉCART au défaut de la disposition', () => {
    // « Gestion » ouvert par défaut, replié par l'utilisateur.
    expect(prefsApresRepli({}, 'gestion', true, false)).toEqual({ replies: ['gestion'], ouverts: [] });
    // Rouvert : retour au défaut, plus rien d'enregistré.
    expect(prefsApresRepli({ replies: ['gestion'] }, 'gestion', false, false)).toEqual({ replies: [], ouverts: [] });
    // « Plus » replié par défaut, ouvert par l'utilisateur.
    expect(prefsApresRepli({}, 'plus', false, true)).toEqual({ replies: [], ouverts: ['plus'] });
  });

  it('vingt replis au plus : le plus ancien sort', () => {
    const vingt = Array.from({ length: 20 }, (_, i) => `g${i}`);
    expect(prefsApresRepli({ replies: vingt }, 'neuf', true, false).replies).toEqual([...vingt.slice(1), 'neuf']);
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `cd takussan-web && npx vitest run src/lib/navigation/__tests__/preferences.test.ts src/lib/navigation/__tests__/preferences.parite.test.ts`
Attendu : FAIL (module `../preferences` absent).

- [ ] **Étape 3 : `src/lib/navigation/preferences.ts`**

```ts
import { z } from 'zod';
import { PERSONAS, type Persona } from './personas';

/**
 * TCK-2480 (ADR-0089 §6) — les préférences du menu de `/app`, sur le COMPTE et par persona :
 * `preferences.navigation = { v: 1, personas: { <persona>: { epingles, replies, ouverts, demarrer_masque } } }`.
 *
 * L'API n'en valide que la forme (`UpdateMeRequest`) ; ce schéma la lit, et la fixture
 * `takussan-api/tests/fixtures/preferences-navigation.json` garde que les deux disent la même chose.
 * Une valeur illisible vaut la disposition par défaut : une préférence ne casse jamais le menu.
 *
 * - `epingles` : les destinations montées dans « Épinglés », dans l'ordre (cinq au plus) ;
 * - `replies` / `ouverts` : les ÉCARTS au repli par défaut des groupes de la disposition ;
 * - `demarrer_masque` : le groupe « Démarrer » (TCK-2479) a été fermé par l'utilisateur.
 */
export const EPINGLES_MAX = 5;
export const REPLIS_MAX = 20;

export interface PreferencesDuPersona {
  readonly epingles?: readonly string[];
  readonly replies?: readonly string[];
  readonly ouverts?: readonly string[];
  readonly demarrer_masque?: boolean;
}

export interface PreferencesDeNavigation {
  readonly v: 1;
  readonly personas: Readonly<Partial<Record<Persona, PreferencesDuPersona>>>;
}

export const NAVIGATION_VIDE: PreferencesDeNavigation = { v: 1, personas: {} };

const IDENTIFIANT = z.string().max(64).regex(/^[a-z0-9-]+$/);

/** PHP encode un tableau associatif vide en `[]` : un `{}` écrit revient de l'API sous cette forme. */
const VIDE_DE_PHP = z.array(z.never()).transform(() => ({}));

const SCHEMA_DU_PERSONA = z.union([
  z.strictObject({
    epingles: z.array(IDENTIFIANT).max(EPINGLES_MAX).optional(),
    replies: z.array(IDENTIFIANT).max(REPLIS_MAX).optional(),
    ouverts: z.array(IDENTIFIANT).max(REPLIS_MAX).optional(),
    demarrer_masque: z.boolean().optional(),
  }),
  VIDE_DE_PHP,
]);

export const SCHEMA_NAVIGATION = z.strictObject({
  v: z.literal(1),
  personas: z.union([z.partialRecord(z.enum(PERSONAS), SCHEMA_DU_PERSONA), VIDE_DE_PHP]),
});

/** `user.preferences?.navigation`, tel que l'API le rend : lu par le schéma, jamais cru. */
export function lirePreferencesDeNavigation(brut: unknown): PreferencesDeNavigation {
  const lu = SCHEMA_NAVIGATION.safeParse(brut);
  return lu.success ? lu.data : NAVIGATION_VIDE;
}

export function prefsDe(navigation: PreferencesDeNavigation, persona: Persona): PreferencesDuPersona {
  return navigation.personas[persona] ?? {};
}

/** Les préférences sans ce qui vaut le défaut ; `undefined` quand rien ne s'en écarte. */
export function nettoyer(p: PreferencesDuPersona): PreferencesDuPersona | undefined {
  const sortie: {
    epingles?: readonly string[];
    replies?: readonly string[];
    ouverts?: readonly string[];
    demarrer_masque?: boolean;
  } = {};
  if (p.epingles?.length) sortie.epingles = p.epingles;
  if (p.replies?.length) sortie.replies = p.replies;
  if (p.ouverts?.length) sortie.ouverts = p.ouverts;
  if (p.demarrer_masque) sortie.demarrer_masque = true;
  return Object.keys(sortie).length > 0 ? sortie : undefined;
}

export function estParDefaut(p: PreferencesDuPersona): boolean {
  return nettoyer(p) === undefined;
}

/** La navigation où CE persona porte `p` — les autres intacts ; un persona revenu au défaut en sort. */
export function avecPersona(
  navigation: PreferencesDeNavigation,
  persona: Persona,
  p: PreferencesDuPersona,
): PreferencesDeNavigation {
  const personas: Partial<Record<Persona, PreferencesDuPersona>> = { ...navigation.personas };
  const propre = nettoyer(p);
  if (propre) personas[persona] = propre;
  else delete personas[persona];
  return { v: 1, personas };
}

/** Le corps de `PATCH /api/me` : `null` efface la clé quand plus aucun persona ne porte rien. */
export function versLeCorps(navigation: PreferencesDeNavigation): PreferencesDeNavigation | null {
  return Object.keys(navigation.personas).length > 0 ? navigation : null;
}

/**
 * Épingler ou désépingler `id`, en repartant des épingles RENDUES (arbitrage A7 : une épingle inconnue
 * ou devenue inaccessible, déjà invisible, est oubliée ici). À cinq, rien ne s'ajoute.
 */
export function epinglesApresBascule(rendues: readonly string[], id: string): string[] {
  if (rendues.includes(id)) return rendues.filter((e) => e !== id);
  if (rendues.length >= EPINGLES_MAX) return [...rendues];
  return [...rendues, id];
}

/** Replier (`replie`) ou ouvrir un groupe : seul l'écart au défaut de la disposition s'enregistre. */
export function prefsApresRepli(
  p: PreferencesDuPersona,
  groupe: string,
  replie: boolean,
  replieParDefaut: boolean,
): PreferencesDuPersona {
  const sauf = (liste?: readonly string[]) => (liste ?? []).filter((g) => g !== groupe);
  const replies = sauf(p.replies);
  const ouverts = sauf(p.ouverts);
  if (replie !== replieParDefaut) (replie ? replies : ouverts).push(groupe);
  return { ...p, replies: replies.slice(-REPLIS_MAX), ouverts: ouverts.slice(-REPLIS_MAX) };
}
```

> Si `tsc` refuse `return lu.success ? lu.data : …` (le `{}` de `VIDE_DE_PHP` n'est pas assignable),
> typer par `lu.data as PreferencesDeNavigation` — la forme a été vérifiée par le schéma juste avant.

- [ ] **Étape 4 : `src/types/user.ts`** — dans `UserPreferences`, après `entry_intent` :

```ts
  /**
   * TCK-2480 (ADR-0089 §6) — épingles et replis du menu de `/app`, par persona. `unknown` à dessein :
   * il se LIT par `lirePreferencesDeNavigation` (`@/lib/navigation/preferences`), jamais directement.
   */
  navigation?: unknown;
```

- [ ] **Étape 5 : lancer, constater le vert** — commande de l'étape 2. Attendu : PASS.

- [ ] **Étape 6 : ablations**
  1. `.max(6)` sur `epingles` → « refuse : six épingles » rougit.
  2. `z.partialRecord(z.string(), …)` → « refuse : persona inconnu » rougit.
  3. Retirer `VIDE_DE_PHP` de l'union de `personas` → « accepte : aucun persona (tableau vide…) » rougit.

- [ ] **Étape 7 : `npx tsc --noEmit && npm run lint`**, puis commit —
  `feat(web): le schéma zod de preferences.navigation, en parité avec l'API (TCK-2480)`.

---

### Tâche 3 : la composition applique les préférences (AC1, AC2, AC4)

**Fichiers :** modifier `src/lib/navigation/composer-menu.ts` ; créer
`src/lib/navigation/__tests__/composer-menu.preferences.test.ts`.

**Interfaces :**
- Consomme : `PreferencesDuPersona`, `EPINGLES_MAX` (tâche 2) ; S1, S2.
- Produit : `composerMenu(ctx, persona, disposition = DISPOSITIONS[persona], preferences: PreferencesDuPersona = {})` ;
  `EntreeComposee` + `epinglable?: true`, `epinglee?: true` ; `GroupeCompose` + `replieParDefaut?: boolean` ;
  `MenuCompose` + `epingles: readonly IdDestination[]`.

- [ ] **Étape 0 : vérifier S1, S2, S3, S8** (lire `composer-menu.ts`, `dispositions.ts`, `demarrer.ts`). Écrire tout écart.

- [ ] **Étape 1 : écrire le test qui échoue** — `composer-menu.preferences.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../catalogue';
import { composerMenu, entreesDuMenu, type MenuCompose } from '../composer-menu';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

const AGENT: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'] };
const ADMIN: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
const CUMUL: ContexteDeMenu = { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] };
const LOCATAIRE: ContexteDeMenu = { roles: ['customer', 'tenant'], capacites: null };

const ids = (menu: MenuCompose, groupe: string) => menu.groupes.find((g) => g.id === groupe)?.entrees.map((e) => e.id) ?? [];
const groupe = (menu: MenuCompose, id: string) => menu.groupes.find((g) => g.id === id);

describe('TCK-2480 — composerMenu applique les préférences du persona (ADR-0089 §4)', () => {
  it('AC1 — épingler « Commissions » la monte dans « Épinglés », en tête, et la retire de « Gestion »', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, { epingles: ['commissions'] });
    expect(menu.groupes[0]).toMatchObject({ id: 'epingles', titre: 'epingles', replie: false, replieParDefaut: false });
    expect(ids(menu, 'epingles')).toEqual(['commissions']);
    expect(ids(menu, 'gestion')).not.toContain('commissions');
    expect(menu.groupes[0].entrees[0]).toMatchObject({ epinglee: true, epinglable: true });
    expect(menu.epingles).toEqual(['commissions']);
  });

  it('sans préférence, le menu est exactement celui de la disposition', () => {
    expect(composerMenu(AGENT, 'agent', undefined, {})).toEqual(composerMenu(AGENT, 'agent'));
    expect(composerMenu(AGENT, 'agent').groupes.some((g) => g.id === 'epingles')).toBe(false);
  });

  it('les épingles gardent l’ordre de l’utilisateur', () => {
    expect(composerMenu(AGENT, 'agent', undefined, { epingles: ['commissions', 'baux'] }).epingles).toEqual(['commissions', 'baux']);
  });

  it('AC4 — un identifiant inconnu ou une destination fermée au persona est ignoré', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, { epingles: ['disparue', 'agence-equipe', 'commissions'] });
    expect(ids(menu, 'epingles')).toEqual(['commissions']);
    expect(menu.epingles).toEqual(['commissions']);
  });

  it('AC4 — ce que seul un AUTRE profil ouvre ne s’épingle pas : il reste dans « Aussi … »', () => {
    const menu = composerMenu(CUMUL, 'admin-agence', undefined, { epingles: ['paiements'] });
    expect(groupe(menu, 'epingles')).toBeUndefined();
    expect(ids(menu, 'aussi')).toContain('paiements');
    expect(groupe(menu, 'aussi')?.entrees.every((e) => e.epinglable === undefined)).toBe(true);
  });

  it('l’action principale et la carte ne s’épinglent pas', () => {
    const menu = composerMenu(LOCATAIRE, 'locataire', undefined, { epingles: ['paiements', 'publier-annonce'] });
    expect(groupe(menu, 'epingles')).toBeUndefined();
    const paiements = groupe(menu, 'mon-logement')?.entrees.find((e) => e.id === 'paiements');
    expect(paiements).toBeDefined();
    expect(paiements?.epinglable).toBeUndefined();
  });

  it('cinq épingles au plus : au-delà, ignorées', () => {
    const six = ['commissions', 'baux', 'visites', 'demandes', 'clients', 'calendrier'];
    expect(composerMenu(AGENT, 'agent', undefined, { epingles: six }).epingles).toEqual(six.slice(0, 5));
  });

  it('replis : un groupe ouvert se replie, un replié s’ouvre ; un groupe sans titre, jamais', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, { replies: ['gestion', 'tete'], ouverts: ['plus'] });
    expect(groupe(menu, 'gestion')).toMatchObject({ replie: true, replieParDefaut: false });
    expect(groupe(menu, 'plus')).toMatchObject({ replie: false, replieParDefaut: true });
    expect(groupe(menu, 'tete')).toMatchObject({ replie: false });
    const admin = composerMenu(ADMIN, 'admin-agence', undefined, { ouverts: ['agence'] });
    expect(groupe(admin, 'agence')).toMatchObject({ replie: false, replieParDefaut: true });
  });

  it('« Démarrer » masqué par l’utilisateur : `demarrer` est nul (TCK-2479 l’enregistre ici)', () => {
    expect(composerMenu(ADMIN, 'admin-agence').demarrer).toBe('espace');
    expect(composerMenu(ADMIN, 'admin-agence', undefined, { demarrer_masque: true }).demarrer).toBeNull();
  });

  it.each(PERSONAS)('%s : épingler ne perd ni n’ajoute aucune destination', (persona) => {
    const tous: ContexteDeMenu = {
      roles: ['customer', 'tenant', 'owner', 'agent', 'agency_admin', 'service_provider'],
      capacites: ['properties.create'],
      cheminsAdmin: [],
    };
    const hrefs = (m: MenuCompose) => new Set([...entreesDuMenu(m).map((e) => e.href), ...(m.carte ? [m.carte.href] : [])]);
    const sans = composerMenu(tous, persona);
    const avec = composerMenu(tous, persona, undefined, { epingles: CATALOGUE.map((d) => d.id) });
    expect(hrefs(avec)).toEqual(hrefs(sans));
    expect(avec.epingles.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/composer-menu.preferences.test.ts`
Attendu : FAIL (quatrième paramètre ignoré, `epingles` absent du menu).

- [ ] **Étape 3 : `composer-menu.ts`**
  - Import : `import { EPINGLES_MAX, type PreferencesDuPersona } from './preferences';`.
  - `EntreeComposee` reçoit :

```ts
  /** TCK-2480 — l'entrée peut s'épingler : ni l'action principale, ni la carte, ni le complément « Aussi … ». */
  readonly epinglable?: true;
  /** TCK-2480 — l'entrée est dans « Épinglés ». */
  readonly epinglee?: true;
```

  - `GroupeCompose` reçoit :

```ts
  /** TCK-2480 — le repli de la DISPOSITION, avant les préférences (absent : `replie`). */
  readonly replieParDefaut?: boolean;
```

  - `MenuCompose` reçoit :

```ts
  /** TCK-2480 — les épingles RENDUES, dans l'ordre : celles dont repart le geste suivant (A7). */
  readonly epingles: readonly IdDestination[];
```

  - Signature :

```ts
export function composerMenu(
  ctx: ContexteDeMenu,
  persona: Persona,
  disposition: Disposition = DISPOSITIONS[persona],
  preferences: PreferencesDuPersona = {},
): MenuCompose {
```

  - Docblock de `composerMenu` : ajouter le point
    « 5. TCK-2480 — les préférences du persona : « Épinglés » d'abord (pris AVANT les groupes, donc retirés
    de leur groupe d'origine), les replis de l'utilisateur, « Démarrer » masqué. Elles déplacent, elles
    n'accordent rien : une épingle ne vise que ce que le persona ouvre. »
  - Juste APRÈS le calcul de `carte`, AVANT la boucle des groupes :

```ts
  // TCK-2480 — « Épinglés » : pris AVANT les groupes, donc retirés de leur groupe d'origine. Une épingle
  // ne vise que ce que le PERSONA ouvre (`prendre` juge sur `juge(d)`, jamais sur l'union : le
  // complément ne s'épingle pas), jamais l'action principale ni la carte ; un identifiant inconnu ou
  // fermé est ignoré, et au-delà de cinq aussi.
  const epingles: EntreeComposee[] = [];
  for (const id of preferences.epingles ?? []) {
    if (epingles.length >= EPINGLES_MAX) break;
    const d = PAR_ID.get(id);
    if (!d || d.id === action?.id || d.id === disposition.carte) continue;
    const entree = prendre(d, 'epingles');
    if (entree) epingles.push({ ...entree, epinglable: true, epinglee: true });
  }
  const epinglable = (e: EntreeComposee): EntreeComposee => (e.id === action?.id ? e : { ...e, epinglable: true });
  /** TCK-2480 (A8) — le repli de l'utilisateur l'emporte sur celui de la disposition ; un groupe sans titre ne se replie pas. */
  const replieDe = (id: string, titre: string | null, parDefaut: boolean): boolean => {
    if (titre === null) return false;
    if (preferences.ouverts?.includes(id)) return false;
    if (preferences.replies?.includes(id)) return true;
    return parDefaut;
  };
```

  - Boucle des groupes : `if (entree) entrees.push(epinglable(entree));` et
    `groupes.push({ id: groupe.id, titre: groupe.titre, replie: replieDe(groupe.id, groupe.titre, groupe.replie === true), replieParDefaut: groupe.replie === true, entrees });`
  - Les deux boucles de « Plus » : `if (entree) plus.push(epinglable(entree));` ; puis
    `groupes.push({ id: 'plus', titre: 'plus', replie: replieDe('plus', 'plus', true), replieParDefaut: true, entrees: plus });`
  - « Aussi » : inchangé pour les entrées (pas d'`epinglable`), et `replie: replieDe('aussi', 'aussi', true), replieParDefaut: true`.
    ⚠ son `titre` vaut `'aussi'` ou `'aussiPlusieurs'` : `replieDe` reçoit la chaîne non nulle, l'identifiant reste `'aussi'`.
  - Le `return` (S2) devient :

```ts
  const groupeEpingles: GroupeCompose[] = epingles.length > 0
    ? [{ id: 'epingles', titre: 'epingles', replie: replieDe('epingles', 'epingles', false), replieParDefaut: false, entrees: epingles }]
    : [];
  return {
    persona,
    action,
    carte,
    groupes: [...groupeEpingles, ...groupes].filter((g) => g.entrees.length > 0),
    priorites: disposition.priorites,
    // TCK-2480 — masqué par l'utilisateur (A9), comme dans un espace suspendu (TCK-2479).
    demarrer: ctx.agenceSuspendue || preferences.demarrer_masque ? null : (disposition.demarrer ?? null),
    epingles: epingles.map((e) => e.id),
  };
```

- [ ] **Étape 4 : lancer, constater le vert** — commande de l'étape 2, puis `npx vitest run src/lib/navigation`
  (tout PASS : `dispositions-validees.test.ts` ne passe aucune préférence, ses `replie` sont inchangés).
  Si `composer-menu.test.ts` compare un `MenuCompose` littéral, y ajouter `epingles: []` et l'écrire.

- [ ] **Étape 5 : ablations**
  1. Déplacer la boucle des épingles APRÈS celle des groupes → « AC1 … la retire de Gestion » rougit.
  2. Retirer `d.id === action?.id ||` → « l'action principale et la carte ne s'épinglent pas » rougit.
  3. `prendre(d, 'epingles', ctx)` (l'union au lieu du persona) → « AC4 — … reste dans Aussi » rougit.
  4. Ignorer `preferences.ouverts` dans `replieDe` → « replis » rougit.
  5. Retirer `|| preferences.demarrer_masque` → « Démarrer masqué » rougit.

- [ ] **Étape 6 : `npx tsc --noEmit && npm run lint`**, puis commit —
  `feat(web): le menu composé applique épingles, replis et « Démarrer » masqué du persona (TCK-2480)`.

---

### Tâche 4 : le fournisseur des préférences — écriture optimiste différée, rétablie sur échec

**Fichiers :** créer `src/lib/navigation/mode-icones.ts`, `src/lib/navigation/use-icones-effectives.ts`,
`src/components/layout/PreferencesDuMenu.tsx`, `src/components/layout/__tests__/PreferencesDuMenu.test.tsx`,
`src/lib/navigation/__tests__/mode-icones.test.ts` ; modifier `src/lib/navigation/personas.ts` (+ test),
`src/components/layout/AppShell.tsx`, les deux tests d'`AppShell` de R9, `src/messages/{fr,en,wo}.json`.

**Interfaces :**
- Produit : `ModeIcones = 'auto' | 'icones' | 'complet'`, `COOKIE_MENU_ICONES`, `PLAGE_ICONES_AUTO`,
  `modeIconesDepuisCookie(valeur)`, `cookieDuModeIcones(mode, securise)`, `ecrireModeIcones(mode)` ;
  `useIconesEffectives(mode): boolean` ; `personaDeLaCoque(...)` ; `PreferencesDuMenuProvider`,
  `usePreferencesDuMenu()`, `DELAI_D_ENVOI_MS` ; `AppShell` + prop `modeIcones?: ModeIcones`.

- [ ] **Étape 1 : le libellé** — sous `nav.sidebar` des trois fichiers (le `wo` = le `fr`) :

| Clé | fr | en |
|---|---|---|
| `preferences.echec` | Votre menu n’a pas pu être enregistré : il est revenu à son état précédent. | Your menu could not be saved: it is back to its previous state. |

- [ ] **Étape 2 : écrire les tests qui échouent**

`src/lib/navigation/__tests__/mode-icones.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAGE_ICONES_AUTO, cookieDuModeIcones, modeIconesDepuisCookie } from '../mode-icones';

describe('le mode icônes de l’appareil (TCK-2480, A10)', () => {
  it('sans cookie, `auto` ; `1` et `0` sont des choix explicites ; le reste vaut `auto`', () => {
    expect(modeIconesDepuisCookie(undefined)).toBe('auto');
    expect(modeIconesDepuisCookie('1')).toBe('icones');
    expect(modeIconesDepuisCookie('0')).toBe('complet');
    expect(modeIconesDepuisCookie('oui')).toBe('auto');
  });

  it('le cookie : `/app`, un an, `SameSite=Lax`, `Secure` en https ; `auto` l’efface', () => {
    expect(cookieDuModeIcones('icones', true)).toBe('menu_icones=1; path=/app; max-age=31536000; samesite=lax; secure');
    expect(cookieDuModeIcones('complet', false)).toBe('menu_icones=0; path=/app; max-age=31536000; samesite=lax');
    expect(cookieDuModeIcones('auto', false)).toContain('max-age=0');
  });

  it('la plage `auto` des infobulles est, au caractère près, celle de la variante CSS `icones:`', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app', 'globals.css'), 'utf8');
    const variante = /@custom-variant icones \{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(variante).toContain('[data-menu="icones"]');
    expect(variante).toContain(`@media ${PLAGE_ICONES_AUTO}`);
    expect(variante).toContain('[data-menu="auto"]');
  });
});
```

> ⚠ Le troisième cas reste ROUGE jusqu'à la tâche 6 (la variante CSS n'existe pas encore) : le marquer
> `it.todo` ici, et le rendre actif à la tâche 6, étape 3. Ne pas commiter un test rouge.

`src/components/layout/__tests__/PreferencesDuMenu.test.tsx` :

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { IMPERSONATION_MARKER_COOKIE } from '@/lib/impersonation';
import { prefsDe } from '@/lib/navigation/preferences';
import fr from '@/messages/fr.json';
import { DELAI_D_ENVOI_MS, PreferencesDuMenuProvider, usePreferencesDuMenu } from '../PreferencesDuMenu';

/**
 * TCK-2480 — l'écriture des préférences du menu : optimiste, envoyée après un court délai, rétablie
 * et dite (toast) sur un échec.
 */
const fetchMock = vi.fn<typeof fetch>();

function Sonde() {
  const p = usePreferencesDuMenu();
  const epingles = prefsDe(p.navigation, 'agent').epingles ?? [];
  return (
    <>
      <output data-testid="epingles">{epingles.join(',')}</output>
      <output data-testid="bailleur">{(prefsDe(p.navigation, 'bailleur').replies ?? []).join(',')}</output>
      <button type="button" onClick={() => p.basculerEpingle('agent', 'commissions', epingles)}>commissions</button>
      <button type="button" onClick={() => p.basculerEpingle('agent', 'baux', epingles)}>baux</button>
      <button type="button" onClick={() => p.reinitialiser('agent')}>réinitialiser</button>
      <button type="button" onClick={() => p.choisirModeIcones('icones')}>icônes</button>
      <output data-testid="mode">{p.modeIcones}</output>
    </>
  );
}

function rendre(navigationInitiale?: unknown) {
  render(
    withIntl(
      <ToastProvider>
        <PreferencesDuMenuProvider navigationInitiale={navigationInitiale} persona="agent" modeIconesInitial="auto">
          <Sonde />
        </PreferencesDuMenuProvider>
        <Toaster />
      </ToastProvider>,
    ),
  );
}

const corps = (appel: number) => JSON.parse(String(fetchMock.mock.calls[appel][1]?.body)) as unknown;
const attendreLEnvoi = () => act(async () => { await vi.advanceTimersByTimeAsync(DELAI_D_ENVOI_MS); });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = `${IMPERSONATION_MARKER_COOKIE}=; max-age=0`;
  document.cookie = 'menu_icones=; path=/app; max-age=0';
});

describe('PreferencesDuMenuProvider — TCK-2480', () => {
  it('optimiste : le geste se voit tout de suite, et part après le délai, en PATCH /api/me', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions');
    expect(fetchMock).not.toHaveBeenCalled();
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions'] } } } });
  });

  it('deux gestes rapprochés partent en UNE écriture, qui porte l’état final', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    fireEvent.click(screen.getByRole('button', { name: 'baux' }));
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions', 'baux'] } } } });
  });

  it('un échec rétablit l’état et le dit (toast)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
    expect(await screen.findByText(fr.nav.sidebar.preferences.echec)).toBeInTheDocument();
  });

  it('une panne réseau aussi', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
  });

  it('l’état rétabli est le dernier ACCEPTÉ par l’API, pas l’état initial', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    fetchMock.mockResolvedValue(new Response('{}', { status: 422 }));
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
    await attendreLEnvoi();
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions');
  });

  it('AC2 — un geste chez l’agent réécrit le bailleur tel quel ; tout effacé → `navigation: null`', async () => {
    rendre({ v: 1, personas: { bailleur: { replies: ['activite'] } } });
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { bailleur: { replies: ['activite'] }, agent: { epingles: ['commissions'] } } } });
    expect(screen.getByTestId('bailleur')).toHaveTextContent('activite');
  });

  it('réinitialiser le dernier persona personnalisé envoie `null`', async () => {
    rendre({ v: 1, personas: { agent: { epingles: ['baux'] } } });
    fireEvent.click(screen.getByRole('button', { name: 'réinitialiser' }));
    await attendreLEnvoi();
    expect(corps(0)).toEqual({ navigation: null });
  });

  it('A5 — sous impersonation, le geste reste dans l’onglet : aucune écriture, aucun toast', async () => {
    document.cookie = `${IMPERSONATION_MARKER_COOKIE}=1`;
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions');
  });

  it('le mode icônes : l’état ET le cookie de l’appareil', () => {
    rendre();
    expect(screen.getByTestId('mode')).toHaveTextContent('auto');
    fireEvent.click(screen.getByRole('button', { name: 'icônes' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('icones');
    expect(document.cookie).toContain('menu_icones=1');
  });
});
```

> ⚠ jsdom n'écrit un cookie `path=/app` que si `location.pathname` commence par `/app` ; si le dernier
> cas rougit sur ce seul point, poser `window.history.replaceState(null, '', '/app')` dans ce cas et
> l'écrire. `IMPERSONATION_MARKER_COOKIE` : vérifier son nom d'export dans `src/lib/impersonation.ts`.

Ajouter à `src/lib/navigation/__tests__/personas.test.ts` :

```ts
import { personaDeLaCoque } from '../personas';

describe('TCK-2480 — personaDeLaCoque : la formule de la barre ET du fournisseur', () => {
  it('l’admin d’une agence individuelle est l’hôte ; le profil actif décide', () => {
    expect(personaDeLaCoque({ roles: ['customer', 'agency_admin'], espaceIndividuel: true })).toBe('hote');
    expect(personaDeLaCoque({ roles: ['customer', 'agency_admin'], espaceIndividuel: false, agencyIsStandard: false })).toBe('hote');
    expect(personaDeLaCoque({ roles: ['customer', 'agent', 'owner'], typeProfilActif: 'owner', espaceIndividuel: false })).toBe('bailleur');
  });
});
```

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/mode-icones.test.ts src/components/layout/__tests__/PreferencesDuMenu.test.tsx src/lib/navigation/__tests__/personas.test.ts`
Attendu : FAIL (modules absents).

- [ ] **Étape 4 : `src/lib/navigation/mode-icones.ts`**

```ts
/**
 * TCK-2480 (ADR-0089 §6) — la barre de `/app` réduite aux icônes : un réglage de l'APPAREIL (il dépend
 * de l'écran, pas de la personne), dans un cookie non `httpOnly` que le layout serveur lit pour rendre
 * la bonne largeur au premier octet.
 *
 * - `auto` (aucun cookie) : réduite entre `md` et `lg` (le contenu passe de 464 à 656 px à 768,
 *   TCK-505). Décidé en CSS — variante `icones:` de `globals.css` — puisque le serveur ne connaît pas
 *   la largeur de l'écran ;
 * - `icones` (`menu_icones=1`) et `complet` (`menu_icones=0`) : le choix explicite l'emporte.
 */
export type ModeIcones = 'auto' | 'icones' | 'complet';

export const COOKIE_MENU_ICONES = 'menu_icones';

/** La plage du défaut `auto`, AU CARACTÈRE PRÈS celle de la variante `icones:` (`mode-icones.test.ts`). */
export const PLAGE_ICONES_AUTO = '(width >= 48rem) and (width < 64rem)';

const UN_AN_EN_SECONDES = 60 * 60 * 24 * 365;

export function modeIconesDepuisCookie(valeur: string | undefined): ModeIcones {
  if (valeur === '1') return 'icones';
  if (valeur === '0') return 'complet';
  return 'auto';
}

/** Le cookie d'un choix explicite ; `auto` l'efface (`max-age=0`). */
export function cookieDuModeIcones(mode: ModeIcones, securise: boolean): string {
  const valeur = mode === 'icones' ? '1' : '0';
  const age = mode === 'auto' ? 0 : UN_AN_EN_SECONDES;
  const cookie = `${COOKIE_MENU_ICONES}=${valeur}; path=/app; max-age=${age}; samesite=lax`;
  return securise ? `${cookie}; secure` : cookie;
}

export function ecrireModeIcones(mode: ModeIcones): void {
  document.cookie = cookieDuModeIcones(mode, window.location.protocol === 'https:');
}
```

- [ ] **Étape 5 : `src/lib/navigation/use-icones-effectives.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { PLAGE_ICONES_AUTO, type ModeIcones } from './mode-icones';

function abonner(rappel: () => void): () => void {
  const requete = window.matchMedia(PLAGE_ICONES_AUTO);
  requete.addEventListener('change', rappel);
  return () => requete.removeEventListener('change', rappel);
}

/**
 * TCK-2480 — la barre est-elle réduite MAINTENANT ? Pour les infobulles et le sens de la bascule
 * seulement : jamais pour la largeur, que le CSS décide dès le premier octet. Au rendu serveur et à
 * l'hydratation, `false` en `auto` : aucune infobulle tant que la page n'est pas hydratée — une
 * infobulle n'occupe aucune place, rien ne bouge à l'œil.
 */
export function useIconesEffectives(mode: ModeIcones): boolean {
  const dansLaPlage = useSyncExternalStore(
    abonner,
    () => window.matchMedia(PLAGE_ICONES_AUTO).matches,
    () => false,
  );
  return mode === 'icones' || (mode === 'auto' && dansLaPlage);
}
```

- [ ] **Étape 6 : `personaDeLaCoque` dans `personas.ts`** (sous `resoudrePersona`) :

```ts
/**
 * TCK-2480 — le persona de la coque de `/app` : LA formule qu'appliquent la barre (`AppSidebar`) et le
 * fournisseur des préférences du menu (`AppShell`), avec les mêmes entrées. La section « Menu » du
 * profil réinitialise ainsi le persona que la barre affiche, jamais un voisin.
 */
export function personaDeLaCoque({
  roles,
  typeProfilActif = null,
  espaceIndividuel,
  agencyIsStandard,
}: {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType | null;
  readonly espaceIndividuel: boolean;
  readonly agencyIsStandard?: boolean;
}): Persona {
  return resoudrePersona({ roles, typeProfilActif, agenceIndividuelle: espaceIndividuel || agencyIsStandard === false });
}
```

  et, dans `AppSidebar.tsx` (R4), remplacer l'appel de `resoudrePersona` par
  `personaDeLaCoque({ roles: user.roles, typeProfilActif, espaceIndividuel: accesAdmin.espaceIndividuel, agencyIsStandard })`
  (dans `useMenuDeLEspace.ts` si TCK-2481 est déjà sur `dev` — voir « Croisement avec TCK-2481 »).

- [ ] **Étape 7 : `src/components/layout/PreferencesDuMenu.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import { relaisImpersonationActif } from '@/lib/impersonation';
import type { IdDestination } from '@/lib/navigation/catalogue';
import { ecrireModeIcones, type ModeIcones } from '@/lib/navigation/mode-icones';
import type { Persona } from '@/lib/navigation/personas';
import {
  NAVIGATION_VIDE,
  avecPersona,
  epinglesApresBascule,
  lirePreferencesDeNavigation,
  prefsApresRepli,
  prefsDe,
  versLeCorps,
  type PreferencesDeNavigation,
  type PreferencesDuPersona,
} from '@/lib/navigation/preferences';

/** TCK-2480 (A4) — le délai avant l'envoi : plusieurs gestes rapprochés partent en UNE écriture. */
export const DELAI_D_ENVOI_MS = 800;

export interface PreferencesDuMenu {
  /** `false` sans fournisseur (tests, coque montée ailleurs) : la barre ne propose aucun geste. */
  readonly actif: boolean;
  /** Le persona que la coque affiche — celui que la section « Menu » du profil réinitialise. */
  readonly persona: Persona | null;
  readonly navigation: PreferencesDeNavigation;
  readonly modeIcones: ModeIcones;
  readonly basculerEpingle: (persona: Persona, id: IdDestination, rendues: readonly IdDestination[]) => void;
  readonly basculerRepli: (persona: Persona, groupe: string, replie: boolean, replieParDefaut: boolean) => void;
  readonly masquerDemarrer: (persona: Persona) => void;
  readonly reinitialiser: (persona: Persona) => void;
  readonly choisirModeIcones: (mode: ModeIcones) => void;
}

const rien = () => {};

/** Sans fournisseur : inerte, mode `complet` — la barre se rend comme avant TCK-2480. */
const REPLI: PreferencesDuMenu = {
  actif: false,
  persona: null,
  navigation: NAVIGATION_VIDE,
  modeIcones: 'complet',
  basculerEpingle: rien,
  basculerRepli: rien,
  masquerDemarrer: rien,
  reinitialiser: rien,
  choisirModeIcones: rien,
};

const Contexte = createContext<PreferencesDuMenu | null>(null);

export function usePreferencesDuMenu(): PreferencesDuMenu {
  return useContext(Contexte) ?? REPLI;
}

interface PreferencesDuMenuProviderProps {
  /** `user.preferences?.navigation`, tel que l'API le rend : lu par le schéma, jamais cru. */
  readonly navigationInitiale: unknown;
  readonly persona: Persona;
  /** Lu par le layout serveur sur le cookie `menu_icones` (`getModeIconesDuMenu`). */
  readonly modeIconesInitial: ModeIcones;
  readonly children: ReactNode;
}

/**
 * TCK-2480 (ADR-0089 §6) — les préférences du menu de `/app`, tenues pour toute la coque : la barre fixe
 * et le tiroir (deux montages d'`AppSidebar`) et la section « Menu » du profil lisent le MÊME état.
 *
 * - Lecture : `user.preferences.navigation`, rendu par le serveur — la disposition personnelle est
 *   juste au premier octet.
 * - Écriture (A4) : optimiste ; la navigation ENTIÈRE part en `PATCH /api/me` 800 ms après le dernier
 *   geste (la clé est remplacée en bloc côté API). Un échec rétablit le dernier état ACCEPTÉ et le
 *   dit ; un geste plus récent en attente suspend ce rétablissement (il porte l'état entier). Ce qui
 *   attend part au `pagehide` et au démontage (`keepalive`).
 * - Sous impersonation (A5), rien ne part : l'API refuserait, et l'opérateur ne modifie pas le compte
 *   qu'il observe.
 * - Le mode icônes est un réglage de l'APPAREIL : un cookie, aucune écriture sur le compte.
 */
export function PreferencesDuMenuProvider({
  navigationInitiale,
  persona,
  modeIconesInitial,
  children,
}: PreferencesDuMenuProviderProps) {
  const t = useTranslations('nav.sidebar.preferences');
  const toast = useToast();
  const [navigation, setNavigation] = useState(() => lirePreferencesDeNavigation(navigationInitiale));
  const [modeIcones, setModeIcones] = useState(modeIconesInitial);
  const confirmee = useRef(navigation);
  const enAttente = useRef<PreferencesDeNavigation | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function envoyer(keepalive = false) {
    minuteur.current = null;
    const suivante = enAttente.current;
    enAttente.current = null;
    if (suivante === null) return;
    if (relaisImpersonationActif()) return;
    let ok = false;
    try {
      const reponse = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ navigation: versLeCorps(suivante) }),
      });
      ok = reponse.ok;
    } catch {
      ok = false;
    }
    if (ok) {
      confirmee.current = suivante;
      return;
    }
    if (enAttente.current !== null) return;
    setNavigation(confirmee.current);
    toast.add({ title: t('echec'), type: 'error' });
  }

  function modifier(cible: Persona, changer: (p: PreferencesDuPersona) => PreferencesDuPersona) {
    // `enAttente` d'abord : deux gestes avant le rendu suivant composent sur le même état.
    const base = enAttente.current ?? navigation;
    const suivante = avecPersona(base, cible, changer(prefsDe(base, cible)));
    setNavigation(suivante);
    enAttente.current = suivante;
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => void envoyer(), DELAI_D_ENVOI_MS);
  }

  const vider = useEffectEvent(() => {
    if (minuteur.current === null) return;
    clearTimeout(minuteur.current);
    void envoyer(true);
  });
  useEffect(() => {
    const surPagehide = () => vider();
    window.addEventListener('pagehide', surPagehide);
    return () => {
      window.removeEventListener('pagehide', surPagehide);
      vider();
    };
  }, []);

  const valeur: PreferencesDuMenu = {
    actif: true,
    persona,
    navigation,
    modeIcones,
    basculerEpingle: (cible, id, rendues) =>
      modifier(cible, (p) => ({ ...p, epingles: epinglesApresBascule(rendues, id) })),
    basculerRepli: (cible, groupe, replie, replieParDefaut) =>
      modifier(cible, (p) => prefsApresRepli(p, groupe, replie, replieParDefaut)),
    masquerDemarrer: (cible) => modifier(cible, (p) => ({ ...p, demarrer_masque: true })),
    reinitialiser: (cible) => modifier(cible, () => ({})),
    choisirModeIcones: (mode) => {
      setModeIcones(mode);
      ecrireModeIcones(mode);
    },
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
```

> Si `react-hooks/*` refuse l'appel de `vider` (un `useEffectEvent`) dans le nettoyage, garder
> l'abonnement `pagehide` seul dans l'effet et l'écrire : `/app` ne se démonte qu'en quittant la coque,
> ce que `pagehide` couvre pour une navigation dure. Patron existant de `useEffectEvent` :
> `src/components/admin/super/radar/annonceur/usePriseEnCharge.ts:34`.

- [ ] **Étape 8 : `AppShell.tsx`**
  - Imports : `PreferencesDuMenuProvider` (`./PreferencesDuMenu`), `type ModeIcones`
    (`@/lib/navigation/mode-icones`), `personaDeLaCoque` (`@/lib/navigation/personas`),
    `useAccesAdminOuRepli` (`@/lib/access/acces-admin-contexte`).
  - `AppShellProps` reçoit :

```ts
  /**
   * TCK-2480 — le mode icônes de l'appareil, lu par le layout sur le cookie `menu_icones`. Absent
   * (tests) : `complet`, la barre de toujours.
   */
  modeIcones?: ModeIcones;
```

  - Dans le corps, avant le `return` :

```ts
  // TCK-2480 — le persona AFFICHÉ, par la même formule que la barre : la section « Menu » du profil
  // réinitialise celui-là.
  const accesAdmin = useAccesAdminOuRepli({ roles: user.roles, agencyId: user.agency_id, agencyIsStandard });
  const persona = personaDeLaCoque({
    roles: user.roles,
    typeProfilActif,
    espaceIndividuel: accesAdmin.espaceIndividuel,
    agencyIsStandard,
  });
```

  - Le `return` : `<PreferencesDuMenuProvider navigationInitiale={user.preferences?.navigation} persona={persona} modeIconesInitial={modeIcones}>`
    juste à l'intérieur de `<MinimalProfileTriggerProvider>`, autour du `<div className="flex h-dvh …">`.
    (`modeIcones = 'complet'` par défaut dans la déstructuration des props.)
  - Le second `<AppSidebar …>` (dans `SheetContent`) reçoit `tiroir` (la prop arrive en tâche 6 ; d'ici
    là, ne rien passer).

- [ ] **Étape 9 : les deux tests de R9** — envelopper leur rendu dans `<ToastProvider>` (import
  `@/components/ui/toast`), comme `AppShell.bandeaux.test.tsx:108-112`. Rien d'autre.

- [ ] **Étape 10 : lancer, constater le vert** — commande de l'étape 3, puis
  `npx vitest run src/components/layout src/lib/navigation "src/app/(dashboard)/app"`. Attendu : PASS.

- [ ] **Étape 11 : ablations**
  1. Retirer `setNavigation(confirmee.current);` → « un échec rétablit » ET « dernier ACCEPTÉ » rougissent.
  2. Retirer `if (minuteur.current !== null) clearTimeout(minuteur.current);` → « UNE écriture » rougit (deux appels).
  3. Retirer `if (relaisImpersonationActif()) return;` → « A5 » rougit.
  4. Dans `avecPersona`, repartir de `{}` au lieu de `navigation.personas` → « AC2 … réécrit le bailleur » rougit.

- [ ] **Étape 12 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): le fournisseur des préférences du menu — écriture optimiste différée, rétablie sur échec (TCK-2480)`.

---

### Tâche 5 : épingler et replier depuis la barre (AC1, AC2, AC4)

**Fichiers :** modifier `src/components/layout/AppSidebar.tsx`, `src/components/layout/styles-de-la-barre.ts`,
`src/components/layout/DemarrerDeLEspace.tsx` (+ `__tests__/DemarrerDeLEspace.test.tsx`),
`src/messages/{fr,en,wo}.json` ; créer `src/components/layout/__tests__/AppSidebar.personnalisation.test.tsx`.

- [ ] **Étape 0 : vérifier S4, S6.**

- [ ] **Étape 1 : les libellés** — sous `nav.sidebar` (le `wo` = le `fr`) :

| Clé | fr | en |
|---|---|---|
| `groupes.epingles` | Épinglés | Pinned |
| `epingle.epingler` | Épingler {libelle} | Pin {libelle} |
| `epingle.plein` | Cinq épingles au plus : désépinglez-en une d’abord. | Five pins at most: unpin one first. |

- [ ] **Étape 2 : écrire le test qui échoue** — `AppSidebar.personnalisation.test.tsx`. Reprendre TELS
  QUELS les `vi.mock` d'en-tête d'`AppSidebar.test.tsx` (`@/hooks/useCan`, `next/navigation`,
  `@/hooks/useProfiles`, les trois compteurs, `@/lib/queries/credits-solde`, les deux files de
  modération, et celui de `@/lib/queries/demarrage-espace` si TCK-2479 l'a posé), puis :

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import type { Persona } from '@/lib/navigation/personas';
import fr from '@/messages/fr.json';
import { AppSidebar } from '../AppSidebar';
import { DELAI_D_ENVOI_MS, PreferencesDuMenuProvider } from '../PreferencesDuMenu';

/**
 * TCK-2480 — la barre montée, avec le fournisseur des préférences : épingler au clavier, replier,
 * le rangement par persona, l'épingle périmée ignorée, l'échec rétabli.
 */
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const AGENT_ET_BAILLEUR: UserRole[] = ['customer', 'agent', 'owner'];

function element(
  roles: UserRole[],
  persona: Persona,
  options: { navigation?: unknown; typeProfilActif?: ProfileType; modeIcones?: ModeIcones } = {},
) {
  const user = {
    id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.sn',
    roles, agency_id: 7, preferences: { navigation: options.navigation },
  } as unknown as User;
  return withIntl(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <PreferencesDuMenuProvider navigationInitiale={options.navigation} persona={persona} modeIconesInitial={options.modeIcones ?? 'complet'}>
          <AppSidebar user={user} agencyIsStandard typeProfilActif={options.typeProfilActif ?? null} />
        </PreferencesDuMenuProvider>
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const groupe = (nom: string) => screen.getByRole('group', { name: nom });
const corps = () => JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as unknown;

describe('TCK-2480 — personnaliser le menu depuis la barre', () => {
  it('AC1 — au clavier : Tab mène de « Commissions » à son épingle ; Entrée la monte dans « Épinglés »', async () => {
    const user = userEvent.setup();
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
    within(groupe('Gestion')).getByRole('link', { name: 'Commissions' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(within(groupe('Gestion')).getByRole('button', { name: 'Épingler Commissions', pressed: false }));
    await user.keyboard('{Enter}');

    expect(within(groupe('Épinglés')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    expect(within(groupe('Gestion')).queryByRole('link', { name: 'Commissions' })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: DELAI_D_ENVOI_MS + 1000 });
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions'] } } } });

    // Désépingler, toujours au clavier : elle revient dans « Gestion ».
    within(groupe('Épinglés')).getByRole('button', { name: 'Épingler Commissions', pressed: true }).focus();
    await user.keyboard('{Enter}');
    expect(within(groupe('Gestion')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Épinglés' })).toBeNull();
  });

  it('AC2 — le même compte, profil actif bailleur, n’a pas l’épingle de l’agent', () => {
    const navigation = { v: 1, personas: { agent: { epingles: ['commissions'] } } };
    render(element(AGENT_ET_BAILLEUR, 'bailleur', { navigation, typeProfilActif: 'owner' }));
    expect(screen.queryByRole('group', { name: 'Épinglés' })).toBeNull();
  });

  it('AC4 — une épingle inconnue ou inaccessible n’est pas rendue', () => {
    const navigation = { v: 1, personas: { agent: { epingles: ['disparue', 'agence-equipe', 'commissions'] } } };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    expect(within(groupe('Épinglés')).getAllByRole('link').map((a) => a.textContent)).toEqual(['Commissions']);
  });

  it('l’action principale ne s’épingle pas (« Paiements » du locataire)', () => {
    render(element(['customer', 'tenant'], 'locataire'));
    expect(screen.queryByRole('button', { name: 'Épingler Paiements' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Épingler Baux' })).toBeInTheDocument();
  });

  it('cinq épingles : celle d’une autre ligne est refusée, et le dit', () => {
    const navigation = { v: 1, personas: { agent: { epingles: ['commissions', 'baux', 'demandes', 'clients', 'calendrier'] } } };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    const visites = screen.getByRole('button', { name: 'Épingler Visites' });
    expect(visites).toHaveAttribute('aria-disabled', 'true');
    expect(visites).toHaveAttribute('title', fr.nav.sidebar.epingle.plein);
  });

  it('replier « Gestion » d’un clic sur son titre : enregistré pour le persona', async () => {
    const user = userEvent.setup();
    render(element(['customer', 'agent'], 'agent'));
    const titre = within(groupe('Gestion')).getByRole('button', { name: 'Gestion' });
    expect(titre).toHaveAttribute('aria-expanded', 'true');
    await user.click(titre);
    expect(within(groupe('Gestion')).getByRole('button', { name: 'Gestion' })).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: DELAI_D_ENVOI_MS + 1000 });
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { replies: ['gestion'] } } } });
  });

  it('un échec d’écriture rétablit le menu et le dit', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const user = userEvent.setup();
    render(element(['customer', 'agent'], 'agent'));
    within(groupe('Gestion')).getByRole('button', { name: 'Épingler Commissions' }).focus();
    await user.keyboard('{Enter}');
    expect(within(groupe('Épinglés')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    expect(await screen.findByText(fr.nav.sidebar.preferences.echec, {}, { timeout: DELAI_D_ENVOI_MS + 1000 })).toBeInTheDocument();
    expect(within(groupe('Gestion')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
  });

  it('« Démarrer » masqué pour le persona : ni groupe, ni lecture', () => {
    const navigation = { v: 1, personas: { 'admin-agence': { demarrer_masque: true } } };
    const { container } = render(element(['customer', 'agency_admin'], 'admin-agence', { navigation }));
    expect(container.querySelector('[data-slot="demarrer"]')).toBeNull();
  });
});
```

> Les libellés (« Gestion », « Commissions », « Visites », « Baux ») sont ceux de `fr.json` : en cas
> d'écart, corriger l'attente sur le libellé RÉEL. L'AC1 éprouve le parcours clavier réel (Tab depuis
> la ligne), pas un `focus()` posé sur le bouton.

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `npx vitest run src/components/layout/__tests__/AppSidebar.personnalisation.test.tsx`
Attendu : FAIL (aucun bouton « Épingler … », titres non basculables).

- [ ] **Étape 4 : `styles-de-la-barre.ts`** — ajouter :

```ts
/**
 * TCK-2480 — l'épingle d'une ligne : discrète, visible au survol de la ligne ET au focus clavier,
 * toujours visible quand la ligne est épinglée (on reconnaît « Épinglés ») ; à 60 % sur un écran
 * tactile, qui n'a pas de survol (A13). Cachée quand la barre est réduite aux icônes.
 */
export const STYLE_EPINGLE =
  'ml-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/ligne:opacity-100 aria-pressed:opacity-100 aria-disabled:cursor-not-allowed [@media(hover:none)]:opacity-60 max-md:size-9 motion-reduce:transition-none';
```

- [ ] **Étape 5 : `SidebarItem` (`AppSidebar.tsx`)** — import `Pin` (lucide) et `STYLE_EPINGLE` ; ajouter
  au-dessus de `SidebarItemProps` :

```ts
/** TCK-2480 — l'épingle d'une ligne : son état, la limite, le geste. */
interface EpingleDeLigne {
  readonly epinglee: boolean;
  /** Cinq épingles déjà : épingler CETTE ligne est refusé, et le bouton le dit. */
  readonly plein: boolean;
  readonly onBasculer: () => void;
}
```

  `SidebarItemProps` reçoit `readonly epingle?: EpingleDeLigne;`. Dans `SidebarItem`, le `<Link>` actuel
  devient `const lien = (<Link …>…</Link>);` avec `min-w-0 flex-1` ajoutés en tête de ses classes, puis :

```tsx
  if (!epingle) return lien;
  const refusee = epingle.plein && !epingle.epinglee;
  // TCK-2480 — l'épingle est une SŒUR du lien (un bouton dans un lien n'est pas valide) : bouton à
  // bascule, nom constant, état dans `aria-pressed`.
  return (
    <div className="group/ligne flex items-center">
      {lien}
      <button
        type="button"
        aria-pressed={epingle.epinglee}
        aria-disabled={refusee || undefined}
        aria-label={t('epingle.epingler', { libelle: label })}
        title={refusee ? t('epingle.plein') : undefined}
        onClick={refusee ? undefined : epingle.onBasculer}
        className={cn(STYLE_EPINGLE, FOCUS_RING)}
      >
        <Pin className={cn('size-3.5', epingle.epinglee && 'fill-current')} aria-hidden />
      </button>
    </div>
  );
```

  (La ligne cadenassée ne reçoit jamais d'épingle : son `return` anticipé reste avant.)

- [ ] **Étape 6 : `GroupeDuMenu`** — remplacer la fonction (et ses props) par :

```tsx
interface GroupeDuMenuProps {
  readonly groupe: GroupeCompose & { readonly entrees: readonly EntreeRendue[] };
  /** TCK-377 — les titres de SECTION paraissent (`avecTitres`). */
  readonly titres: boolean;
  readonly premier: boolean;
  readonly idBase: string;
  readonly activeHref: string | null;
  readonly rendreEntree: (entree: EntreeRendue) => ReactNode;
  /**
   * TCK-2480 — replier ou ouvrir le groupe, ENREGISTRÉ sur le compte (A8). Absent (aucun
   * fournisseur) : seuls les groupes repliés par défaut se basculent, pour ce montage seulement.
   */
  readonly onBasculer?: (groupe: string, replie: boolean, replieParDefaut: boolean) => void;
}

/** Les groupes dont le titre paraît toujours : les divulgations, et « Épinglés » (on voit où va l'entrée, A6). */
const TOUJOURS_TITRES: ReadonlySet<string> = new Set([...GROUPES_DIVULGATION, 'epingles']);

/**
 * TCK-2478 — un groupe de la disposition ; TCK-2480 — repliable d'un clic sur son titre, et le repli
 * s'enregistre (A8).
 *
 * - Le titre paraît pour un groupe replié (par défaut ou par l'utilisateur), une divulgation, « Épinglés »,
 *   ou quand les titres de section paraissent (TCK-377). Avec le fournisseur, tout titre qui paraît est
 *   le bouton de bascule ; sans lui, seuls les groupes repliés par défaut le sont (TCK-2478).
 * - AC4 de TCK-2478 — l'entrée active n'est jamais cachée : un groupe qui la contient s'ouvre à
 *   l'arrivée sur elle, SANS rien écrire ; le refermer alors ne fait que le refermer (il est déjà
 *   replié pour le compte). L'ajustement se fait pendant le rendu, sur le patron « état dérivé d'une
 *   prop », sans effet.
 */
function GroupeDuMenu({ groupe, titres, premier, idBase, activeHref, rendreEntree, onBasculer }: GroupeDuMenuProps) {
  const t = useTranslations('nav.sidebar');
  const contientLActif = activeHref !== null && groupe.entrees.some((e) => e.href === activeHref);
  const replieParDefaut = groupe.replieParDefaut ?? groupe.replie;
  const [replieLocal, setReplieLocal] = useState(groupe.replie);
  const replie = onBasculer ? groupe.replie : replieLocal;
  const [ouvertParLActif, setOuvertParLActif] = useState(contientLActif);
  const [actifVu, setActifVu] = useState(contientLActif);
  if (contientLActif !== actifVu) {
    setActifVu(contientLActif);
    setOuvertParLActif(contientLActif);
  }
  const ouvert = !replie || ouvertParLActif;

  const avecTitre =
    groupe.titre !== null && (titres || replie || replieParDefaut || TOUJOURS_TITRES.has(groupe.id));
  const bascule = avecTitre && (onBasculer !== undefined || replieParDefaut);
  const libelle = groupe.titre !== null ? t(`groupes.${groupe.titre}`, groupe.titreValeurs) : null;
  const idTitre = `${idBase}-${groupe.id}-titre`;
  const idListe = `${idBase}-${groupe.id}-liste`;

  const basculer = () => {
    setOuvertParLActif(false);
    if (replie && ouvert) return;
    if (onBasculer) onBasculer(groupe.id, ouvert, replieParDefaut);
    else setReplieLocal(ouvert);
  };

  return (
    <div
      role={avecTitre ? 'group' : undefined}
      aria-labelledby={avecTitre ? idTitre : undefined}
      data-groupe={groupe.id}
      className={cn('space-y-1', !premier && 'mt-4')}
    >
      {bascule ? (
        <button
          type="button"
          id={idTitre}
          aria-expanded={ouvert}
          aria-controls={idListe}
          onClick={basculer}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1 text-left hover:text-foreground max-md:py-2',
            STYLE_TITRE,
            FOCUS_RING,
          )}
        >
          <span className="truncate">{libelle}</span>
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 shrink-0 transition-transform motion-reduce:transition-none', ouvert && 'rotate-90')}
          />
        </button>
      ) : avecTitre ? (
        <p id={idTitre} className={cn('px-3 pb-1', STYLE_TITRE)}>
          {libelle}
        </p>
      ) : null}
      <div id={idListe} hidden={bascule && !ouvert} className="space-y-1">
        {groupe.entrees.map(rendreEntree)}
      </div>
    </div>
  );
}
```

- [ ] **Étape 7 : le corps d'`AppSidebar`**
  - Imports : `usePreferencesDuMenu` (`./PreferencesDuMenu`), `EPINGLES_MAX` et `prefsDe`
    (`@/lib/navigation/preferences`).
  - Après le calcul de `persona` (dans `useMenuDeLEspace.ts` si TCK-2481 est déjà sur `dev` : le hook
    lit `usePreferencesDuMenu()` et passe `prefsDe(…)` à `composerMenu` ; `AppSidebar` récupère `prefs`
    pour ses gestes — voir « Croisement avec TCK-2481 ») :

```ts
  // TCK-2480 — les préférences du compte, PAR PERSONA ; sans fournisseur, aucune (repli inerte).
  const prefs = usePreferencesDuMenu();
  const menu = composerMenu(
    { roles: user.roles, capacites, cheminsAdmin: accesAdmin.chemins, agenceSuspendue: agencySuspended },
    persona,
    undefined,
    prefsDe(prefs.navigation, persona),
  );
```

  - `rendreEntree` passe l'épingle :

```tsx
      epingle={
        prefs.actif && entree.epinglable && !entree.locked
          ? {
              epinglee: entree.epinglee === true,
              plein: menu.epingles.length >= EPINGLES_MAX,
              onBasculer: () => prefs.basculerEpingle(persona, entree.id, menu.epingles),
            }
          : undefined
      }
```

  - Le `<nav>` (A6 — « Épinglés » d'abord, puis « Démarrer », puis les groupes) :

```tsx
  const basculerGroupe = prefs.actif
    ? (id: string, replie: boolean, parDefaut: boolean) => prefs.basculerRepli(persona, id, replie, parDefaut)
    : undefined;
  const [epingles, autres] = groupes[0]?.id === 'epingles' ? [groupes[0], groupes.slice(1)] : [null, groupes];
  const rendreGroupe = (groupe: (typeof groupes)[number], premier: boolean) => (
    <GroupeDuMenu
      key={groupe.id}
      groupe={groupe}
      titres={titres}
      premier={premier}
      idBase={idBase}
      activeHref={activeHref}
      rendreEntree={rendreEntree}
      onBasculer={basculerGroupe}
    />
  );
```

```tsx
        {epingles ? rendreGroupe(epingles, true) : null}
        {menu.demarrer ? (
          <DemarrerDeLEspace
            mode={menu.demarrer}
            onNavigate={onNavigate}
            onMasquer={prefs.actif ? () => prefs.masquerDemarrer(persona) : undefined}
          />
        ) : null}
        {autres.map((groupe, index) => rendreGroupe(groupe, index === 0 && epingles === null && !menu.demarrer))}
```

  (« Démarrer » porte déjà sa marge basse `mb-4` ; derrière « Épinglés », lui donner une marge haute —
  prop `className` ou un `<div className="mt-4">` — et vérifier l'espacement à la mesure.)

- [ ] **Étape 8 : `DemarrerDeLEspace.tsx`** — prop `readonly onMasquer?: () => void;` et :

```tsx
          // TCK-2480 — avec le fournisseur, le masquage s'enregistre pour le persona (`demarrer_masque`) :
          // `composerMenu` rend alors `demarrer: null`, et ce composant n'est plus monté. Sans lui (tests,
          // coque montée ailleurs), l'état local de TCK-2479.
          onClick={() => (onMasquer ? onMasquer() : setMasque(true))}
```

  Mettre à jour le docblock (« ⚠ Le masquage vit dans cet état local … TCK-2480 l'enregistre ») : il
  s'enregistre désormais quand `onMasquer` est passé. Dans `DemarrerDeLEspace.test.tsx` : renommer le cas
  « … il revient au remontage tant que TCK-2480 ne l'enregistre pas » en « sans `onMasquer`, … il revient
  au remontage », et ajouter :

```tsx
  it('TCK-2480 — avec `onMasquer`, la croix le délègue au compte', async () => {
    const onMasquer = vi.fn();
    // … même montage que le cas voisin, avec `onMasquer={onMasquer}` …
    await userEvent.click(screen.getByRole('button', { name: fr.nav.sidebar.demarrer.masquer }));
    expect(onMasquer).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Étape 9 : lancer, constater le vert** — commande de l'étape 3, puis le périmètre :
  `npx vitest run src/components/layout src/lib/navigation src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx "src/app/(dashboard)/app"`.
  Attendu : PASS (les tests existants d'`AppSidebar` n'ont pas de fournisseur : aucun bouton
  d'épingle, replis inchangés).

- [ ] **Étape 10 : ablations**
  1. `tabIndex={-1}` sur le bouton d'épingle → « AC1 — au clavier » rougit.
  2. Dans `GroupeDuMenu`, ignorer `onBasculer` (toujours l'état local) → « replier Gestion … enregistré » rougit.
  3. Passer `prefsDe(prefs.navigation, 'agent')` en dur → « AC2 » rougit.
  4. Retirer `!entree.locked &&` puis `entree.epinglable &&` : le second fait rougir « l'action principale ne s'épingle pas ».

- [ ] **Étape 11 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): épingler et replier depuis la barre, enregistré pour le persona (TCK-2480)`.

---

### Tâche 6 : la barre réduite aux icônes, juste au premier octet (AC5)

**Fichiers :** modifier `src/app/globals.css`, `src/lib/session.ts`, `src/app/(dashboard)/app/layout.tsx`
(+ les 4 tests de R8 ; créer `src/app/(dashboard)/app/__tests__/layout.mode-icones.test.tsx`),
`src/components/layout/AppShell.tsx`, `AppSidebar.tsx`, `styles-de-la-barre.ts`, `BandeATraiter.tsx`,
`EnTeteDEspace.tsx`, `src/lib/navigation/__tests__/mode-icones.test.ts` (activer le cas CSS),
`AppSidebar.personnalisation.test.tsx` (compléter), `src/messages/{fr,en,wo}.json`.

- [ ] **Étape 0 : vérifier S5, S7.**

- [ ] **Étape 1 : les libellés** — sous `nav.sidebar` (le `wo` = le `fr`) :

| Clé | fr | en |
|---|---|---|
| `icones.reduire` | Réduire la barre | Collapse sidebar |
| `icones.deplier` | Déplier la barre | Expand sidebar |
| `aTraiter.compact` | `{count, plural, one {À traiter : # élément} other {À traiter : # éléments}}` | `{count, plural, one {To do: # item} other {To do: # items}}` |
| `aTraiter.totalCourt` | `{count, plural, =100 {99+} other {#}}` | `{count, plural, =100 {99+} other {#}}` |

- [ ] **Étape 2 : écrire les tests qui échouent**

`src/app/(dashboard)/app/__tests__/layout.mode-icones.test.tsx` — copie de `layout.profil-actif.test.tsx`
(mêmes `vi.mock`) où le mock de session devient
`vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => undefined, getModeIconesDuMenu: () => modeLu() }))`
(`modeLu` hissé par `vi.hoisted`), le mock d'`AppShell` sonde `props.modeIcones`, et :

```tsx
describe('layout /app — le mode icônes de l’appareil (TCK-2480, AC5)', () => {
  it.each(['auto', 'icones', 'complet'] as const)('descend `%s`, lu sur le cookie, à la coque', async (mode) => {
    getMe.mockResolvedValue(ADMIN_ET_BAILLEUR);
    modeLu.mockResolvedValue(mode);
    await rendre();
    expect(sonde).toHaveBeenLastCalledWith(mode);
  });
});
```

Compléter `AppSidebar.personnalisation.test.tsx` (imports : `renderToString` de `react-dom/server`,
`hydrateRoot` de `react-dom/client`, `act` de `@testing-library/react`) :

```tsx
describe('TCK-2480 — AC5 : rendu serveur sans saut (largeur et épingles)', () => {
  const navigation = { v: 1, personas: { agent: { epingles: ['commissions'] } } };

  it.each([
    ['auto', 'auto'],
    ['complet', 'complet'],
    ['icones', 'icones'],
  ] as const)('mode %s : `data-menu="%s"` est DANS le HTML serveur, avec la largeur réduite en variante', (mode, attendu) => {
    const html = renderToString(element(['customer', 'agent'], 'agent', { navigation, modeIcones: mode }));
    const conteneur = document.createElement('div');
    conteneur.innerHTML = html;
    const barre = conteneur.querySelector('aside')!;
    expect(barre.getAttribute('data-menu')).toBe(attendu);
    expect(barre.className).toContain('w-64');
    expect(barre.className).toContain('icones:w-16');
    // Les épingles aussi sont au premier octet.
    expect(conteneur.querySelector('[data-groupe="epingles"]')?.textContent).toContain('Commissions');
  });

  it('l’hydratation ne change ni la barre ni les épingles, et ne signale aucun écart', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const jsx = element(['customer', 'agent'], 'agent', { navigation, modeIcones: 'auto' });
    const conteneur = document.createElement('div');
    conteneur.innerHTML = renderToString(jsx);
    document.body.appendChild(conteneur);
    const avant = conteneur.querySelector('aside')!.outerHTML.length;
    const classeAvant = conteneur.querySelector('aside')!.className;
    await act(async () => {
      hydrateRoot(conteneur, jsx);
    });
    expect(conteneur.querySelector('aside')!.className).toBe(classeAvant);
    expect(conteneur.querySelector('aside')!.getAttribute('data-menu')).toBe('auto');
    expect(conteneur.querySelector('[data-groupe="epingles"]')).not.toBeNull();
    expect(erreurs.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    expect(avant).toBeGreaterThan(0);
    erreurs.mockRestore();
    conteneur.remove();
  });

  it('le tiroir n’est jamais réduit, quel que soit le mode', () => {
    // `tiroir` : la barre du `Sheet` (AppShell).
    const html = renderToString(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <ToastProvider>
            <PreferencesDuMenuProvider navigationInitiale={undefined} persona="agent" modeIconesInitial="icones">
              <AppSidebar user={{ id: 1, roles: ['customer', 'agent'], agency_id: 7 } as unknown as User} agencyIsStandard tiroir />
            </PreferencesDuMenuProvider>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    expect(html).toContain('data-menu="complet"');
  });

  it('la bascule du pied de barre choisit le mode OPPOSÉ à l’état effectif', async () => {
    const user = userEvent.setup();
    render(element(['customer', 'agent'], 'agent', { modeIcones: 'complet' }));
    await user.click(screen.getByRole('button', { name: /Réduire la barre/ }));
    expect(document.querySelector('aside')).toHaveAttribute('data-menu', 'icones');
    await user.click(screen.getByRole('button', { name: /Déplier la barre/ }));
    expect(document.querySelector('aside')).toHaveAttribute('data-menu', 'complet');
  });
});
```

> ⚠ Le message d'hydratation de React 19 peut aussi passer par `console.warn` ou `onRecoverableError` ;
> si le cas « hydratation » reste vert sous l'ablation 3, élargir l'espion (les deux consoles, et
> `hydrateRoot(…, { onRecoverableError })`) et l'écrire.

- [ ] **Étape 3 : la variante CSS** — dans `src/app/globals.css`, sous `@custom-variant dark …` (l. 19) :

```css
/*
 * TCK-2480 (ADR-0089 §6) — la barre de `/app` réduite aux icônes. `data-menu` est posé par le layout
 * serveur (cookie `menu_icones`) : `icones` = choix explicite de l'appareil ; `auto` (aucun cookie) =
 * réduite entre `md` et `lg` seulement. La largeur se décide ICI, en CSS, parce que le serveur ne
 * connaît pas l'écran : elle est juste au premier octet et rien ne saute à l'hydratation.
 * ⚠ La plage est, au caractère près, `PLAGE_ICONES_AUTO` (`src/lib/navigation/mode-icones.ts`), que
 * lisent les infobulles : `mode-icones.test.ts` les confronte.
 */
@custom-variant icones {
  &:where([data-menu="icones"], [data-menu="icones"] *) {
    @slot;
  }
  @media (width >= 48rem) and (width < 64rem) {
    &:where([data-menu="auto"], [data-menu="auto"] *) {
      @slot;
    }
  }
}
```

  Puis, dans `mode-icones.test.ts`, remplacer l'`it.todo` de la tâche 4 par le cas complet.

- [ ] **Étape 4 : `src/lib/session.ts`** — import `COOKIE_MENU_ICONES, modeIconesDepuisCookie, type ModeIcones`
  (`./navigation/mode-icones`) et :

```ts
/**
 * TCK-2480 — le mode icônes de la barre de `/app` sur CET appareil (cookie `menu_icones`, non
 * `httpOnly`, écrit par le navigateur). Lu par le layout pour rendre la bonne largeur au premier octet.
 */
export async function getModeIconesDuMenu(): Promise<ModeIcones> {
  const cookieStore = await cookies();
  return modeIconesDepuisCookie(cookieStore.get(COOKIE_MENU_ICONES)?.value);
}
```

- [ ] **Étape 5 : le layout** — `src/app/(dashboard)/app/layout.tsx` : importer `getModeIconesDuMenu`
  avec ses voisins de `@/lib/session` ; après `typeProfilActif` :

```ts
  // TCK-2480 (AC5) — la barre réduite aux icônes, réglage de l'appareil : lue ici pour que la largeur
  // soit dans le HTML serveur.
  const modeIcones = await getModeIconesDuMenu();
```

  et `modeIcones={modeIcones}` sur `<AppShell>`. Dans les QUATRE tests de R8, ajouter
  `getModeIconesDuMenu: async () => 'auto' as const` à leur `vi.mock('@/lib/session', …)`.

- [ ] **Étape 6 : `AppShell.tsx`** — `<AppSidebar … tiroir />` sur le montage du `SheetContent`.

- [ ] **Étape 7 : `styles-de-la-barre.ts`** — ajouter :

```ts
/** TCK-2480 — le libellé d'une ligne : lu par le lecteur d'écran dans tous les modes, caché à l'œil réduite. */
export const LIBELLE_DE_LIGNE = 'truncate icones:sr-only';
```

  et ajouter `icones:hidden` à `STYLE_EPINGLE`.

- [ ] **Étape 8 : `AppSidebar.tsx` — le mode, l'attribut, les infobulles**
  - Imports : `Tooltip, TooltipContent, TooltipTrigger` (`@/components/ui/tooltip`), `Home`,
    `PanelLeftClose`, `PanelLeftOpen` (lucide), `type ModeIcones`, `useIconesEffectives`, `LIBELLE_DE_LIGNE`.
  - `AppSidebarProps` reçoit :

```ts
  /** TCK-2480 — le montage du tiroir (`Sheet`, sous `md`) : jamais réduit aux icônes. */
  tiroir?: boolean;
```

  - Dans le corps, après `prefs` :

```ts
  // TCK-2480 (A10, A11) — le mode de l'appareil : `data-menu` sur la barre, la largeur en CSS
  // (variante `icones:`). Les variantes compactes ne sont RENDUES que si la barre peut se réduire.
  const modeIcones: ModeIcones = tiroir ? 'complet' : prefs.modeIcones;
  const reductible = modeIcones !== 'complet';
  const infobulle = useIconesEffectives(modeIcones);
```

  - L'`aside` :

```tsx
    <aside
      data-menu={modeIcones}
      className={cn(
        'flex h-full w-64 flex-col bg-card transition-[width] duration-200 motion-reduce:transition-none icones:w-16 icones:pt-5',
        className,
      )}
    >
```

  - `SidebarItem` reçoit `readonly infobulle?: boolean;` ; son lien passe sous une infobulle et ses
    classes se réduisent :

```tsx
  const lien = (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={nomAccessible}
            className={cn(
              'relative flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors max-md:py-2.5 icones:justify-center icones:px-0',
              FOCUS_RING,
              active ? 'bg-border text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted',
              emphasized && !active && 'text-foreground font-semibold',
            )}
          />
        }
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className={LIBELLE_DE_LIGNE}>{label}</span>
        {counterKey && counter && counter > 0 ? (
          <SidebarCounter value={counter} label={libelleCompteur(counterKey, counter)} />
        ) : null}
        {valeur !== undefined ? (
          <span
            data-slot="valeur-entree"
            className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground md:hidden"
          >
            {valeur}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
```

    La ligne cadenassée : `icones:justify-center icones:px-0` sur le `span role="link"`, `LIBELLE_DE_LIGNE`
    sur son libellé, `icones:hidden` sur le cadenas. `SidebarCounter` : ajouter
    `icones:absolute icones:right-0.5 icones:top-0.5 icones:ml-0 icones:min-w-4 icones:px-1 icones:text-[10px]`
    (le lien est `relative`). `rendreEntree` passe `infobulle={infobulle}`.
  - `GroupeDuMenu` reçoit `readonly infobulle: boolean` : le `<p>` de titre prend `icones:sr-only` et
    est suivi de `<div aria-hidden className="mx-2 my-1 hidden h-px bg-border icones:block" />` ; le
    bouton de bascule prend `icones:justify-center icones:px-0`, son libellé `truncate icones:sr-only`, et
    passe sous `<Tooltip disabled={!infobulle}><TooltipTrigger render={<button … />}>…</TooltipTrigger><TooltipContent side="right">{libelle}</TooltipContent></Tooltip>` ;
    `!premier && 'mt-4 icones:mt-2'`.
  - L'action principale : son `Link` passe sous la même infobulle (`libelleAction`), prend
    `icones:justify-center icones:px-0`, l'icône `icones:mt-0`, le libellé `icones:sr-only`.
  - Le pied (`<div className="px-3 pb-4">`), dans l'ordre :

```tsx
        {menu.carte ? (
          <>
            <div className={reductible ? 'icones:hidden' : undefined}>
              <CarteDeMiseEnLocation href={lien(menu.carte)} onNavigate={onNavigate} />
            </div>
            {reductible ? (
              <LienDePied
                href={lien(menu.carte)}
                icone={Home}
                libelle={t('carteLocation.titre')}
                infobulle={infobulle}
                onNavigate={onNavigate}
                className="hidden icones:flex"
              />
            ) : null}
          </>
        ) : null}
        {showProUpgradeCard ? (
          <div className="icones:hidden">
            <ProUpgradeCard pending={Boolean(hasPendingUpgrade)} onNavigate={onNavigate} />
          </div>
        ) : null}
        {isSuperAdmin(user.roles) ? (
          <LienDePied href={HREF_CONSOLE} icone={ShieldCheck} libelle={t('console')} infobulle={infobulle} onNavigate={onNavigate} />
        ) : null}
        {!tiroir && prefs.actif ? (
          <BasculeDesIcones mode={modeIcones} infobulle={infobulle} onBasculer={() => prefs.choisirModeIcones(infobulle ? 'complet' : 'icones')} />
        ) : null}
        <SidebarUserFooter user={user} onNavigate={onNavigate} />
```

    avec, au-dessus d'`AppSidebar` :

```tsx
interface LienDePiedProps {
  readonly href: string;
  readonly icone: LucideIcon;
  readonly libelle: string;
  readonly infobulle: boolean;
  readonly onNavigate?: () => void;
  readonly className?: string;
}

/** TCK-2480 — un lien de pied de barre (console, carte réduite) : icône et libellé ; réduite, une infobulle. */
function LienDePied({ href, icone: Icone, libelle, infobulle, onNavigate, className }: LienDePiedProps) {
  return (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted max-md:py-2.5 icones:justify-center icones:px-0',
              FOCUS_RING,
              className,
            )}
          />
        }
      >
        <Icone className="size-4 shrink-0" aria-hidden />
        <span className={LIBELLE_DE_LIGNE}>{libelle}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{libelle}</TooltipContent>
    </Tooltip>
  );
}

interface BasculeDesIconesProps {
  readonly mode: ModeIcones;
  readonly infobulle: boolean;
  readonly onBasculer: () => void;
}

/**
 * TCK-2480 (A10) — le bouton du pied de barre : il choisit le mode explicite OPPOSÉ à l'état effectif.
 * Son nom suit l'état : en `auto`, les deux libellés sont rendus et le CSS en montre un (le serveur ne
 * sait pas lequel) ; en mode explicite, un seul.
 */
function BasculeDesIcones({ mode, infobulle, onBasculer }: BasculeDesIconesProps) {
  const t = useTranslations('nav.sidebar.icones');
  const auto = mode === 'auto';
  return (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onBasculer}
            className={cn(
              'mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted icones:justify-center icones:px-0',
              FOCUS_RING,
            )}
          />
        }
      >
        {mode !== 'icones' ? <PanelLeftClose className={cn('size-4 shrink-0', auto && 'icones:hidden')} aria-hidden /> : null}
        {mode !== 'complet' ? <PanelLeftOpen className={cn('size-4 shrink-0', auto && 'hidden icones:block')} aria-hidden /> : null}
        {mode !== 'icones' ? <span className={auto ? 'icones:hidden' : undefined}>{t('reduire')}</span> : null}
        {mode !== 'complet' ? <span className={auto ? 'hidden icones:inline icones:sr-only' : 'sr-only'}>{t('deplier')}</span> : null}
      </TooltipTrigger>
      <TooltipContent side="right">{infobulle ? t('deplier') : t('reduire')}</TooltipContent>
    </Tooltip>
  );
}
```

    (`LucideIcon` : `import type { LucideIcon } from 'lucide-react'`.) `SidebarUserFooter` : le lien prend
    `icones:justify-center icones:px-0`, l'`Avatar` reste, le bloc de texte prend `icones:sr-only`.
  - La bande : `<BandeATraiter … reductible={reductible} />`.

- [ ] **Étape 9 : `EnTeteDEspace.tsx`** — `<div className="px-3 pb-3 md:pt-5 icones:hidden">` et, dans
  son docblock : « TCK-2480 — cachée quand la barre est réduite : le sélecteur reste dans la barre haute
  dès 768 px (`ProfileSwitcher`, TCK-505 #1). »

- [ ] **Étape 10 : `BandeATraiter.tsx`** — prop `readonly reductible?: boolean;` (défaut `false`) ;
  imports `Inbox` (lucide), `Popover, PopoverContent, PopoverTrigger` (`@/components/ui/popover`). Les
  deux `<ul>` existants prennent `icones:hidden`. Après eux, dans la `<section>` :

```tsx
      {/* TCK-2480 (A11) — barre réduite : une icône qui porte le total et ouvre les MÊMES pastilles.
          Rendue seulement si la barre peut se réduire : en `complet`, aucun doublon à lire. */}
      {reductible ? (
        <Popover open={ouvertReduite} onOpenChange={setOuvertReduite}>
          <PopoverTrigger
            aria-label={t('compact', { count: total })}
            className={cn(
              'relative hidden size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted icones:flex',
              FOCUS_RING,
            )}
          >
            <Inbox className="size-4" aria-hidden />
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-muted-foreground px-1 text-[10px] font-semibold leading-4 tabular-nums text-background"
            >
              {t('totalCourt', { count: Math.min(total, 100) })}
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-64 p-3">
            <ul className="flex flex-wrap gap-1.5">{[...visibles, ...autres].map(pastilleReduite)}</ul>
          </PopoverContent>
        </Popover>
      ) : null}
```

  avec, dans le composant (avant le `return null` anticipé, hooks d'abord) :
  `const [ouvertReduite, setOuvertReduite] = useState(false);`,
  `const total = [...visibles, ...autres].reduce((somme, p) => somme + p.nombre, 0);`, et
  `pastilleReduite` = `pastille` dont le `onClick` ferme aussi le popover
  (`() => { setOuvertReduite(false); onNavigate?.(); }`). Pastille : pas de couleur primaire (elle reste
  à l'action principale, S5).

- [ ] **Étape 11 : lancer, constater le vert** — commande de l'étape 3 de la tâche 5, plus :
  `npx vitest run src/lib/navigation/__tests__/mode-icones.test.ts "src/app/(dashboard)/app" src/components/layout src/components/profile`.
  Attendu : PASS.

- [ ] **Étape 12 : la variante compile** — `./dev.sh` (front), ouvrir `/app` connecté, et relever dans
  la feuille de style servie qu'existent la règle `icones:w-16` sous `[data-menu="icones"]` ET sous
  `@media (width >= 48rem) and (width < 64rem)` + `[data-menu="auto"]`. (La mesure de largeur est la
  tâche 8.)

- [ ] **Étape 13 : ablations**
  1. Dans le layout, `modeIcones="auto"` en dur (cookie ignoré) → `layout.mode-icones.test.tsx` rougit (`icones`, `complet`).
  2. Dans `globals.css`, la plage `(width < 70rem)` → `mode-icones.test.ts` « au caractère près » rougit.
  3. Dans `AppSidebar`, décider `data-menu` après l'hydratation (`useIconesEffectives(…) ? 'icones' : 'complet'`) → « rendu serveur … `data-menu` » rougit pour `auto`.
  4. Retirer `tiroir ? 'complet' :` → « le tiroir n'est jamais réduit » rougit.

- [ ] **Étape 14 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): la barre réduite aux icônes, par défaut entre md et lg, juste au premier octet (TCK-2480)`.

---

### Tâche 7 : la section « Menu » du profil

**Fichiers :** créer `src/components/profile/ProfileMenuSection.tsx`,
`src/components/profile/__tests__/ProfileMenuSection.test.tsx` ; modifier
`src/app/(dashboard)/app/profile/page.tsx`, `src/messages/{fr,en,wo}.json`.

- [ ] **Étape 1 : les libellés** — sous `profile.menu` (le `wo` = le `fr`) :

| Clé | fr | en |
|---|---|---|
| `titre` | Menu | Menu |
| `texte` | Vos épingles et les groupes repliés du menu « {persona} » vous suivent sur tous vos appareils. | Your pins and collapsed groups in the “{persona}” menu follow you on every device. |
| `personnalise` | Votre menu est personnalisé. | Your menu is customised. |
| `dejaParDefaut` | Votre menu suit la disposition par défaut. | Your menu follows the default layout. |
| `reinitialiser` | Revenir au menu par défaut | Restore the default menu |
| `appareil.label` | Barre latérale sur cet appareil | Sidebar on this device |
| `appareil.auto` | Automatique : réduite aux icônes sur un écran moyen | Automatic: icons only on medium screens |
| `appareil.icones` | Toujours réduite aux icônes | Always icons only |
| `appareil.complet` | Toujours complète | Always full |
| `appareil.aide` | Ce réglage ne vaut que pour ce navigateur. | This setting only applies to this browser. |

- [ ] **Étape 2 : écrire le test qui échoue** — `ProfileMenuSection.test.tsx` :

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { DELAI_D_ENVOI_MS, PreferencesDuMenuProvider } from '@/components/layout/PreferencesDuMenu';
import { ProfileMenuSection } from '../ProfileMenuSection';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function rendre(navigation?: unknown) {
  render(
    withIntl(
      <ToastProvider>
        <PreferencesDuMenuProvider navigationInitiale={navigation} persona="agent" modeIconesInitial="auto">
          <ProfileMenuSection />
        </PreferencesDuMenuProvider>
      </ToastProvider>,
    ),
  );
}

describe('ProfileMenuSection — TCK-2480', () => {
  it('revenir au menu par défaut efface le persona ACTIF, et lui seul', async () => {
    const user = userEvent.setup();
    rendre({ v: 1, personas: { agent: { epingles: ['commissions'] }, bailleur: { replies: ['activite'] } } });
    expect(screen.getByText(/menu « Agent »/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revenir au menu par défaut' }));
    expect(screen.getByText('Votre menu suit la disposition par défaut.')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: DELAI_D_ENVOI_MS + 1000 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      navigation: { v: 1, personas: { bailleur: { replies: ['activite'] } } },
    });
  });

  it('un menu déjà par défaut : le bouton est inactif', () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Revenir au menu par défaut' })).toBeDisabled();
  });

  it('sans fournisseur, rien ne se rend', () => {
    const { container } = render(withIntl(<ProfileMenuSection />));
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Étape 3 : lancer, constater l'échec.**
  Run : `npx vitest run src/components/profile/__tests__/ProfileMenuSection.test.tsx`

- [ ] **Étape 4 : `ProfileMenuSection.tsx`**

```tsx
'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePreferencesDuMenu } from '@/components/layout/PreferencesDuMenu';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { estParDefaut, prefsDe } from '@/lib/navigation/preferences';

const MODES: readonly ModeIcones[] = ['auto', 'icones', 'complet'];

/**
 * TCK-2480 (ADR-0089 §6) — le profil → « Menu » : revenir à la disposition par défaut du persona
 * ACTIF (épingles, replis, « Démarrer » masqué — A9), et choisir le mode de la barre sur CET appareil
 * (A10 : le seul chemin de retour à « Automatique »). Rien sans le fournisseur de la coque.
 */
export function ProfileMenuSection() {
  const t = useTranslations('profile.menu');
  const tPersonas = useTranslations('nav.sidebar.personas');
  const idTitre = useId();
  const idMode = useId();
  const prefs = usePreferencesDuMenu();
  if (!prefs.actif || prefs.persona === null) return null;
  const persona = prefs.persona;
  const parDefaut = estParDefaut(prefsDe(prefs.navigation, persona));
  const options = MODES.map((mode) => ({ value: mode, label: t(`appareil.${mode}`) }));

  return (
    <section aria-labelledby={idTitre} className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 id={idTitre} className="text-lg font-bold text-foreground">
          {t('titre')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('texte', { persona: tPersonas(persona) })}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground" aria-live="polite">
          {parDefaut ? t('dejaParDefaut') : t('personnalise')}
        </p>
        <Button type="button" variant="outline" disabled={parDefaut} onClick={() => prefs.reinitialiser(persona)}>
          {t('reinitialiser')}
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor={idMode}>{t('appareil.label')}</Label>
        <Select
          value={prefs.modeIcones}
          onValueChange={(suivant) => {
            const mode = MODES.find((m) => m === suivant);
            if (mode) prefs.choisirModeIcones(mode);
          }}
          items={options}
        >
          <SelectTrigger id={idMode} className="w-full sm:w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('appareil.aide')}</p>
      </div>
    </section>
  );
}
```

- [ ] **Étape 5 : `profile/page.tsx`** — `<ProfileMenuSection />` juste après `<ProfileTimezoneSection … />`,
  avec le commentaire `{/* TCK-2480 — le menu de la console : réinitialiser le persona actif, et la barre de cet appareil. */}`.

- [ ] **Étape 6 : lancer, constater le vert** — commande de l'étape 3, puis `npx vitest run src/components/profile "src/app/(dashboard)/app/profile"`.

- [ ] **Étape 7 : ablations**
  1. `prefs.reinitialiser('bailleur')` en dur → « efface le persona ACTIF, et lui seul » rougit.
  2. Retirer `disabled={parDefaut}` → « déjà par défaut : inactif » rougit.

- [ ] **Étape 8 : `npx tsc --noEmit && npm run lint && npm run check:i18n`**, puis commit —
  `feat(web): la section « Menu » du profil — revenir au menu par défaut, la barre de cet appareil (TCK-2480)`.

---

### Tâche 8 : mesure au navigateur, notes et livraison

> ⚠ Une commande de plus de ~9 minutes est coupée sans rien dire : une mesure par commande. Méthode :
> `docs/qa/responsive-2026-09-02.md`, CDP direct (mémoire « Mesure au navigateur par CDP direct ») ;
> chaque commande sous `perl -e 'alarm …'` (mémoire « Chien de garde des Workflows »).

- [ ] **Étape 1 : préparer** — `./dev.sh` (API avec la tâche 1, front). Relever dans
  `takussan-api/database/seeders/` un compte agent ; un compte agent ET bailleur (sinon, créer le
  profil bailleur par l'assistant `/onboarding/owner` et l'écrire).

- [ ] **Étape 2 : AC5 — la largeur au premier octet.** Dans Chrome à 900 × 800 :
  1. **JavaScript coupé** (`Emulation.setScriptExecutionDisabled`), sans cookie `menu_icones` : charger
     `/app`, relever `document.querySelector('aside[data-menu]')` → `data-menu="auto"`,
     `getBoundingClientRect().width === 64`.
  2. JavaScript actif, même page : un `PerformanceObserver({ type: 'layout-shift', buffered: true })`
     posé avant le chargement (`Page.addScriptToEvaluateOnNewDocument`) ; largeur relevée au
     `DOMContentLoaded` puis 2 s après le `load` : 64 et 64 ; aucun décalage attribué à l'`aside`.
  3. Cookie `menu_icones=0` (`Network.setCookie`, `path=/app`) : 256 px JS coupé, 256 px JS actif.
  4. Cookie `menu_icones=1` à 1366 px : 64 ; sans cookie à 1366 : 256 ; sans cookie à 768 : 64, à
     1024 : 256 (bornes).
  5. **Ablation** : retirer le bloc `@media` de la variante dans `globals.css` → à 900 px sans cookie,
     256 ; rétablir, re-mesurer 64.
  6. Bascule du pied de barre à 900 px (sans cookie) → 256 et `document.cookie` contient
     `menu_icones=0` ; recharger → 256 dès le HTML.
  7. Barre réduite : infobulle au survol et au FOCUS d'une entrée ; la bande « À traiter » réduite à une
     icône portant le total, qui ouvre ses pastilles ; `scrollWidth − innerWidth = 0`.

- [ ] **Étape 3 : AC1 / AC2 au navigateur.** Compte agent : épingler « Commissions » au clavier (Tab
  depuis la ligne, Entrée) ; recharger → dans « Épinglés », absente de « Gestion » ; ouvrir un SECOND
  navigateur (contexte CDP neuf, `Target.createBrowserContext`), se connecter → l'épingle y est. Basculer
  sur le profil bailleur du même compte → pas d'« Épinglés ». Couper l'API (`docker compose stop` n'est
  PAS l'outil : bloquer la requête par `Fetch.enable` + `Fetch.failRequest` sur `*/api/me`) puis
  épingler → le toast, et l'épingle revient. Profil → « Menu » → « Revenir au menu par défaut » → la
  barre redevient celle de la disposition.

- [ ] **Étape 4 : les gardes du dépôt** —
  `for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`, puis, dans `takussan-web/`,
  `npx tsc --noEmit && npm run lint && npm run check:i18n`, et dans `takussan-api/`,
  `./vendor/bin/pint --test` sur les fichiers touchés (AC7).

- [ ] **Étape 5 : notes du ticket** — dans `TCK-2480` : les arbitrages retenus (A1-A14) et ceux que la
  session a changés ; les écarts au plan et aux suppositions S1-S8 ; les ablations et leur résultat ;
  les relevés de l'étape 2 (largeurs, JS coupé/actif, décalages) et de l'étape 3 ; la mise à jour de
  `docs/models-spec.md#1-user` laissée à `/sync-specs` après le merge (A14). `status: doing`,
  `node docs/backlog/ranger-tickets.mjs`. Commit : `docs(backlog): mesure au navigateur de TCK-2480`.

- [ ] **Étape 6 :** demander au porteur l'accord de push ; avec l'accord : push, PR vers `dev`, la CI
  joue les suites (API CI et Web CI doivent TOUTES DEUX tourner : la fixture les réveille).
