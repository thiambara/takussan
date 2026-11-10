# ADR-0090 — La coque de `/app` perd sa barre du haut : une colonne pleine hauteur porte la marque, « Aller à », le compte et ce qui attend

- **Statut** : Accepté le 2026-11-06 par le porteur (choix entre quatre maquettes, puis recommandations validées) ; **§ 4 et § 8 amendés le 2026-11-10** (cf. § *Amendement du 2026-11-10 — l'en-tête du téléphone, une seule flèche, le plein écran*)
- **Date** : 2026-11-06
- **Tickets** : TCK-2489 → TCK-2491
- **Prolonge** : [ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) — le menu reste une donnée composée par persona ; cet ADR décide de sa **présentation** et de la place des contrôles globaux

## Contexte

Relevé sur `dev` (77ccd274e) le 2026-11-06, après le chantier d'ADR-0089 :

- **Deux barres se partagent la coque.** Une barre d'encre de 56 px en haut (`AppTopbar`) porte le logo,
  la recherche d'annonces (`SearchAutocomplete`, dès `lg`), le bouton de la palette « Aller à… »,
  le `ProfileSwitcher`, la pastille de crédits, la langue, la cloche et le menu du compte. La barre
  latérale (`AppSidebar`, 256 px) porte l'en-tête d'espace, l'action principale, la bande « À
  traiter » (pastilles « 21 messages · 16 visites »), le menu, des cartes et le pied du compte.
- **Le porteur la juge « moche et pas vraiment top »** (2026-11-06), captures à l'appui : titres de
  groupe en capitales espacées et encadrés, pastilles qui doublent les compteurs du menu, carte
  « Demande en cours » de 200 px, profil répété en haut et en bas. Référence donnée : la barre de
  Claude — une seule colonne, une seule hiérarchie, calme.
- **La recherche « Aller à » vit dans la barre du haut**, loin du menu qu'elle double.

Quatre maquettes ont été soumises au porteur le 2026-11-06 (Atelier, Encre, Rail, Carnet ;
`/playground/coque`, retirées du dépôt après le choix).

## Décision

1. **Direction « Atelier », avec le bloc « Aujourd'hui » de « Carnet ».** Une colonne claire pleine
   hauteur, de la teinte du lin un cran sous la page ; lignes de 36 px ; icônes fines ; titres de
   groupe en casse de phrase, discrets, repliables ; compteurs en chiffres de la couleur primaire
   plutôt qu'en pastilles pleines ; l'actif marqué par un fond et l'icône en couleur primaire.
   La charte Lin (jetons, Bricolage/DM Sans) ne change pas.
2. **Plus de barre du haut à partir de `md`.** Ce qu'elle portait se range dans la colonne :
   - en tête : la marque, la cloche, le bouton « Replier la barre » ;
   - puis l'action principale de la persona (« Publier un bien »…) et **« Aller à » (⌘K / Ctrl K)**,
     une ligne du menu qui ouvre la palette d'ADR-0089 (TCK-2482) ;
   - au pied : le compte (avatar, nom, espace et rôle) — un seul menu y réunit le changement
     d'espace (`ProfileSwitcher`), la langue, le profil, les réglages et la déconnexion ; le solde
     de crédits se lit sur l'entrée « Crédits » du menu et dans ce menu du compte.
   - **La recherche d'annonces du site public entre dans la palette** : une action « Chercher un
     bien sur Takussan » (avec le texte tapé, quand il y en a) mène à `/properties`.
3. **« Aujourd'hui » remplace la bande de pastilles.** Les compteurs prioritaires de la persona
   (`priorites`, ADR-0089 §3) deviennent des lignes libellées par l'action (« Messages non lus »,
   « Visites à confirmer », « Demandes de contact »), avec leur nombre ; seules les lignes non nulles
   paraissent, et le bloc disparaît quand tout est à zéro. Aucune entrée du menu ne change de place
   selon la charge (inchangé).
