# TCK-2482 — La palette de commandes ⌘K / Ctrl K : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).
>
> ⚠ **Ne démarre qu'une fois TCK-2479, TCK-2480 et TCK-2481 mergés sur `dev`** (règle 2 du backlog ; la
> palette consomme les deux crochets que TCK-2481 sort d'`AppSidebar`, et le fournisseur de préférences de
> TCK-2480 vit dans la même coque). Branche à tirer de `dev` à jour : `feat/palette-de-commandes-tck-2482`.

**But :** aller n'importe où dans son espace, ou changer d'espace, en tapant trois lettres. Une palette
ouverte par ⌘K / Ctrl K ou par un bouton de la barre haute propose, groupés : l'action principale ➊, ce
qui attend (« À traiter »), les pages récentes, tout le menu rendu (« Aller à », « Plus » et complément
« Aussi … » compris) et les autres espaces (« Passer à : … »).

**Architecture :** deux fonctions pures dans `src/lib/navigation/palette.ts` — `optionsDeLaPalette`
(ce qu'elle propose, lu sur le MENU RENDU, jamais sur le catalogue) et `chercherDansLaPalette` (repli des
accents, synonymes, pertinence dans un groupe) — et un stockage local `pages-recentes.ts`. Le composant
`PaletteDeCommandes` (Base UI `Dialog` + motif ARIA combobox/listbox écrit à la main, patron de
`GlobalSearch`) les rend ; il compose le menu par `useMenuDeLEspace` et lit les compteurs par
`useCompteursDuMenu` (TCK-2481). `AppShell` porte l'état ouvert/fermé, le raccourci et la mémoire des
pages ; `AppTopbar` porte le bouton.

**Pile :** Next.js 16, React 19 (React Compiler), TypeScript 5, vitest 4 + Testing Library + axe-core
4.13, next-intl 4, Base UI 1.7 (`Dialog`), lucide-react. **Aucune dépendance neuve, aucune Radix, pas
de `cmdk`.**

**Références :** [ADR-0089](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) ·
[TCK-2482](../backlog/tickets/doing/TCK-2482-palette-de-commandes.md) · plans précédents :
[TCK-2478](2026-11-05-tck-2478-dispositions-par-persona.md),
[TCK-2479](2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md),
[TCK-2480](2026-11-05-tck-2480-personnalisation-du-menu.md),
[TCK-2481](2026-11-05-tck-2481-barre-d-onglets-mobile.md).

## Contraintes globales

- **La palette ne juge aucun accès.** Elle lit ce que la barre rend (`useMenuDeLEspace` : persona,
  `composerMenu`, cadenas) ; une destination que le menu ne rend pas — inaccessible au compte, ou
  cadenassée — n'y paraît jamais. Elle n'importe pas `CATALOGUE` (hors tests).
- **Aucun code de production de la palette n'appelle `estOuverte` ni `composerMenu`** : tout passe par
  `useMenuDeLEspace`, qui reçoit l'objet de contexte du menu TEL QUEL (A17). Ce sont les deux gardes que
  TCK-2483 posera après ce ticket (S8) ; la palette doit y être conforme dès sa livraison. Les tests de
  `src/lib/navigation/__tests__/` appellent `composerMenu` et `estOuverte` librement (les gardes ignorent
  les `__tests__`).
- Aucune recherche de données métier (biens, clients, baux) : hors périmètre.
- Seules écritures : celles que la barre fait déjà (l'action ➊ est un LIEN ; la bascule passe par
  `useSwitchActiveProfile`, la chaîne du sélecteur, sans chemin neuf).
- Chaque clé i18n neuve en `fr`, `en`, `wo` (le `wo` = le français tel quel, wolof en pause). Aucun texte
  affiché en dur — raccourcis `⌘ K` / `Ctrl K` compris.
- `md:` n'est pas le bureau dans `/app` (TCK-505) ; rien ne se pose en colonnes.
- Pas de `useMemo`/`useCallback` neuf (React Compiler). Props en `interface XxxProps`, champs `readonly`.
- Jamais de suite entière en local : les fichiers touchés (`npx vitest run <chemins>`), puis la CI.
- Avant chaque commit front : `npx tsc --noEmit && npm run lint && npm run check:i18n &&
  npm run check:i18n-namespaces && npm run check:classes-emises` (dans `takussan-web/`).
- Commits en français, préfixés, citant `TCK-2482`, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Un commit par tâche.

### Le script d'ablation (à écrire une fois, dans ton scratchpad)

Chaque ablation mute, teste et restaure dans UN script ; rien ne reste en place.

```bash
#!/usr/bin/env bash
# ablation.sh — usage : bash ablation.sh <fichier relatif à takussan-web> '<expression perl -0pe>' <tests…>
# L'expression ne contient AUCUNE apostrophe (utiliser \x27 au besoin).
set -u
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
F="$1"; EXPR="$2"; shift 2
SAUVE="$(mktemp)"
cp "$F" "$SAUVE"
perl -0pi -e "$EXPR" "$F"
if cmp -s "$F" "$SAUVE"; then echo "✗ MUTATION SANS EFFET — l'expression ne correspond à rien"; cp "$SAUVE" "$F"; rm -f "$SAUVE"; exit 2; fi
npx vitest run "$@"; CODE=$?
cp "$SAUVE" "$F"; rm -f "$SAUVE"
git diff --stat -- "$F"
echo "code vitest = $CODE (attendu : différent de 0)"
```

Après chaque ablation : `git diff --stat` ne doit montrer QUE les changements de la tâche.

---

## Relevés (mesurés le 2026-11-05 sur `feat/bande-a-traiter-tck-2479`, `b837e053e` — TCK-2478 mergé, TCK-2479 en cours dans l'arbre)

### R1 — Qui utilise déjà ⌘K / Ctrl K

`grep -rnE "metaKey|ctrlKey" takussan-web/src` (hors tests) :

| Fichier:ligne | Ce que c'est | Conflit avec la palette ? |
|---|---|---|
| `src/components/admin/super/GlobalSearch.tsx:42-52` (condition l. 45) | **⌘K / Ctrl K** : la recherche globale de la console plateforme (TCK-600). Écoute `window`, `preventDefault()`, ouvre son `Dialog`. | **Non** : montée par `SuperAdminTopbar.tsx:8,81`, coque `/super-admin`. `AppShell` et `SuperAdminShell` ne sont jamais montés ensemble. |
| `src/components/admin/super/radar/fiche/useRaccourcisFiche.ts:28,35` | Ctrl/⌘ + Entrée sur la fiche Radar ; ignore toute combinaison Ctrl/⌘ pour ses raccourcis à une touche. | Non (console, et pas la touche K). |
| `src/components/home/Navbar.tsx:184`, `auth/RetourAuth.tsx:94`, `shared/BoutonRetour.tsx:47`, `shared/IndicateurDeNavigation.tsx:51`, `search/Pagination.tsx:79` | Détection d'un clic modifié (ouvrir dans un onglet). | Non (clic, pas clavier). |

**Éditeurs riches : aucun.** `package.json` ne porte ni tiptap, ni lexical, ni quill, ni slate, ni
prosemirror, ni codemirror, ni monaco ; `grep -rn "contentEditable\|contenteditable" src` ne rend rien.
Aucun champ de `/app` n'utilise ⌘K aujourd'hui. La règle retenue (arbitrage A6) tient pour l'avenir
sans liste : un champ qui se sert du raccourci l'intercepte et appelle `preventDefault()` ; la palette
s'efface devant `defaultPrevented`, et devant tout `contenteditable`.

### R2 — La recherche tolérante aux accents existe déjà

| Fichier:ligne | Forme | Exportée ? |
|---|---|---|
| `src/components/ui/combobox.tsx:34-40` | `replierPourRecherche` : NFD, diacritiques `[̀-ͯ]` retirés, `toLocaleLowerCase('fr')`, tirets/apostrophes/blancs → une espace, `trim` (TCK-633, TCK-788). | **Oui** |
| `src/types/search.ts:746-748` | `plier` (`\p{Diacritic}`) | non |
| `src/lib/highlightMatch.ts:7-12` | `normalize` (`\p{Diacritic}`) | non |
| `src/lib/suggestions-de-recherche.ts:89-93`, `src/lib/libelle-equipement.ts:50`, `admin/super/AgencyOnboardingDialog.tsx:326`, `radar/fiche/passage.ts:66` | repli local | non |

→ La palette réutilise `replierPourRecherche` (A10) : une règle de repli de plus serait la huitième.

### R3 — Basculer de profil, et ce qui recompose le menu

- `useMyProfiles()` (`src/hooks/useProfiles.ts:55`) : `GET /api/me/profiles` par le relais, clé
  `CLE_PROFILS`, `staleTime` 30 s.
- `useSwitchActiveProfile()` (`src/hooks/useProfiles.ts:65-131`) : `PATCH /api/me/active-profile` ;
  `onMutate` (l. 75) déplace l'actif dans le cache des profils ; `onSuccess` : `setActiveProfileId`
  (l. 92, TCK-2050), toast « Espace basculé sur … », **`router.refresh()` (l. 101)** — le layout serveur
  relit le cookie — puis `oublierLeCacheDEspace(queryClient)` (l. 107 ; `src/lib/cache-d-espace.ts:21` :
  `resetQueries` de tout sauf les profils) ; `onSettled` (l. 119) : invalide profils, `roles`,
  `permissions`, et `refreshUser()` (l. 126).
