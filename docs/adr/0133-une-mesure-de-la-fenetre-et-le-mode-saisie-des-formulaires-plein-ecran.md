# ADR-0133 — Une seule mesure de la fenêtre pour toute l'application, et le mode saisie des formulaires plein écran

- **Statut** : Accepté le 2026-11-21 (maquette « L'écran économe » validée au téléphone par le porteur ; décision « 1a » du même jour : le mode clavier dans la branche de la publication) — amendé le 2026-11-22 : les surfaces superposées, la conversation et la recherche (« fait a et b » du porteur, chantier 2)
- **Date** : 2026-11-21
- **Tickets** : TCK-2988 ; amendement : TCK-2995 (feuilles et panneaux), TCK-2996 (messagerie), TCK-2997 (recherche)
- **S'appuie sur** : [ADR-0107](0107-la-densite-du-bureau-est-un-jeu-de-jetons.md) (les valeurs sur l'échelle)

## Contexte

Relevé le 2026-11-21 sur `/publish`, sur l'iPhone du porteur (Chrome iOS) et dans la maquette locale
`playground/maquettes/ecran` :

- **Sur iPhone, le clavier ne réduit que la fenêtre VISUELLE** (`visualViewport`). Safari comme Chrome
  laissent la fenêtre de mise en page (`innerHeight`) intacte. Un pied posé en `bottom: 0` reste donc
  sous le clavier, et un en-tête `sticky` peut sortir par le haut quand le navigateur fait défiler la
  page pour montrer le champ. C'est ce que montre la capture du porteur : le pied de l'assistant est
  caché, et l'en-tête garde ses 56 px et sa ligne de résumé quand il ne reste que 330 px.
- **Une seule mesure existe, et un seul composant la lit** : `useDecalageDuClavier` (TCK-2598) remonte
  le pied que la coque d'entrée monte elle-même. Le pied de `WizardShell` ne la reçoit pas.
- **La maquette a éprouvé une autre mécanique au téléphone, et le porteur l'a validée** :
  - une mesure unique publiée sur `<html>` ;
  - un cadre calé sur la fenêtre visible PENDANT la saisie seulement ;
  - un en-tête qui passe de 56 à 44 px ;
  - un pied de 52 px collé au clavier, avec ↑ ↓ qui passent d'un champ à l'autre sans le fermer ;
  - un champ amené en tête du corps quand il ouvre une liste ;
  - tout revient à l'état d'avant quand le clavier se ferme.
- **Chrome iOS pose sa propre barre de remplissage** (clé, carte, position) au-dessus du clavier. Aucun
  réglage de champ ne l'a retirée dans la maquette.
- **La liste d'un `Combobox` (base-ui, sur Floating UI) se positionne déjà dans la fenêtre visible** :
  `getViewportRect` lit `visualViewport.height` comme limite du viewport
  (`@floating-ui/dom`, lu le 2026-11-21).

## Décision

**La fenêtre se mesure en un seul endroit : un magasin de module, et non un fournisseur React. Il
publie la saisie et la fenêtre visible sur `<html>`. Un formulaire plein écran y répond par CSS (le
variant `saisie:`) : sous `lg`, pendant la saisie seulement, le cadre se cale sur la fenêtre visible,
l'en-tête se compacte et le pied devient la barre de saisie.**

1. **La mesure** — `src/lib/fenetre.ts`, lue par `useFenetre()` (`useSyncExternalStore`) :

       caché = innerHeight − (visualViewport.offsetTop + visualViewport.height)

   - Les écouteurs se posent au premier abonné et se retirent au dernier. La mesure est synchrone, comme
     l'était `useDecalageDuClavier` : quelques lectures, et les abonnés ne sont prévenus que si une valeur
     change.
   - Sur `<html>`, elle publie :
     - `data-saisie="ouvert"` quand un champ éditable a le focus sur un pointeur grossier, ou quand un
       clavier de plus de 120 px est mesuré. Le mode part avec le focus, sans attendre que le clavier
       ait fini de monter : un seul changement de mise en page au lieu de deux ;
     - `--vue-h` et `--vue-top`, la fenêtre visible ;
     - `--clavier`, la hauteur cachée.
   - Une sortie de champ attend 80 ms avant de déclarer la saisie finie : passer d'un champ à l'autre
     ne replie pas tout.
   - **Un clavier rabaissé sans quitter le champ ferme la saisie.** Le bouton de Chrome iOS, comme le
     retour d'Android, ferme le clavier en laissant le focus au champ (relevé le 2026-11-21 sur l'iPhone du
     porteur : « Continuer avec Google » ne revenait qu'au toucher suivant). Une fois qu'un clavier a été
     mesuré pendant le focus, sa disparition met fin à la saisie. Toucher le champ rouvre le clavier, la
     mesure le revoit, et la saisie reprend. Chaque nouveau focus repart optimiste.
   - `useDecalageDuClavier` lit cette mesure : il n'y a plus deux écouteurs de `visualViewport`.
   - **Pourquoi un magasin, et non un fournisseur** : `WizardShell` est monté sous la coque d'entrée
     (`/publish`) ET sous la coque de l'application (`/app/properties/new`), qui ne partagent aucun
     ancêtre où poser un fournisseur.