4. **Le tableau de bord n'ouvre le menu que pour l'admin d'agence** (persona `admin-agence`). Pour
   toutes les autres personas, l'entrée « Tableau de bord » descend après le deuxième groupe titré
   (troisième ou quatrième lot, selon que la persona a ou non un groupe de tête) ; une persona sans
   groupe titré (prestataire) la place en quatrième ligne. La page d'arrivée `/app` et la barre
   d'onglets mobile ne changent pas.
5. **Les « Récents »** (pages retenues par `RetenirLaPageRecente`, TCK-2482) paraissent en fin de
   menu, quatre au plus, sans icône.
6. **Les cartes de statut deviennent une ligne.** La carte « Demande en cours » (passage en agence
   standard), la carte de mise en location et la carte d'offre gardent leur lien et leur sens, sous
   une forme d'une ou deux lignes au-dessus du compte.
7. **Repli** : le mode « icônes seules » d'ADR-0089 devient un rail de 60 px (icônes, point de
   couleur pour un compte non nul, infobulles) ; épingles, replis de groupe et préférences du compte
   sont conservés tels quels.
8. **Mobile (sous `md`)** : la barre d'onglets de TCK-2481 reste. Une en-tête compacte (marque,
   « Aller à », cloche) remplace la barre d'encre ; le tiroir « Menu » rend la nouvelle colonne.
9. **Hors périmètre** : la coque de `/super-admin`, les pages publiques, le contenu des pages.

## Conséquences

- `AppTopbar` disparaît de la coque de `/app` au profit d'une en-tête mobile ; ses tests
  (contraste, focus, raccourci) migrent vers leurs nouveaux emplacements.
- Les gardes d'ADR-0089 restent la référence : catalogue unique, composition pure, aucune
  destination perdue, `masquees` posé par l'appelant unique.
- La position du tableau de bord est une **donnée** de `dispositions.ts`, éprouvée par persona.
- Les mesures de la coque (largeurs 320 → 1440, contraste des jetons, ordre de tabulation, sombre)
  sont refaites au navigateur ; elles remplacent celles de TCK-2480/2481 là où elles divergent.

## Options écartées

- **Encre** (colonne sombre pleine hauteur, champ qui filtre le menu sur place) : la plus marquée,
  mais une colonne sombre sur tout l'écran alourdit une console qu'on regarde des heures.
- **Rail** (rail de sections en couleur primaire + panneau) : supprime l'accordéon, mais double les
  clics pour changer de section et ne se replie pas.
- **Carnet** (page en feuille posée sur le lin, sections en texte seul) : élégante, mais la marge
  autour de la page coûte de la largeur aux tableaux ; son bloc « Aujourd'hui » est repris.
- **Garder la barre du haut pour le logo et la langue** : deux barres pour peu de contenu ; écarté.

## Amendement du 2026-11-10 — l'en-tête du téléphone, une seule flèche, le plein écran

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 5 (a) : *le titre de la page en haut, sans
  logo* ; décisions 3 a et 6 a de la famille 3 ; demande transverse : *« les flèches de navigation back
  en mobile doivent être les mêmes dans toutes les pages »* ; décision n° 4 (b) pour la place
  d'« Aujourd'hui ») — modalités : décisions de la session, à revoir.
