---
id: TCK-2598
title: "Une seule coque pour l'entrée : l'intention en titre, l'avancement du parcours, le bouton collé au-dessus du clavier"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2600, TCK-2604, TCK-2608, TCK-2611, TCK-2613]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#onboarding-parcours"
  models: []
tags: [front, auth, onboarding, mobile, audit-ux, app]
---

## Objectif utilisateur

Le nouveau venu traverse la connexion, le code, son prénom, l'orientation, l'invitation ou la publication sans que l'écran change trois fois de visage, voit où il en est du parcours entier, et garde toujours le bouton principal sous le pouce — même clavier ouvert.

## Contrat de données

Aucun endpoint. La coque reçoit de chaque page son intention (titre de la barre), sa position dans le parcours (pas courant / total, compte compris) et, au bureau, l'objet à montrer dans le panneau (le bien, l'agence qui invite, l'aperçu de l'annonce) ; sans objet, pas de panneau décoratif.

## Direction UX / Artistique

- Maquettes de référence (la coque est commune aux cinq pages de la famille) : `/fr/playground/maquettes?p=app-entree-connexion&a=a`, `?p=app-entree-publier&a=a`, `?p=app-entree-orientation&a=a`, `?p=app-entree-invitation&a=a`, `?p=app-entree-assistants&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- **Téléphone (360-390 px)** : barre de 56 px — retour à gauche, l'intention en titre (« Publier votre bien », « Rejoindre Dakar Immo »), l'avancement en pastilles à droite ; plus de bandeau photo de 236 px. Le bouton principal est collé en bas, et remonte au-dessus du clavier quand un champ a le focus (le modèle est le pied collant de l'assistant de publication). Aucune barre d'onglets publique (règle des couches, ADR-0091).
- **Bureau (≥ 1280 px)** : colonne de formulaire de 480 px ; le panneau voisin porte l'objet de l'intention ; la photo de villa et le slogan disparaissent. Les colonnes se posent dès `lg`, jamais dès `md`.
- La flèche de retour est celle, unique, que la famille 3 aligne sur tout le produit (README de l'audit, § Maquettes) — ce ticket ne la redessine pas.
- Quitter (✕ ou « Quitter ») demande confirmation dès qu'une saisie existe, et dit où la reprendre.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — la coque remplace la mise en page de `(auth)/layout.tsx`, d'`OnboardingShell`, de `/publish` (`BarreDeMarque`) et de `/invitations` ; ces fonctions restent :

- « Retour » vers la page publique quittée, mémorisée ou dans l'historique (TCK-568) ; logo vers l'accueil ; arrivée en haut de page ; session périmée refermée à l'arrivée sur `/auth/*` après avoir demandé au serveur (`ReinitialiserSessionClient`).
- `noindex` et titre d'onglet traduit sur chaque page ; « Retour au site » des écrans d'onboarding.
- Le fournisseur de toasts reste monté sur `/publish` (sans lui, Base UI lève au rendu, mémoire « ToastProvider : quatre coques + /publish »).
- Les frontières de dictionnaire par segment (`messagesPour(...)`, TCK-337) ne s'élargissent pas : la coque ne tire aucun espace de libellés dans le socle commun.
- La note de pied « Vos réponses sont enregistrées au fur et à mesure » ne paraît que sur un écran qui écrit vraiment un brouillon.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel, wolof en pause) ; ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Delta à produire

- [ ] Coque d'entrée : barre (retour, intention, avancement, sortie), zone de contenu, pied collé suivant le clavier, panneau d'objet au bureau.
- [ ] Bascule des pages `/auth/*`, `/onboarding/*`, `/publish`, `/invitations/accept` sur la coque, contenus inchangés (chaque page est refaite par son propre ticket).
- [x] Confirmation de sortie quand une saisie existe. *(Réserves r1/r2 fermées : toutes les sorties gardées, marque comprise ; l'invitation et l'assistant d'admin d'agence déclarent leur saisie. Preuve : `CoqueDEntree.sortie-gardee.tck-2598`, `EntreeDInvitation.sortie.tck-2598`, `AgencyAdminOnboardingWizard.sortie.tck-2598`, 10 ablations rouges, cf. Notes.)*
- [ ] Tests : retour vers la page quittée, `noindex`, toasts montés sur `/publish`, confirmation de sortie avec et sans saisie, absence de la barre d'onglets publique.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, champ numéro focalisé et clavier émulé (`visualViewport` réduit de 336 px), le bas du bouton « Recevoir un code » est dans la zone visible (mesure au navigateur, comparée au relevé de l'audit : bouton à 594 px, sous le clavier).
- [ ] AC2 — À 1280 px, la colonne de formulaire mesure 480 px ± 8 et aucune image décorative n'est chargée sur `/auth/login` sans intention (vérifié au réseau).
- [ ] AC3 — Sur `/onboarding/intention` avec une saisie en cours, « Quitter » ouvre une confirmation ; sans saisie, il sort directement.
- [ ] AC4 — Le poids du dictionnaire servi sur `/auth/login` ne dépasse pas celui mesuré sur `dev` avant le ticket de plus de 2 %.
- [ ] AC5 — `/publish` rend sans frontière d'erreur avec un toast déclenché au premier rendu.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2598.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le contenu de chaque écran (TCK-2600, TCK-2604, TCK-2608, TCK-2611, TCK-2613).
- La flèche de retour elle-même et la coque de `/app` (famille 3).

## Notes d'implémentation

- **La coque** : `takussan-web/src/components/entree/CoqueDEntree.tsx` (client) — barre de 56 px au téléphone (flèche unique / « ✕ » / marque, intention, pastilles, sortie), barre de 64 px dès `lg` (pastille de retour, marque, intention + pastilles au centre, sortie), colonne `max-w-[30rem]` (480 px en rem : la densité ×0,9 du bureau ne la rabat pas), emplacements `objet` (panneau voisin dès `lg`, empilé sous `xl`) et `pied` (collant, remonté de ce que le clavier cache : `useDecalageDuClavier`, `innerHeight − (visualViewport.offsetTop + height)`). Une page déclare par `<DeclarerEntree titre pas total saisie reprise pied objet />` (patron de `DeclarerEnTete`).
- **Libellés par le serveur** (`libelles-de-la-coque.ts`, espace neuf `coqueDEntree`, lu par `getTranslations` seul) : la coque ne lit aucun espace côté client. Mesuré : `/auth/login` sert 7 espaces / 10 839 o gzip, avant comme après (AC4 : +0 %).
- **Bascule** : `(auth)/layout.tsx` (villa, slogan et bandeau supprimés ; `RetourAuth` en flèche unique au téléphone — `LienFlecheDeRetour` reçoit `peutRevenir`, la règle « site PUBLIC seulement » de TCK-568 — et en pastille au bureau) ; `OnboardingShell` (même API, + `intention`, `pas`, `total`, `largeur` ; les assistants gardent `large` tant que leurs tickets ne les refont pas ; prénom et invitation en `etroite`) ; `/publish` (la coque dans le layout, SOUS `ToastProvider` ; `BarreDeMarque` reste aux pages d'erreur).
- **Confirmation de sortie** : un clic sur la sortie est retenu quand une saisie est déclarée, puis rejoué sur le lien après « Quitter » (patron de `garde-de-sortie.tsx`). Déclarée par `QuestionDIntention` (un autre choix que celui proposé) et `EtapePrenom` (un nom tapé), chacune disant où reprendre (« … reposée à votre prochaine connexion »). Le libellé de la sortie d'onboarding reste « Retour au site » (contrainte du ticket) : c'est lui, le « Quitter » d'AC3.
- **Mesures** (390 × 844, clavier émulé à 336 px) : « Recevoir un code » finissait à 595 px, il finit à 456 (zone visible : 508). À 1280 : colonne 480 px (avant 403), aucune image chargée (avant : la villa d'Unsplash). 768 et 1024 : aucun défilement horizontal sur login, register, forgot-password, verify-email, invitations ; le titre de l'inscription commence à 115 px sous une barre de 58 (le chevauchement de 1024-1180 du 2026-09-23 ne peut plus se produire).
- **Pour les tickets de page (2600, 2604, 2608, 2611, 2613)** : `pied` est monté par la coque, HORS du `<form>` de la page et de ses contextes — un bouton d'envoi y porte `form="<id>"`. Ouverte sur la marque (onboarding, invitation), la barre du téléphone n'écrit pas l'intention (maquette orientation a-0/a-1 : marque et pastilles) ; ouverte sur un retour ou « ✕ », elle l'écrit. Mesuré à 360 : marque, pastilles et « Retour au site » tiennent (43 px de jeu).
- **Réserves r1 et r2 de la contre-vérification de b055562f7 (2026-11-14)** — re-mesuré au HEAD (e798d91d0) : `QuestionDIntention` n'existe plus (l'orientation de TCK-2608 monte la coque sans sortie ni saisie) ; seul `EtapePrenom` déclarait une saisie.
  - **r1, la marque** : toute `Marque` de la coque (barre du téléphone, après un retour, barre du panneau, barre du bureau) passe par `auClicDeSortie`, la même garde que « Retour au site », « ✕ » et « Quitter » ; bloquée (TCK-2601), elle reste inerte par la garde elle-même. Un lien de sortie qu'une page pose dans son `enTete` emprunte la garde par `useClicDeSortie()` (fonction STABLE : une valeur de contexte neuve à chaque rendu faisait boucler la page qui redéclare son en-tête) — c'est la marque de l'écran du code d'invitation, la seule du téléphone sur cet écran. Le test de TCK-2601 qui acceptait une marque sortant sans demander malgré une saisie est corrigé.
  - **r2, l'invitation** : `EntreeDInvitation` déclare une saisie dès que les noms diffèrent du pré-rempli de l'agence (comparés au pré-rempli, pas au vide : une page intacte sort sans demander), ou qu'un numéro ou un code est tapé ; `AccepterInvitation` dès qu'un mot de passe est tapé ou que les noms diffèrent du pré-rempli (voie mot de passe, et compte connecté sans nom). Reprise : `invitationAccept.sortie.reprise`. La saisie fusionnée par la coque est désormais un OU (un `false` monté après un `true` l'effaçait).
  - **r2, l'assistant d'admin d'agence** : `TotpEnrollment` gagne un rappel facultatif `onEtape` (les deux autres montages inchangés) ; l'assistant déclare une saisie dès que le code QR est montré (un secret est écrit : `enable` en régénère un à chaque fois), avec deux reprises — `agency.onboarding.sortie.configuration` (« … reprendra au début, avec un nouveau code QR ») et `.codes` aux codes de secours, montrés une seule fois. L'accueil et l'intro sortent sans demander (décision (b) posée à team-lead).
  - **Non couvert, hors réserve** : aucun écran au HEAD ne combine la flèche de retour (`retour`, `(auth)`) avec une saisie déclarée ; l'orientation (TCK-2608) ne déclare aucune saisie, et sa propre marque (`BarreDOrientation`) n'est pas branchée sur `useClicDeSortie` — à faire si un de ses écrans en déclare une. Retour arrière du navigateur et fermeture d'onglet : toujours sans `beforeunload`. Pas de relevé au navigateur : jsdom monte les vrais composants sous la vraie coque, et le lien de Next n'appelle pas la navigation quand son `onClick` l'a annulée (`next/dist/client/app-dir/link.js`, `e.defaultPrevented`).
- **Écart signalé** : la maquette d'arrivée directe (connexion a-1) dessine une photo de ville (176 px au téléphone, panneau de 45 % au bureau) que l'AC2 et TCK-2604 écartent sans photo fournie par le porteur — fiche `TCK-2598.json`, écarts acceptés.