2. **Pas de `interactive-widget=resizes-content`.** La formule couvre déjà Android, où le clavier
   réduit la fenêtre de mise en page : `caché` y vaut 0, et un clavier se voit à `innerHeight` qui
   baisse. La balise changerait toutes les pages d'Android pour un besoin que la mesure couvre déjà.
3. **Le variant `saisie:`** (`html[data-saisie="ouvert"] &`, dans `globals.css`) : la réponse est en
   CSS. Aucun composant ne re-rend parce que le clavier bouge.
4. **Le profil « formulaire plein écran »** (la coque d'entrée `pleinEcran` et `WizardShell`, sous
   `lg` seulement) :
   - le cadre passe de `h-dvh` dans le flux à `position: fixed`, calé sur `--vue-top` et `--vue-h`,
     pendant la saisie seulement. Hors saisie, il reste dans le flux : une hauteur mesurée restait figée
     sur Chrome iOS quand ses barres se repliaient (bande vide relevée dans la maquette) ;
   - l'en-tête passe de 56 à 44 px, sans la ligne de résumé, et « Aperçu » n'y garde que son œil ;
   - le pied de l'assistant (segments, rond ←, « Continuer » de 48 px) cède la place à une barre de
     52 px : ↑ ↓ (`pointerdown` empêché, le focus ne quitte jamais un champ), la partie et le rang
     (« Le bien · 2/6 »), et « Continuer » ;
   - ce qui se replie (la notice de reprise du brouillon) se replie ;
   - le champ qui prend le focus est amené en tête du corps s'il ouvre une liste
     (`data-ancre="tete"`), sinon juste assez pour être visible. Trois passes, à 30, 280 et 650 ms,
     puis une à chaque changement de `--vue-h` ;
   - une cale de la hauteur de la fenêtre visible, en fin de corps, permet d'amener en tête même le
     dernier champ.
5. **Hors de cette décision** : les barres qui s'escamotent au défilement (listes et lecture), le
   profil « conversation » et le profil « recherche » de la maquette. Chacun s'ajoutera en amendement,
   sur la même mesure. *(Les barres : ADR-0134. La conversation et la recherche : l'amendement du 2026-11-22,
   ci-dessous.)*

## Conséquences

- **Une émulation de bureau ne prouve pas la géométrie.** Elle montre la bascule (pointeur grossier,
  focus), pas le clavier. Le juge est le téléphone ; les tests éprouvent les classes et la logique de
  la mesure.