- **Le menu se recompose par le SERVEUR** : `src/app/(dashboard)/app/layout.tsx:95` calcule
  `typeProfilActif = typeDuProfilActif(await getActiveProfileId())` et le passe à `AppShell` (l. 107),
  avec le `user` (et ses `roles` de l'espace) relu. `router.refresh()` rend donc une nouvelle coque :
  barre, tiroir, onglets et palette recomposés, sans code de plus.
- `ProfileSwitcher` (`src/components/profile/ProfileSwitcher.tsx:87-96, 230`) : `useMyProfiles`,
  `useSwitchActiveProfile`, `espacesAProposer(profils, activeId)` (`src/lib/espaces.ts:54`, TCK-497 : une
  agence `individual` ne présente qu'un espace), libellé `profileShortLabel(profil, tTypes)`
  (`ProfileBadge.tsx:134` : « Propriétaire · Agence X »).

### R4 — Où vit le cookie `active_profile_id`

- Nom : `ACTIVE_PROFILE_COOKIE` (`src/lib/profiles.ts:5`).
- Posé par le relais `src/app/api/me/active-profile/route.ts:28-34` : `httpOnly`, `secure` en
  production, `sameSite: 'lax'`, `path: '/'`, 30 jours. Aussi par les actions d'onboarding
  (`src/app/actions/*-onboarding.ts`, `auto-onboard.ts`).
- Lu par `getActiveProfileId()` (`src/lib/session.ts:28-32`) — `undefined` sous impersonation (TCK-600).
- Le navigateur ne le lit pas (`httpOnly`) : `AuthContext` en tient un double (`setActiveProfileId`,
  `src/context/AuthContext.tsx:138`) pour l'en-tête des appels.

### R5 — Le `Dialog` de Base UI et le retour du focus

`src/components/ui/dialog.tsx` : `DialogContent` étale ses props sur `DialogPrimitive.Popup` et monte un
bouton de fermeture `absolute top-2 right-2`. Base UI 1.7.0
(`node_modules/@base-ui/react/dialog/popup/DialogPopup.d.ts:24,34`) : `initialFocus` et `finalFocus`
acceptent `boolean | RefObject | (type) => boolean | HTMLElement | null | void` ; par défaut, le focus
revient « au déclencheur ou à l'élément focalisé avant ». Ouverte par un raccourci, la palette n'a pas de
déclencheur ; touchée au doigt sur Safari iOS, un bouton n'est pas focalisé (même constat que TCK-2481,
arbitrage 10). Le popup porte `role="dialog"` et `data-open` quand il est ouvert
(`DialogPopupDataAttributes.d.ts:5`). Le contenu du popup n'est monté que pendant l'ouverture.

### R6 — Le patron de combobox du dépôt

`GlobalSearch.tsx:70-190` (TCK-600) : `Dialog` + `Input role="combobox"` + `aria-controls` /
`aria-activedescendant`, `role="listbox"` > `role="group"` > `role="option"`, flèches et Entrée sur le
champ ; testé par `GlobalSearch.test.tsx:53` (`u.keyboard('{Control>}k{/Control}')` dans jsdom).

### R7 — Tests axe

`axe-core` 4.13.0 (`package.json:52`) ; patron : `import axe from 'axe-core'` puis
`expect((await axe.run(élément)).violations).toEqual([])` (`DemarrerDeLEspace.test.tsx:11`,
`ui/__tests__/date-time-picker.nom-du-dialogue.test.tsx:137`).

### R8 — Stockage local : un patron et une politique

- Patron : `src/lib/recherches-recentes.ts` (TCK-2475) — clé `takussan.…`, lecture et écriture sous
  `try/catch`, plafond, la plus récente en tête ; testé par `src/lib/__tests__/recherches-recentes.test.ts`.
- La politique de confidentialité ÉNUMÈRE ce que le stockage local garde
  (`src/content/legal/privacy.ts:169` fr, `:346` en) et son en-tête (l. 6-8) exige qu'« un nouveau
  traceur [soit] reporté ici dans le même changement » ; `src/content/legal/README.md` exige que la date
  de version avance, et `scripts/check-terms-version.mjs` lie `VERSION_DOCUMENTS` à
  `PublishReadiness::TERMS_VERSION` de l'API. Précédent : TCK-2472 (`ca955de7f`) a touché ensemble
  `privacy.ts`, `editeur.ts`, `PublishReadiness.php` et `textes.test.ts`.
- ⚠ Constat hors ticket : les « dernières recherches » de TCK-2475 (`takussan.recherches-recentes`)
  ne sont PAS nommées dans cette liste. Ce plan ne les ajoute pas (hors périmètre) — à signaler.

### R9 — i18n par frontière

`messagesPour('(dashboard)/app')` sert les espaces de premier niveau listés par
`src/i18n/namespaces.json` (généré) : `nav` et `profile` y sont (mesuré). Les clés neuves vivent donc sous
`nav.palette` : aucun espace de premier niveau neuf, `check:i18n-namespaces` reste vert.
`t.has(…)` est déjà employé (`GlobalSearch.tsx:113`). Les trois fichiers de messages se relisent et se
réécrivent à l'identique par `JSON.stringify(…, null, 2) + '\n'` (mesuré : `true` pour les trois).

---

## Ce qu'on suppose (à re-mesurer à la tâche 0, avant tout code)

Lu dans les plans de TCK-2479, TCK-2480 et TCK-2481. Chaque écart se corrige au plus juste dans la
tâche qui le touche, et s'ÉCRIT dans le rapport.

| # | Supposition | Où ce plan s'en sert | Si elle est fausse |
|---|---|---|---|
| S1 | `src/components/layout/useMenuDeLEspace.ts` exporte `useMenuDeLEspace({ user, agencyIsStandard?, typeProfilActif?, agencySuspended? })` → `{ persona, menu, groupes, entrees }`, `groupes` portant le cadenas (`locked`). Avec TCK-2480, il lit lui-même les préférences ; il peut rendre aussi `groupesDeLaDisposition`. | T3 | **BLOQUÉ** : ne pas recomposer le menu dans la palette (« un persona calculé deux fois finit par diverger »). Rapporter. |
| S2 | `src/components/layout/useCompteursDuMenu.ts` exporte `useCompteursDuMenu(entrees, { agencyIsStandard?, actif? })` → `Record<NavCounterKey, number>`, « 0 sur erreur ». | T3 | BLOQUÉ, même raison. |
| S3 | `pastillesATraiter(entrees, comptes, priorites)` → `{ visibles, autres }` et `MenuCompose.priorites` (TCK-2479) — **vérifié** dans l'arbre relevé (`a-traiter.ts:33`, `composer-menu.ts:37`). | T3 | — |
| S4 | `MenuCompose` garde `persona`, `action`, `carte`, `groupes` ; un groupe `epingles` peut ouvrir la liste (TCK-2480) ; les entrées épinglées QUITTENT leur groupe d'origine (aucun doublon). | T1, T3 | Si une entrée paraît deux fois : dédoublonner par `href` dans `optionsDeLaPalette` et l'écrire. |
| S5 | `AppTopbar` n'a plus le bouton du tiroir ni `onMenuToggle`/`menuOpen` (TCK-2481) ; le groupe de droite garde `ml-auto flex min-w-0 shrink items-center gap-2` et commence par `<ProfileSwitcher user={user} />`. | T4 | Poser le bouton en tête de ce groupe, quel qu'en soit le reste. |
| S6 | `AppShell` monte `PreferencesDuMenuProvider` (TCK-2480) autour de la coque, `BarreDOnglets` (TCK-2481), et calcule peut-être déjà `pathname` (`porteLaBarreDOnglets`). | T4 | Réutiliser la variable existante ; la palette se monte DANS le fournisseur. |
| S7 | `AppShell.menu-et-credits.test.tsx` porte la liste à jour des `vi.mock` qu'exige une coque montée. | T4 | La recopier telle qu'elle est le jour venu. |
| S8 | **TCK-2483 passe APRÈS ce ticket** (ordre prévu : 2479 → 2480 → 2481 → 2482 → 2483 ; plan `2026-11-05-tck-2483-modules-actives-par-agence.md`, amendement « modules par agence » en fin d'ADR-0089). `ContexteDeMenu.masquees` n'existe donc PAS à l'exécution de ce plan, et la palette n'en sait rien. | T3, T4 | Si TCK-2483 est déjà sur `dev` : passer `modulesMasques` dans `contexteDuMenu` (A17) comme `AppSidebar`, relancer `src/lib/navigation/__tests__/modules.test.ts` et ajouter son test de l'AC10 sur la palette montée. L'écrire. |

**Ce que TCK-2483 posera après nous, et que la palette respecte dès sa livraison.** Ses deux gardes
(`src/lib/navigation/__tests__/modules.test.ts`, tâche 2 de son plan) lisent tout `src/` hors `__tests__` :

1. `estOuverte(` n'est appelée que dans `src/lib/navigation/` — la palette ne l'appelle nulle part ;
2. tout appelant de `composerMenu(` (hors `composer-menu.ts`) pose `masquees` par `destinationsMasquees(` —
   la palette n'appelle pas `composerMenu` : son seul appelant côté coque reste `useMenuDeLEspace`
   (TCK-2481), que TCK-2483 mettra à jour, et la palette en hérite par l'objet de contexte (A17).

Une palette qui lirait le catalogue brut, ou qui composerait son propre menu, rougirait ces gardes le
jour où TCK-2483 arrive — et montrerait d'ici là des modules que l'agence a masqués.

---

## Arbitrages (validés par la session le 2026-11-05, par délégation du porteur)

1. **A1 — Combobox écrit à la main, sur le patron de `GlobalSearch`** (R6), dans le `Dialog` de Base UI.
   Le `Combobox` de Base UI apporte son propre filtrage, sa sélection et un popup ancré au champ : il
   faudrait les neutraliser pour une liste groupée, en place, à pertinence maison. Le patron du dépôt est
   déjà éprouvé dans jsdom, raccourci compris.
2. **A2 — Les groupes, et quand ils paraissent.** Ordre fixe : Actions, À traiter, Récents, Aller à,
   Espaces. **Champ vide** : tout, dans cet ordre (« Récents » remonte avant « Aller à » : en bas d'une
   liste de trente entrées, il ne servirait à rien). **Avec une saisie** : « Récents » disparaît (ses
   entrées sont dans « Aller à »), les autres groupes sont filtrés ; la frappe ne réordonne qu'À
   L'INTÉRIEUR d'un groupe. **Aucun tri par usage** (ADR-0089 §5) : un récent ne remonte rien.
3. **A3 — La pertinence.** La saisie est repliée (`replierPourRecherche`) et coupée en mots ; une option
   n'est retenue que si CHAQUE mot correspond. Par mot : 4 si le libellé commence par lui, 3 si un mot du
   libellé commence par lui, 2 si un mot d'un synonyme commence par lui, 1 s'il est contenu dans le
   libellé ou un synonyme. Somme ; à égalité, l'ordre du menu. La précision (« Aussi administrateur »)
   n'est pas cherchée.
4. **A4 — Lecture de l'AC2.** Chez le locataire, « loyer » rend en premier l'action ➊ « Payer mon loyer »
   (vers `/app/payments`), puis « Paiements » en tête de « Aller à » (synonyme). Les deux mènent à
   Paiements ; le test exige les deux.
5. **A5 — Les sources.** Le menu RENDU par `useMenuDeLEspace` : ses `groupes` (épingles comprises, dans
   l'ordre affiché), « Plus » et « Aussi … » compris ; jamais une entrée cadenassée (`locked`) ; une
   entrée de « Aussi … » porte la précision du groupe (« Aussi agent »). La carte du client (« Mettre un
   bien en location », `menu.carte`) est dans « Aller à », sous son libellé de carte. **Hors palette** :
   « Démarrer » (des étapes, pas des destinations) et les liens du pied de barre (« Mon profil »,
   « Console plateforme ») — ils ne sont pas dans `MenuCompose`, et la palette ne lit que lui. Les y
   ajouter demande de les faire entrer au catalogue : ticket suivant si le porteur le veut.
6. **A6 — Le raccourci.** Ctrl + K ou ⌘ + K, sans Alt ni Maj, hors répétition. Ignoré si
   `defaultPrevented` (un champ qui s'en sert a la priorité), si la cible est dans un `contenteditable`,
   si un AUTRE dialogue est ouvert (`[role=dialog][data-open]` : tiroir, assistant d'accueil — deux
   modales empilées se disputent le focus), et en plein écran (`/app/properties/new` : le parcours porte
   sa propre sortie). Il marche depuis un champ de saisie (aucun ne l'utilise, R1). Palette ouverte, il la
   referme. `preventDefault()` : Firefox et Chrome sous Windows/Linux y mettent la recherche du navigateur.
7. **A7 — Retour du focus explicite.** La coque retient l'élément focalisé à l'ouverture (le bouton
   lui-même quand on l'a touché : Safari iOS ne le focalise pas) et le passe en `finalFocus` ; retiré du
   DOM entre-temps (navigation), le défaut de Base UI reprend.
8. **A8 — Les pages récentes.** La coque retient sur l'appareil chaque chemin `/app…` visité (hors plein
   écran) : clé `takussan.pages-recentes.<id du compte>` (un autre compte du même appareil ne les lit
   pas), huit chemins bruts, le plus récent d'abord, lecture et écriture sous `try/catch`. À
   l'affichage, chaque chemin se résout sur le menu D'AUJOURD'HUI (`resolveActiveHref`) : un chemin que le
   menu ne couvre plus disparaît (jamais une destination inaccessible), la page courante est exclue,
   cinq au plus, sans doublon.
9. **A9 — Les synonymes** vivent dans `nav.palette.synonymes.<idDestination>` (une chaîne, mots séparés
   par des virgules), lus par `t.has` / `t` ; une destination sans clé n'a pas de synonyme. Une garde vérifie
   que chaque clé est un identifiant du catalogue, et que « loyer » (fr) / « rent » (en) ne mènent qu'aux
   paiements. Le `wo` porte le français tel quel.
10. **A10 — Le repli** est `replierPourRecherche` (`components/ui/combobox.tsx`, R2), importé tel quel.
11. **A11 — Le bouton de la barre haute** : premier contrôle du groupe de droite, à TOUTES les largeurs
    (icône seule sous `lg` ; « Aller à… » et `Ctrl K` / `⌘ K` dès `lg`) — sous `md`, c'est la seule
    porte de la palette (pas de clavier). Icône `Search` (le ticket dit « bouton de recherche ») ; le
    champ de recherche de biens, lui, ne paraît que dès `lg` et porte son propre texte. Nom accessible
    « Aller à une page ou changer d'espace » (commence par le texte visible, WCAG 2.5.3),
    `aria-keyshortcuts="Control+K Meta+K"`. Plateforme détectée par `useSyncExternalStore` (serveur :
    `Ctrl K`), sans écart d'hydratation.
12. **A12 — Les espaces** : `espacesAProposer(profils, actif)` moins l'espace actif ; libellé
    « Passer à : » + `profileShortLabel` — les MÊMES mots que le sélecteur (« Propriétaire · Agence
    Teranga »), pas le nom du persona : deux surfaces qui nomment un espace différemment, c'est un
    utilisateur qui se demande s'il s'agit du même. Choisir = `useSwitchActiveProfile().mutate(id)` puis
    fermer : toast, `router.refresh()`, cache oublié — la chaîne du sélecteur, sans un geste de plus (R3).
13. **A13 — Les compteurs** : `useCompteursDuMenu(entrees, { agencyIsStandard })` tant que la palette est
    ouverte — mêmes clés de cache que la barre, aucun sondage palette fermée (son contenu n'est pas
    monté). « À traiter » = `pastillesATraiter(…, menu.priorites)`, visibles et autres.
14. **A14 — Mise en page** : le dialogue s'ancre en haut (`top-[10vh] translate-y-0`, `sm:max-w-xl`),
    la liste défile seule (`max-h-[min(60dvh,28rem)]`), le bouton de fermeture du `Dialog` reste (au doigt,
    pas d'Échap) et le champ lui laisse sa place (`pr-8`).
15. **A15 — La politique de confidentialité** nomme les pages récentes dans le même changement (R8, règle
    de son en-tête) ; la date de version avance, avec `TERMS_VERSION` de l'API (garde). ⚠ Effet connu,
    déjà payé par TCK-2472 la veille : une connexion par téléphone et une prise du Radar redemandent
    l'acceptation des CGU (`PhoneLoginService.php:130`, `RadarClaims.php:202`).
**Décision de la session sur A15** — validé : aucune production n'est servie (préproduction seule), la
re-acceptation ne coûte rien de réel. Le MÊME changement de `privacy.ts` nomme aussi les recherches
récentes de TCK-2475, qu'il omet aujourd'hui (relevé R8) : une seule avance de version pour les deux.

16. **A16 — `depends_on`** du ticket : `[TCK-2479, TCK-2480, TCK-2481]` (S1, S2, S6). TCK-2483 n'en est
    pas : c'est LUI qui passe après (S8).
17. **A17 — Un seul objet de contexte du menu, transmis tel quel.** La palette ne reçoit pas `user`,
    `agencyIsStandard`… champ par champ : elle reçoit `contexteDuMenu: Parameters<typeof useMenuDeLEspace>[0]`
    et le passe INTACT à `useMenuDeLEspace`. Le jour où TCK-2483 ajoute `modulesMasques` aux arguments du
    crochet, la palette n'a rien à changer : seul `AppShell` remplit l'objet, au même endroit que pour la
    barre. Champ par champ, un argument optionnel oublié ne ferait rougir ni `tsc` ni aucun test, et la
    palette montrerait les modules masqués que la barre cache.

---

## AC → preuve

| AC | Tâches | Tests | Ablations | Navigateur |
|---|---|---|---|---|
| AC1 — Ctrl K ouvre, Échap ferme et rend le focus | 4 | `AppShell.palette.test.tsx` « AC1 » (+ ⌘K, bouton, plein écran) ; `usePaletteDeCommandes.test.ts` | T4-1, T4-2, T4-3, T4-4 | T6 étape 2 |
| AC2 — locataire, « loyer » → Paiements en premier | 2, 3 | `palette-synonymes.test.ts` « AC2 » ; `PaletteDeCommandes.test.tsx` « AC2 » | T2-1, T1-5 | T6 étape 3 |
| AC3 — « Plus » trouvé ; inaccessible jamais (catalogue brut → rouge) | 1, 3 | `palette.test.ts` « AC3 » (huit personas, cadenas, récents) ; `PaletteDeCommandes.test.tsx` « AC3 » | **T1-1 (catalogue brut)**, T1-2, T1-3 | — |
| AC4 — « Passer à : … » bascule et recompose | 3 | `PaletteDeCommandes.test.tsx` « AC4 » | T3-1, T3-2 | **T6 étape 4** |
| AC5 — axe : aucune violation, palette ouverte | 3 | `PaletteDeCommandes.test.tsx` « AC5 » (jsdom) | T3-4 | T6 étape 5 (axe au navigateur, contrastes réels) |

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| Créer `takussan-web/src/lib/navigation/palette.ts` | `optionsDeLaPalette`, `chercherDansLaPalette`, `decouperLesMots` | 1 |
| Créer `takussan-web/src/lib/navigation/pages-recentes.ts` | `lirePagesRecentes`, `retenirPage` | 1 |
| Créer `takussan-web/src/lib/navigation/__tests__/palette.test.ts` | AC3 pur, recherche, récents | 1 |
| Créer `takussan-web/src/lib/navigation/__tests__/pages-recentes.test.ts` | stockage | 1 |
| Modifier `takussan-web/src/messages/{fr,en,wo}.json` | `nav.palette.*` | 2 |
| Créer `takussan-web/src/lib/navigation/__tests__/palette-synonymes.test.ts` | garde des synonymes, AC2 | 2 |
| Créer `takussan-web/src/components/layout/PaletteDeCommandes.tsx` | le dialogue et la combobox | 3 |
| Créer `takussan-web/src/components/layout/__tests__/PaletteDeCommandes.test.tsx` | AC2, AC3, AC4, AC5, ARIA, clavier | 3 |
| Créer `takussan-web/src/components/layout/usePaletteDeCommandes.ts` | raccourci, mémoire des pages | 4 |
| Créer `takussan-web/src/components/layout/__tests__/usePaletteDeCommandes.test.ts` | règles du raccourci | 4 |
| Modifier `takussan-web/src/components/layout/AppShell.tsx` | état, raccourci, mémoire, montage | 4 |
| Modifier `takussan-web/src/components/layout/AppTopbar.tsx` | le bouton | 4 |
| Créer `takussan-web/src/components/layout/__tests__/AppShell.palette.test.tsx` | AC1 dans la coque | 4 |
| Modifier `takussan-web/src/components/layout/__tests__/AppTopbar.a11y.test.tsx` | l'anneau du bouton | 4 |
| Modifier `takussan-web/src/content/legal/privacy.ts`, `editeur.ts`, `__tests__/textes.test.ts` ; `takussan-api/app/Services/Property/PublishReadiness.php` | pages récentes nommées, version | 5 |
| Modifier `docs/backlog/tickets/…/TCK-2482-palette-de-commandes.md` | statut, `depends_on`, notes | 0, 6 |

**Ordre :** séquentiel (0 → 6). T3 lit les messages de T2.

---

### Tâche 0 : branche, statut, suppositions

- [ ] **Étape 1 :** `git switch dev && git pull && git switch -c feat/palette-de-commandes-tck-2482`.
- [ ] **Étape 2 :** relever S1 à S7 (lire `useMenuDeLEspace.ts`, `useCompteursDuMenu.ts`, `composer-menu.ts`,
  `AppTopbar.tsx`, `AppShell.tsx`, `AppShell.menu-et-credits.test.tsx`) et écrire le résultat dans le
  rapport. S1 ou S2 faux → **BLOQUÉ**, s'arrêter là.
- [ ] **Étape 3 :** dans le ticket, `status: doing`, `depends_on: [TCK-2479, TCK-2480, TCK-2481]` (A16),
  `updated:` du jour ; `node docs/backlog/ranger-tickets.mjs`. Commit avec la tâche 1.

---

### Tâche 1 : les sources pures — menu rendu, recherche sans accents, pages récentes (AC3)

**Fichiers :** créer `src/lib/navigation/palette.ts`, `src/lib/navigation/pages-recentes.ts` et leurs
deux tests.

**Interfaces :**
- Produit : `GROUPES_DE_LA_PALETTE`, `type GroupeDeLaPalette`, `type CibleDeLaPalette`,
  `interface OptionDeLaPalette`, `interface SourcesDeLaPalette`, `interface LibellesDeLaPalette`,
  `optionsDeLaPalette(s, l): OptionDeLaPalette[]`, `chercherDansLaPalette(options, requete): OptionDeLaPalette[]`,
  `decouperLesMots(texte): string[]`, `RECENTS_AFFICHES` ; `PAGES_RECENTES_MAX`,
  `clePagesRecentes(compte)`, `lirePagesRecentes(compte): string[]`, `retenirPage(compte, chemin): void`.
- Consomme : `composerMenu`, `EntreeComposee`, `GroupeCompose` (`composer-menu.ts`), `PastilleATraiter`
  (`a-traiter.ts`), `resolveActiveHref`, `APP_EXACT_ROOTS` (`active-path.ts`), `replierPourRecherche`
  (`@/components/ui/combobox`), `Profile` (`@/types/profile`).

- [ ] **Étape 1 : écrire `src/lib/navigation/__tests__/pages-recentes.test.ts`** (rouge : module absent)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGES_RECENTES_MAX, clePagesRecentes, lirePagesRecentes, retenirPage } from '../pages-recentes';

/**
 * TCK-2482 (A8) — les pages de `/app` ouvertes sur CET appareil, pour la palette : par compte, au plus
 * huit chemins, le plus récent en tête, sans doublon ; rien hors de `/app` ; un stockage qui lève (navigation
 * privée, quota) ne casse rien. Rien ne part au serveur.
 */
describe('pages récentes (TCK-2482)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('la plus récente en tête, sans doublon', () => {
    retenirPage(1, '/app/payments');
    retenirPage(1, '/app/leases/3');
    retenirPage(1, '/app/payments');
    expect(lirePagesRecentes(1)).toEqual(['/app/payments', '/app/leases/3']);
  });

  it(`au plus ${PAGES_RECENTES_MAX}`, () => {
    for (let i = 0; i < PAGES_RECENTES_MAX + 3; i++) retenirPage(1, `/app/leases/${i}`);
    const lues = lirePagesRecentes(1);
    expect(lues).toHaveLength(PAGES_RECENTES_MAX);
    expect(lues[0]).toBe(`/app/leases/${PAGES_RECENTES_MAX + 2}`);
  });

  it('seules les pages de /app sont retenues', () => {
    retenirPage(1, '/properties');
    retenirPage(1, '/application');
    retenirPage(1, '/app');
    expect(lirePagesRecentes(1)).toEqual(['/app']);
  });

  it('par compte : un autre compte du même appareil ne les lit pas', () => {
    retenirPage(1, '/app/payments');
    expect(lirePagesRecentes(2)).toEqual([]);
    expect(clePagesRecentes(1)).not.toBe(clePagesRecentes(2));
  });

  it('une valeur illisible ou d’une autre forme ne casse rien', () => {
    window.localStorage.setItem(clePagesRecentes(1), '{pas du json');
    expect(lirePagesRecentes(1)).toEqual([]);
    window.localStorage.setItem(clePagesRecentes(1), JSON.stringify([1, null, '/ailleurs', '/app/visits']));
    expect(lirePagesRecentes(1)).toEqual(['/app/visits']);
  });

  it('un stockage qui lève ne casse rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => retenirPage(1, '/app/payments')).not.toThrow();
    expect(lirePagesRecentes(1)).toEqual([]);
  });
});
```

- [ ] **Étape 2 : écrire `src/lib/navigation/__tests__/palette.test.ts`** (rouge : module absent)

La table des comptes est RECOPIÉE de `dispositions-validees.test.ts` (pas importée : deux tests qui se
valident l'un l'autre ne prouvent rien). Les libellés sont les VRAIS libellés français de la barre.

```ts
import { Search } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import fr from '@/messages/fr.json';
import { CATALOGUE, estOuverte, type IdDestination } from '../catalogue';
import { composerMenu, entreesDuMenu, type EntreeComposee } from '../composer-menu';
import {
  chercherDansLaPalette,
  decouperLesMots,
  optionsDeLaPalette,
  type GroupeDeLaPalette,
  type LibellesDeLaPalette,
  type OptionDeLaPalette,
  type SourcesDeLaPalette,
} from '../palette';
import { PERSONAS, type Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

const TOUTES_LES_PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

const COMPTES: Record<Persona, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
  plateforme: { roles: ['customer', 'super_admin'], capacites: [], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
};

const SIDEBAR = fr.nav.sidebar as unknown as Record<string, unknown>;
const ADMIN = fr.nav.admin as unknown as Record<string, string>;
const ACTIONS = SIDEBAR.actions as Record<string, string>;
/** Des synonymes de test : la garde des VRAIS synonymes est `palette-synonymes.test.ts` (tâche 2). */
const SYNONYMES: Partial<Record<IdDestination, string[]>> = { paiements: ['loyer', 'quittance'], clients: ['crm'] };

const LIBELLES: LibellesDeLaPalette = {
  entree: (e) => (e.labelSpace === 'nav.admin' ? ADMIN[e.labelKey]! : (SIDEBAR[e.labelKey] as string)),
  action: (e) => ACTIONS[e.labelKey] ?? (SIDEBAR[e.labelKey] as string),
  carte: () => 'Mettre un bien en location',
  precision: (g) => (g.id === 'aussi' ? 'Aussi' : null),
  synonymes: (id) => SYNONYMES[id] ?? [],
  pastille: (p) => `${p.nombre} ${p.cle}`,
  espace: (p) => `Passer à : ${p.type}`,
  motsEspace: ['espace', 'profil'],
};

function sources(persona: Persona, autres: Partial<SourcesDeLaPalette> = {}): SourcesDeLaPalette {
  const menu = composerMenu(COMPTES[persona], persona);
  return { action: menu.action, carte: menu.carte, groupes: menu.groupes, pastilles: [], espaces: [], recents: [], pathname: '/app', ...autres };
}
const du = (groupe: GroupeDeLaPalette, options: readonly OptionDeLaPalette[]) => options.filter((o) => o.groupe === groupe);
const hrefDe = (o: OptionDeLaPalette) => (o.cible.type === 'lien' ? o.cible.href : null);

describe('TCK-2482 AC3 — la palette ne propose que le menu RENDU', () => {
  it.each(PERSONAS)('%s : « Aller à » = exactement les entrées du menu composé, dans son ordre, carte en dernier', (persona) => {
    const menu = composerMenu(COMPTES[persona], persona);
    const attendus = [...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : [])];
    expect(du('aller-a', optionsDeLaPalette(sources(persona), LIBELLES)).map(hrefDe)).toEqual(attendus);
  });

  it.each(PERSONAS)('%s : aucune destination que le compte ne peut ouvrir, dans aucun groupe', (persona) => {
    const proposes = new Set(optionsDeLaPalette(sources(persona), LIBELLES).map(hrefDe));
    const ouvertes = new Set(CATALOGUE.filter((d) => estOuverte(d, COMPTES[persona])).map((d) => d.href));
    const fermees = CATALOGUE.filter((d) => !ouvertes.has(d.href)).map((d) => d.href);
    expect(fermees.filter((href) => proposes.has(href))).toEqual([]);
  });

  it('une destination rangée sous « Plus » est trouvée : « avis » chez le locataire', () => {
    const menu = composerMenu(COMPTES.locataire, 'locataire');
    expect(menu.groupes.find((g) => g.id === 'plus')!.entrees.map((e) => e.id)).toContain('avis');
    const trouvees = chercherDansLaPalette(optionsDeLaPalette(sources('locataire'), LIBELLES), 'avis');
    expect(trouvees.map((o) => o.libelle)).toContain('Mes avis');
  });

  it('une page d’agence n’est jamais trouvée chez le locataire', () => {
    const trouvees = chercherDansLaPalette(optionsDeLaPalette(sources('locataire'), LIBELLES), 'équipe');
    expect(trouvees).toEqual([]);
  });

  it('une entrée cadenassée n’est jamais proposée', () => {
    const s = sources('agent');
    const groupes = s.groupes.map((g) => ({
      ...g,
      entrees: g.entrees.map((e) => (e.id === 'statistiques' ? { ...e, locked: true } : e)),
    }));
    const hrefs = optionsDeLaPalette({ ...s, groupes, recents: ['/app/overview'] }, LIBELLES).map(hrefDe);
    expect(hrefs).not.toContain('/app/overview');
  });

  it('une entrée du complément porte sa précision ; une entrée de « Plus » n’en porte aucune', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agent', 'owner'], capacites: ['properties.create'] };
    const menu = composerMenu(ctx, 'bailleur');
    const options = optionsDeLaPalette(
      { action: menu.action, carte: menu.carte, groupes: menu.groupes, pastilles: [], espaces: [], recents: [], pathname: '/app' },
      LIBELLES,
    );
    expect(options.find((o) => o.cle === 'aller-a:commissions')?.precision).toBe('Aussi');
    expect(options.find((o) => o.cle === 'aller-a:documents')?.precision).toBeUndefined();
  });
});

