---
id: TCK-567
title: "Carrousel de bienvenue sans bloc vide sur téléphone, statut d'export de données traduit et suivi"
status: doing
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [front, mobile, onboarding, welcome, privacy, i18n, a11y]
---

## Objectif utilisateur

À la première connexion, le carrousel de bienvenue se lit comme une présentation composée : une
illustration, un titre, une phrase, puis les commandes — sans grand vide blanc sur téléphone. Dans
« Confidentialité > Mes données », l'utilisateur lit l'état de son export dans sa langue (« En
attente », « Prêt »…), sait qu'un e-mail suivra, et voit la ligne passer à « Prêt » sans recharger.

## Contexte

Retour testeur du 2026-09-23 (web + mobile, `preview.takussan.com`, compte propriétaire « Fa Diop »).
Deux points relèvent de ce ticket.

### M10 — « Les 3 écrans du carrousel ont des espaces vides » — **confirmé**

Capture : carrousel client « Find your perfect property » à 390 px, un grand bloc blanc entre le
texte et les trois pastilles.

Mécanisme, établi par lecture du code puis mesuré :

- `WelcomeModal` est plein écran sous `sm` (`h-[100dvh]`), conformément à TCK-251 (« modale plein
  écran (mobile) … illustration au-dessus »).
- Le seul enfant qui grandissait était un espaceur **vide** (`<div className="flex-1" />`) posé
  entre le texte et les pastilles.
- `WelcomeSlide.illustration` existait depuis TCK-251, mais **aucun des cinq parcours n'en passait**
  (`grep illustration` hors `components/welcome/` → 0 site) : toute la hauteur libre allait au vide.
- Mesure (maquette fidèle aux classes du composant, Chrome headless par CDP, port 9368, émulation
  `mobile: true`) : à 390 × 844, **593 px** séparent le bas du texte du haut des pastilles, pour
  une modale de 844 px. La capture du testeur montre exactement cette géométrie.

**Remesuré le 2026-09-23 sur le DOM RÉEL du composant** (réparation 1, après la vérification
adverse) : le rendu de `WelcomeModal` par vitest est injecté dans une page qui charge la CSS
**compilée de l'application** (`src/app/globals.css` passée par `@tailwindcss/postcss`), polices
Bricolage/DM Sans, Chrome headless par CDP (port 9368). Le modèle de HEAD, rendu de la même façon
avec les diapositives du parcours client en `en`, donne **590 px** de vide à 390 × 844 (386 px à
360 × 640) — la capture du testeur, au pixel près. La maquette HTML de la première passe forçait
`leading-snug` sur le titre alors que `twMerge` le retire dans l'application : la mesure sur DOM réel
remplace la sienne.

Non observé sur `preview.takussan.com` : la modale n'apparaît qu'à un compte connecté qui ne l'a
jamais vue, et la consigne interdit de se connecter ou de soumettre un formulaire.

**Parcours administrateur d'agence — relevé par la vérification adverse.**
`AgencyStandardWelcomeWizard` ne passe aucune illustration (fichier du périmètre d'un autre groupe
de la vague). Avec la scène centrée de la première passe, son carrousel gardait **295 px** de vide
à 390 × 844 (DOM réel). La cause n'est pas ce parcours-là : c'est que la modale acceptait une
diapositive sans illustration et lui laissait la hauteur réservée. Elle ne l'accepte plus — une
diapositive non illustrée reçoit `ILLUSTRATION_PAR_DEFAUT` (`Sparkles`, neutre) : **123 px**
à 390 × 844, tout parcours présent ou futur compris.

**Centrage de la scène — relevé par la vérification adverse.** Le `justify-center` de la scène
n'était gardé par aucun test. Mesuré sur DOM réel, la mutation `justify-start` rend **204 px** de
vide sous le texte avec illustration (au lieu de 110), et **574 px** sur une diapositive sans
illustration — le défaut du testeur. Il est désormais gardé.

