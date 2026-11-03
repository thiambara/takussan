---
id: TCK-567
title: "Carrousel de bienvenue sans bloc vide sur téléphone, statut d'export de données traduit et suivi"
status: done
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-24
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
      `safe-area-inset-bottom`. *Mesuré le 2026-09-24 sur le **simulateur** iOS (Safari 18.0,
      iPhone 16 portrait), pas sur un appareil réel : `innerHeight` 659 = `100dvh` 659 = hauteur de
      la modale (0–659), rien de coupé (illustration 64–339, titre 363–391, « Suivant » 555–595,
      « Passer » 603–643), `scrollWidth` = `innerWidth` = 393. ⚠ **Ce n'était pas l'application en marche** : Safari du simulateur
      n'offre pas de CDP, et la page mesurée était un **instantané statique** — le DOM rendu de la
      modale (`client-en.html`, sorti de jsdom) posé avec la CSS compilée de l'application
      (`app.css`) et une sonde qui affiche les mesures dans la page (`scratchpad/U5/ios/build.mjs`).
      Ce qui est mesuré est donc la CSS réelle sur le DOM réel du composant, sous WebKit ; ce qui
      ne l'est pas : l'hydratation, le primitif de dialogue monté par React, et le clavier virtuel
      (précision de la vérification adverse du 2026-09-24). La marge `safe-area-inset-bottom`
      y vaut **0** (la barre d'outils de Safari couvre l'encoche) : son effet quand elle n'est pas
      nulle (écran d'accueil, barre repliée) n'est toujours pas observé. Case laissée ouverte.*

## Restes de la vérification adverse — soldés le 2026-09-24 (TCK-575)

Chaque reste a été rejoué avant correction, puis le correctif a été retiré et remis en place
(copie, retrait, test, restauration par `cp`, md5 identique ; journaux dans
`scratchpad/ablation/U5/`).

- **Seconde vérification adverse (2026-09-24) : trois des correctifs ci-dessous ne tenaient
  pas.** Rejoués avant correction, tous verts :
  - *M10, garde de visibilité contournable* : l'encre de l'icône à 5 % d'opacité
    (`text-primary/5`), l'encre `text-background` sur la pastille `bg-card` (deux jetons, deux
    couleurs à 1,05:1) et `max-sm:opacity-[.05]` sur la boîte restaient verts, 24/24. La garde
    comparait des **noms** de jetons et ne connaissait l'opacité qu'en échelle numérique : la
    phrase « refuse toute opacité sous 100 » ci-dessous était **fausse** pour la valeur arbitraire.
    **Corrigé** : `raisonsDInvisibilite` mesure désormais le **rapport de contraste WCAG** entre le
    trait (encre héritée, alpha composé sur le fond) et le fond réel remonté du DOM, dans les
    **deux thèmes**, contre le seuil non textuel de **3:1**, par le harnais partagé
    `src/test/contraste-wcag.ts` ; chaque variante d'encre ou de fond (`max-sm:`, `dark:`…) est
    mesurée aussi ; une couleur qu'on ne sait pas résoudre (valeur arbitraire, variable, trait
    recoloré par `stroke-<couleur>`) est un échec nommé. `classesMasquantes` refuse
    `opacity-[…]`, `opacity-(…)`, `[clip-path:…]` et `[clip:…]`. Rejoué après : `text-primary/5`
    → 6 rouges, `text-background` → 6, `max-sm:opacity-[.05]` → 7, et trois formes voisines
    (`max-sm:text-card`, `text-muted`, `stroke-card` sur l'icône) → 6 chacune ; le code réel reste
    vert, 24/24.
  - *M16, « tant que » non gardé* : `refetchInterval: (q) => q.state.dataUpdateCount < 2 ?
    intervalleDeSuivi(…) : false` (le suivi s'arrête après un rafraîchissement) restait vert : le
    test passait de « en attente » à « prêt » en un seul cycle. **Corrigé** : un test où la
    fabrication dure quatre cycles (`queued` → `processing` ×3 → `ready`) exige cinq appels, aucun
    « Prêt » avant, puis l'arrêt. Mutation du vérificateur → 1 rouge ; intervalle constant → 3.
  - *AC10* : la mesure iOS était un instantané statique, pas l'application — précisé dans AC10.
- **M10 : une icône présente mais invisible passait.** Reproduit : `hidden` sur l'icône de
  `WelcomeIllustration`, puis l'icône de la couleur de sa pastille ; welcome + privacy restaient
  verts à 50/50. **Corrigé dans la garde** : `__tests__/visibilite.ts` (`raisonsDInvisibilite`)
  vérifie l'icône et ses ancêtres jusqu'à la boîte (classes masquantes), le trait
  (`currentColor`, épaisseur > 0) et l'égalité des jetons couleur de trait et fond. La fonction est
  appelée par `WelcomeModal.test.tsx` et, sur chaque diapositive des cinq parcours, par
  `WelcomeWizards.illustrations.test.tsx`. Ablations : `hidden` → 6 rouges sur 24, couleur de la
  pastille → 6 rouges sur 24.
- **M10 : l'opacité partielle et les formes arbitraires passaient.** Reproduit : `max-sm:opacity-5`
  sur la boîte restait vert. **Corrigé** : `classesMasquantes` refuse toute opacité d'échelle sous
  100 (et, depuis la seconde vérification, toute opacité en valeur arbitraire), ainsi
  que `[display:…]`, `[visibility:…]`, `[opacity:…]` et `[content-visibility:…]`, sous n'importe
  quelle variante. Ablations : `max-sm:opacity-5` → 7 rouges, `[display:none]` arbitraire → 7
  rouges.
- **M16 : AC6 n'était gardé que sur la fonction, pas sur son branchement.** Reproduit :
  `refetchInterval: 10_000` constant restait vert. **Corrigé** : deux tests du panneau. Le premier
  vérifie qu'un export en attente passe à « Prêt » sans recharger la page, le second que le panneau
  n'interroge plus l'API quand rien ne se prépare. Ablation : intervalle constant → 2 rouges.
- **Risque : e-mail d'export et 429 en français en dur (D-24).** **Soldé par TCK-575.** L'e-mail
  suit la langue du destinataire et son bouton mène à la page « Mes données » du front (l'ancien
  lien d'API rendait 401). Le 429 porte `code`, `available_at` et `Retry-After`, et le panneau dit
  quand une nouvelle demande sera possible au lieu de « réessayez dans quelques minutes ».
- **Risque : l'état vide n'était pas un `<EmptyState>`.** **Corrigé** : `<EmptyState>` avec icône,
  titre et une phrase qui dit quoi faire (`privacy.dataExports.emptyHint`). Ablation : paragraphe
  maison → 1 rouge.
- **Découvert en mesurant : cibles de 36 px au doigt** (la demande et le téléchargement, à 320, 360
  et 390 px). **Corrigé** : `max-sm:min-h-11` (44 px). Ablation : retour à 40 px → 1 rouge.
- **Risque : parcours administrateur d'agence sur l'icône neutre.** **Faux aujourd'hui** :
  `AgencyStandardWelcomeWizard` porte ses trois icônes et figure dans `PARCOURS_ILLUSTRES`
  (AC9). La nouvelle garde de visibilité le couvre aussi.
- **Risque : `100dvh` et `safe-area` non vérifiés sur WebKit.** **Mesuré en partie** sur le
  simulateur iOS (voir AC10). Reste ouvert : appareil réel, et `safe-area-inset-bottom` non nulle.
- **Risque : les gardes de disposition sont structurelles, et la géométrie se mesure hors CI.**
  **Reste ouvert.** jsdom ne calcule aucune disposition. La liste des classes masquantes s'est
  élargie (opacité partielle, formes arbitraires, `clip-path` arbitraire ; et, depuis la reprise
  du 2026-09-24, toute propriété arbitraire, tout filtre, mélange ou masque, les formes nulles en
  valeur arbitraire ; et, depuis la réparation 1, des **seuils** de réduction — dimension, échelle,
  rotation 3D, inclinaison — et le fond propre de l'icône), mais elle reste **fermée** : une
  translation hors cadre, un frère posé par-dessus l'icône, une règle CSS écrite ailleurs, une
  expression de dimension (`h-[clamp(…)]`) et des rotations composées sur plusieurs éléments
  passeraient (voir « Reprise des défauts mineurs »). La couleur, elle, n'est plus une liste : elle se mesure (contraste ≥ 3:1 dans les
  deux thèmes).
- **Risque : borne de 21 à 27 rem.** **Reste ouvert, sans défaut.** Elle a été mesurée sur les
  textes fr, en et wo actuels (19,4 à 21 rem), et aucune nouvelle locale n'est prévue. Une langue
  aux textes nettement plus longs demandera une nouvelle mesure.

## Reprise des défauts mineurs (2026-09-24)

Troisième vérification adverse de la garde de visibilité (M10), soldée par l'unité M3.

**Reproduit avant correction** : cinq classes posées sur l'icône de `WelcomeIllustration.tsx`
(`<Icon className="size-9 …">`), `npx vitest run src/components/welcome` → **24/24 verts** pour
chacune : `[color:transparent]`, `stroke-[0]`, `[stroke-width:0]`, `brightness-0`, `blur-lg`. Toutes
rendent le trait invisible ou illisible : les deux premières formes d'épaisseur nulle l'emportent
sur l'attribut `stroke-width` de Lucide, `[color:transparent]` vide le `currentColor` hérité,
`brightness-0` repeint le trait en noir (sur la pastille `card` du thème sombre), `blur-lg` étale un
trait de 2 px sur 16.

**Corrigé dans `components/welcome/__tests__/visibilite.ts`** (la garde ; aucun composant touché) :

- `raisonsDInvisibilite` refuse, entre l'icône et la boîte, **toute propriété arbitraire**
  (`[propriété:valeur]`, quelle qu'elle soit), **tout filtre, mélange ou masque** hors de sa valeur
  neutre (`blur`, `brightness`, `contrast`, `grayscale`, `invert`, `sepia`, `saturate`,
  `hue-rotate`, `drop-shadow`, `filter-…`, `mix-blend-…`, `mask-…` ; `blur-none`,
  `brightness-100`, `mix-blend-normal`… passent) et tout `style` en ligne (signalé, pas lu) ; les
  variantes sont retirées par un découpage qui respecte les crochets
  (`[@media(max-height:30rem)]:hidden` → `hidden`) ;
- l'épaisseur du trait se juge sur la **classe** (`stroke-N`, `stroke-[N]`) comme sur l'attribut,
  contre un plancher de **0,5** unité du `viewBox` (0,75 px à `size-9`) au lieu de « > 0 » ;
- toute couleur de texte ou de fond en valeur arbitraire non numérique (`text-[transparent]`) est
  « non mesurable » ;
- `classesMasquantes` (qui garde aussi les ancêtres de la boîte) reconnaît les formes nulles en
  valeur arbitraire (`h-[0]`, `size-[0px]`, `scale-[0]`, `stroke-[0]`) et les propriétés
  arbitraires de couleur, de trait, de remplissage, de filtre, de masque, de transformation et de
  dimension.

**Prouvé par les mêmes mutations** (script `scratchpad/ablation/M3/mut-welcome.sh` : copie, mutation,
vitest, restauration par `cp`, md5 `98fd5e12…` identique après chaque série) : les cinq →
**6 rouges sur 24** chacune ; quatre voisines aussi (`text-[transparent]`, `stroke-[0.05]`,
`max-sm:brightness-0`, `mix-blend-difference`) → 6 rouges chacune ; témoin neutre `blur-none` →
24/24 vert ; code réel → 24/24 vert.

**Hors d'atteinte d'une analyse de classes, écrit aussi dans l'en-tête de `visibilite.ts`** : un
`style` en ligne est signalé mais pas interprété ; une règle CSS écrite ailleurs qui viserait
l'icône, un frère posé **par-dessus** elle (un halo `z-10` opaque) et une translation hors cadre
(`translate-x-full` dans la boîte `overflow-hidden`) passent. Le dernier juge reste la mesure au
navigateur sur la CSS compilée (AC1).

## Reprise des défauts mineurs (2026-09-24) — réparation 1 (M3)

Quatrième vérification adverse de la garde de visibilité : un défaut majeur et un mineur,
**reproduits** avant correction (script `scratchpad/ablation/M3/mut-wi.sh` : classe ajoutée à
`<Icon className="size-9 …">`, `npx vitest run src/components/welcome`, restauration par `cp`, md5
`98fd5e12…` identique après chaque mutation).

**Majeur — le fond propre de l'icône n'était pas mesuré.** `fondsSousLIcone` prenait le fond au
repos par `fondHerite(svg)`, qui commence au **parent**. `bg-primary` sur l'icône (trait `primary`
sur fond `primary`, 1:1) → **24/24 verts**, quand `max-sm:bg-primary` → 6 rouges. L'en-tête
annonçait pourtant « le fond peint le plus proche ». **Corrigé** : le fond au repos est celui que
l'icône peint elle-même s'il existe (alpha composé sur le fond hérité), sinon le fond hérité ; une
couleur de fond qu'on ne sait pas résoudre y devient une raison nommée (« fond non mesurable »), plus
une exception. Après : `bg-primary` et `bg-primary/90` → **6 rouges sur 24**. `bg-card` et
`bg-background` sur l'icône restent verts **à bon droit** : ce sont le fond de la pastille et un
fond voisin, sur lesquels le trait `primary` se lit.

**Mineur — réductions et épaisseur en `rem`.** `classesMasquantes` ne connaissait que les formes
nulles : `size-px`, `size-0.5`, `size-[0.1px]`, `scale-5`, `-scale-x-0`, `rotate-x-90` et
`stroke-[0.02rem]` → **24/24 verts** chacune. **Corrigé** par `reductionDe` (appelée sur la chaîne
de l'icône à la boîte) : dimension (`size`, `w`, `h`, `max-w`, `max-h`) sous 16 px ou sous un quart
en relatif ; échelle sous 50 % (signe compris : un miroir n'efface rien) ; rotation 3D dont le
cosinus tombe sous ½ ; inclinaison de 60° ou plus ; une valeur arbitraire illisible est « non
mesurable ». `epaisseurDeClasse` lit `rem`/`em` (×16) et `%` (de la diagonale 24 du `viewBox`) ;
`bg-blend-…` rejoint les mélanges refusés. Après : les sept → **6 rouges sur 24** chacune, et
`skew-x-60`, `bg-blend-multiply`, `rotate-y-[90deg]`, `size-3` sur la pastille → 6 rouges.
**Témoins verts (24/24)** : `size-6`, `scale-75`, `rotate-x-30`, `stroke-[0.1rem]`,
`-scale-x-100`, `bg-background`, `bg-card` ; code réel 24/24 ; `src/components/welcome` +
`promesses-de-delai` 79/79.

**Hors d'atteinte, ajouté à l'en-tête de `visibilite.ts`** : une expression de dimension
(`h-[clamp(…)]`, `w-[calc(…)]` — la boîte en porte une) n'est pas évaluée, et chaque classe est
jugée seule — deux `rotate-x-55` empilés, chacun au-dessus du seuil, écrasent l'icône au tiers.

## Troisième passe — la session (2026-09-24)

La vérification de la réparation 1 l'a refusée sur un point : « une valeur arbitraire illisible est
non mesurable » était **faux** pour les dimensions et l'épaisseur — `size-[1mm]` (3,8 px) et
`stroke-[0.1mm]`, tous deux émis par Tailwind 4.2.2, restaient **24/24 verts** ; un rembourrage ou
un filet sur le SVG (`p-4`, `border-8`), qui rétrécit le DESSIN dans sa boîte, aussi. **Corrigé**
dans `visibilite.ts` : une longueur d'une unité inconnue est « unité non mesurable » (dimension) ou
`NaN`, donc trop fine (épaisseur) ; un `p-*`/`border-*` à largeur sur le SVG lui-même est une raison
nommée (« dessin rétréci »). Rejoué : `size-[1mm]`, `stroke-[0.1mm]`, `p-4`, `border-8` → **6
rouges sur 24** chacune ; témoins `border-solid` et `stroke-[0.1rem]` → 24/24 verts. Composant
restauré par `cp`, md5 `98fd5e12…` identique.

## Hors périmètre

- ~~L'e-mail « Votre export de données est prêt » est rédigé en français en dur côté API~~ :
  soldé par TCK-575.
- ~~Le message du 429 est une phrase française émise par l'API, sans code~~ : soldé par TCK-575.
- ~~L'état vide « Aucun export demandé. » n'est pas un `<EmptyState>`~~ : corrigé (voir
  ci-dessus).

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