- **Le mode est optimiste.** Un focus posé par programme sur un champ, sans clavier sur iOS, le
  déclencherait à tort. Relevé le 2026-11-21 : aucune étape de la publication ne focalise un champ
  (seuls les titres d'étape et les puces reçoivent un focus de programme).
- **La barre de remplissage de Chrome iOS reste.** Elle ne se commande pas depuis une page.
- **Un nouvel écran plein écran hérite du profil** s'il passe par la coque d'entrée. Ailleurs, il doit
  s'abonner à la mesure (`useFenetre`) pour que `<html>` porte `data-saisie`.
- **`--vue-h` et `--vue-top` n'existent que sur un écran abonné.** Le CSS qui les lit porte un repli
  (`100dvh`, `0px`).

## Application

- `src/lib/fenetre.ts` : la mesure, le magasin, `useFenetre()`, `estEditable()`.
- `src/components/entree/useDecalageDuClavier.ts` : lit le magasin.
- `src/app/globals.css` : le variant `saisie:`.
- `src/components/entree/CoqueDEntree.tsx` : le cadre et l'en-tête en saisie.
- `src/components/property-form/wizard/WizardShell.tsx` et `wizard/saisie.ts` : la barre de saisie, ↑ ↓, le
  champ amené, la cale ; `EnTetePublication.tsx` : l'en-tête de `/app/properties/new` en saisie.
- Les tests : `src/lib/__tests__/fenetre.tck-2988.test.tsx`, et ceux du mode saisie de la coque et de
  `WizardShell`, chacun vérifié par ablation.

## Amendement du 2026-11-22 — les surfaces superposées, la conversation et la recherche

### Contexte

Relevé le 2026-11-22 à 390 × 844, pointeur tactile, avec une fenêtre visible simulée : un clavier de 336 px qui
laisse visibles les 508 premiers pixels. Les surfaces relevées et ce qu'elles faisaient :

- **La conversation ouverte de `/app/messages`** : `data-saisie` n'y était jamais posé. La route est en boîte
  (ADR-0134), et la coque ne s'abonne à la mesure qu'en mode document. Le composeur restait de 788 à 832 px, sous le
  clavier.
- **Le formulaire plein écran `/app/customers/new`** (un `PanneauDroit` sous `xl`) : « Continuer » restait de 757 à
  805 px, sous le clavier. Il en allait de même de toute `FeuilleDuBas` avec un champ, comme « Demander au fil » :
  son pied restait de 775 à 844 px.
- **La recherche du site public** (le dialogue de la pastille) : la saisie était bien posée, mais le dialogue
  gardait 844 px. Les dernières suggestions passaient sous le clavier, sans que rien permette de les atteindre.
- **La palette de `/app`** et **« Nouvelle conversation »** : deux écrans pleins, au même défaut.

Toutes ces surfaces ont deux points communs. Elles sont `fixed`, donc posées sur la fenêtre de mise en page, que le
clavier d'iPhone ne réduit pas. Et elles sont montées dans un portail, hors de la coque qui s'abonne à la mesure.

### Décision

6. **Une surface superposée ouverte s'abonne à la mesure.** C'est le rôle de `SuiviDeLaFenetre`
   (`src/lib/fenetre.ts`, à côté de `useFenetre`), monté DANS son contenu : il n'existe que pendant l'ouverture.
   - `<html>` porte donc `data-saisie` et la fenêtre visible sur toute route, y compris celles que la coque
     n'abonne pas.
   - Avec `corps`, il ramène le champ focalisé en vue (`block: 'nearest'`) à chaque changement de la fenêtre
     visible. C'est le geste de `CadreDeLaFeuille`, rendu commun.
7. **Les primitives répondent en CSS** (le variant `saisie:`), et rien ne change hors saisie :
   - **`FeuilleDuBas`**, sous `md` :
     - elle se pose sur le clavier (`bottom: --clavier`) ;
     - sa hauteur est bornée à `min(90dvh, --vue-h − 8 px)` ;
     - la zone sûre du pied tombe ;
     - son pied (l'action) reste au-dessus du clavier, et son corps défile.
     - `CadreDeLaFeuille` garde son réglage en ligne, plus fin (dès 2 px cachés), qui l'emporte.
   - **`PanneauDroit`**, sous `xl` (où il couvre l'écran) :
     - il se cale sur la fenêtre visible (`top: --vue-top`, `height: --vue-h`) ;
     - un formulaire y garde son pied ;
     - son en-tête passe de 56 à 44 px, sans la ligne d'étape.
8. **La conversation ouverte au téléphone** (`/app/messages`, sous `md`) :
   - la messagerie s'abonne à la mesure, et le cadre porte `data-cadre-de-conversation` ;
   - en saisie, `globals.css` le cale sur la fenêtre visible ;
   - l'en-tête du fil passe de 56 à 44 px ;
   - les puces du pont et le bandeau de l'objet se replient ;
   - le fil reste collé en bas quand il rétrécit (`ChatView` observe aussi sa propre hauteur).
   - Le choix « Équipe » et les réponses rapides **restent**. Pour l'agent, écrire au client ou à l'équipe est une
     décision qui doit rester sous les yeux pendant qu'il tape.
9. **La recherche et ses deux écrans pleins** (le dialogue de la pastille sous `lg`, la palette et « Nouvelle
   conversation ») se calent sur la fenêtre visible en saisie : la liste s'arrête au haut du clavier.
10. **La saisie optimiste ne retire aucun geste.** Le mode part avec le focus, avant toute mesure du clavier, et un
    focus posé par programme peut n'ouvrir aucun clavier sur iOS. En saisie, une surface peut donc se compacter ou
    se redimensionner, mais jamais retirer le seul moyen d'agir.
    - « Rechercher » reste dans le dialogue de recherche, même si la touche du clavier fait la même chose :
      la maquette le repliait, ce qui est écarté ici.
    - Sans clavier mesuré, une feuille garde sa hauteur : `min(90dvh, --vue-h − 8 px)` vaut 90dvh.

### Conséquences

- **Une feuille ou un panneau neuf hérite du comportement** dès qu'il passe par les primitives. Les huit
  `SheetContent side="bottom"` d'avant (TCK-2690) n'en héritent pas.
- Ouvrir une surface sur une page non abonnée (le site public hors barre d'onglets) y pose désormais
  `data-saisie`. Seules la barre d'onglets et la pastille y répondent, et elles le faisaient déjà.
- **Ce que seul un téléphone juge** : la géométrie réelle du clavier et le défilement que Safari impose pour
  montrer le champ (`offsetTop`). Relevé en émulation : avec un décalage de 150 px, chaque surface reste dans
  `[--vue-top, --vue-top + --vue-h]`.