- **Amende** : le § 4 (ce qui ouvre le menu) et le § 8 (l'en-tête compacte sous `md`). Les §§ 1 à 3 et 5
  à 7 ne changent pas.
- **Tickets** : TCK-2617 (en-tête, flèche, plein écran), TCK-2619 (plus de bouton flottant, marque vers
  `/app`), TCK-2618 (place d'« Aujourd'hui ») ; par adoption, toutes les pages des familles 4 à 6.

**Contexte** (relevé sur `dev`, 1bce3798a, le 2026-11-10 ; audit
[`03-coque-et-accueil.md`](../qa/audit-ux-2026-11/03-coque-et-accueil.md)).

- Sous `md`, l'en-tête du § 8 porte la marque, « Aller à » et la cloche. Le titre de la page est dans le
  contenu, et il disparaît au défilement.
- Un fil de conversation est cerné par deux en-têtes et la barre d'onglets : il ne reste que 40 % de
  l'écran pour les messages.
- Chaque page dessine sa propre flèche de retour : 14 px ici, 16 px là, `ChevronLeft` ailleurs.
- Le site public a déjà son en-tête de page partagé, `EnTeteDePage`
  ([ADR-0091](0091-la-navigation-mobile-du-site-public-suit-le-profil.md), amendement du 2026-11-09,
  TCK-2568).
- Un bouton flottant (Messagerie) reste monté au bureau dans `/app`. Il est retiré du téléphone depuis
  TCK-2481.

**Décision.**

1. **Le § 8 est remplacé.** Sous `md`, l'en-tête de la coque prend **une forme parmi quatre**, et aucune
   ne porte la marque :
   - **racine**, une page d'onglet ou de menu : le titre de la page, puis la cloche et « Aller à ». Le titre
     **est** le H1 de la page, et il reste visible au défilement ;
   - **accueil** : la salutation de l'accueil
     ([ADR-0096](0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md)), puis la cloche ;
   - **détail** : la flèche de retour, le titre et une action au plus ;
   - **plein écran** : un fil de conversation ouvert, un formulaire ou un tunnel n'ont **ni en-tête de
     coque ni barre d'onglets**. La page porte son propre en-tête, avec la même flèche.
2. **Les pages déclarent à la coque** leur titre, leur forme et leurs actions, au lieu de dessiner leur
   en-tête. Une page qui ne déclare rien prend la forme « racine », avec son titre de métadonnées.
3. **Une seule flèche de retour**, la même dans `/app` et sur le site public : celle d'`EnTeteDePage`, par
   le même composant ou par un composant partagé.
   - Un test garde qu'aucune page de `/app` ne dessine la sienne.
   - Son repli suit la règle d'ADR-0091 : la page précédente du site, sinon un parent sûr.
4. **Au bureau**, un fil d'Ariane remplace les « ← Retour » des pages de détail.
5. **Aucun bouton flottant dans `/app`**, au bureau compris. La messagerie est au menu et dans
   « Aujourd'hui ».
6. **La marque mène à `/app`**, dans la colonne du bureau et dans le tiroir.
7. **Le § 4 est amendé.** Le tableau de bord ouvre le menu de l'admin d'agence, et désormais aussi celui
   de l'**agent**, sous le nom « Aujourd'hui ». Pour l'agent, c'est la même destination que l'ancien
   « Tableau de bord », qui disparaît de son menu (amendement d'ADR-0089 du 2026-11-10). Pour les autres
   personas, le § 4 tient.

**Conséquences.**

- **La règle entre dans `docs/design-guidelines.md`** : les quatre formes, la flèche unique, le plein
  écran, et pas de flottant.
- **Toutes les pages des familles 4 à 6 adoptent la déclaration à la coque.** C'est pourquoi TCK-2617
  passe tôt dans l'ordre des lots.
- `dispositions-validees.test.ts` change exprès pour l'agent.
- Sous `md`, « Aller à » quitte l'en-tête des formes « détail » et « plein écran ». Il reste dans le
  tiroir « Menu » et dans les formes « racine » et « accueil ».
- Les mesures de la coque (largeurs, contraste, ordre de tabulation, sombre) se refont au navigateur
  pour les quatre formes.

**Application.** La coque de `/app` lit la déclaration de la page (nom indicatif : un contexte d'en-tête
alimenté par la page). Gardes :

- une forme par type de page, éprouvée à 360 et 390 px ;
- « une seule flèche », qui refuse toute flèche locale dans `src/app/(dashboard)` ;
- « aucun bouton flottant dans `/app` » ;
- la marque mène à `/app`.