describe('TCK-2482 — les autres groupes', () => {
  it('l’action ➊ ouvre la liste, avec le libellé de la disposition (« Payer mon loyer »)', () => {
    const options = optionsDeLaPalette(sources('locataire'), LIBELLES);
    expect(options[0]).toMatchObject({ groupe: 'actions', libelle: 'Payer mon loyer', cible: { type: 'lien', href: '/app/payments' } });
  });

  it('un espace suspendu n’a pas d’action ➊ dans la palette non plus', () => {
    const menu = composerMenu({ ...COMPTES.agent, agenceSuspendue: true }, 'agent');
    expect(du('actions', optionsDeLaPalette(sources('agent', { action: menu.action }), LIBELLES))).toEqual([]);
  });

  it('« À traiter » : la page filtrée de la pastille, cherchable par le nom de son entrée', () => {
    const options = optionsDeLaPalette(
      sources('agent', { pastilles: [{ cle: 'pendingVisits', nombre: 3, href: '/app/visits?tab=requested' }] }),
      LIBELLES,
    );
    const pastille = du('a-traiter', options)[0]!;
    expect(hrefDe(pastille)).toBe('/app/visits?tab=requested');
    expect(chercherDansLaPalette(options, 'visites').map((o) => o.cle)).toContain('a-traiter:pendingVisits');
  });

  it('récents : résolus sur le menu du compte, page courante exclue, jamais une page fermée, sans doublon', () => {
    const options = optionsDeLaPalette(
      sources('locataire', {
        pathname: '/app/leases',
        recents: ['/app/agency/team', '/app/payments/12', '/app/leases/3', '/app/payments', '/app'],
      }),
      LIBELLES,
    );
    expect(du('recents', options).map((o) => o.cle)).toEqual(['recents:paiements', 'recents:tableau-de-bord']);
  });

  it('les espaces viennent en dernier et portent leur profil', () => {
    const profil = { id: 'owner:7', type: 'owner', numeric_id: 7, agency_id: 3, status: 'active', created_at: null } as const;
    const options = optionsDeLaPalette(sources('agent', { espaces: [profil] }), LIBELLES);
    expect(options.at(-1)).toMatchObject({ groupe: 'espaces', cible: { type: 'espace', profilId: 'owner:7' } });
  });
});

