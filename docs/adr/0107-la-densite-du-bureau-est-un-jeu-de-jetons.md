# ADR-0107 — La densité du bureau est un jeu de jetons, la racine reste à 16 px

- **Statut** : Accepté le 2026-11-10 par le porteur (« voie 2 »)
- **Date** : 2026-11-10
- **Tickets** : TCK-2692 (la bascule) ; TCK-2685 (les tailles fixes en `rem` calculés)
- **Remplace** : la **mécanique** de TCK-635 (`html { font-size: 90% }` dès `lg`, `globals.css`
  § `@layer base`), **pas son rendu** : le porteur garde le bureau à 90 %.
- **Amende** : [ADR-0106](0106-la-maquette-retenue-fait-foi-au-pixel.md), § 1 (référence du
  bureau), § 3 (unité des jetons) et § 4 (requêtes de conteneur).

## Contexte

- **TCK-635 (2026-10-12)** : le porteur trouvait le site plus net à 90 % de zoom. La racine passe à
  90 % dès 64rem (1024 px). Tout ce qui est en `rem` suit (texte, espacements, rayons Tailwind) ;
  ce qui est écrit en px ne suit pas, « et c'est voulu » (commentaire de `globals.css`).
- **Le relevé de fidélité du 2026-11-10**
  ([synthèse](../qa/audit-ux-2026-11/fidelite-au-pixel.md), annexes A à C) montre ce que cette
  mécanique coûte :
  - **Deux échelles coexistent, et leur ordre s'inverse à 1024 px.** `text-sm` rend 14 px au
    téléphone et 12,6 px au bureau, tandis que `text-[13px]` rend 13 px partout : au bureau, le
    « petit » texte devient plus grand que le corps.
  - **Le texte écrit en px ignore le réglage de police de l'utilisateur.** Produit, hors tests et
    maquettes : environ 380 `text-[Npx]`, et environ 530 autres valeurs arbitraires en px.
    Maquettes : environ 2 860 `text-[Npx]`.
  - **ADR-0106 a dû mettre les jetons de la maquette en px** (§ 3), pour qu'ils échappent aux
    90 %. Ce choix multiplie le texte qui ignore le réglage de police.
  - **ADR-0106 a dû interdire les requêtes de conteneur** (§ 4) : leurs seuils en `rem` se lisent
    contre la racine, et suivraient les 90 %.
  - **La visionneuse rendait le cadre téléphone à `rem` 14,4** dans une fenêtre de bureau
    (annexe C, § 1).
- **Ce qui ne bouge pas avec la racine** : une requête média en `rem` se lit contre la taille
  initiale du navigateur, jamais contre celle de `html`. Les seuils `sm`, `md`, `lg`, `xl`, `2xl`
  ne dépendent donc pas de cette décision.
- **Ce qui bouge avec la racine, et qu'on oublie** : un seuil de **requête de conteneur** en `rem`
  se lit contre la taille calculée de `html` (CSS Containment 3, à vérifier au navigateur). Le
  produit en emploie déjà, malgré ADR-0106 § 4 : environ 34 seuils dans 8 fichiers
  (`@max-[11rem]:`, `@md:`, `@min-[14rem]/stat:`…), dans les cartes de bien, les graphiques, la
  `Navbar`, la vérification d'identité et `StatCard`. Au bureau, ils se lisent aujourd'hui à
  `rem` 14,4.

## Décision

**La racine reste à la taille du navigateur (16 px par défaut) à toute largeur. La densité du
bureau n'est plus une taille de racine : c'est un jeu de jetons qui passent à ×0,9 dès `lg`.**

1. **La règle `html { font-size: 90% }` est retirée.** Rien ne fixe la taille de `html`.
2. **Dès `lg` (64rem), ces échelles passent à ×0,9** :
   - `--spacing` (une seule variable dans Tailwind 4 : marges, `gap`, `h-*`, `w-*`, `size-*`) ;
   - l'échelle `--text-*`, avec ses interlignes ;
   - `--radius`, et les rayons qui en dérivent ;
   - `--container-*` (`max-w-sm`…) ;
   - la taille de texte héritée par le `body`, pour le texte sans classe de taille ;
   - chaque valeur arbitraire du produit écrite en `rem` et active au bureau : environ 95 classes
     (123 occurrences dans 70 fichiers, moins 4 variantes de requête média et 25 variantes de
     requête de conteneur), et les styles en ligne en `rem` ;
   - chaque seuil de requête de conteneur en `rem` (les 25 variantes arbitraires et 9 nommées,
     `@md:`, `@lg:`…). Il se lit à `rem` 16 après la bascule : il garde son seuil du bureau par
     une écriture de chaque côté de `lg`, ou l'écart est mesuré et accepté par écrit.