**Seconde vérification adverse — ce qui REMPLIT la hauteur n'était pas gardé (réparation 2).**
La hauteur réservée était portée par la boîte `welcome-illustration` (`h-[clamp(…)]`), la peinture
par l'enfant `WelcomeIllustration` (`h-full` + `bg-muted`). Reproduit avant de corriger : retirer la
hauteur de la boîte (mutation C) ou le `h-full` de l'enfant (mutation B) laissait
`src/components/welcome` à **18/18 vert**, et la capture de la mutation B montre le bloc blanc du
testeur revenu (panneau peint de 80 px dans une boîte de 320). Pire, la mesure d'AC1 cochait la
mutation B : elle mesurait l'écart entre des boîtes **réservées**, pas ce qui est **peint**.

Correctif à la cause : la boîte porte désormais **à la fois** sa hauteur et sa peinture
(`relative overflow-hidden rounded-2xl bg-muted`) ; `WelcomeIllustration` ne dessine plus que les
halos et la pastille, dimensionnés en `%` de la boîte. Il n'y a plus de propagation à perdre.

Nouvel instrument (`scratchpad/H-r2/mesure.mjs`, DOM réel rendu par vitest + CSS compilée, Chrome
headless CDP port 9368) : **le plus grand bandeau vertical de la modale où rien n'est peint** — ni
fond non transparent, ni texte, ni SVG. C'est ce que voit l'œil. HEAD : **599 px** à 390 × 844,
**395 px** à 360 × 640.

**Paysage — relevé par la seconde vérification, reproduit.** `justify-center` dans une scène
`overflow-y-auto` rend inaccessible le débordement du haut : 56 / 36 / 30 px d'illustration coupés
à 568 × 320, 667 × 375, 844 × 390, et le texte n'apparaissait qu'après un défilement que rien ne
signale. Trois corrections, chacune mesurée :

- centrage par `my-auto` sur la diapositive au lieu de `justify-center` sur la scène : une marge
  `auto` vaut 0 en débordement, rien n'est coupé (clip-haut ≤ −24 px à toutes les tailles). Le mot-clé
  `safe` (`justify-center-safe`) aurait fait de même dans Chrome, mais là où il manque la
  déclaration entière tombe ; une marge `auto` ne dépend de rien. Avec le texte agrandi à 150 %,
  `justify-center` coupe encore 24 px à 360 × 640, `my-auto` rien ;