describe('TCK-2482 — chercherDansLaPalette', () => {
  const opt = (cle: string, groupe: GroupeDeLaPalette, libelle: string, motsCles: string[] = []): OptionDeLaPalette => ({
    cle, groupe, libelle, motsCles, icone: Search, cible: { type: 'lien', href: `/app/${cle}` },
  });

  it('champ vide : tout, dans l’ordre reçu', () => {
    const options = [opt('a', 'actions', 'A'), opt('r', 'recents', 'R'), opt('b', 'aller-a', 'B')];
    expect(chercherDansLaPalette(options, '   ')).toEqual(options);
  });

  it('sans les accents ni la casse : « etats » trouve « États des lieux », « EQUIPE » trouve « Équipe »', () => {
    const options = [opt('edl', 'aller-a', 'États des lieux'), opt('equipe', 'aller-a', 'Équipe'), opt('docs', 'aller-a', 'Documents')];
    expect(chercherDansLaPalette(options, 'etats').map((o) => o.cle)).toEqual(['edl']);
    expect(chercherDansLaPalette(options, 'EQUIPE').map((o) => o.cle)).toEqual(['equipe']);
  });

  it('les synonymes : « loyer » trouve « Paiements »', () => {
    const options = [opt('paiements', 'aller-a', 'Paiements', ['loyer', 'quittance']), opt('baux', 'aller-a', 'Baux', ['bail'])];
    expect(chercherDansLaPalette(options, 'loyer').map((o) => o.cle)).toEqual(['paiements']);
  });

  it('chaque mot doit correspondre : « mes vis » trouve « Mes visites », pas « Mes biens »', () => {
    const options = [opt('biens', 'aller-a', 'Mes biens'), opt('visites', 'aller-a', 'Mes visites')];
    expect(chercherDansLaPalette(options, 'mes vis').map((o) => o.cle)).toEqual(['visites']);
  });

  it('dans un groupe : début du libellé, puis un mot, puis un synonyme, puis l’ordre reçu', () => {
    const options = [
      opt('contenu', 'aller-a', 'Mon calendrier'),
      opt('synonyme', 'aller-a', 'Agenda', ['calendrier partagé']),
      opt('mot', 'aller-a', 'Le calendrier'),
      opt('debut', 'aller-a', 'Calendrier'),
    ];
    expect(chercherDansLaPalette(options, 'cal').map((o) => o.cle)).toEqual(['debut', 'contenu', 'mot', 'synonyme']);
    expect(chercherDansLaPalette(options, 'endrier').map((o) => o.cle)).toEqual(['contenu', 'synonyme', 'mot', 'debut']);
  });

  it('les groupes gardent leur ordre, quelle que soit la pertinence ; « Récents » disparaît à la frappe', () => {
    const options = [
      opt('action', 'actions', 'Payer mon loyer'),
      opt('recent', 'recents', 'Paiements'),
      opt('page', 'aller-a', 'Paiements', ['loyer']),
      opt('espace', 'espaces', 'Passer à : Paiements'),
    ];
    expect(chercherDansLaPalette(options, 'paie').map((o) => o.cle)).toEqual(['page', 'espace']);
    expect(chercherDansLaPalette(options, 'loyer').map((o) => o.cle)).toEqual(['action', 'page']);
  });

  it('decouperLesMots : virgules, blancs, vides retirés', () => {
    expect(decouperLesMots(' loyer, quittance ,, payer ')).toEqual(['loyer', 'quittance', 'payer']);
  });
});

// `EntreeComposee` reste importé pour que `tsc` refuse une forme d'entrée que la palette ne lit plus.
export type _EntreeLue = EntreeComposee;
```

> Le cas « endrier » attend : « Mon calendrier » (contenu, 1, rang 0), « Agenda » (synonyme contenu, 1,
> rang 1), « Le calendrier » (contenu, 1, rang 2), « Calendrier » (contenu, 1, rang 3) — à égalité de
> score, l'ordre reçu. Si `tsc` refuse l'alias `_EntreeLue` (`noUnusedLocals`), retirer l'alias et l'import.

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/palette.test.ts src/lib/navigation/__tests__/pages-recentes.test.ts`
Attendu : FAIL (modules `../palette` et `../pages-recentes` introuvables).

- [ ] **Étape 4 : créer `src/lib/navigation/pages-recentes.ts`**

```ts
/**
 * TCK-2482 (A8) — les pages de `/app` ouvertes sur CET appareil, que la palette de commandes propose sous
 * « Récents ». Patron : `src/lib/recherches-recentes.ts` (TCK-2475).
 *
 * - Par compte (`takussan.pages-recentes.<id>`) : un autre compte du même appareil ne les lit pas.
 * - Des chemins BRUTS (`/app/leases/42`) : la palette les résout sur le menu du jour
 *   (`optionsDeLaPalette`), si bien qu'un chemin que le menu ne couvre plus disparaît de lui-même.
 * - Rien ne quitte le navigateur. Tout accès au stockage est enveloppé : en navigation privée, sous quota
 *   ou stockage bloqué, `localStorage` lève — la palette fonctionne alors sans récents.
 * - Nommées par la politique de confidentialité (`src/content/legal/privacy.ts`, § 8).
 */
export const PAGES_RECENTES_MAX = 8;

export function clePagesRecentes(compte: number | string): string {
  return `takussan.pages-recentes.${compte}`;
}

function estUnCheminDeLApp(chemin: unknown): chemin is string {
  return typeof chemin === 'string' && (chemin === '/app' || chemin.startsWith('/app/'));
}

export function lirePagesRecentes(compte: number | string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const brut = window.localStorage.getItem(clePagesRecentes(compte));
    if (!brut) return [];
    const lu: unknown = JSON.parse(brut);
    return Array.isArray(lu) ? lu.filter(estUnCheminDeLApp).slice(0, PAGES_RECENTES_MAX) : [];
  } catch {
    return [];
  }
}

export function retenirPage(compte: number | string, chemin: string): void {
  if (typeof window === 'undefined' || !estUnCheminDeLApp(chemin)) return;
  const suivantes = [chemin, ...lirePagesRecentes(compte).filter((c) => c !== chemin)].slice(0, PAGES_RECENTES_MAX);
  try {
    window.localStorage.setItem(clePagesRecentes(compte), JSON.stringify(suivantes));
  } catch {
    /* quota, navigation privée : la page n'est simplement pas retenue */
  }
}
```

- [ ] **Étape 5 : créer `src/lib/navigation/palette.ts`**

```ts
import { ArrowLeftRight, type LucideIcon } from 'lucide-react';
import { replierPourRecherche } from '@/components/ui/combobox';
import type { Profile } from '@/types/profile';
import type { PastilleATraiter } from './a-traiter';
import { APP_EXACT_ROOTS, resolveActiveHref } from './active-path';
import type { IdDestination } from './catalogue';
import type { EntreeComposee, GroupeCompose } from './composer-menu';

/**
 * TCK-2482 (ADR-0089 §4) — la palette de commandes de `/app` : ce qu'elle propose, et comment elle
 * cherche. Deux fonctions pures ; `PaletteDeCommandes` ne fait que les rendre.
 *
 * - Elle ne lit que le MENU RENDU (`useMenuDeLEspace` : persona, `composerMenu`, cadenas). Une
 *   destination que le menu ne rend pas — fermée au compte, ou cadenassée — n'y est jamais : la palette
 *   ne relit pas le catalogue, et `palette.test.ts` le garde sur les huit personas.
 * - Les groupes paraissent toujours dans l'ordre de `GROUPES_DE_LA_PALETTE` ; la frappe ne réordonne
 *   qu'À L'INTÉRIEUR d'un groupe.
 * - Aucun tri par usage (ADR-0089 §5) : « Récents » est un groupe à part, montré sur un champ vide.
 */
export const GROUPES_DE_LA_PALETTE = ['actions', 'a-traiter', 'recents', 'aller-a', 'espaces'] as const;
export type GroupeDeLaPalette = (typeof GROUPES_DE_LA_PALETTE)[number];

export type CibleDeLaPalette =
  | { readonly type: 'lien'; readonly href: string; readonly publique?: true }
  | { readonly type: 'espace'; readonly profilId: string };

export interface OptionDeLaPalette {
  /** Unique dans la liste : `<groupe>:<identifiant>`. */
  readonly cle: string;
  readonly groupe: GroupeDeLaPalette;
  readonly libelle: string;
  /** Affichée après le libellé (« Aussi administrateur ») ; jamais cherchée. */
  readonly precision?: string;
  /** Les synonymes déclarés dans les messages : cherchés, jamais affichés. */
  readonly motsCles: readonly string[];
  readonly icone: LucideIcon;
  readonly cible: CibleDeLaPalette;
}

export type EntreeDuMenuRendu = EntreeComposee & { readonly locked?: boolean };
export type GroupeDuMenuRendu = GroupeCompose & { readonly entrees: readonly EntreeDuMenuRendu[] };

export interface SourcesDeLaPalette {
  readonly action: EntreeComposee | null;
  readonly carte: EntreeComposee | null;
  readonly groupes: readonly GroupeDuMenuRendu[];
  readonly pastilles: readonly PastilleATraiter[];
  /** Les espaces à proposer (`espacesAProposer`), l'espace actif déjà retiré. */
  readonly espaces: readonly Profile[];
  /** Les chemins retenus sur l'appareil (`lirePagesRecentes`), le plus récent d'abord. */
  readonly recents: readonly string[];
  readonly pathname: string | null;
}

/** Le texte naît loin de l'écran : la donnée porte la clé, le rendu la résout (TCK-286). */
export interface LibellesDeLaPalette {
  readonly entree: (e: EntreeComposee) => string;
  readonly action: (e: EntreeComposee) => string;
  readonly carte: (e: EntreeComposee) => string;
  readonly precision: (g: GroupeCompose) => string | null;
  readonly synonymes: (id: IdDestination) => readonly string[];
  readonly pastille: (p: PastilleATraiter) => string;
  readonly espace: (p: Profile) => string;
  readonly motsEspace: readonly string[];
}

export const RECENTS_AFFICHES = 5;

/** `" loyer, quittance ,, payer "` → `['loyer', 'quittance', 'payer']`. */
export function decouperLesMots(texte: string): string[] {
  return texte.split(',').map((m) => m.trim()).filter((m) => m !== '');
}

function cibleDe(e: EntreeComposee): CibleDeLaPalette {
  return { type: 'lien', href: e.href, ...(e.publique ? { publique: true as const } : {}) };
}

export function optionsDeLaPalette(s: SourcesDeLaPalette, l: LibellesDeLaPalette): OptionDeLaPalette[] {
  const options: OptionDeLaPalette[] = [];
  const rendues = s.groupes.flatMap((g) => g.entrees.filter((e) => !e.locked).map((e) => ({ e, g })));
  const parHref = new Map<string, EntreeComposee>();
  for (const { e } of rendues) if (!parHref.has(e.href)) parHref.set(e.href, e);

  // ➊ — l'action principale telle que la barre la rend (absente d'un espace suspendu, TCK-600).
  if (s.action) {
    options.push({
      cle: `actions:${s.action.id}`,
      groupe: 'actions',
      libelle: l.action(s.action),
      motsCles: l.synonymes(s.action.id),
      icone: s.action.icon,
      cible: cibleDe(s.action),
    });
  }

  // À traiter — les pastilles de la bande, déjà jugées (`pastillesATraiter`), cherchables aussi par le
  // nom de leur entrée : « 3 visites en attente » se trouve par « visites ».
  for (const p of s.pastilles) {
    const e = rendues.find((r) => r.e.counterKey === p.cle)?.e;
    if (!e) continue;
    options.push({
      cle: `a-traiter:${p.cle}`,
      groupe: 'a-traiter',
      libelle: l.pastille(p),
      motsCles: [l.entree(e), ...l.synonymes(e.id)],
      icone: e.icon,
      cible: { type: 'lien', href: p.href },
    });
  }

  // Récents — résolus sur le menu D'AUJOURD'HUI : un chemin qu'il ne couvre plus disparaît.
  const hrefs = [...parHref.keys()];
  const courant = resolveActiveHref(s.pathname, hrefs, APP_EXACT_ROOTS);
  const vus = new Set<string>();
  for (const chemin of s.recents) {
    if (vus.size === RECENTS_AFFICHES) break;
    const href = resolveActiveHref(chemin, hrefs, APP_EXACT_ROOTS);
    const e = href === null ? undefined : parHref.get(href);
    if (!e || href === courant || vus.has(e.href)) continue;
    vus.add(e.href);
    options.push({ cle: `recents:${e.id}`, groupe: 'recents', libelle: l.entree(e), motsCles: [], icone: e.icon, cible: cibleDe(e) });
  }

  // Aller à — le menu entier, dans son ordre : groupes, « Plus », complément « Aussi … », puis la carte.
  for (const { e, g } of rendues) {
    const precision = l.precision(g);
    options.push({
      cle: `aller-a:${e.id}`,
      groupe: 'aller-a',
      libelle: l.entree(e),
      ...(precision ? { precision } : {}),
      motsCles: l.synonymes(e.id),
      icone: e.icon,
      cible: cibleDe(e),
    });
  }
  if (s.carte) {
    options.push({
      cle: `aller-a:${s.carte.id}`,
      groupe: 'aller-a',
      libelle: l.carte(s.carte),
      motsCles: l.synonymes(s.carte.id),
      icone: s.carte.icon,
      cible: cibleDe(s.carte),
    });
  }

  for (const p of s.espaces) {
    options.push({
      cle: `espaces:${p.id}`,
      groupe: 'espaces',
      libelle: l.espace(p),
      motsCles: l.motsEspace,
      icone: ArrowLeftRight,
      cible: { type: 'espace', profilId: p.id },
    });
  }
  return options;
}

/** A3 — 4 : le libellé commence par le mot ; 3 : un mot du libellé ; 2 : un mot d'un synonyme ; 1 : contenu. */
function scoreDuMot(mot: string, libelle: string, synonymes: readonly string[]): number {
  if (libelle.startsWith(mot)) return 4;
  if (libelle.split(' ').some((m) => m.startsWith(mot))) return 3;
  if (synonymes.some((s) => s.split(' ').some((m) => m.startsWith(mot)))) return 2;
  if (libelle.includes(mot) || synonymes.some((s) => s.includes(mot))) return 1;
  return 0;
}

/**
 * La recherche : repli des accents, de la casse et des séparateurs (`replierPourRecherche`, la règle du
 * dépôt) ; chaque mot saisi doit correspondre ; tri par groupe, puis par score, puis dans l'ordre reçu.
 * Un champ vide rend tout ; une saisie retire « Récents ».
 */
export function chercherDansLaPalette(options: readonly OptionDeLaPalette[], requete: string): OptionDeLaPalette[] {
  const mots = replierPourRecherche(requete).split(' ').filter((m) => m !== '');
  if (mots.length === 0) return [...options];
  const rang = (g: GroupeDeLaPalette) => GROUPES_DE_LA_PALETTE.indexOf(g);
  const notees: { readonly option: OptionDeLaPalette; readonly score: number; readonly ordre: number }[] = [];
  options.forEach((option, ordre) => {
    if (option.groupe === 'recents') return;
    const libelle = replierPourRecherche(option.libelle);
    const synonymes = option.motsCles.map(replierPourRecherche);
    let score = 0;
    for (const mot of mots) {
      const s = scoreDuMot(mot, libelle, synonymes);
      if (s === 0) return;
      score += s;
    }
    notees.push({ option, score, ordre });
  });
  return notees
    .sort((a, b) => rang(a.option.groupe) - rang(b.option.groupe) || b.score - a.score || a.ordre - b.ordre)
    .map((n) => n.option);
}
```

