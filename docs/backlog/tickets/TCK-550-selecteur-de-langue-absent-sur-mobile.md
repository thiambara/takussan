---
id: TCK-550
title: "Aucun sélecteur de langue n'est atteignable sur mobile : FR / EN / WO n'existent que dans la barre de bureau"
status: done
phase: P1
family: bug
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, mobile, i18n, navbar, footer]
---

## Objectif utilisateur

Sur téléphone, un visiteur qui arrive sur le site dans une langue qu'il ne lit pas passe en
français, anglais ou wolof en deux gestes, depuis n'importe quelle page publique.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat N3). `LanguageSwitcher` n'est rendu que dans le bloc
d'actions `hidden lg:flex` de `Navbar` ; ni le menu mobile ni le pied de page ne le proposent.
Mesuré à 390 et 360 px : le seul « FR » du DOM est invisible (`offsetParent === null`).
TCK-159 (`done`) a câblé le sélecteur public, mais ses critères ne portaient que sur la barre de
bureau. Un visiteur qui suit un lien partagé vers `/fr/…` reste donc en français, alors que la
sélection de la langue est une fonctionnalité P0.

## Contrat de données

Aucun endpoint. Le changement de langue suit le mécanisme existant (préfixe d'URL puis cookie,
ADR-0026 §5) ; pour un utilisateur connecté, la préférence suit le chemin déjà en place.

## Direction UX / Artistique

- Dans le menu mobile : un contrôle segmenté **FR · EN · WO**, visible sans défilement, la langue
  courante marquée. Pas une liste déroulante.
- Dans le pied de page : le même choix, pour qui ne passe jamais par le menu.
- Les libellés des langues restent dans leur propre langue (« Wolof », pas « Wolof (langue) »).

## Contraintes strictes (métier)

- Changer de langue conserve le chemin et la requête courants (`/fr/properties?type=villa` →
  `/wo/properties?type=villa`).
- L'état sélectionné est annoncé aux technologies d'assistance (`aria-current` ou équivalent).

## Delta à produire

- [x] Choix de langue dans le menu mobile de `Navbar`.
- [x] Choix de langue dans le pied de page public.
- [x] Test : le choix est présent et visible sous `lg` ; changer de langue conserve chemin et requête.

## Critères d'acceptation

- [x] AC1 — à 360 × 740, menu ouvert, trois contrôles FR, EN, WO sont visibles (boîte non nulle,
      dans le viewport sans défilement du panneau), avec au moins 44 px de hauteur de zone tactile.
- [x] AC2 — depuis `/fr/properties?type=villa&page=2`, choisir WO mène à
      `/wo/properties?type=villa&page=2`, textes affichés en wolof.
- [x] AC3 — le pied de page porte le même choix, visible à 360 px.
- [x] AC4 — la langue courante est la seule marquée comme sélectionnée, dans les deux emplacements.

## Hors périmètre

- La traduction de contenus manquants en `wo` (dettes i18n distinctes).
- Le sélecteur de la barre de bureau, inchangé.

## Notes d'implémentation

### Re-mesure des prémisses (2026-09-23, avant tout changement)

Banc : `next dev -p 3021` du worktree, Chrome headless CDP, `mobile:true`, API partagée :8002.
Charge au moment de la mesure : `load averages: 44.07 87.79 75.17` sur 8 cœurs.

- **Tenu** — à 360 × 740 et 390 × 844 sur `/fr/properties?type=villa&page=2` (`innerWidth` 360 et
  390, viewport non élargi) : un seul contrôle « FR » dans le DOM, `offsetParent === null`, boîte
  nulle. Menu ouvert : **0** contrôle FR/EN/WO dans le panneau. Pied de page : **0**.
- **Écart trouvé** — le docblock de `LanguageSwitcher` affirmait que le commutateur est « monté
  dans la Navbar et le pied de page — donc sur toute la surface publique ». Faux : `Footer.tsx`
  n'importait aucun sélecteur (`grep -n LanguageSwitcher src/components/home/Footer.tsx` → rien).
  Le motif invoqué pour lire `window.location.search` au clic (éviter `useSearchParams()`) reste
  juste, mais sa justification citait un montage inexistant.
- **Contrainte de test trouvée** — `Footer.test.tsx` (TCK-437, AC1) exigeait « ni bouton » dans le
  pied de page et que tout élément interactif y soit un lien ; `Footer.liens-localises.test.tsx`
  (TCK-461) exige que le nombre d'ancres égale le nombre d'entrées de `footerLinks`. Un choix de
  langue dans le pied de page contredit forcément l'une des deux gardes, selon qu'il est fait de
  boutons ou de liens.


### Défaut trouvé en vérifiant AC2/AC4 : la langue de la RACINE ne suit pas le changement, une fois sur deux

Après un choix de langue, l'URL passe bien à `/wo/properties?type=villa&page=2` et les textes sont
en wolof, mais `<html lang>` reste `fr` et `useLocale()` rend `fr` sous la racine — le contrôle
marque alors **FR** comme courant sur une page en wolof (AC4 rouge). Relevé par série de lectures
à 0,5 / 2 / 5 / 11 s après la navigation : l'état ne se rattrape pas.

