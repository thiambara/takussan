---
id: TCK-2914
title: "État des lieux sur le terrain : « Terminer et envoyer le PDF », et « Lui envoyer un code par SMS » pour que le bailleur signe lui-même"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2913]
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#24-inventory-"
tags: [front, etats-des-lieux, signature, sms, audit-ux, app]
---

## Objectif utilisateur

L'agent termine l'état des lieux en sachant que le PDF part aux deux parties ; et quand le bailleur est présent, il lui fait signer avec un code reçu par SMS au lieu de signer pour lui.

## Contrat de données

- Envoi du PDF à la seconde signature, `pdf_sent_at`, code SMS du bailleur (`party=landlord`) : TCK-2913.

Audit (`audit-f4-patrimoine.md`, app-etats-des-lieux **e2**, téléphone et bureau : « Terminer et envoyer le PDF » → « Terminer » ; « Lui envoyer un code par SMS » absent ; fiche `TCK-2648.json` a-2).

## Direction UX / Artistique

**Référence de fidélité** : page `app-etats-des-lieux`, approche `a`, écran **e2 « Récapitulatif et signatures »** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-etats-des-lieux.tsx` :

- téléphone (l. 607) et bureau (l. 641) : le bouton final « Terminer et envoyer le PDF » ;
- téléphone et bureau, carte « Agence, pour le bailleur · <agent> — Mandat de gestion de <bailleur> » (`SignatureAgence`, l. 555-569) : sous « Signer ici », le lien « Lui envoyer un code par SMS », qui bascule la carte sur la saisie du code du bailleur (les 6 cases, « Rien reçu ? Renvoyer le code (dans 0:42) » — même composant que la signature du locataire).

Après la fin : un message dit à qui le PDF part (« Le PDF part à Aminata Diop et à Mouhamed Sène »).

## Contraintes strictes (métier)

- Le libellé « Terminer et envoyer le PDF » ne promet que ce que l'API fait : il n'apparaît qu'avec TCK-2913 livré.
- Le code du bailleur part au numéro de son compte (jamais saisi) ; s'il n'a pas de numéro, le lien n'est pas rendu.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Bouton final « Terminer et envoyer le PDF » et message de fin nommant les destinataires.
- [ ] Carte de signature de l'agence : « Lui envoyer un code par SMS » → saisie du code du bailleur.
- [ ] Mettre à jour la fiche de fidélité `TCK-2648.json` (a-2 levé).
- [ ] Tests : libellé du bouton ; `POST …/onsite-code` avec `party=landlord` ; signature avec le code ; lien absent sans téléphone du bailleur.

## Critères d'acceptation

- [ ] AC1 — À 390 et 1440, le bouton final de l'écran des signatures s'intitule « Terminer et envoyer le PDF ».
- [ ] AC2 — Toucher « Lui envoyer un code par SMS » envoie `POST /api/inventories/{id}/onsite-code` avec `party=landlord` et affiche les 6 cases du code ; un code juste enregistre la signature du bailleur.
- [ ] AC3 — Pour un bailleur sans téléphone sur son compte, le lien n'est pas rendu.
- [ ] AC4 — Après la seconde signature, l'écran nomme les destinataires du PDF.
- [ ] AC5 — Vérifier au navigateur, sur un état des lieux semé **avec** photos (la démo n'en a pas), les vignettes de l'écran d'une pièce (e1) et de la comparaison de sortie (e3), téléphone et bureau ; corriger si absentes (point « non vérifiable par le code » de l'audit).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2648.json` :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2648.json` liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La dictée de la note de pièce (TCK-2903).

## Notes d'implémentation

_(à remplir par implementing-specs)_