- sur un écran de moins de 30rem de haut, l'illustration — décorative — s'efface
  (`[@media(max-height:30rem)]:hidden`) : titre et texte sont visibles sans défiler à 568 × 320,
  667 × 375 et 844 × 390 (ils ne l'étaient à aucune des trois) ;
- la hauteur téléphone passe de `40dvh` à `calc(100dvh - 24rem)` (ce que l'écran laisse après
  croix, texte, pastilles, boutons), toujours entre 9rem et 20rem : identique à 390 × 844 (320 px)
  et 360 × 640 (256 px), mais `40dvh` poussait la dernière ligne sous la ligne de flottaison à
  360 × 500 et 360 × 520 — ce n'est plus le cas.

**Troisième vérification adverse — ce qui ANNULE la boîte n'était pas gardé (soldé).** Les gardes
vérifiaient la PRÉSENCE de la hauteur, de la peinture et de l'effacement sur écran bas, jamais
qu'aucune autre classe ne les annule. Reproduit avant de corriger, `src/components/welcome` à
**21/21 vert** sous chacune des trois mutations de la vérification :

- `max-sm:hidden` (ou `hidden sm:flex`) sur la boîte : le vide du testeur revient sur téléphone,
  293 px sans rien de peint à 390 × 844 (mesure de la vérification) ;
- `flex-col-reverse` sur la diapositive : l'illustration passe **sous** le texte, contre TCK-251 ;
- `calc(100dvh-44rem)` : le terme soustrait n'était pas borné, la boîte retombe à son plancher
  (209 px de vide à 390 × 844).

Et un défaut de build : Tailwind scanne aussi les tests, et deux messages d'assertion de
`WelcomeModal.test.tsx` avaient la forme d'une classe à valeur arbitraire — reproduit par
compilation de `globals.css` (`@tailwindcss/postcss`, `optimize.minify`) : `Invalid media query`,
une règle `<n>rem` et une règle `<min>rem` dans la CSS livrée.

Pour borner le terme soustrait par une mesure et non un goût, **ce que la modale consomme hors
boîte d'illustration** (croix, titre, texte, pastilles, boutons, marges) a été mesuré au navigateur
sur le DOM réel + la CSS compilée (Chrome headless CDP, port 9378, `deviceScaleFactor` 3,
`mobile: true`) : **19,4 à 21 rem** pour les parcours client fr / en / wo et agence, à 390 × 844,
390 × 664, 360 × 740 et 360 × 640 (polices chargées, aucune scène en débordement). `24rem` laisse
3 rem de marge ; la garde exige un terme entre 21 et 27 rem.

Remarque : le compte du testeur voyait le carrousel **client** (`customer.welcome`), monté par
`AppShell` pour un compte `isCustomerOnly` — il était donc client seul à ce moment, cohérent avec
un passage propriétaire ultérieur. Rien à corriger de ce côté.

### M16 — « Le badge queued » — **confirmé**

Capture : « Mes données », après « Demander mon export ». La ligne affichait `queued`.

Mécanisme : `DataExportsPanel.tsx` rendait `<Badge>{dataExport.status}</Badge>`, c'est-à-dire le
code brut de l'API. Le code, lui, est **stable** (`App\Models\Enums\DataExportStatus` : `queued`,
`processing`, `ready`, `expired`, `failed`, reflété par `DataExportStatus` côté front) : rien à
changer côté API, c'est au front de le traduire (principe n° 5).

Deux défauts voisins, sur la même ligne, relevés en lisant le composant :

- les deux dates étaient formatées en **`'fr-FR'` figé** (`toLocaleString('fr-FR')`) : un
  utilisateur `en` lisait « Requested on 23/09/2026 10:15:00 ». Ces deux occurrences étaient
  comptées dans le cliquet « reste » de `scripts/check-locale-figee.mjs` ;
- la liste ne se rafraîchissait jamais : la fabrication tourne en file (`ProcessDataExport`), et le
  statut restait « en attente » jusqu'au rechargement manuel de la page.

## Critères d'acceptation

- [x] AC1 — mesuré sur ce qui est **peint** (plus grand bandeau vertical de la modale sans fond,
      texte ni SVG) : à 390 × 844, de **599 px** (HEAD) à **121 px** (parcours client en `en` et
      `fr`), 134 px en `wo` et pour l'administrateur d'agence ; à 360 × 640, de 395 à 51 px ; à
      1280 × 800 (carte centrée), 27 px. Le panneau peint fait la hauteur de sa boîte à toutes les
      tailles (320 / 256 / 176 px). L'instrument rejette les mutations que l'ancien cochait :
      boîte sans hauteur → 241 px, diapositive sans `my-auto` → 215 px. Aucun défilement horizontal
      (`scrollWidth` = `innerWidth` partout). *(DOM réel + CSS compilée, CDP port 9368.)*
- [x] AC2 — aucun élément qui prend la hauteur libre (`flex-1`/`grow`) n'est vide ; la scène grandit
      et défile (`flex-1 min-h-0 overflow-y-auto`), sa diapositive est son seul enfant et se centre
      par `my-auto` ; aucun `justify-content` non sûr sur la scène ; pastilles et boutons hors de la
      scène et `shrink-0` (`WelcomeModal.test.tsx`). Rougissent : sans `my-auto`, `justify-center`
      de la réparation 1, espaceur vide rétabli.
