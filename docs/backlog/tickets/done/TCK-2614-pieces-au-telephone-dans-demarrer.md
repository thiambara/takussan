---
id: TCK-2614
title: "« Démarrer » : les pièces à envoyer depuis le téléphone, une par une, avec leur état — et le NINEA tapé, pas photographié"
status: done
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2612, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2613]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#35-agentprofile-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#42-kycdossier-"
tags: [front, onboarding, kyc, mobile, audit-ux, app]
---

## Objectif utilisateur

Le bailleur, l'agent ou le prestataire qui est entré sans ses pièces les envoie plus tard depuis son téléphone, une à la fois, en photographiant la pièce ou en choisissant un fichier, et sait à chaque instant ce qui manque, ce qui est parti et ce qui est vérifié.

## Contrat de données

- `GET /api/me/pieces` (TCK-2612) : `code`, `required`, `kind`, `state` par pièce.
- `PATCH /api/me/owner-profiles/{owner_profile}/tax-id` (TCK-2612) pour le NINEA tapé.
- Existant : envoi de pièce bailleur, agent, prestataire (`…/kyc/upload`), soumission bailleur et agent (`…/kyc/submit`), `GET /api/me/espace/demarrage` (étapes `kyc` du bailleur, `pieces` de l'agent et du prestataire après TCK-2612).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-assistants&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écran « Les pièces, plus tard, dans Démarrer » et sa variante bureau.
- Une ligne par pièce : son nom en clair (« Pièce d'identité », « RIB », « NINEA », « Carte professionnelle », « Assurance RC pro — facultative »), à quoi elle sert en une phrase (« Pour que l'agence puisse vous verser vos loyers »), son état en mot et en pastille : **À fournir**, **Envoyée**, **Vérifiée**, **À refaire** (avec la raison si l'agence l'a donnée).
- Une pièce à fournir ouvre deux gestes de même poids : **« Prendre une photo »** (appareil arrière) et **« Choisir un fichier »** ; l'aperçu de la photo s'affiche avant l'envoi avec « Reprendre ».
- Le NINEA est un **champ texte** (clavier alphanumérique, espaces tolérés, format montré en aide : « 7 chiffres puis 3 caractères, ex. 0123456 7G2 ») ; le joindre en fichier reste possible par un lien discret.
- **« Envoyer mes pièces »** soumet ce qui est prêt ; un envoi partiel est permis et dit ce qui reste.
- **Téléphone (360-390 px)** : liste empilée, geste principal collé en bas. **Bureau (≥ 1280 px)** : un tableau (pièce, à quoi elle sert, état, action), colonnes dès `lg`.
- Ton : **vouvoiement**.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression :

- Chaque pièce que les assistants d'aujourd'hui demandent reste demandée, avec ses formats et sa taille maximale acceptés aujourd'hui ; aucune pièce ne devient obligatoire pour utiliser l'espace.
- Le NINEA en fichier reste accepté.
- Le NINEA n'est jamais réaffiché en clair au bailleur (forme masquée).
- L'étape de « Démarrer » se coche d'elle-même quand l'API la rend faite.
- Aucun « KYC » visible : le mot est « Pièces » (TCK-2616).
- Libellés neufs en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Écran des pièces, ouvert depuis l'étape « Pièces » de « Démarrer » pour les trois rôles.
- [ ] Prise de photo ou choix de fichier, aperçu, envoi ; NINEA tapé.
- [ ] Tests : quatre états rendus ; « Prendre une photo » porte la capture par l'appareil arrière ; NINEA mal formé → message sous le champ, rien n'est envoyé ; envoi partiel → la ligne passe à « Envoyée », les autres restent « À fournir ».

## Critères d'acceptation

- [ ] AC1 — Un agent sans pièce voit, depuis « Démarrer », la liste de ses pièces avec « À fournir » et les deux gestes par pièce (sur `dev` : aucune étape « Pièces » pour l'agent).
- [ ] AC2 — Un bailleur tape « 0 123 456 7G2 » et envoie : la ligne NINEA passe à « Envoyée » sans fichier joint.
- [ ] AC3 — À 390 px, « Envoyer mes pièces » est visible sans défilement ; à 1280 px, les pièces sont rendues en tableau.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2614.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La vérification par l'agence (famille 6) ; les assistants (TCK-2613), qui ne sortent les pièces de leurs étapes qu'une fois cet écran livré.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

- **Décision 2b, porteur, 2026-11-13 — le NINEA est FACULTATIF pour un bailleur personne physique**, requis pour une
  société (`metadata.owner_type = company`, même règle qu'`OwnerProfile::companyName()` ; un profil sans `owner_type` est
  un particulier). Portée par `PiecesDuProfil` (`required` de `GET /api/me/pieces`) ; `requisesEnvoyees()` lit la même
  liste, donc l'étape `kyc` du bailleur dans « Démarrer » suit (`NineaFacultatifDuParticulierTest`, ablation de la
  condition dans les deux sens : rouge). L'écran rend alors la maquette telle quelle : « Facultatif · Si vos biens sont
  en société », hors du compte (« 1 sur 2 ») et du reste à fournir. Relevé des autres juges de « pièces complètes » :
  `submitKyc` ne juge rien (il liste les sortes présentes) ; aucun pourcentage de complétude ne lit le NINEA ; aucune
  garde de parité ne recopie la liste. **L'assistant `/onboarding/owner` suit aussi (r2, team-lead : « 2b vaut
  partout »)** : la page lit `required` du NINEA de CE profil (`GET /api/me/pieces`, `X-Profile-Id`, `nineaRequis()`)
  et `OwnerOnboardingWizard` n'exige le NINEA avant « Envoyer mes pièces » que s'il est requis — sans autre changement
  de l'assistant (TCK-2613 le refera). Une lecture en échec le laisse requis, comme avant.
- Décision 6a — `GET /api/me/pieces` sert au seul titulaire `file` (`name`, `size`, `sent_at`) et `number_masked`
  (`Masking::tail`) ; `null` sous impersonation (`MePiecesFichierTest`). `docs/models-spec.md` (« État par pièce ») est à
  faire converger (`/sync-specs`).
- Décision 7a — aucun appel à `…/kyc/submit` depuis l'écran.