**Préexistant, et pas propre au mobile** : témoin sur le code d'AVANT ce ticket
(`git show HEAD:…/LanguageSwitcher.tsx` remis en place le temps de la mesure, puis restauré), menu
déroulant de bureau à 1280 px, 5 passages : `lang` final = `wo, fr, fr, wo, wo` — **2 sur 5 restent
en `fr`**. Cause : le layout racine (`src/app/layout.tsx`, qui pose `<html lang>` et le provider de
locale dont hérite `IntlProvider` de `[locale]/(public)`) est partagé entre `/fr/…` et `/wo/…` ;
la navigation douce ne le re-rend pas, et seul le rafraîchissement déclenché par le
`revalidatePath` de `setLocaleAction` — rendu pour l'URL d'AVANT — le touche, en course avec le
`router.push`.

**Correctif** : `router.refresh()` après le `router.push` dans la mécanique partagée
(`useChangementDeLangue`). Mesuré après : **10 passages sur 10** finissent en `lang` = langue
choisie, langue courante marquée juste (5 par le menu déroulant de bureau à 1280 px, 5 par le menu
mobile à 360 px). Test : `ChoixDeLangue.test.tsx` exige l'ordre `push` puis `refresh` ; rouge par
ablation de la ligne.

### Décisions

- **Une seule mécanique.** Ce que faisait `LanguageSwitcher` (cookie + préférence de compte par
  `setLocaleAction`, puis navigation vers le même chemin et la même requête) est extrait dans
  `src/hooks/useChangementDeLangue.ts` ; le menu déroulant de bureau et le nouveau contrôle
  segmenté `src/components/shared/ChoixDeLangue.tsx` l'appellent tous deux. Le rendu de bureau
  n'a pas changé (mesuré à 1280 : déclencheur « FR » visible, 54 × 28, bouton de menu mobile
  masqué, aucun groupe segmenté dans la barre).
- **Des boutons, pas des liens.** `aria-current="true"` sur la seule langue courante (la
  sémantique du menu de bureau), `lang` et nom accessible en endonyme (« Français », « English »,
  « Wolof »), libellé visible « FR/EN/WO » contenu dans le nom (WCAG 2.5.3). Des liens auraient
  rompu `Footer.liens-localises.test.tsx` (TCK-461 : autant d'ancres que d'entrées, toutes via
  `LienLocalise`) ; des boutons rompaient l'AC1 de `Footer.test.tsx` (TCK-437, « ni bouton »).
  Cette dernière garde est resserrée plutôt que relâchée : les SEULS boutons tolérés sont les
  trois du groupe « Langue », et un test éprouve qu'ils agissent.
- **Dans le menu : entre les liens et le bloc de compte**, pas en bas — il reste au-dessus du
  bloc de compte, dont la hauteur varie avec la connexion.
- **Dans le pied de page : sous la signature**, pas dans la barre du bas. Mesuré dans la barre du
  bas (témoin : même page, contrôle masqué) : à 1024 px, liens juridiques 24 → 48 px et copyright
  20 → 40 px de haut, repliés sur deux lignes par le troisième élément. Sous la signature, la
  barre du bas retrouve exactement ses hauteurs d'avant à 768, 1024 et 1280. À 1024 la colonne
  fait 188 px : le contrôle passe à la ligne (`flex-wrap`) sans déborder.
- **Cliquet `ENCRES_INVERSES` 243 → 244** (`surface-publique.contraste.test.ts`) : +1 de
  `ChoixDeLangue` (les choix non courants en `text-muted-foreground` sans fond propre), relevé
  fichier par fichier par `couplesDuFichier` ; `Footer` 4, `Navbar` 14, `LanguageSwitcher` 1,
  inchangés.

### Mesures des AC (navigateur, `next dev -p 3021`, Chrome headless CDP, 2026-09-23)

- **AC1** — 360 × 740, `mobile:true`, `innerWidth` 360 (viewport non élargi, `scrollWidth` 360),
  menu ouvert : FR, EN, WO à y = 316…360, boîtes 44 × 44, 44 × 44, 49 × 44, dans le viewport et
  dans le panneau (`scrollTop` 0, `scrollHeight` = `clientHeight`). Déconnecté : panneau 68 → 507.
  **Connecté** (`owner1@dakarimmo.sn`, session par `set-token`) : panneau 68 → 615, mêmes boîtes.
- **AC2** — depuis `/fr/properties?type=villa&page=2`, WO par le menu → `/wo/properties?type=villa&page=2`,
  `<html lang="wo">`, `h1` « Wiila », bouton de menu « Ubbil menu bi », pied de page en wolof,
  cookie `NEXT_LOCALE=wo`. Aussi : WO par le pied de page, EN par le menu → `/en/…`, `lang="en"`.
- **AC3** — pied de page à 360 : groupe « Langue » visible, trois boutons de 44 px de haut, dans
  le viewport une fois défilé, aucun débordement (`scrollWidth` 360). En `en` et `wo` : 360 aussi.
- **AC4** — au chargement de `/fr/…`, `/en`, `/wo` : un seul `aria-current`, le bon, dans le menu
  ET le pied de page. Après changement : cf. le correctif ci-dessus (10/10).

### Écart NON corrigé — la préférence d'un utilisateur connecté n'est jamais enregistrée

Vérifié connecté : après un passage en WO, `users.preferred_language` de `owner1@dakarimmo.sn`
reste `fr` (lecture seule en base). Cause : `setLocaleAction` envoie
`PATCH /api/users/me`, **route qui n'existe pas** (`php artisan route:list --path=users/me` →
aucune ; la route réelle est `PATCH /api/me`, dont `UpdateMeRequest` n'accepte pas
`preferred_language`). L'échec est avalé par le `catch` de l'action. Préexistant, et le contrat du
ticket renvoie explicitement au « chemin déjà en place » : hors périmètre, à ouvrir en ticket
(front + back).
