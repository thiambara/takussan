# ADR-0136 — Chaque page de `/app` a un profil d'espace, décidé par sa route

- **Statut** : Accepté le 2026-11-22 (« fait a et b » du porteur, chantier 5 de « L'écran économe », délégué à
  l'agent avec la consigne de valider ses recommandations sous les angles métier, ingénierie et utilisateurs)
- **Date** : 2026-11-22
- **Tickets** : TCK-2998
- **S'appuie sur** : [ADR-0133](0133-une-mesure-de-la-fenetre-et-le-mode-saisie-des-formulaires-plein-ecran.md)
  (la mesure, le mode saisie et son amendement du 2026-11-22), [ADR-0134](0134-au-telephone-la-page-de-app-defile-et-ses-barres-s-effacent.md)
  (le mode se décide par la route)

## Contexte

La maquette « L'écran économe » propose un profil d'espace par type de page :

- **liste et lecture** : la page défile et les barres s'effacent ;
- **formulaire** : pas d'onglets, et le mode saisie complet ;
- **conversation** : hauteur fixe, composeur collé au clavier ;
- **immersif** (carte, galerie) : tout s'efface, sauf la pastille.

Relevé du code le 2026-11-22. Trois de ces profils existaient déjà, mais sous trois noms et à trois endroits :

- **liste** : `defileLeDocument` (ADR-0134), qui fait défiler le document et effacer les barres ;
- **formulaire** : `estFormulaire`, une fonction privée de `en-tete-de-la-coque.ts` (`/app/…/new`), ajoutée à
  `estPleinEcran`. Elle donne la forme d'en-tête `plein-ecran`, qui retire la barre d'onglets ;
- **conversation** : `declaration.conversation`, l'état de `/app/messages` qu'ADR-0134 admet comme seule bascule.

Mesuré à 390 × 844 avec un clavier simulé de 336 px, sur `/app/leases/new` (un formulaire dans le document) :

- la barre d'action (« Retour », « Continuer ») restait de 771 à 844 px, sous le clavier ;
- l'en-tête gardait ses 56 px et sa ligne d'étape.

**L'immersif n'a aucune route dans `/app`.** Les 91 pages ont été parcourues. La seule surface immersive est la vue
carte de la recherche publique, et elle l'est déjà : pas de barre d'onglets, une pastille flottante « Filtres ·
Liste » (TCK-553). C'est un état de `PropertiesDiscoveryPage`, hors de la coque.

## Décision

**Une seule fonction, `profilDEspace(pathname, { conversation })` (`src/components/layout/plein-ecran.ts`), donne le
profil de toute page de la console. La coque le publie (`data-espace`), et le CSS y répond.**

1. **Trois profils, décidés par la route** :
   - `formulaire` : les créations (`/app/…/new`, `estFormulaire`, désormais exportée de `plein-ecran.ts`) et le
     plein écran de la publication (`estPleinEcran`) ;
   - `conversation` : `/app/messages` avec une conversation ouverte. C'est l'exception d'état qu'ADR-0134 admet déjà,
     et elle n'est reconnue que sur cette route ;
   - `liste` : tout le reste.
   - **Une déclaration de page ne change jamais le profil**, comme le mode de défilement (ADR-0134 § 1). Une page qui
     déclare `forme="plein-ecran"` garde son profil : sa barre d'onglets part, mais son mode ne bascule pas sous le
     doigt.
2. **`formeDeLaRoute` lit le profil.** Un `formulaire` a l'en-tête `plein-ecran`. Il n'y a plus de seconde
   définition de « formulaire ».
3. **La coque s'abonne à la mesure sur tout profil**, et plus seulement en mode document : la saisie d'un formulaire y
   répond aussi.
4. **En saisie, sous `md`** (`globals.css`) :
   - **tout profil en mode document** : la barre d'action se pose sur le clavier (`bottom: --clavier`). La barre
     d'onglets est partie, et sa réserve avec elle. L'en-tête collé suit le haut de la fenêtre visible
     (`top: --vue-top`) quand le navigateur la décale pour montrer le champ ;
   - **`formulaire`** : l'en-tête passe de 56 à 44 px, et sa ligne d'étape (`data-slot="ligne-d-etape"`) se replie,
     comme dans la publication (ADR-0133 § 4) et le panneau plein écran (son amendement, § 7) ;
   - **`conversation`** : le cadre calé sur la fenêtre visible (ADR-0133, amendement, § 8).
5. **L'immersif n'est pas un profil de la console tant qu'aucune route de `/app` n'en porte.** Le jour où une carte ou
   une galerie y devient une page, elle s'ajoutera ici, par sa route. Le type ne l'énumère pas d'avance.

## Les angles

- **Métier** :
  - un agent qui crée un bail, un client ou une demande au téléphone garde « Continuer » sous le pouce pendant qu'il
    tape. Avant, il devait fermer le clavier pour avancer, sur les parcours qui créent la valeur (baux, clients,
    biens) ;
  - aucune règle d'accès ne change, et aucun chemin ne se ferme : les onglets étaient déjà retirés des formulaires.
- **Utilisateurs** :
  - l'agent et l'administrateur d'agence (créations, messagerie) ;
  - le bailleur et le prestataire (leurs formulaires de `/app`) ;
  - le locataire (signalement, paiement) ;
  - le visiteur n'est pas concerné : le site public garde sa barre et sa recherche (ADR-0133, amendement, § 9) ;
  - **la saisie optimiste ne retire aucun geste** (amendement, § 10). Sans clavier mesuré, l'en-tête se compacte,
    mais la barre d'action reste en bas, à sa place.
- **Ingénierie** :
  - une fonction au lieu de trois conditions dispersées ;
  - un test parcourt toutes les pages de `src/app/(dashboard)/app` et vérifie que « formulaire » couvre exactement
    les créations et le plein écran ;
  - les modes de défilement ne bougent pas : aucune route ne change de mode (ADR-0134, avertissement) ;
  - au bureau, rien ne change : les règles sont sous `md`, et la saisie n'y part pas sans pointeur grossier.

## Conséquences

- **Une création neuve (`/app/x/new`) est un formulaire, sans rien déclarer.** Un formulaire qui n'est pas une
  création, comme une édition, reste « liste » tant que sa route ne le dit pas. Sa barre d'action se pose quand même
  sur le clavier, car la règle vaut pour tout le mode document.
- `data-espace` est publié à toute largeur. Seules les règles sous `md` le lisent.
- **Ce que seul un téléphone juge** : la barre d'action posée sur le vrai clavier, et l'en-tête qui suit
  `--vue-top` quand Safari décale la fenêtre visible.

## Application

- `src/components/layout/plein-ecran.ts` : `profilDEspace`, `estFormulaire`.
- `src/lib/navigation/en-tete-de-la-coque.ts` : `formeDeLaRoute` lit le profil.
- `src/components/layout/AppShell.tsx` : `data-espace`, l'abonnement à la mesure sur tout profil.
- `src/components/layout/EnTeteMobile.tsx` : `data-slot="ligne-d-etape"`.
- `src/app/globals.css` : les règles de la saisie en mode document et du profil « formulaire ».
- Les tests : `plein-ecran.test.ts` (dont le parcours des pages), `CoqueHauteur.test.tsx` et
  `en-tete-mobile.tck-2617.test.tsx`, vérifiés par ablation.
