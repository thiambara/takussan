---
id: TCK-2988
title: Publication au téléphone — un en-tête et un pied compacts, la place rendue à la question
status: doing
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: []
blocks: []
spec_refs:
  features: ["docs/features.md#11-gestion-des-biens"]
  models: []
tags: [front, publication, mobile, assistant]
---

## Objectif utilisateur

Quand il publie son bien sur un téléphone, le propriétaire voit la question en cours sans que les
bandeaux du haut et le pied du bas lui en prennent la moitié.

## Contrat de données

Aucun endpoint neuf. Rien ne change dans ce que l'assistant écrit (brouillon local, annonce publiée).
Les données affichées existent déjà : le résumé de l'aperçu, l'état du brouillon et l'avancement.

## Direction UX / Artistique

**Référence de fidélité : la maquette « L'écran économe »**, variante `#publier` (compacte) contre
`#publier?v=actuelle` (aujourd'hui). Elle est locale, jamais versionnée :
`takussan-web/src/app/[locale]/(public)/playground/maquettes/ecran/ecrans-cadre.tsx`, à lire au chemin
absolu de l'arbre principal. Le porteur l'a validée le 2026-11-21 (« c'est excellent, je valide »). On
en reprend le résultat, pas le code.

Mesure de la maquette (390 × 664) : la question passe de 390 à 537 px de haut (+38 %). L'en-tête et ses
bandeaux passent de 158 à 56 px, le pied de 117 à 71 px.

- **En-tête, 56 px.** On y trouve « ✕ », l'intention avec, dessous, le résumé de l'annonce (type ·
  contrat · lieu, puis le prix ou « Prix à venir »), et « Aperçu » à droite, qui ouvre le tiroir
  d'aperçu existant. Les six pastilles quittent la barre du téléphone : l'avancement est au pied. La
  barre d'aperçu sous l'en-tête disparaît, son contenu étant passé dans l'en-tête.
- **Brouillon.** La ligne « Brouillon gardé sur ce téléphone · Effacer ce brouillon » quitte le
  téléphone. Un brouillon repris s'annonce une fois, par une ligne discrète en tête de la question
  (« Brouillon repris, gardé sur ce téléphone. Effacer »), qui part à l'étape suivante.
- **Quitter (✕).** Quand un brouillon existe, ✕ demande quoi en faire : partir en le gardant, rester,
  ou l'effacer et partir. C'est ce qui permet de retirer le bandeau permanent.
- **Pied.** La progression en trois parties devient trois segments de 3 px au ras du pied, sans
  libellés : le nom de la partie reste écrit au-dessus de la question. Les gestes tiennent sur une
  ligne : « Précédent » est un bouton rond de 48 px à flèche, « Continuer » prend la largeur restante
  et « Plus tard » se place entre les deux quand l'étape le permet.

## Contraintes strictes (métier)

- **Bureau inchangé** : dès `lg` (1024), `/publish` et `/app/properties/new` rendent exactement ce qu'ils
  rendent aujourd'hui.
- **Le pied est commun aux deux entrées** (TCK-2819 : un seul assistant). `/app/properties/new` reçoit
  donc le pied compact. Son en-tête (« Reprendre plus tard », qui écrit le brouillon, TCK-465) ne change
  pas dans ce ticket.
- **Les états du brouillon qui avertissent restent visibles** au téléphone : stockage refusé ou plein
  (`refus`, `quota`), brouillon purgé, brouillon effacé.
- « Effacer » reste inerte quand la sortie est verrouillée (feuille de compte ouverte, écritures en
  cours, TCK-2601 AC5).
- **Accessibilité.** « Précédent » garde son nom accessible. La barre de progression du pied garde
  son nom et sa valeur (« Étape N sur M »), puisqu'elle remplace les pastilles. Les cibles font au moins
  44 px.
- La coque d'entrée ne lit aucune traduction (TCK-337). Ce que la page y ajoute arrive par déclaration,
  libellés compris.
- Clés i18n neuves en `fr`, `en` et `wo` (le `wo` porte le texte français, wolof en pause).

## Delta à produire

- [x] Pied de l'assistant au téléphone : segments de 3 px au ras du pied, gestes sur une ligne
      (Précédent rond, Continuer extensible), hauteur réservée au dock mise à jour
- [x] Coque d'entrée : une ligne sous l'intention et un avancement porté par la page (pastilles
      masquées au téléphone), déclarables ; une sortie « effacer et quitter » déclarable dans la
      confirmation
- [x] `/publish` au téléphone : résumé de l'annonce et « Aperçu » dans l'en-tête, sans barre d'aperçu
- [x] `/publish` au téléphone : ligne d'état du brouillon retirée, notice de reprise, confirmation de
      sortie avec effacement
- [x] Tests de fidélité TCK-2819 et TCK-2600 mis à jour vers cette décision, vérifiés par ablation

## Critères d'acceptation

- [x] AC1 — À 390 px sur `/publish`, étape « caractéristiques », l'en-tête fait 56 px. Aucune barre
      d'aperçu ni ligne d'état du brouillon ne s'intercale entre l'en-tête et la question.
- [x] AC2 — À 390 px, le pied mesure au plus 72 px hors zone de sécurité, sur les deux entrées. *71 px
      sur `/publish` et sur `/app/properties/new` (relevé le 2026-11-21, API locale, compte propriétaire).*
- [x] AC3 — « Aperçu » dans l'en-tête ouvre le tiroir existant (carte, liste « Pour publier »).
- [x] AC4 — Avec un brouillon, ✕ ouvre une confirmation qui propose de partir, de rester et d'effacer
      puis partir. Effacer vide réellement le brouillon local.
- [x] AC5 — Stockage refusé : l'avertissement reste visible au téléphone.
- [x] AC6 — À 360 px, à l'étape des photos (« Plus tard » présent), les trois gestes tiennent sur une
      ligne sans déborder.
- [ ] AC7 — À 1024 et 1280 px, `/publish` et `/app/properties/new` sont identiques à avant (relevé).
      *`/publish` relevé identique. `/app/properties/new` : pas de relevé avant/après, voir les notes.*

### Ajouts du 2026-11-21 (décisions « 1b », « 2b » et « 1a » du porteur)

- [x] AC8 — Le résumé de la barre dit le prix d'abord, une fois donné (« 250 000 F/mois · Appartement · … »).
- [x] AC9 — Avec un brouillon, ✕ ouvre la feuille du bas de la maquette : « Quitter la publication ? »,
      « Reprendre plus tard » en tête et focalisé, « Continuer la publication », « Effacer le brouillon ».
- [x] AC10 — `/app/properties/new` au téléphone : en-tête compact de `/publish` (titre et résumé, Aperçu en
      œil, « Quitter » court), sans barre d'aperçu sous l'en-tête.
- [x] AC11 — Mode saisie (ADR-0133) sur les deux entrées, au téléphone : un champ focalisé replie l'en-tête à
      44 px sans résumé, replie le bandeau, et remplace le pied par une barre de 52 px (↑ ↓, « Le bien · 2/6 »,
      Continuer) ; le champ qui ouvre une liste est amené en tête ; tout revient quand le focus part. Rien ne
      change dès `lg`.

## Hors périmètre

- La barre d'onglets escamotable et le défilement du document (ADR-0133, § 5).
- *Le mode saisie et l'en-tête de `/app/properties/new`, d'abord hors périmètre, y sont entrés le
  2026-11-21 sur décision du porteur (« 1a », « 2b ») : ADR-0133, AC8 à AC11.*

## Notes d'implémentation

Relevés au navigateur le 2026-11-21 (`next dev`, émulation, `/publish`) :

- **390 × 664, étape du lieu** : l'en-tête fait 56 px, le pied 71 px, et la question 537 px de haut (mêmes
  mesures que la maquette). La barre dit « Appartement · En location · Prix à venir ».
- **360 × 640, étape des photos** : Précédent (16→64), Plus tard (72→156) et Continuer (164→344) tiennent
  sur la ligne, sans débordement horizontal.
- **Brouillon repris** : une seule notice, avec « Effacer », qui part au premier pas. ✕ ouvre la
  confirmation, focus sur « Quitter », dans l'ordre visible Rester · Quitter · Effacer le brouillon.
- **AC7 (`/publish`)** : à 1024 et à 1280, le même relevé a été pris sur les fichiers de `dev` remis en
  place puis sur cette branche. Il est identique : position et taille de la barre, du corps, du titre, du
  pied, de la progression et des trois gestes, avec les pastilles et la ligne d'état du brouillon.
- **AC7 (`/app/properties/new`)** : la page exige une session et l'API, qui n'étaient pas lancées. Son
  bureau n'est gardé que par les classes, toutes préfixées `max-lg:` ou remplacées par `lg:`, et par le test
  « dès `lg`, /app/properties/new garde son pied ». À relever en préproduction.

La confirmation de sortie de `/publish` apparaît désormais aussi au bureau (« Quitter », la marque) dès qu'un
brouillon existe. Avant, le lien partait sans rien demander.

La barre du téléphone ne passe à `pr-1` que si la page porte l'avancement au pied ET déclare `aDroite`.
Les écrans d'invitation (`aDroite` seul) gardent leur `pr-3`. La hauteur des segments s'écrit sur l'échelle,
`calc(var(--spacing)*0.75)` (ADR-0107). « Effacer le brouillon » en sortant a été relevé au navigateur :
`/publish` rouvert repart de l'accueil, sans brouillon repris.

Tests : `CoqueDEntree.ecran-econe.tck-2988`, `PublierSansCompte.ecran-econe.tck-2988` et
`WizardShell.pied-du-telephone.tck-2819` (réécrit sur cette décision). Chaque changement a été vérifié par
ablation : retiré, il fait rougir au moins un test.

### Relevés du 2026-11-21, seconde passe (émulation 390 × 664, API locale)

- **`/app/properties/new`, en-tête (2b)** : la question passe de 378 à 439 px de haut. Le titre garde 208 px
  à 390 et 178 px à 360 grâce au libellé court « Quitter » (nom accessible : « Enregistrer et quitter »),
  écart assumé avec la maquette, qui n'a pas ce bouton. Rien ne déborde à 360. À 768, l'ancien en-tête et la
  barre d'aperçu restent.
- **Feuille de sortie** : 290 px au bas de l'écran, focus sur « Reprendre plus tard ».
- **Mode saisie, `/publish`** : focus sur Quartier → cadre `fixed` sur la fenêtre visible, en-tête de 44 px
  sans résumé, Aperçu en œil de 40 px, label de Quartier à 12 px sous l'en-tête, barre de saisie de 52 px.
  Focus retiré → en-tête de 56 px, pied de 71 px, cadre dans le flux. ↑ ↓ passent Ville → Quartier →
  Lien collé et retour, sans fermer la saisie.
- **Mode saisie, bureau (1280)** : focus sur Quartier, aucun `data-saisie`, pied de 100 px inchangé.
- **La géométrie du clavier n'est pas prouvée par l'émulation** (ADR-0133, Conséquences) : le juge est
  le téléphone.
- **Écart local sans rapport** : `sitemap-couverture` compte 26 pages publiques au lieu de 24 dans cet
  arbre, à cause des deux pages de maquette locales et non suivies (`playground/maquettes`). En CI, l'arbre ne
  les a pas. Même cause pour les 19 classes signalées par `check:classes-emises`.

Tests ajoutés : `src/lib/__tests__/fenetre.tck-2988`, `WizardShell.mode-saisie.tck-2988`,
`PropertyWizard.en-tete-du-telephone.tck-2988`, et le mode saisie dans `CoqueDEntree.ecran-econe.tck-2988`.
Douze ablations sur la mesure, la barre de saisie, le bandeau et la coque : chacune fait rougir au moins un
test.
