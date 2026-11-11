---
id: TCK-2617
title: "Coque de /app au téléphone : le titre de la page en haut, une seule flèche de retour, le plein écran d'une conversation ou d'un formulaire"
status: todo
phase: P1
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2632]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, navigation, mobile, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, dans `/app`, chacun sait sur quelle page il se trouve même après avoir fait défiler, revient en arrière toujours par le même geste, et lit une conversation ou remplit un formulaire sur tout l'écran.

## Contrat de données

Aucun endpoint neuf.

- **Le titre** est celui que la page déclare dans son en-tête de page. À défaut, c'est le libellé de l'entrée du menu composé qui sert la route (catalogue et disposition du persona, ADR-0089). Une page sans titre propre n'est donc jamais sans titre.
- **Le repli du retour** est la liste parente de la route (`listePour`, la table des sections que lit déjà la page introuvable). Le retour par l'historique suit la règle du site public (TCK-2568 : seulement si la page précédente de l'onglet est du site).
- **L'espace** affiché sur l'accueil est celui du profil actif, tel que le pied du compte le nomme déjà.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-coque&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans à suivre : « Accueil (admin) », « Page racine (Demandes) », « Page de détail », « Conversation ouverte », « Persona · bailleur », « Persona · locataire », « Persona · prestataire ». Coque commune des maquettes : `…/maquettes/chrome-app.tsx` (`EnTeteRacine`, `EnTeteAccueil`, `EnTeteDetail`, `EnTeteFormulaire`, `EcranApp`).
- **Décision 5 (a) du porteur** : au téléphone, le titre de la page est en haut et le logo disparaît de l'en-tête. L'en-tête mesure 56 px, colle en haut et ne défile pas. Il prend quatre formes :
  - **Page racine** : le titre à gauche (Bricolage 20 px, tronqué sur une ligne). C'est le H1 de la page. À droite, dans cet ordre : 0 ou 1 action de page en bouton icône de 40 px (« + » primaire plein, filtres…), puis « Aller à », puis la cloche.
  - **Accueil** : à gauche, l'espace en bouton (avatar en initiales de 28 px, nom de l'espace, chevron). Il ouvre la feuille du compte et des espaces. À droite, « Aller à » et la cloche. Le salut (« Bonjour Awa ») reste le H1, dans le contenu.
  - **Détail** : la flèche de retour, puis un titre court (17 px, tronqué), puis « ⋯ » de 44 px qui ouvre les actions secondaires de la page en feuille du bas, quand la page en a. Ni cloche ni « Aller à » : ils sont à un retour de distance.
  - **Plein écran** (formulaire, tunnel) : « ✕ » à gauche, puis le titre et « Étape 2 sur 4 » en 13 px. Pas de barre d'onglets.
- **Conversation ouverte** : ni en-tête de coque, ni barre d'onglets. C'est l'en-tête du fil qui porte la flèche (contenu : TCK-2632).
- **La flèche de retour est unique pour toute l'application** (demande du porteur, README § Maquettes). C'est `ArrowLeft` en 20 px, comme `BoutonRetour` du produit, dans une cible de 44 px. Sa variante ronde pleine sur photo a un fond de carte et l'ombre de `BoutonSurPhoto`, une cible de 44 px, et s'aligne sur ses voisins « Partager » et « Favori ». C'est le `BoutonRetourDePage` du site public (TCK-2568), et non une seconde version.
  - Les liens texte « ← Retour à … » gardent leur forme, avec le même glyphe en 16 px.
  - Les chevrons de période, de pagination et de carrousel ne sont pas des retours.
- **Barre d'action collante** : la coque offre aux pages de détail une barre de 64 px au-dessus des onglets (fond carte, ombre haute légère), qui porte 1 bouton pleine largeur ou 2 boutons à 50/50. Les pages l'adoptent dans leurs propres tickets.
  - **Mise à jour du 2026-11-10** (relevé de fidélité au pixel, [annexe C § 2.3 et § 5.1](../../../qa/audit-ux-2026-11/fidelite/C-coque.md)) : la barre mesure **73 px** et non 64 — filet 1 + `py-3` (12 + 12) + bouton d'action principale de 48, relevé sur 49 écrans. Elle est la primitive de TCK-2689 ; au-dessus des onglets elle n'ajoute pas de zone sûre, en plein écran elle ajoute `env(safe-area-inset-bottom)`. Les feuilles que ce ticket crée (compte et espaces, actions « ⋯ ») sont la feuille du bas de TCK-2690, et les icônes de l'en-tête suivent les cotes de TCK-2691 (C5 : 20 px, trait 1,75, encre douce).
- **Bureau (≥ 1280 px)** : la colonne ne change pas, et le H1 reste dans la zone de contenu. Sur une page de détail, un fil d'Ariane de 13 px (« Baux › Bail de la Villa Ngor ») remplace le lien « ← Retour » au-dessus du H1 (écran « Page de détail », bureau). Entre `md` et `lg`, la règle de la coque vaut : `md` n'est pas le bureau, et l'en-tête de 56 px n'existe que sous `md`, comme aujourd'hui.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md).

**Pas de régression.** Ce qui existe et doit rester :

- **En-tête mobile** (`EnTeteMobile`) : la cloche, avec sa pastille plafonnée à « 9+ » et son popover jusqu'à TCK-2634 ; le bouton « Aller à », qui ouvre la palette, rend le focus à son bouton et garde `aria-keyshortcuts`.
- **Dans la coque** :
  - le lien d'évitement « Aller au contenu principal », premier élément focalisable ;
  - les bandeaux d'impersonation, d'agence suspendue et du site (maintenance), dans la zone qui défile ;
  - la région `aria-live` des non-lus ;
  - les zones sûres du haut et du bas ;
  - le tiroir « Menu », inchangé ici ;
  - la route plein écran `/app/properties/new` (TCK-631), qui garde sa propre sortie.