- [ ] **Étape 6 : lancer, constater le vert** — commande de l'étape 3. Attendu : PASS. Si un cas de
  pertinence diffère, relire A3 avant de toucher le test : c'est la règle qui fait foi, l'attente se
  corrige seulement si elle contredit A3 (écrire l'écart).

- [ ] **Étape 7 : ablations** (script `ablation.sh` ; chacune doit sortir ≠ 0)

  1. **AC3, le catalogue brut** (exigé par le ticket) — la palette liste le catalogue au lieu du menu :
     ```bash
     bash ablation.sh src/lib/navigation/palette.ts 's{const rendues = [^\n]+\n}{const rendues = [...s.groupes.flatMap((g) => g.entrees.map((e) => ({ e, g }))), ...CATALOGUE.map((d) => ({ e: { ...d, labelKey: "x", icon: d.icone, groupe: "plus" }, g: s.groupes[0] }))];\n}; s{\A}{import { CATALOGUE } from "./catalogue";\n}' src/lib/navigation/__tests__/palette.test.ts
     ```
     Attendu : « aucune destination que le compte ne peut ouvrir » et « exactement les entrées » rougissent.
  2. **Cadenas** : `'s{g\.entrees\.filter\(\(e\) => !e\.locked\)}{g.entrees}'` → « une entrée cadenassée » rougit.
  3. **Récents, page courante** : `'s{ \|\| href === courant}{}'` → « récents : résolus … » rougit.
  4. **Pages récentes hors `/app`** (fichier `pages-recentes.ts`, apostrophes écrites `\x27`) :
     `bash ablation.sh src/lib/navigation/pages-recentes.ts 's{\(chemin === \x27/app\x27 \|\| chemin\.startsWith\(\x27/app/\x27\)\)}{true}' src/lib/navigation/__tests__/pages-recentes.test.ts`
     → « seules les pages de /app » rougit.
  5. **Synonymes** : `'s{const synonymes = option\.motsCles\.map\(replierPourRecherche\);}{const synonymes: string[] = [];}'`
     → « les synonymes : loyer » rougit.
  6. **Accents** : `'s{const libelle = replierPourRecherche\(option\.libelle\);}{const libelle = option.libelle.toLowerCase();}'`
     → « sans les accents » rougit.

  Écrire chaque résultat dans le rapport ; `git diff --stat` propre après chacune.

- [ ] **Étape 8 :** `npx tsc --noEmit && npm run lint`, puis commit (avec la tâche 0) —
  `feat(web): les sources pures de la palette — menu rendu, recherche sans accents, pages récentes (TCK-2482)`.

---

### Tâche 2 : les messages et les synonymes (AC2)

**Fichiers :** `src/messages/{fr,en,wo}.json` ; créer `src/lib/navigation/__tests__/palette-synonymes.test.ts`.

- [ ] **Étape 1 : écrire le test qui échoue** — `palette-synonymes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { replierPourRecherche } from '@/components/ui/combobox';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { CATALOGUE } from '../catalogue';
import { decouperLesMots } from '../palette';

/**
 * TCK-2482 (A9) — les synonymes de la palette vivent dans les messages, par identifiant de destination.
 * Une clé qui ne nomme aucune destination (identifiant renommé, destination retirée) serait un synonyme
 * mort : la garde la refuse. Et l'AC2 tient à un mot : « loyer » ne doit mener qu'aux paiements.
 */
type Messages = { nav: { palette: { synonymes: Record<string, string> } } };
const IDS = new Set<string>(CATALOGUE.map((d) => d.id));
const LANGUES: [string, Messages][] = [['fr', fr as unknown as Messages], ['en', en as unknown as Messages], ['wo', wo as unknown as Messages]];

/** Les destinations dont un synonyme porte un mot qui COMMENCE par `debut` (la règle de A3). */
function porteurs(m: Messages, debut: string): string[] {
  return Object.entries(m.nav.palette.synonymes)
    .filter(([, v]) => decouperLesMots(v).some((s) => replierPourRecherche(s).split(' ').some((w) => w.startsWith(debut))))
    .map(([id]) => id);
}

describe('TCK-2482 — les synonymes de la palette', () => {
  it.each(LANGUES)('%s : chaque clé nomme une destination du catalogue', (_langue, m) => {
    expect(Object.keys(m.nav.palette.synonymes).filter((id) => !IDS.has(id))).toEqual([]);
  });

  it.each(LANGUES)('%s : aucun synonyme vide', (_langue, m) => {
    expect(Object.entries(m.nav.palette.synonymes).filter(([, v]) => decouperLesMots(v).length === 0)).toEqual([]);
  });

  it('AC2 — « loyer » ne mène qu’aux paiements (fr), « rent » de même (en)', () => {
    expect(porteurs(fr as unknown as Messages, 'loyer')).toEqual(['paiements']);
    expect(porteurs(en as unknown as Messages, 'rent')).toEqual(['paiements']);
  });

  it('« clients » mène au CRM', () => {
    expect(porteurs(fr as unknown as Messages, 'crm')).toContain('clients');
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec** — `npx vitest run src/lib/navigation/__tests__/palette-synonymes.test.ts`
  → FAIL (`nav.palette` absent).

- [ ] **Étape 3 : ajouter `nav.palette`** — écrire `ajouter-palette.mjs` dans ton scratchpad et le lancer
  par `node <chemin>/ajouter-palette.mjs` (les trois fichiers se relisent à l'identique, R9) :

```js
import { readFileSync, writeFileSync } from 'node:fs';

const RACINE = '/Users/aminethiam/Documents/perso/takussan/takussan-web/src/messages/';

const FR = {
  titre: 'Aller à une page ou changer d’espace',
  description: 'Tapez quelques lettres. Flèches pour parcourir, Entrée pour ouvrir, Échap pour fermer.',
  champ: 'Rechercher une page, une action ou un espace',
  placeholder: 'Une page, une action, un espace…',
  ouvrir: 'Aller à…',
  raccourciMac: '⌘ K',
  raccourciAutre: 'Ctrl K',
  groupes: { actions: 'Actions', aTraiter: 'À traiter', recents: 'Récents', allerA: 'Aller à', espaces: 'Espaces' },
  passerA: 'Passer à : {espace}',
  aucun: 'Aucun résultat pour « {q} »',
  resultats: '{count, plural, =0 {Aucun résultat} one {# résultat} other {# résultats}}',
  synonymesEspace: 'espace, profil, changer, basculer, passer',
  synonymes: {
    'tableau-de-bord': 'accueil, résumé, synthèse, vue d’ensemble',
    'mes-biens': 'biens, annonces, logements, propriétés, maisons, appartements',
    'publier-bien': 'ajouter un bien, nouvelle annonce, créer une annonce, mettre en ligne',
    'proposer-bien': 'ajouter un bien, nouvelle annonce, soumettre un bien',
    'publier-annonce': 'ajouter un bien, nouvelle annonce, mettre en location, devenir hôte',
    messagerie: 'messages, discussions, conversations, boîte de réception',
    reservations: 'réservation, séjour, location courte',
    visites: 'visite, rendez-vous, rdv',
    credits: 'solde, portefeuille, recharger, mise en avant',
    taches: 'tâches, à faire, rappels',
    'chercher-bien': 'chercher, recherche, trouver, louer, acheter',
    favoris: 'coups de cœur, sauvegardés, enregistrés',
    recherches: 'alertes, recherches enregistrées',
    maintenance: 'panne, réparation, intervention, travaux, plomberie, électricité',
    'carnet-prestataires': 'prestataires, artisans, plombier, électricien',
    demandes: 'prospects, leads, contacts, demandes de contact',
    baux: 'bail, contrat, contrat de location',
    paiements: 'loyer, loyers, payer, quittance, facture, encaissement, versement',
    avis: 'notes, commentaires, évaluations',
    commissions: 'honoraires, rémunération',
    documents: 'fichiers, pièces, papiers',
    'etats-des-lieux': 'état des lieux, inventaire, edl, entrée, sortie',
    'entrees-en-attente': 'emménagement, entrée dans les lieux, onboarding',
    statistiques: 'stats, chiffres, rapports',
    exports: 'export, csv, excel, télécharger',
    'vue-agence': 'agence, performance, activité de l’agence',
    kpis: 'indicateurs, kpi, objectifs',
    alertes: 'anomalies, signaux',
    proprietaires: 'bailleurs, propriétaires, mandants',
    clients: 'crm, contacts, acheteurs, prospects',
    calendrier: 'agenda, planning, disponibilités',
    'agence-equipe': 'équipe, collaborateurs, agents, membres, inviter',
    'agence-roles': 'rôles, permissions, droits, accès',
    'agence-fiche': 'agence, fiche de l’agence, logo, coordonnées',
    'agence-kyc': 'kyc, vérification, identité, justificatifs',
    'agence-facturation': 'abonnement, facturation, formule, reversements',
    'agence-finances': 'finances, comptabilité, revenus, trésorerie',
    'agence-moderation-avis': 'modération, avis à valider',
    'agence-moderation-biens': 'modération, biens à valider, validation',
    'agence-journal': 'audit, historique, traces, journal',
    'agence-integrations': 'api, webhooks, connecteurs',
  },
};

const EN = {
  titre: 'Go to a page or switch space',
  description: 'Type a few letters. Arrows to browse, Enter to open, Esc to close.',
  champ: 'Search a page, an action or a space',
  placeholder: 'A page, an action, a space…',
  ouvrir: 'Go to…',
  raccourciMac: '⌘ K',
  raccourciAutre: 'Ctrl K',
  groupes: { actions: 'Actions', aTraiter: 'To do', recents: 'Recent', allerA: 'Go to', espaces: 'Spaces' },
  passerA: 'Switch to: {espace}',
  aucun: 'No results for “{q}”',
  resultats: '{count, plural, =0 {No results} one {# result} other {# results}}',
  synonymesEspace: 'space, profile, switch, change',
  synonymes: {
    'tableau-de-bord': 'home, overview, summary',
    'mes-biens': 'properties, listings, homes, houses, apartments',
    'publier-bien': 'add a property, new listing, create a listing, publish',
    'proposer-bien': 'add a property, new listing, submit a property',
    'publier-annonce': 'add a property, new listing, become a host',
    messagerie: 'messages, inbox, chat, conversations',
    reservations: 'booking, reservation, stay, short stay',
    visites: 'visit, viewing, appointment',
    credits: 'balance, wallet, top up, boost',
    taches: 'tasks, to do, reminders',
    'chercher-bien': 'search, find, buy, browse',
    favoris: 'favourites, favorites, saved',
    recherches: 'alerts, saved searches',
    maintenance: 'repair, fix, work order, plumbing, electrical',
    'carnet-prestataires': 'providers, contractors, plumber, electrician',
    demandes: 'leads, enquiries, prospects, contacts',
    baux: 'lease, contract, tenancy agreement',
    paiements: 'rent, pay, receipt, invoice, payment',
    avis: 'ratings, comments, feedback',
    commissions: 'fees, earnings',
    documents: 'files, papers, attachments',
    'etats-des-lieux': 'inventory, check-in, check-out, condition report',
    'entrees-en-attente': 'move-in, onboarding',
    statistiques: 'stats, figures, reports, analytics',
    exports: 'export, csv, excel, download',
    'vue-agence': 'agency, performance',
    kpis: 'indicators, metrics, kpi',
    alertes: 'anomalies, warnings',
    proprietaires: 'landlords, owners',
    clients: 'customers, crm, contacts, buyers',
    calendrier: 'schedule, agenda, availability',
    'agence-equipe': 'team, members, staff, invite',
    'agence-roles': 'roles, permissions, access',
    'agence-fiche': 'agency profile, logo, contact details',
    'agence-kyc': 'kyc, verification, identity, documents',
    'agence-facturation': 'subscription, billing, plan, payouts',
    'agence-finances': 'finances, accounting, revenue',
    'agence-moderation-avis': 'moderation, reviews',
    'agence-moderation-biens': 'moderation, listings to approve',
    'agence-journal': 'audit, log, history',
    'agence-integrations': 'api, webhooks, connectors',
  },
};

// Wolof en pause (2026-10-16) : une clé neuve porte le français tel quel.
for (const [fichier, bloc] of [['fr.json', FR], ['en.json', EN], ['wo.json', FR]]) {
  const chemin = RACINE + fichier;
  const texte = readFileSync(chemin, 'utf8');
  const json = JSON.parse(texte);
  if (texte !== JSON.stringify(json, null, 2) + '\n') throw new Error(`${fichier} ne se relit pas à l'identique : insérer à la main`);
  if (json.nav.palette) throw new Error(`${fichier} : nav.palette existe déjà`);
  json.nav.palette = bloc;
  writeFileSync(chemin, JSON.stringify(json, null, 2) + '\n');
  console.log(`✓ ${fichier}`);
}
```

  > Avant de lancer : `node -e 'console.log(require("…/takussan-web/src/lib/navigation/catalogue.ts"))'`
  > ne marche pas (TS) — relever plutôt les identifiants par `grep -oE "id: '[a-z-]+'|pageAgence\('[a-z-]+'" src/lib/navigation/catalogue.ts`
  > et vérifier que chaque clé de `synonymes` y figure (le test de l'étape 1 le refera). Un identifiant
  > ajouté au catalogue depuis le relevé n'a simplement pas de synonyme : ce n'est pas une erreur.

- [ ] **Étape 4 : lancer, constater le vert** — commande de l'étape 2, puis `npm run check:i18n` et
  `npm run check:i18n-namespaces` (sortie 0).

- [ ] **Étape 5 : ablation T2-1 (AC2)** — retirer « loyer » des synonymes FR des paiements :
  `bash ablation.sh src/messages/fr.json 's{"loyer, loyers, payer, }{"payer, }' src/lib/navigation/__tests__/palette-synonymes.test.ts`
  → « AC2 » rougit.

- [ ] **Étape 6 :** commit — `feat(web): les libellés et les synonymes de la palette, en trois langues (TCK-2482)`.

---

### Tâche 3 : la palette — dialogue, combobox au clavier, bascule d'espace (AC2, AC3, AC4, AC5)

**Fichiers :** créer `src/components/layout/PaletteDeCommandes.tsx` et son test.

**Interfaces :**
- Produit : `PaletteDeCommandes(props: PaletteDeCommandesProps)` ; props `ouverte`, `onOuverteChange`,
  `contexteDuMenu: Parameters<typeof useMenuDeLEspace>[0]` (A17), `retourDuFocus?: RefObject<HTMLElement | null>`.
- Consomme : `useMenuDeLEspace` (S1), `useCompteursDuMenu` (S2), `pastillesATraiter`, `DISPOSITIONS`,
  `useMyProfiles`, `useSwitchActiveProfile`, `espacesAProposer`, `profileShortLabel`, `cheminLocalise`,
  `useCurrentLocale`, `lirePagesRecentes`, les fonctions de `palette.ts`.

- [ ] **Étape 1 : écrire le test qui échoue** — `src/components/layout/__tests__/PaletteDeCommandes.test.tsx`

```tsx
/**
 * TCK-2482 — la palette montée seule, ouverte : rôles ARIA, clavier, AC2 (« loyer » chez le locataire),
 * AC3 (« Plus » trouvé, l'inaccessible jamais), AC4 (« Passer à : … » bascule, puis la palette suit le
 * persona que la coque rend), AC5 (axe). L'ouverture par ⌘K / Ctrl K et le retour du focus sont éprouvés
 * dans la coque (`AppShell.palette.test.tsx`).
 */
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { cheminLocalise } from '@/i18n/routing';
import { retenirPage } from '@/lib/navigation/pages-recentes';
import type { MyProfilesResponse, Profile, ProfileType } from '@/types/profile';
import type { User, UserRole } from '@/types/user';
import { PaletteDeCommandes } from '../PaletteDeCommandes';

const etat = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  nonLus: 0,
  profils: undefined as MyProfilesResponse | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: etat.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 3, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => etat.nonLus }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: etat.profils, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: etat.mutate, isPending: false }),
}));

