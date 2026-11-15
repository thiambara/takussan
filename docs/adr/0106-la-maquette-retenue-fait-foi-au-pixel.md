# ADR-0106 — La maquette retenue fait foi au pixel, à taille réelle, sauf l'accessibilité, la technique et ses propres incohérences

- **Statut** : Accepté le 2026-11-10 par le porteur (« 1a 2a 3b 4a », [synthèse](../qa/audit-ux-2026-11/fidelite-au-pixel.md#décisions-du-porteur-2026-11-10)) ;
  **amendé le même jour** par [ADR-0107](0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)
  (« voie 2 ») : § 1, § 3 et § 4. Les passages amendés sont marqués.
- **Date** : 2026-11-10
- **Tickets** :
  - préparation (vague 91) : TCK-2684 (outil et références), TCK-2685 (jetons), TCK-2686 (densité),
    TCK-2687 et TCK-2688 (primitives existantes), TCK-2689 et TCK-2690 (primitives neuves),
    TCK-2691 (coque) ;
  - application : tous les tickets front des vagues 86 à 90 (TCK-2578 → TCK-2683).
- **Amende** :
  - TCK-2460, une hauteur de contrôle unique (`design-guidelines.md`, `check-champs-uniformes`) ;
  - TCK-2490, le texte de la colonne en px ;
  - [ADR-0095](0095-le-ton-suit-la-session.md) n'est pas touché : la maquette n'est pas une
    référence de ton.
- **S'appuie sur** : TCK-753 (contour de champ et focus), TCK-450 (aplats des pastilles), TCK-635
  (échelle du bureau à 90 %).

## Contexte

- **Le porteur a choisi le 2026-11-10 les maquettes des familles 2 à 6** et veut le même écran
  après implémentation : « au pixel près — les contours, les tailles, l'espacement ».
- **Le relevé du même jour** ([synthèse et annexes A à D](../qa/audit-ux-2026-11/fidelite-au-pixel.md))
  montre qu'une implémentation directe ne le serait pas :
  - **La visionneuse n'a jamais rendu à taille réelle.**
    - Le cadre téléphone, vu sur un écran de bureau, hérite de `html { font-size: 90% }`
      (TCK-635). Il est rendu à rem 14,4, quand un vrai téléphone rend 16 : ce qui est en `rem`
      rétrécit, ce qui est en px non.
    - Le bureau y est réduit à 73 %.
  - **Les maquettes parlent une autre échelle que le design system** :
    - texte en px fixes, 13 et 15 px surtout ;
    - contrôles à 44/48 px au téléphone et à 36/32 px au bureau, contre 40 px partout dans le
      produit ;
    - aucune primitive identique, sauf le squelette.
  - **Les maquettes se contredisent entre elles** : 7 cases à cocher, 4 interrupteurs,
    12 tailles d'avatar.
  - **Elles contredisent des règles payées** :
    - contour de champ à 1,26:1 (WCAG 1.4.11 exige 3:1) ;
    - ton « info » à 3,88:1 ;
    - texte de champ à 15 px, qui fait zoomer Safari sur iPhone.
  - **Elles ne sont dessinées qu'à 390 et à 1440.** Rétrécies à la largeur utile du produit,
    18 pages sur 29 se dégradent à 1280 et 26 sur 29 à 1024.
  - **Les maquettes ne sont pas versionnées.** La CI et les worktrees ne les ont pas.

## Décision

1. **La référence est la taille réelle.**
   - Téléphone : **390 × 844, rem 16**.
   - Bureau : **1440 × 900, racine 16 px, densité ×0,9**, l'échelle du produit dès 1024.
     *Amendé le 2026-11-10 par [ADR-0107](0107-la-densite-du-bureau-est-un-jeu-de-jetons.md) :
     la première forme disait « rem 14,4 ». Le rendu au réglage par défaut est le même ; la
     densité passe par les jetons, plus par la racine.*
   - Une maquette se lit et se mesure dans un cadre qui a sa propre largeur (un document à part).
     Jamais dans la visionneuse mise à l'échelle.
   - Le porteur revoit les écrans téléphone retenus à cette taille avant le gel des références.
2. **La maquette retenue fait foi, au pixel**, pour la mise en page, les tailles, les espacements,
   les contours, les rayons, les couleurs, la typographie et les icônes, **sauf dans trois cas** :
   - **(a) l'accessibilité mesurée**, où le produit garde sa règle :
     - contour de champ et de contrôle non textuel ≥ 3:1 (`--input`, TCK-753) ;
     - anneau de focus plein ;
     - texte ≥ 4,5:1 sur son fond (le ton « info » d'une pastille passe en `--info`) ;
   - **(b) les contraintes techniques** : texte de champ ≥ 16 px au téléphone (anti-zoom iOS) ;
   - **(c) les incohérences des maquettes entre elles** : une primitive n'a qu'un dessin, celui de
     la **valeur majoritaire** relevée (annexe B, § 2.4 et § 6).

   Ce qu'elle emporte, et qui amende des règles existantes :
   - hauteurs 44/48 px au téléphone, 36/32 au bureau, dans `/app` seulement, par une portée de
     densité posée sur la coque (le site public ne bouge pas : amende TCK-2460) ;
   - titre de page en graisse 600, 20 px au téléphone ;
   - texte de la colonne en `rem` au bureau, soit 12,6 px (amende TCK-2490) ;
   - bouton sombre en variante ;
   - toast sombre en bas, partout ;
   - « F » dans `/app`, et « F CFA » sur l'offre et l'abonnement (décision n° 14) ;
   - dates sans l'année de l'année en cours ;
   - trait d'icône de la maquette.
3. **Les tailles fixes de la maquette deviennent des jetons en `rem` calculés, hors de l'échelle
   ×0,9.**
   - Exemples : `--text-ui` 0,8125rem (13 px), `--text-corps` 0,9375rem (15 px),
     `--spacing-icone` 1,125rem (18 px). Au réglage par défaut, ils rendent la valeur de la
     maquette à toute largeur, et ils suivent le réglage de police de l'utilisateur.
   - *Amendé le 2026-11-10 par [ADR-0107](0107-la-densite-du-bureau-est-un-jeu-de-jetons.md) : la
     première forme les voulait en px, pour échapper à `html { font-size: 90% }`. La racine reste
     désormais à 16 px, et rien n'a plus à y échapper.*
   - Le code des tickets n'écrit **aucune valeur arbitraire** (`text-[13px]`, `shadow-[…]`,
     `tracking-[…]`) : une garde le refuse dans `src/app/(dashboard)` et ses composants
     (TCK-2685).
4. **Entre 768 et 1279 px, une règle**, puisque la maquette n'y dit rien :
   - une grille à piste fixe passe en colonne unique sous `xl` (1280) ;
   - un panneau latéral de fiche (480 px) passe en plein écran sous `xl` ;
   - une table défile dans son conteneur (`overflow-x-auto`), jamais coupée par `overflow-hidden` ;
   - aucune page ne fait défiler le document horizontalement.

   **À 1280 px**, les pages qui s'y dégradent reçoivent une maquette (« bureau 1280 »), validée
   par le porteur comme les autres. Elle fait foi à cette largeur. Elle est faite sur Opus 5.5,
   à la demande du porteur.

   **Trois bandes, quand l'adaptation à 1280 ne peut pas être fluide sans changer 1440** :
   - ≥ 1440 : la maquette validée ;
   - 1280 à 1439 : la maquette 1280 ;
   - < 1280 : la règle, par `lg` et `xl`.

   Les maquettes l'écrivent `min-[1440px]:`, seulement là où un gabarit fluide échoue. Le produit
   reçoit pour cela un **point de rupture nommé à 90rem (1440 px)**, défini par TCK-2685 et
   distinct de `2xl` (1536 px), que le site public emploie déjà. Les maquettes 1280 restent
   écrites en `min-[1440px]:`. **L'implémentation peut employer des requêtes de conteneur.**
   *Amendé le 2026-11-10 par [ADR-0107](0107-la-densite-du-bureau-est-un-jeu-de-jetons.md) : la
   première forme les interdisait, parce que leurs seuils en `rem` suivaient les 90 % de la racine.*
5. **La preuve est structurelle, et mesurée par l'implémenteur.**
   - **L'outil** (`takussan-web/scripts/fidelite/`, TCK-2684) compare les styles calculés des
     éléments appariés (libellé, icône ou rôle déclaré) à des **références gelées et versionnées**
     (JSON, `docs/qa/audit-ux-2026-11/fidelite/references/`).
   - **Les pixels** ne servent que sur les zones au contenu identique.
   - **Tolérances** :
     - exactes pour la police, la graisse, le rayon, la bordure et les icônes ;
     - ±3/255 par canal pour les couleurs ;
     - ±1 px pour les dimensions, ±2 px pour les positions ;
     - ≤ 0,5 % de pixels sur une zone à contenu identique, à étalonner sur les trois premiers
       tickets.
   - **Chaque ticket front** des vagues 86 à 90 porte les critères AC-F1 à AC-F5 (annexe D, § 7).
   - **La PR** joint le tableau des écarts et le rideau, et le porteur valide sur le rideau.
   - La CI ne joue pas la comparaison : elle n'a ni l'application servie ni la base de démo.
6. **L'ordre** :
   1. la préparation (vague 91) ;
   2. le porteur revoit le téléphone à taille réelle et valide les maquettes à 1280 ;
   3. le gel des références ;
   4. les pages.

   Un ticket front des vagues 86 à 90 dépend des tickets de préparation dont il emploie les
   primitives.

## Conséquences

- **Le texte de `/app` grossit** : environ 40 % du texte du téléphone passe de 12 à 13-15 px.
  Les boutons et les champs changent de hauteur. C'est voulu.
- **La garde `check-champs-uniformes` reste vraie** : la hauteur vient de la portée de densité,
  jamais de l'appelant.
- **Les maquettes deviennent des références mesurées**, qu'une retouche invalide. Une maquette
  retouchée après le gel produit une nouvelle référence, datée et nommée dans la fiche de
  fidélité du ticket.
- **L'écran réel peut différer de la maquette dans les trois cas du § 2.** Le ticket le dit et la
  PR le montre, au tableau « écarts acceptés ».
- **Ce que la méthode ne voit pas** : les états non relevés (survol, menu ouvert, vides
  rares), les pseudo-éléments, et un écart sous la tolérance. Le rideau sert à ces cas.

## Options écartées

- **Une comparaison d'images brute.** Les données de la maquette et de la base diffèrent, et
  66 pages lisent les leurs côté serveur, hors de portée d'une interception.
- **La référence à 90 % pour le téléphone.** Le produit ne peut pas la rendre sans faire zoomer
  l'iPhone dans les champs.
- **Les règles existantes partout où elles ont tranché.** Le résultat serait moins fidèle que ce
  que le porteur a choisi.
- **Des maquettes à 1280 et à 1024 pour toutes les pages.** Leur coût est disproportionné : sous
  1280, la règle du § 4 suffit.

## Application

- Le ticket TCK-2617 voit sa cote de barre d'action corrigée : 73 px et non 64 (TCK-2691).
- `takussan-web/CLAUDE.md`, § Responsive : la barre latérale mesure 272 px depuis TCK-2490, et
  non 256 (TCK-2691).