- **Les retours existants** (bail, intervention, document, état des lieux, conversation…) restent atteignables : au téléphone par la flèche de l'en-tête, au bureau par le fil d'Ariane. La destination ne change pas. Le retour reste un vrai lien (clic molette, « ouvrir dans un onglet »), avec repli sur la liste parente quand rien du site ne précède la page dans l'onglet.

**Autres règles :**

- **Un seul H1 exposé à l'arbre d'accessibilité, à toute largeur** : le titre de l'en-tête sous `md`, le H1 de la page dès `md`. Le `<title>` du document reste « <Titre> — Takussan ».
- **Le plein écran d'une conversation se décide par l'ÉTAT de la page.** Ouvrir un fil ne change pas le chemin (`/app/messages?conversation=…`), et la règle actuelle (`estPleinEcran`) ne lit que le chemin.
- **Le logo quitte l'en-tête du téléphone.** Il reste dans la colonne de bureau et dans le tiroir (sa cible : TCK-2619).
- **Aucune autre flèche de retour ne subsiste dans `/app`** : une garde l'éprouve (voir Delta).
- Libellés neufs (« Retour », « Plus d'actions », « Étape {n} sur {total} »…) en `fr`/`en`/`wo`, `wo` = le texte français tel quel. Vouvoiement.

## Delta à produire

- [ ] Un moyen, pour une page ou pour un état de page, de déclarer à la coque :
  - son titre court ;
  - son action d'en-tête ;
  - sa forme (racine, accueil, détail, plein écran) ;
  - ses actions secondaires (« ⋯ »).

  À défaut de déclaration, la coque se sert du titre dérivé et de la forme racine. Une route sous une liste parente prend la forme détail.
- [ ] Les quatre formes d'en-tête sous `md`, et le plein écran sans onglets (formulaire, tunnel, conversation ouverte).
- [ ] La flèche unique, partagée avec le site public. Les retours de `/app` qui portent leur propre glyphe passent par elle :
  - lien de `LeaseDetail` en 14 px ;
  - `DocumentDetailClient` en 16 px ;
  - `maintenance/[id]` ;
  - l'en-tête du fil `ChatView` ;
  - tout autre retour relevé par la garde.

  Au téléphone, les liens « ← Retour » du contenu disparaissent au profit de l'en-tête. Au bureau, le fil d'Ariane les remplace.
- [ ] Le fil d'Ariane des pages de détail au bureau.
- [ ] L'emplacement de la barre d'action collante au-dessus des onglets.
- [ ] La règle écrite dans `docs/design-guidelines.md` : l'en-tête du téléphone de `/app`, la flèche unique et ses deux variantes, ce qui n'est pas un retour.
- [ ] Tests :
  - forme d'en-tête par route ;
  - titre dérivé du menu quand la page n'en déclare pas ;
  - un seul H1 exposé (390 et 1280) ;
  - plein écran d'un fil ouvert ;
  - repli du retour sur la liste parente.
- [ ] Garde : une flèche de retour (`ArrowLeft` ou `ChevronLeft` dans un lien ou un bouton de retour) hors du composant partagé fait rougir un test. La liste fermée des exceptions est écrite dans le test : période, pagination, carrousel, calendrier.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844 sur `/app/leases`, l'en-tête montre « Baux » et aucun logo. Le document compte exactement un `h1` dont le style calculé n'est pas `display: none`, et son texte est « Baux ».
- [ ] AC2 — À 390 sur un bail ouvert depuis `/app/leases?status=active`, le lien de retour de l'en-tête mesure 44 × 44, porte le nom « Retour », et son SVG est celui du retour de la fiche publique (même classe lucide `lucide-arrow-left`, 20 px).
  - Le toucher ramène à `/app/leases?status=active` (filtre gardé).
  - Ouvert dans un nouvel onglet, le même bail ramène à `/app/leases`.
- [ ] AC3 — À 390, ouvrir une conversation retire du DOM visible l'en-tête de la coque (`[data-slot=en-tete-mobile]`) et la barre d'onglets. Les refermer les rend.
- [ ] AC4 — À 390 sur `/app`, la gauche de l'en-tête porte le nom de l'espace actif et ouvre la feuille du compte. Sur toute autre page racine, elle porte le titre.
- [ ] AC5 — À 360, le titre le plus long d'une page racine (« Demandes de contact ») se tronque sur une ligne à côté de trois boutons, avec `scrollWidth − innerWidth = 0` (`innerWidth` relevé, pas déduit).
- [ ] AC6 — À 1280, la colonne est inchangée (même jeu d'entrées qu'avant le ticket). Une page de bail montre le fil d'Ariane « Baux › … » et aucun lien « ← Retour ».
- [ ] AC7 — La garde rougit si l'on remet le lien `ArrowLeft` d'origine dans `LeaseDetail` (ablation).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2617.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les cases des onglets et les entrées du menu par persona (TCK-2618), le logo, les libellés et le tiroir (TCK-2619).
- La feuille de la cloche au téléphone (TCK-2634) et le contenu du fil de conversation (TCK-2632).
- Les actions « ⋯ » et la barre collante de chaque page : elles viennent avec le ticket de la page.
- La coque de `/super-admin`.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