- [x] AC2b — la boîte de l'illustration porte **à la fois** sa hauteur et sa peinture : `bg-muted`
      sur elle et nulle part dessous, hauteur téléphone `clamp(≥ 9rem, …dvh…, max)`, `sm:h-*`,
      `relative overflow-hidden` pour les halos. Rougissent (2 tests chacune) : hauteur retirée
      (la mutation C de la vérification), hauteur fixe `h-20`, peinture retirée, `sm:h-44` retiré.
      La mutation B (`h-full`) n'a plus d'objet : plus rien ne se propage.
- [x] AC2c — en paysage (568 × 320, 667 × 375, 844 × 390), rien n'est coupé en haut (clip ≤ −24 px,
      contre 56 / 36 / 30 px) et titre + texte sont visibles sans défiler ; entre 480 et 560 px de
      haut (360 × 500, 360 × 520, 320 × 568), le texte entier aussi. Le test « écran bas » garde
      l'effacement (`[@media(max-height:<24–36>rem)]:hidden`) ; il rougit sans lui.
- [x] AC2d — rien ne peut défaire la boîte en silence : la seule classe masquante de la boîte est
      l'effacement sur écran bas, et ni la diapositive ni la scène n'en portent aucune ; la
      diapositive est `flex-col` sans inversion ni `order-*` sur elle ou ses enfants, et
      l'illustration en est le premier enfant ; le terme soustrait de la hauteur téléphone est
      `100dvh` moins 21 à 27 rem (reste mesuré : 19,4 à 21 rem). Rougissent : `max-sm:hidden` et
      `hidden sm:flex` sur la boîte, `max-sm:hidden` sur la diapositive, `flex-col-reverse`,
      `order-last` sur la boîte, `44rem` et `16rem` soustraits (sept ablations, restauration par
      copie, md5 identique). Les messages d'assertion n'ont plus la forme d'une classe : la
      compilation de `globals.css` ne produit plus ni avertissement ni règle parasite (elle en
      produit une de chaque avec l'ancien fichier de test, rejoué).
- [x] AC3 — les parcours client, propriétaire, agent et locataire illustrent leurs trois diapositives,
      d'une icône différente chacune — **les quatre** sont testés (`WelcomeWizards.illustrations.test.tsx`).
- [x] AC3b — une diapositive qu'un parcours n'illustre pas reçoit l'illustration par défaut de la
      modale ; celle du parcours prime quand elle existe. Le parcours administrateur d'agence est
      dans le test des parcours : trois diapositives illustrées, 123 px d'écart max entre boîtes à
      390 × 844 (DOM réel) au lieu de 295 — **134 px sans rien de peint** avec l'instrument de la
      réparation 2.
- [x] AC4 — l'illustration est décorative (`aria-hidden`), et l'indicateur d'étape ne porte plus
      `role="tablist"` sans onglet (ARIA invalide) : `role="group"`, libellé « Étape n sur 3 ».
- [x] AC5 — aucun des cinq codes de statut n'atteint l'écran tel quel ; `queued` rend « En
      attente » (fr), les libellés suivent la locale (`en`, `wo`) ; le ton distingue prêt (succès),
      échec (danger), préparation (info), attente et expiration (neutre), par `StatusBadge` de la
      console — les **cinq** tons testés (`DataExportsPanel.test.tsx`). En wolof, les **cinq**
      libellés et l'annonce d'e-mail sont rendus et différents du français comme de l'anglais : une
      valeur française posée dans `wo.json` rougit (mutation E de la vérification, rejouée par un
      alias vitest vers une copie mutée — `wo.json` partagé non touché).
- [x] AC6 — tant qu'un export est en attente ou en préparation, la ligne dit qu'un e-mail suivra
      (vrai : `DataExportReadyNotification`) et la liste se rafraîchit toutes les 10 s ; elle cesse
      dès que plus rien ne se prépare. Un export `queued` passe à « Prêt » sans rechargement.
      L'annonce est testée pour `queued` **et** `processing`, et absente pour les trois autres
      (la mutation D `status === 'queued'` rougit).
- [x] AC7 — les dates de la ligne suivent la locale active (`useFormatteurs()`) ; le cliquet « reste »
      de `check-locale-figee.mjs` descend de 26 à 24.
- [x] AC8 — chaque correctif a été retiré puis remis : le test correspondant rougit sans lui
      (sept ablations en première passe, quatre en réparation : `justify-start`, modale sans
      illustration par défaut, icône répétée du parcours propriétaire, tons `processing`/`expired`
      permutés ; restauration par copie vérifiée par md5). Réparation 2 : dix ablations, toutes
      rouges — hauteur de boîte retirée, hauteur fixe, peinture retirée, `sm:h-44` retiré, sans
      `my-auto`, `justify-center`, sans effacement sur écran bas, espaceur vide, sans illustration
      par défaut, annonce limitée à `queued`, français dans `wo.json`.
- [x] AC9 — le parcours **administrateur d'agence** (`AgencyStandardWelcomeWizard`) passe ses
      **propres** icônes, distinctes par diapositive (`UserPlus` / `ShieldCheck` / `ChartColumn`),
      posées à l'intégration du lot ; le parcours a rejoint `PARCOURS_ILLUSTRES`
      (`WelcomeWizards.illustrations.test.tsx`, rouge avant les icônes).
- [ ] AC10 — vérification sur appareil réel (iOS Safari) de la hauteur `100dvh` et de la marge
      `safe-area-inset-bottom`. *Non mesuré : aucun WebKit disponible.*

## Hors périmètre

- L'e-mail « Votre export de données est prêt » est rédigé en français en dur côté API
  (`DataExportReadyNotification`) : dette D-24, autre ticket.
- Le message du 429 (« Un export a déjà été demandé dans les dernières 24h. ») est une phrase
  française émise par l'API, sans code : même dette.
- L'état vide « Aucun export demandé. » n'est pas un `<EmptyState>` : écart à la charte, non
  signalé par le testeur.

## Notes d'implémentation

- `components/welcome/WelcomeIllustration.tsx` (neuf) : un seul dessin pour tous les parcours —
  deux halos `bg-primary/5` et `/10` **proportionnels** à la boîte de la modale (un halo en taille
  fixe était rogné sur la carte desktop), icône Lucide dans une pastille `bg-card`. Il ne peint
  **pas** de surface : le panneau `bg-muted` est la boîte de la modale (réparation 2). Jetons
  uniquement ; le thème sombre suit.
- `WelcomeModal` : `ILLUSTRATION_PAR_DEFAUT` (`<WelcomeIllustration icon={Sparkles} />`, constante de
  module) comble une diapositive non illustrée ; une « scène » `flex-1 overflow-y-auto` contient la
  diapositive, centrée par `my-auto` (sûr en débordement) ; pastilles et boutons restent en pied ;
  `pt-6` évite la croix du primitif. La boîte de l'illustration, peinte (`bg-muted`), mesure
  `clamp(9rem, 100dvh - 24rem, 20rem)` sur téléphone, `11rem` dès `sm`, et s'efface sous 30rem de
  hauteur d'écran.
- `DataExportsPanel` : `StatusBadge` (pastille unique de la charte) + `Record<DataExportStatus, …>`
  exhaustif — un sixième statut ajouté au type sans libellé casse `tsc` au lieu de réapparaître brut.
  `refetchInterval` piloté par `intervalleDeSuivi()` (exportée, testée pure et intégrée).
- Clés i18n ajoutées : `privacy.dataExports.status.{queued,processing,ready,expired,failed}`,
  `privacy.dataExports.pendingHint`.