const AGENCE = { id: 3, name: 'Agence Teranga', slug: 'agence-teranga', kind: 'standard' as const };
const profil = (type: ProfileType, n: number): Profile => ({
  id: `${type}:${n}`, type, numeric_id: n, agency_id: 3, agency: AGENCE, status: 'active', created_at: null,
});
const utilisateur = (roles: UserRole[]): User =>
  ({ id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles, agency_id: 3 }) as unknown as User;

const fermer = vi.fn();
function ui(roles: UserRole[], typeProfilActif: ProfileType | null = null) {
  return withIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaletteDeCommandes
        ouverte
        onOuverteChange={fermer}
        contexteDuMenu={{ user: utilisateur(roles), agencyIsStandard: true, typeProfilActif }}
      />
    </QueryClientProvider>,
  );
}
const LOCATAIRE: UserRole[] = ['customer', 'tenant'];
const noms = (racine: HTMLElement) => within(racine).queryAllByRole('option').map((o) => o.textContent ?? '');

beforeEach(() => {
  etat.push.mockReset();
  etat.mutate.mockReset();
  fermer.mockReset();
  etat.nonLus = 0;
  etat.profils = undefined;
  window.localStorage.clear();
});

describe('<PaletteDeCommandes> — TCK-2482', () => {
  it('rôles ARIA : un dialogue nommé, un combobox focalisé qui contrôle une listbox de groupes nommés', async () => {
    render(ui(LOCATAIRE));
    const dialogue = await screen.findByRole('dialog', { name: 'Aller à une page ou changer d’espace' });
    const champ = within(dialogue).getByRole('combobox', { name: 'Rechercher une page, une action ou un espace' });
    expect(champ).toHaveFocus();
    const liste = within(dialogue).getByRole('listbox');
    expect(champ).toHaveAttribute('aria-controls', liste.id);
    expect(champ).toHaveAttribute('aria-expanded', 'true');
    expect(champ).toHaveAttribute('aria-autocomplete', 'list');
    const groupes = within(liste).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent);
    expect(groupes).toEqual(['Actions', 'Aller à']);
    const premiere = within(liste).getAllByRole('option')[0]!;
    expect(premiere).toHaveAttribute('aria-selected', 'true');
    expect(champ).toHaveAttribute('aria-activedescendant', premiere.id);
  });

  it('AC2 — chez un locataire, « loyer » propose Paiements en premier ; Entrée y mène', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    await u.type(await screen.findByRole('combobox'), 'loyer');
    const liste = screen.getByRole('listbox');
    expect(noms(liste)[0]).toBe('Payer mon loyer');
    expect(noms(within(liste).getByRole('group', { name: 'Aller à' }))[0]).toBe('Paiements');
    await u.keyboard('{Enter}');
    expect(etat.push).toHaveBeenCalledWith('/app/payments');
    expect(fermer).toHaveBeenCalledWith(false);
  });

  it('AC3 — « Mes avis », rangé sous « Plus », est trouvé ; « Équipe », fermée au locataire, jamais', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'avis');
    expect(noms(screen.getByRole('listbox'))).toContain('Mes avis');
    await u.clear(champ);
    await u.type(champ, 'equipe');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Aucun résultat pour « equipe »')).toBeInTheDocument();
    expect(champ).toHaveAttribute('aria-expanded', 'false');
  });

  it('sans les accents : « etats » trouve « États des lieux »', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    await u.type(await screen.findByRole('combobox'), 'etats');
    expect(noms(screen.getByRole('listbox'))).toEqual(['États des lieux']);
  });

  it('clavier : les flèches déplacent l’option active (et bouclent), Entrée ouvre celle-là', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    const options = screen.getAllByRole('option');
    await u.keyboard('{ArrowDown}');
    expect(champ).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await u.keyboard('{ArrowUp}{ArrowUp}');
    expect(champ).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
    await u.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(etat.push).toHaveBeenCalledTimes(1);
    expect(etat.push.mock.calls[0]![0]).toBe('/app');
  });

  it('« À traiter » : 3 messages non lus chez le locataire → la messagerie', async () => {
    etat.nonLus = 3;
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const groupe = within(await screen.findByRole('listbox')).getByRole('group', { name: 'À traiter' });
    await u.click(within(groupe).getByRole('option', { name: '3 messages non lus' }));
    expect(etat.push).toHaveBeenCalledWith('/app/messages');
  });

  it('« Récents » sur un champ vide : résolus sur le menu, l’inaccessible et la page courante absents ; disparaissent à la frappe', async () => {
    for (const chemin of ['/app/agency/team', '/app', '/app/leases/4', '/app/payments']) retenirPage(1, chemin);
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const groupe = within(await screen.findByRole('listbox')).getByRole('group', { name: 'Récents' });
    expect(noms(groupe)).toEqual(['Paiements', 'Mon bail']);
    await u.type(screen.getByRole('combobox'), 'pai');
    expect(within(screen.getByRole('listbox')).queryByRole('group', { name: 'Récents' })).toBeNull();
  });

  it('une destination du site public s’ouvre dans la langue courante (« Chercher un bien » du client)', async () => {
    const u = userEvent.setup();
    render(ui(['customer']));
    await u.type(await screen.findByRole('combobox'), 'chercher');
    await u.keyboard('{Enter}');
    expect(etat.push).toHaveBeenCalledWith(cheminLocalise('/properties', 'fr'));
  });

  it('AC4 — « Passer à : … » bascule le profil actif ; la coque rendue sous le nouveau profil, la palette suit', async () => {
    etat.profils = { data: [profil('agent', 5), profil('owner', 7)], meta: { active_profile_id: 'agent:5', count: 2 } };
    const roles: UserRole[] = ['customer', 'agent', 'owner'];
    const u = userEvent.setup();
    const { rerender } = render(ui(roles, 'agent'));
    const champ = await screen.findByRole('combobox');

    // Persona agent : « Commissions » est à lui, sans précision ; son propre espace n'est pas proposé.
    await u.type(champ, 'commissions');
    expect(noms(screen.getByRole('listbox'))).toEqual(['Commissions']);
    await u.clear(champ);
    await u.type(champ, 'passer');
    expect(noms(screen.getByRole('listbox'))).toEqual(['Passer à : Propriétaire · Agence Teranga']);

    await u.keyboard('{Enter}');
    expect(etat.mutate).toHaveBeenCalledWith('owner:7');
    expect(fermer).toHaveBeenCalledWith(false);

    // `router.refresh()` rend la coque avec le cookie neuf (R3) : on la rend telle quelle.
    etat.profils = { ...etat.profils, meta: { active_profile_id: 'owner:7', count: 2 } };
    rerender(ui(roles, 'owner'));
    await u.clear(champ);
    await u.type(champ, 'commissions');
    expect(noms(screen.getByRole('listbox'))).toEqual(['CommissionsAussi agent']);
    await u.clear(champ);
    await u.type(champ, 'passer');
    expect(noms(screen.getByRole('listbox'))).toEqual(['Passer à : Agent · Agence Teranga']);
  });

  it('AC5 — axe : aucune violation, champ vide (cinq groupes possibles) et sans résultat', async () => {
    etat.nonLus = 2;
    etat.profils = { data: [profil('agent', 5), profil('owner', 7)], meta: { active_profile_id: 'agent:5', count: 2 } };
    retenirPage(1, '/app/messages');
    const u = userEvent.setup();
    render(ui(['customer', 'agent', 'owner'], 'agent'));
    const dialogue = await screen.findByRole('dialog');
    expect((await axe.run(dialogue)).violations).toEqual([]);
    await u.type(screen.getByRole('combobox'), 'zzzz');
    expect((await axe.run(dialogue)).violations).toEqual([]);
  });
});
```

> Deux attentes à re-mesurer si elles rougissent sans que la règle soit en cause :
> - « Récents » chez le locataire : `'/app/leases/4'` se résout sur « Mon bail » (`baux`, libellé
>   `myLease` de sa disposition) ; `'/app'` est la page courante (exclue) ; `'/app/agency/team'` ne
>   se résout sur rien. Le libellé vient de `entree.labelKey` — si TCK-2480/2481 ont changé la clé, lire
>   le menu rendu, pas la disposition.
> - « Commissions » sous le bailleur : précision « Aussi agent » (`nav.sidebar.groupes.aussi`, `profil:
>   agent`). `textContent` colle libellé et précision (`CommissionsAussi agent`) ; c'est voulu, la
>   précision est un `<span>` voisin.
> - Clavier : le premier `ArrowDown{ArrowDown}{Enter}` après le bouclage revient à l'option 1 du champ vide
>   du locataire : l'action « Payer mon loyer » est l'option 0, « Tableau de bord » (`/app`) l'option 1.
>   Si « À traiter » ou « Récents » s'intercalent (ils sont vides ici), corriger l'index, pas la règle.

- [ ] **Étape 2 : lancer, constater l'échec** —
  `npx vitest run src/components/layout/__tests__/PaletteDeCommandes.test.tsx` → FAIL (module absent).

- [ ] **Étape 3 : créer `src/components/layout/PaletteDeCommandes.tsx`**

```tsx
'use client';

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { profileShortLabel } from '@/components/profile/ProfileBadge';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { useCurrentLocale } from '@/i18n/hooks';
import { cheminLocalise } from '@/i18n/routing';
import { espacesAProposer } from '@/lib/espaces';
import { pastillesATraiter } from '@/lib/navigation/a-traiter';
import type { EntreeComposee } from '@/lib/navigation/composer-menu';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { lirePagesRecentes } from '@/lib/navigation/pages-recentes';
import {
  GROUPES_DE_LA_PALETTE,
  chercherDansLaPalette,
  decouperLesMots,
  optionsDeLaPalette,
  type GroupeDeLaPalette,
  type OptionDeLaPalette,
} from '@/lib/navigation/palette';
import { cn } from '@/lib/utils';
import { useCompteursDuMenu } from './useCompteursDuMenu';
import { useMenuDeLEspace } from './useMenuDeLEspace';

/** La clé de titre de chaque groupe, sous `nav.palette.groupes`. */
const TITRES: Record<GroupeDeLaPalette, string> = {
  actions: 'actions',
  'a-traiter': 'aTraiter',
  recents: 'recents',
  'aller-a': 'allerA',
  espaces: 'espaces',
};

/**
 * A17 — les arguments du crochet qui compose LE menu de la barre, transmis tels quels : un champ que le
 * crochet gagne (`modulesMasques`, TCK-2483) atteint la palette sans qu'on y touche.
 */
type ContexteDuMenuDeLEspace = Parameters<typeof useMenuDeLEspace>[0];

interface PaletteDeCommandesProps {
  readonly contexteDuMenu: ContexteDuMenuDeLEspace;
  readonly ouverte: boolean;
  readonly onOuverteChange: (ouverte: boolean) => void;
  /** A7 — l'élément focalisé à l'ouverture ; absent ou retiré du DOM : le défaut de Base UI. */
  readonly retourDuFocus?: RefObject<HTMLElement | null>;
}

/**
 * TCK-2482 (ADR-0089) — la palette de commandes de `/app` : ⌘K / Ctrl K ou le bouton de la barre haute
 * (la coque, `AppShell`, tient l'état). `Dialog` de Base UI et motif ARIA combobox/listbox écrit à la
 * main, sur le patron de `GlobalSearch` (TCK-600) : le champ garde le focus, les flèches déplacent
 * `aria-activedescendant`, Entrée ouvre, Échap ferme (Base UI).
 *
 * Son contenu n'est monté que palette ouverte : la composition du menu et les compteurs ne coûtent rien
 * palette fermée, et la saisie repart de zéro à chaque ouverture.
 */
