---
id: TCK-2614
title: "« Démarrer » : les pièces à envoyer depuis le téléphone, une par une, avec leur état — et le NINEA tapé, pas photographié"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2612]
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

## Hors périmètre

- La vérification par l'agence (famille 6) ; les assistants (TCK-2613), qui ne sortent les pièces de leurs étapes qu'une fois cet écran livré.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