3. **Ne changent pas** :
   - les seuils (`--breakpoint-*`) et toute requête média (pas les requêtes de conteneur : § 2) ;
   - ce qui est en px : bordures, ombres, gabarits mesurés (`w-[264px]`, `w-[480px]`). Ces
     valeurs ne suivaient déjà pas les 90 %.
4. **Les tailles fixes de la maquette sont des jetons en `rem` calculés, hors de l'échelle ×0,9**
   (13 px = 0,8125rem, 15 px = 0,9375rem, 18 px = 1,125rem). Au réglage par défaut, ils rendent
   la même valeur à toute largeur, comme les px de la maquette. Ils suivent le réglage de
   l'utilisateur.
   - Le texte du produit écrit en px (`text-[Npx]`) passe en `rem` calculé, au même rendu.
   - La garde des valeurs arbitraires de TCK-2685 reste.
5. **Au réglage par défaut, le rendu est identique au pixel**, site public compris. La preuve est
   mesurée par l'outil de TCK-2684 : comparaison avant/après à 1440, 1280 et 1024. À 390, rien ne
   change, puisque la règle ne valait que dès `lg`.
6. **Les requêtes de conteneur sont de nouveau permises** dans l'implémentation. Un seuil écrit
   après la bascule se lit à `rem` 16 à toute largeur.

## Conséquences

- **Le réglage de police de l'utilisateur est respecté partout**, y compris par les tailles fixes
  de la maquette. Avant, environ 380 textes du produit, et 59 % du texte des maquettes au
  téléphone, l'ignoraient.
- **`getComputedStyle(html).fontSize` vaut 16 px à toute largeur.** Un `rem` vaut la même chose
  partout. Une valeur se lit sans savoir de quel côté de 1024 px on se trouve.
- **Une seule source de densité.** On ne règle plus la densité par la racine : on la règle par les
  jetons, qu'on peut un jour moduler par surface (`/app`, site public) sans toucher au reste.
- **Risque : les composants tiers en `rem`** ne suivront plus le ×0,9. Exemples : Leaflet
  (`leaflet.css` en compte 2), une feuille de bibliothèque, le texte d'un SVG ou d'un `canvas`
  dimensionné en `rem`. Chacun est inventorié par TCK-2692 : soit il passe dans l'échelle, soit
  l'écart est mesuré et accepté par écrit.
- **Risque : un jeton déclaré dans `@theme inline`** est recopié en valeur dans l'utilitaire, et ne
  peut pas être redéfini sous une requête média. Chaque échelle ×0,9 doit être lue par `var()`. Le
  thème par défaut de Tailwind 4 l'est ; c'est à vérifier à l'implémentation, pas à supposer.
- **Une valeur en `em`** suit la taille de texte de son élément, comme avant. Ce qui était relatif
  à la racine (`rem`) et ne passe pas par un jeton perd le ×0,9 : c'est l'inventaire du § 2.
- **Correction du 2026-11-10, avant toute implémentation** : la première rédaction de ce § 2
  rangeait 28 variantes `…-[11rem]:` parmi les requêtes média, donc hors de l'inventaire. 25 sont
  des requêtes de conteneur, qui suivent la racine. Le relevé est refait dans TCK-2692.
- **L'artefact du cadre téléphone ne disparaît pas tout seul.** Les jetons ×0,9 suivent la largeur
  de la fenêtre, pas celle du cadre. Seul le rendu en iframe de la visionneuse (en cours, session
  du 2026-11-10) rend le cadre téléphone à son échelle de téléphone.
- **Le zoom de Safari iOS sur les champs** n'est pas concerné : sous `lg`, rien ne change.

## Options écartées

- **Voie 1 — retirer les 90 % tout court.** Le bureau grossit de 11 % partout. Il faudrait revoir
  environ 200 écrans de bureau des maquettes et le site public. Et c'est contre la préférence du
  porteur, qui a choisi ce rendu par TCK-635.
- **Statu quo (c) — garder la racine à 90 % et les jetons de la maquette en px** (ADR-0106 § 3 dans
  sa première forme). Deux échelles restent, avec leur inversion. Les tailles fixes restent
  sourdes au réglage de l'utilisateur. Les requêtes de conteneur restent interdites.

## Application

- `takussan-web/src/app/globals.css` : la règle de TCK-635 est retirée ; un bloc dès `lg` redéfinit
  les échelles du § 2 (TCK-2692).
- Les jetons de taille fixe en `rem` calculés : TCK-2685.
- **Ce qui l'empêche de régresser** :
  - un test de TCK-2692 vérifie que la racine rend 16 px à 1440. Remettre la règle des 90 % le
    fait rougir (ablation) ;
  - la garde des valeurs arbitraires de TCK-2685 refuse un `text-[Npx]` neuf dans `/app` ;
  - la comparaison avant/après de l'outil de TCK-2684 est jointe à la PR de la bascule.