export function PaletteDeCommandes({ ouverte, onOuverteChange, retourDuFocus, contexteDuMenu }: PaletteDeCommandesProps) {
  const t = useTranslations('nav.palette');
  const champ = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={ouverte} onOpenChange={(o) => onOuverteChange(o)}>
      <DialogContent
        data-slot="palette-de-commandes"
        initialFocus={champ}
        finalFocus={() => {
          const element = retourDuFocus?.current ?? null;
          return element !== null && element.isConnected ? element : true;
        }}
        className="top-[10vh] translate-y-0 gap-3 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{t('titre')}</DialogTitle>
        <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        <ContenuDeLaPalette contexteDuMenu={contexteDuMenu} champ={champ} fermer={() => onOuverteChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface ContenuDeLaPaletteProps {
  readonly contexteDuMenu: ContexteDuMenuDeLEspace;
  readonly champ: RefObject<HTMLInputElement | null>;
  readonly fermer: () => void;
}

function ContenuDeLaPalette({ contexteDuMenu, champ, fermer }: ContenuDeLaPaletteProps) {
  const t = useTranslations('nav.palette');
  const tMenu = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tTypes = useTranslations('profile.types');
  const router = useRouter();
  const pathname = usePathname();
  const locale = useCurrentLocale();
  const idListe = useId();
  const [saisie, setSaisie] = useState('');
  const [actif, setActif] = useState(0);
  // A8 — lus une fois par ouverture (le contenu est démonté à la fermeture).
  const [recents] = useState(() => lirePagesRecentes(contexteDuMenu.user.id));

  // S1, S2 — LE menu de la barre et SES compteurs : la palette ne juge aucun accès elle-même, n'appelle
  // ni `composerMenu` ni `estOuverte` (gardes de TCK-2483, S8), et passe le contexte INTACT (A17).
  const { menu, groupes, entrees } = useMenuDeLEspace(contexteDuMenu);
  const compteurs = useCompteursDuMenu(entrees, { agencyIsStandard: contexteDuMenu.agencyIsStandard });
  const bande = pastillesATraiter(entrees, compteurs, menu.priorites);
  const profils = useMyProfiles();
  const bascule = useSwitchActiveProfile();
  const actifId = profils.data?.meta.active_profile_id ?? null;

  const libelle = (e: EntreeComposee) => (e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : tMenu(e.labelKey));
  const options = optionsDeLaPalette(
    {
      action: menu.action,
      carte: menu.carte,
      groupes,
      pastilles: [...bande.visibles, ...bande.autres],
      espaces: espacesAProposer(profils.data?.data ?? [], actifId).filter((p) => p.id !== actifId),
      recents,
      pathname,
    },
    {
      entree: libelle,
      // Le libellé de la barre : la clé de la disposition (« Payer mon loyer »), sinon celui de l'entrée.
      action: (e) => (DISPOSITIONS[menu.persona].libelleAction ? tMenu(`actions.${e.labelKey}`) : libelle(e)),
      carte: () => tMenu('carteLocation.titre'),
      precision: (g) => (g.id === 'aussi' && g.titre !== null ? tMenu(`groupes.${g.titre}`, g.titreValeurs) : null),
      synonymes: (id) => (t.has(`synonymes.${id}`) ? decouperLesMots(t(`synonymes.${id}`)) : []),
      pastille: (p) => tMenu(`aTraiter.noms.${p.cle}`, { count: p.nombre }),
      espace: (p) => t('passerA', { espace: profileShortLabel(p, tTypes) }),
      motsEspace: decouperLesMots(t('synonymesEspace')),
    },
  );
  const resultats = chercherDansLaPalette(options, saisie);
  const indexActif = resultats.length === 0 ? -1 : Math.min(actif, resultats.length - 1);
  const idOption = (index: number) => `${idListe}-option-${index}`;
  const requete = saisie.trim();
  const parGroupe = GROUPES_DE_LA_PALETTE.map((g) => [g, resultats.filter((o) => o.groupe === g)] as const).filter(
    ([, liste]) => liste.length > 0,
  );

  const choisir = (option: OptionDeLaPalette | undefined) => {
    if (!option) return;
    const cible = option.cible;
    // A12 — la chaîne du sélecteur de profil, sans un geste de plus (toast, `router.refresh()`, cache).
    if (cible.type === 'espace') {
      if (!bascule.isPending) bascule.mutate(cible.profilId);
    } else {
      router.push(cible.publique ? cheminLocalise(cible.href, locale) : cible.href);
    }
    fermer();
  };

  const deplacer = (pas: 1 | -1) => {
    if (resultats.length === 0) return;
    const suivant = (indexActif + pas + resultats.length) % resultats.length;
    setActif(suivant);
    document.getElementById(idOption(suivant))?.scrollIntoView?.({ block: 'nearest' });
  };

  const surTouche = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      deplacer(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      deplacer(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choisir(resultats[indexActif]);
    }
  };

  return (
    <div className="grid min-w-0 gap-3">
      {/* `pr-8` : la place du bouton de fermeture du `Dialog` (A14). */}
      <div className="pr-8">
        <Input
          ref={champ}
          role="combobox"
          aria-label={t('champ')}
          aria-expanded={resultats.length > 0}
          aria-controls={resultats.length > 0 ? idListe : undefined}
          aria-autocomplete="list"
          aria-activedescendant={indexActif >= 0 ? idOption(indexActif) : undefined}
          placeholder={t('placeholder')}
          value={saisie}
          maxLength={80}
          autoComplete="off"
          onChange={(event) => {
            setSaisie(event.target.value);
            setActif(0);
          }}
          onKeyDown={surTouche}
        />
      </div>
      <p role="status" className="sr-only">
        {t('resultats', { count: resultats.length })}
      </p>
      {resultats.length === 0 && requete !== '' ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('aucun', { q: requete })}</p>
      ) : null}
      {resultats.length > 0 ? (
        <div id={idListe} role="listbox" aria-label={t('titre')} className="-mx-1 max-h-[min(60dvh,28rem)] overflow-y-auto px-1">
          {parGroupe.map(([groupe, liste]) => (
            <div key={groupe} role="group" aria-labelledby={`${idListe}-${groupe}`} className="pb-2">
              <div
                id={`${idListe}-${groupe}`}
                role="presentation"
                className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {t(`groupes.${TITRES[groupe]}`)}
              </div>
              {liste.map((option) => {
                const index = resultats.indexOf(option);
                const Icone = option.icone;
                return (
                  <div
                    key={option.cle}
                    id={idOption(index)}
                    role="option"
                    aria-selected={index === indexActif}
                    // Le champ garde le focus : un clic choisit sans le lui retirer.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActif(index)}
                    onClick={() => choisir(option)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground',
                      index === indexActif && 'bg-muted',
                    )}
                  >
                    <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{option.libelle}</span>
                    {option.precision ? (
                      <span className="shrink-0 truncate text-xs text-muted-foreground">{option.precision}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

> Si `tsc` refuse `t(\`synonymes.${id}\`)` ou `tMenu(\`aTraiter.noms.${p.cle}\`, …)` (clés typées), suivre
> la forme qu'emploie `AppSidebar` pour ses clés construites (`t(\`groupes.${…}\`)`) ; ne pas élargir le
> typage du dépôt. Si axe signale le titre de groupe (`role="presentation"` + `id`), le remplacer par
> `aria-label={t(…)}` sur le `role="group"` et un titre `aria-hidden` ; l'écrire.

- [ ] **Étape 4 : lancer, constater le vert** — commande de l'étape 2. Attendu : PASS.

- [ ] **Étape 5 : ablations**
  1. **AC4, la bascule** : `bash ablation.sh src/components/layout/PaletteDeCommandes.tsx 's{if \(!bascule\.isPending\) bascule\.mutate\(cible\.profilId\);}{void cible;}' src/components/layout/__tests__/PaletteDeCommandes.test.tsx`
     → « AC4 » rougit.
  2. **L'espace actif proposé** : `'s{\.filter\(\(p\) => p\.id !== actifId\)}{}'` → « AC4 » rougit (deux options « Passer à »).
  3. **Entrée sur la première, pas sur l'active** : `'s{choisir\(resultats\[indexActif\]\)}{choisir(resultats[0])}'`
     → « clavier » rougit.
  4. **AC5, les rôles** : `'s{role="option"}{data-role="option"}'` → « rôles ARIA » ET « AC5 » rougissent
     (listbox sans option : `aria-required-children`).

- [ ] **Étape 6 :** `npx tsc --noEmit && npm run lint && npm run check:i18n && npm run check:classes-emises`,
  puis commit — `feat(web): la palette de commandes — dialogue, combobox au clavier, bascule d’espace (TCK-2482)`.

---

### Tâche 4 : l'ouverture — ⌘K / Ctrl K, le bouton de la barre haute, la mémoire des pages (AC1)

**Fichiers :** créer `src/components/layout/usePaletteDeCommandes.ts` et son test ; modifier
`AppShell.tsx`, `AppTopbar.tsx`, `__tests__/AppTopbar.a11y.test.tsx` ; créer
`__tests__/AppShell.palette.test.tsx`.

**Interfaces :**
- Produit : `estLeRaccourciDeLaPalette(e): boolean`, `autreDialogueOuvert(racine?): boolean`,
  `useRaccourciDeLaPalette({ actif, ouverte, changer })`, `useRetenirLaPageRecente(compte, chemin)` ;
  `AppTopbarProps.onOuvrirPalette?: (depuis: HTMLElement) => void`.

- [ ] **Étape 1 : écrire `src/components/layout/__tests__/usePaletteDeCommandes.test.ts`** (rouge)

```ts
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autreDialogueOuvert, estLeRaccourciDeLaPalette, useRaccourciDeLaPalette } from '../usePaletteDeCommandes';

/** TCK-2482 (A6) — les règles du raccourci, une par une. */
const touche = (o: Partial<Parameters<typeof estLeRaccourciDeLaPalette>[0]> = {}) => ({
  key: 'k', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false,
  target: document.body as EventTarget | null, ...o,
});
const presser = (init: KeyboardEventInit) => {
  const ev = new KeyboardEvent('keydown', { cancelable: true, ...init });
  window.dispatchEvent(ev);
  return ev;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('estLeRaccourciDeLaPalette', () => {
  it('Ctrl K et ⌘K, majuscule comprise', () => {
    expect(estLeRaccourciDeLaPalette(touche())).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ key: 'K' }))).toBe(true);
  });

  it('ni K seul, ni avec Alt ou Maj, ni répété, ni une autre touche', () => {
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ altKey: true }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ shiftKey: true }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ repeat: true }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ key: 'j' }))).toBe(false);
  });

  it('un champ qui s’en sert l’a intercepté (`defaultPrevented`) : la palette s’efface', () => {
    expect(estLeRaccourciDeLaPalette(touche({ defaultPrevented: true }))).toBe(false);
  });

  it('dans un `contenteditable` : non ; dans `contenteditable="false"` ou un champ de saisie : oui', () => {
    const editeur = document.createElement('div');
    editeur.setAttribute('contenteditable', '');
    const dedans = document.createElement('span');
    editeur.append(dedans);
    const fige = document.createElement('div');
    fige.setAttribute('contenteditable', 'false');
    const champ = document.createElement('input');
    document.body.append(editeur, fige, champ);
    expect(estLeRaccourciDeLaPalette(touche({ target: dedans }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ target: fige }))).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ target: champ }))).toBe(true);
  });
});

describe('useRaccourciDeLaPalette', () => {
  it('ouvre, et prive le navigateur de son propre Ctrl K', () => {
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: true, ouverte: false, changer }));
    const ev = presser({ key: 'k', ctrlKey: true });
    expect(changer).toHaveBeenCalledWith(true);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('palette ouverte, le même raccourci la referme', () => {
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: true, ouverte: true, changer }));
    presser({ key: 'k', metaKey: true });
    expect(changer).toHaveBeenCalledWith(false);
  });

  it('ne s’ouvre pas par-dessus un autre dialogue ouvert, mais se referme toujours', () => {
    const autre = document.createElement('div');
    autre.setAttribute('role', 'dialog');
    autre.setAttribute('data-open', '');
    document.body.append(autre);
    expect(autreDialogueOuvert()).toBe(true);
    const changer = vi.fn();
    const { rerender } = renderHook((p: { ouverte: boolean }) => useRaccourciDeLaPalette({ actif: true, ouverte: p.ouverte, changer }), {
      initialProps: { ouverte: false },
    });
    const ev = presser({ key: 'k', ctrlKey: true });
    expect(changer).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    rerender({ ouverte: true });
    presser({ key: 'k', ctrlKey: true });
    expect(changer).toHaveBeenCalledWith(false);
  });

  it('inactif (plein écran) : rien, et le navigateur garde son raccourci', () => {
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: false, ouverte: false, changer }));
    const ev = presser({ key: 'k', ctrlKey: true });
    expect(changer).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});
```

- [ ] **Étape 2 : écrire `src/components/layout/__tests__/AppShell.palette.test.tsx`** (rouge)

  Recopier EN TÊTE la liste des `vi.mock` de `AppShell.menu-et-credits.test.tsx` telle qu'elle est le
  jour venu (S7), en remplaçant celui de `next/navigation` par le suivant, et en ajoutant celui de
  `@/hooks/useProfiles` :

```tsx
const chemin = vi.hoisted(() => ({ valeur: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.valeur,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
```

  puis :

```tsx
/**
 * TCK-2482 (AC1) — la palette dans la coque `/app` montée en entier : ⌘K / Ctrl K et le bouton de la
 * barre haute l'ouvrent, Échap la ferme et rend le focus à l'élément d'avant ; rien en plein écran ; la
 * coque retient la page sur l'appareil.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { lirePagesRecentes } from '@/lib/navigation/pages-recentes';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

// … les `vi.mock` recopiés (voir ci-dessus) …

const NOM = 'Aller à une page ou changer d’espace';
function utilisateur(roles: UserRole[]): User {
  return { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
}
function monter(roles: UserRole[] = ['customer', 'tenant']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppShell user={utilisateur(roles)} agencyIsStandard>
            <button type="button">avant</button>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  chemin.valeur = '/app';
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('TCK-2482 — la palette dans la coque', () => {
  it('AC1 — Ctrl K ouvre la palette sur son champ ; Échap la ferme et rend le focus à l’élément précédent', async () => {
    const u = userEvent.setup();
    monter();
    const avant = screen.getByRole('button', { name: 'avant' });
    avant.focus();
    await u.keyboard('{Control>}k{/Control}');
    const dialogue = await screen.findByRole('dialog', { name: NOM });
    expect(within(dialogue).getByRole('combobox')).toHaveFocus();
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(avant).toHaveFocus();
  });

  it('⌘K l’ouvre aussi, et le referme', async () => {
    const u = userEvent.setup();
    monter();
    await u.keyboard('{Meta>}k{/Meta}');
    expect(await screen.findByRole('dialog', { name: NOM })).toBeInTheDocument();
    await u.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
  });

  it('le bouton de la barre haute l’ouvre ; à la fermeture, le focus lui revient', async () => {
    const u = userEvent.setup();
    monter();
    const bouton = screen.getByRole('button', { name: NOM });
    expect(bouton).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    await u.click(bouton);
    expect(await screen.findByRole('dialog', { name: NOM })).toBeInTheDocument();
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(bouton).toHaveFocus();
  });

  it('plein écran (/app/properties/new) : ni bouton, ni raccourci', async () => {
    chemin.valeur = '/app/properties/new';
    const u = userEvent.setup();
    monter(['customer', 'agent']);
    expect(screen.queryByRole('button', { name: NOM })).toBeNull();
    await u.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog', { name: NOM })).toBeNull();
  });

  it('la coque retient la page courante sur l’appareil, pas une page plein écran', () => {
    chemin.valeur = '/app/payments';
    const { unmount } = monter();
    expect(lirePagesRecentes(1)).toEqual(['/app/payments']);
    unmount();
    chemin.valeur = '/app/properties/new';
    monter(['customer', 'agent']);
    expect(lirePagesRecentes(1)).toEqual(['/app/payments']);
  });
});
```

- [ ] **Étape 3 : lancer, constater l'échec** —
  `npx vitest run src/components/layout/__tests__/usePaletteDeCommandes.test.ts src/components/layout/__tests__/AppShell.palette.test.tsx`
  → FAIL.

- [ ] **Étape 4 : créer `src/components/layout/usePaletteDeCommandes.ts`**

```ts
'use client';

import { useEffect, useEffectEvent } from 'react';
import { retenirPage } from '@/lib/navigation/pages-recentes';

type ToucheDuRaccourci = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat' | 'defaultPrevented' | 'target'
>;

/**
 * TCK-2482 (A6) — ⌘K (macOS) ou Ctrl K ouvre la palette.
 *
 * Relevé le 2026-11-05 : aucun champ de `/app` ne se sert de ce raccourci — aucun éditeur riche, aucun
 * `contenteditable` ; la recherche globale de la console (`GlobalSearch`, TCK-600) le prend dans une AUTRE
 * coque. La règle tient pour l'avenir SANS liste : un champ qui s'en sert l'intercepte et appelle
 * `preventDefault()`, et la palette s'efface devant `defaultPrevented` ; un `contenteditable` garde ses
 * raccourcis. Il marche depuis un champ de saisie ordinaire.
 */
export function estLeRaccourciDeLaPalette(e: ToucheDuRaccourci): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return false;
  if (e.key.toLowerCase() !== 'k') return false;
  const cible = e.target;
  return !(cible instanceof Element && cible.closest('[contenteditable]:not([contenteditable="false"])') !== null);
}

/**
 * Un autre dialogue est ouvert — le tiroir, un assistant d'accueil (`role="dialog"` + `data-open`, Base
 * UI) : la palette ne s'ouvre pas par-dessus. Deux modales empilées se disputent le focus.
 */
export function autreDialogueOuvert(racine: ParentNode = document): boolean {
  return racine.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]') !== null;
}

interface RaccourciDeLaPalette {
  /** `false` en plein écran : le parcours porte sa propre sortie, le navigateur garde son raccourci. */
  readonly actif: boolean;
  readonly ouverte: boolean;
  readonly changer: (ouverte: boolean) => void;
}

export function useRaccourciDeLaPalette({ actif, ouverte, changer }: RaccourciDeLaPalette): void {
  const surTouche = useEffectEvent((event: KeyboardEvent) => {
    if (!estLeRaccourciDeLaPalette(event)) return;
    if (!ouverte && autreDialogueOuvert()) return;
    // Firefox, et Chrome sous Windows et Linux, y mettent leur propre recherche.
    event.preventDefault();
    changer(!ouverte);
  });
  useEffect(() => {
    if (!actif) return undefined;
    const ecouter = (event: KeyboardEvent) => surTouche(event);
    window.addEventListener('keydown', ecouter);
    return () => window.removeEventListener('keydown', ecouter);
  }, [actif]);
}

/** TCK-2482 (A8) — la coque retient chaque page de `/app` visitée ; `null` : rien (plein écran). */
export function useRetenirLaPageRecente(compte: number, chemin: string | null): void {
  useEffect(() => {
    if (chemin !== null) retenirPage(compte, chemin);
  }, [compte, chemin]);
}
```

- [ ] **Étape 5 : `AppShell.tsx`** (relire le fichier d'abord : S6)
  - Imports : `useRef` (avec `useState`), `PaletteDeCommandes` (`./PaletteDeCommandes`),
    `useRaccourciDeLaPalette`, `useRetenirLaPageRecente` (`./usePaletteDeCommandes`).
  - Si `pathname` n'existe pas encore, remplacer `const pleinEcran = estPleinEcran(usePathname());` par
    `const pathname = usePathname();` + `const pleinEcran = estPleinEcran(pathname);`.
  - Sous `pleinEcran` :

```tsx
  // TCK-2482 — la palette de commandes : une par coque, ouverte par ⌘K / Ctrl K ou par la barre haute.
  // A7 — l'élément focalisé à l'ouverture (le bouton touché, que Safari iOS ne focalise pas) reçoit le
  // focus à la fermeture.
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const retourDuFocus = useRef<HTMLElement | null>(null);
  const changerPalette = (ouverte: boolean, depuis?: HTMLElement | null) => {
    if (ouverte) {
      const focalise = document.activeElement;
      retourDuFocus.current = depuis ?? (focalise instanceof HTMLElement ? focalise : null);
    }
    setPaletteOuverte(ouverte);
  };
  useRaccourciDeLaPalette({ actif: !pleinEcran, ouverte: paletteOuverte, changer: changerPalette });
  useRetenirLaPageRecente(user.id, pleinEcran ? null : pathname);
```

  - `<AppTopbar … />` reçoit `onOuvrirPalette={(depuis) => changerPalette(true, depuis)}`.
  - Juste après le `<div className="flex min-h-0 flex-1 overflow-hidden">…</div>` (et DANS le
    `PreferencesDuMenuProvider` de TCK-2480, pour que le menu de la palette soit celui de la barre) :

```tsx
        {pleinEcran ? null : (
          <PaletteDeCommandes
            ouverte={paletteOuverte}
            onOuverteChange={(ouverte) => changerPalette(ouverte)}
            // A17 — les mêmes arguments que ceux du menu de la barre. TCK-2483 (S8) y ajoutera
            // `modulesMasques`, ici et pour la barre, au même endroit.
            contexteDuMenu={{ user, agencyIsStandard, typeProfilActif, agencySuspended }}
            retourDuFocus={retourDuFocus}
          />
        )}
```

  > Si `AppShell` construit déjà un objet d'arguments pour `useMenuDeLEspace` ou `AppSidebar` (selon la
  > forme livrée par TCK-2481), passer CE MÊME objet plutôt qu'un littéral : une seule source pour la
  > barre, les onglets et la palette.

- [ ] **Étape 6 : `AppTopbar.tsx`**
  - Imports : `Search` (avec `Menu` s'il reste), `useSyncExternalStore` (`react`).
  - Au-dessus du composant :

```tsx
/** TCK-2482 (A11) — `⌘ K` sur Apple, `Ctrl K` ailleurs ; `Ctrl K` au rendu serveur, sans écart d'hydratation. */
const sAbonnerARien = () => () => {};
const estSurApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);
const jamaisSurApple = () => false;
```

  - Dans `AppTopbarProps` :

```tsx
  /** TCK-2482 — ouvre la palette de commandes, depuis ce bouton. Absent : pas de bouton (coques de test). */
  onOuvrirPalette?: (depuis: HTMLElement) => void;
```

  - Dans le corps : `const tPalette = useTranslations('nav.palette');` et
    `const surApple = useSyncExternalStore(sAbonnerARien, estSurApple, jamaisSurApple);`
  - En TÊTE du groupe `ml-auto flex min-w-0 shrink items-center gap-2`, avant `<ProfileSwitcher … />` :

```tsx
        {/* TCK-2482 (A11) — la palette : à toutes les largeurs (sous `md`, c'est sa seule porte), icône
            seule sous `lg`. Écrit à la main : il porte `ANNEAU_FOCUS`, comme le logo. */}
        {onOuvrirPalette ? (
          <button
            type="button"
            data-slot="ouvrir-palette"
            onClick={(event) => onOuvrirPalette(event.currentTarget)}
            aria-label={tPalette('titre')}
            aria-keyshortcuts="Control+K Meta+K"
            className={cn(
              'relative inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-md bg-white/10 text-sm text-white/90 after:absolute after:-inset-1 hover:bg-white/20 lg:w-auto lg:px-2.5',
              ANNEAU_FOCUS,
            )}
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden lg:inline">{tPalette('ouvrir')}</span>
            <kbd aria-hidden className="hidden rounded bg-white/15 px-1.5 font-mono text-[11px] lg:inline">
              {surApple ? tPalette('raccourciMac') : tPalette('raccourciAutre')}
            </kbd>
          </button>
        ) : null}
```

  - Mettre à jour le docblock d'`ANNEAU_FOCUS` : il couvre désormais aussi le bouton de la palette.

- [ ] **Étape 7 : `AppTopbar.a11y.test.tsx`** — ajouter un cas qui monte `AppTopbar` avec
  `onOuvrirPalette={vi.fn()}` et vérifie que le bouton « Aller à une page ou changer d'espace » porte les
  trois classes d'`ANNEAU_FOCUS` (`focus-visible:outline-2`, `focus-visible:outline-offset-2`,
  `focus-visible:outline-white`) — même forme que les cas existants du fichier ; et un cas sans la prop :
  aucun bouton.

- [ ] **Étape 8 : lancer, constater le vert** — commande de l'étape 3, puis le filet de la coque :
  `npx vitest run src/components/layout src/lib/navigation` → PASS. Si un test existant d'`AppShell` ou
  d'`AppTopbar` compte les boutons de la barre haute, mettre son attente à jour et l'écrire.

- [ ] **Étape 9 : ablations**
  1. **AC1, retour du focus** : `bash ablation.sh src/components/layout/PaletteDeCommandes.tsx 's{return element !== null && element\.isConnected \? element : true;}{return false;}' src/components/layout/__tests__/AppShell.palette.test.tsx`
     → « AC1 » et « le bouton … le focus lui revient » rougissent.
  2. **Alt** : `bash ablation.sh src/components/layout/usePaletteDeCommandes.ts 's{ \|\| e\.altKey}{}' src/components/layout/__tests__/usePaletteDeCommandes.test.ts`
     → « ni K seul, ni avec Alt » rougit.
  3. **Autre dialogue** : `'s{    if \(!ouverte && autreDialogueOuvert\(\)\) return;\n}{}'` → « ne s'ouvre pas par-dessus » rougit.
  4. **`defaultPrevented`** : `'s{ \|\| e\.defaultPrevented}{}'` → « un champ qui s'en sert » rougit.
  5. **Mémoire des pages** (`AppShell.tsx`) : `'s{  useRetenirLaPageRecente\([^\n]+\n}{}'` →
     « la coque retient la page » rougit.

- [ ] **Étape 10 :** `npx tsc --noEmit && npm run lint && npm run check:i18n && npm run check:classes-emises`,
  puis commit — `feat(web): ⌘K / Ctrl K et le bouton de la barre haute ouvrent la palette (TCK-2482)`.

---

### Tâche 5 : la politique de confidentialité nomme les pages récentes (A15)

**Fichiers :** `takussan-web/src/content/legal/privacy.ts`, `editeur.ts`, `__tests__/textes.test.ts` ;
`takussan-api/app/Services/Property/PublishReadiness.php`.

- [ ] **Étape 1 : le test qui échoue** — en fin de `src/content/legal/__tests__/textes.test.ts`
  (`<J>` = le jour du commit, en chiffres) :

```ts
/**
 * TCK-2482 (A15) — la palette de commandes retient sur l'appareil les pages de l'espace ouvertes
 * récemment (`src/lib/navigation/pages-recentes.ts`) : la politique les nomme dans le stockage local.
 */
describe('politique de confidentialité — les pages récentes de la palette', () => {
  it('les nomme dans le stockage local, dans les deux langues', () => {
    expect(privacy.fr).toContain('pages de votre espace ouvertes récemment (palette de commandes)');
    expect(privacy.en).toContain('recently opened pages of your space (command palette)');
  });

  it('la version des documents avance avec elles', () => {
    expect(VERSION_DOCUMENTS).toEqual({ date: '<J> novembre 2026', dateEn: 'November <J>, 2026' });
  });
});
```

  `grep -n "VERSION_DOCUMENTS).toEqual" src/content/legal/__tests__/textes.test.ts` : le cas de TCK-2472
  (« la version des documents avance avec le journal ») fige `4 novembre 2026` — il rougira ; le passer à
  la nouvelle date, avec en commentaire « avancée par TCK-2482 ».

- [ ] **Étape 2 :** `npx vitest run src/content/legal/__tests__/textes.test.ts` → FAIL.

- [ ] **Étape 3 : `privacy.ts`**
  - fr (l. 169) : remplacer `- **stockage local du navigateur** — biens consultés récemment, favoris`
    par `- **stockage local du navigateur** — biens consultés récemment, pages de votre espace ouvertes récemment (palette de commandes), favoris`.
  - en (l. 346) : remplacer `- **browser local storage** — recently viewed properties, offline favourites`
    par `- **browser local storage** — recently viewed properties, recently opened pages of your space (command palette), offline favourites`.
- [ ] **Étape 4 : la version** — `editeur.ts` : `VERSION_DOCUMENTS = { date: '<J> novembre 2026', dateEn: 'November <J>, 2026' }` ;
  `PublishReadiness.php` : `TERMS_VERSION = '2026-11-<JJ>'` et la date citée dans son docblock.
  Puis `./vendor/bin/pint app/Services/Property/PublishReadiness.php` (dans `takussan-api/`),
  `node scripts/check-terms-version.mjs` (racine) → sortie 0.
- [ ] **Étape 5 :** `npx vitest run src/content/legal` → PASS ; côté API,
  `php bin/impacted-tests.php --run --connus` (jamais `--run` seul).
- [ ] **Étape 6 :** commit — `docs(legal): la politique de confidentialité nomme les pages récentes de la palette (TCK-2482)`.

---

### Tâche 6 : mesure au navigateur, notes et livraison

Méthode : `./dev.sh` (API + front), Chrome piloté en CDP direct (`docs/qa/responsive-2026-09-02.md` ;
mémoire « Mesure au navigateur par CDP direct »). Comptes du seeder : relever les e-mails dans
`takussan-api/database/seeders/` (un locataire, un compte à deux profils dans une agence standard, un
admin d'agence). Chaque relevé, daté, va dans les notes du ticket.

- [ ] **Étape 1 — largeurs** : à 320, 390, 768 et 1366 px sur `/app`, `innerWidth` relevé et
  `scrollWidth − innerWidth = 0` (TCK-505 : le bouton s'ajoute au groupe de droite). Le bouton est
  visible aux quatre largeurs ; « Aller à… » et le raccourci seulement à 1366.
- [ ] **Étape 2 — AC1** : à 1366, `Input.dispatchKeyEvent` (`modifiers: 2`, Ctrl ; puis `4`, Meta) ouvre la
  palette, `document.activeElement` est le combobox ; Échap la ferme et rend le focus à l'élément focalisé
  avant (relever son `outerHTML` court). Ouvrir par un clic sur le bouton : le focus revient au bouton.
- [ ] **Étape 3 — AC2** : compte locataire, taper « loyer » : la première option est « Payer mon loyer »,
  la première de « Aller à » est « Paiements » ; Entrée → `/app/payments`.
- [ ] **Étape 4 — AC4** : compte à deux profils, taper « passer », choisir l'autre espace. Relever :
  `PATCH /api/me/active-profile` → 200, le toast, la barre recomposée (en-tête d'espace, action ➊,
  groupes), puis la palette rouverte (« Passer à » propose l'espace quitté ; une entrée de l'autre profil
  porte « Aussi … »).
- [ ] **Étape 5 — AC5 au navigateur** : palette ouverte (champ vide, puis « zzzz »), injecter
  `takussan-web/node_modules/axe-core/axe.min.js` par `Runtime.evaluate` et lancer
  `axe.run(document.querySelector('[data-slot="palette-de-commandes"]'))` : aucune violation, contrastes
  RÉELS compris (jsdom ne les calcule pas).
- [ ] **Étape 6 — coût** : palette ouverte 30 s sur `/app` (admin d'agence, 1366) : les requêtes de
  compteurs relevées par `Network` ne doublent pas celles de la barre (mêmes clés de cache, A13).
- [ ] **Étape 7 — 390 px** : la palette tient sans débord horizontal, la liste défile seule, le bouton de
  fermeture ne recouvre pas le champ.
- [ ] **Étape 8 — notes du ticket** : les arbitrages A1 à A16, les écarts au plan, les ablations et leur
  résultat, les relevés. Cocher le delta et les AC prouvés. Commit —
  `docs(backlog): TCK-2482, notes d’implémentation et relevés au navigateur (TCK-2482)`.
- [ ] **Étape 9 :** les gardes du dépôt (`for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`,
  racine), puis demander au porteur l'accord de push ; avec l'accord : push, PR vers `dev`, la CI joue
  les suites.
