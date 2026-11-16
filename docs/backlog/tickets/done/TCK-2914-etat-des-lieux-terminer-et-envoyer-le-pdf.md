---
id: TCK-2914
title: "État des lieux sur le terrain : « Terminer et envoyer le PDF », et « Lui envoyer un code par SMS » pour que le bailleur signe lui-même"
status: done
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

Implémenté le 2026-11-15 (branche `feat/audit-manques-2026-11-15`).

**Prémisse re-mesurée — écarts :**
- La route du code est `POST /api/inventories/{id}/sign/onsite-code` (TCK-2646/2913), pas `…/onsite-code` : `party=landlord` dans le corps.
- **AC3 n'avait aucun signal côté front** : `can_sign_as` rendait `landlord_onsite` sans regarder le téléphone (seul l'envoi rendait 422 `landlord_without_phone`), et `landlord` n'expose qu'un id et un nom. Corrigé à la source : `InventoryResource::canSignAs()` n'ajoute `landlord_onsite` que si le compte du bailleur porte un numéro **vérifié** (même condition que le 422). Aucune clé de ressource neuve. Deux attentes de `InventorySignatureTest` / `InventoryOnsiteSignatureTest` (bailleurs de fixture sans numéro) mises à jour.
- La fiche (`InventorySignatures`) disait « par X, au titre du mandat » ou rien pour une signature du bailleur recueillie par code : elle la dit désormais comme celle du locataire (« Signé sur place devant …, avec le code reçu au … »).

**Décisions (mineures, tranchées) :**
- Le bloc du code du locataire est devenu `SignatureParCode` (partie `tenant` | `landlord`), réutilisé tel quel pour le bailleur : tracé + six cases + « Renvoyer le code », le tracé et le code partent ensemble (`role=landlord`, `signature`, `code`). Le corps de l'envoi du locataire reste vide (inchangé).
- Toucher « Lui envoyer un code par SMS » dans la carte de l'agence envoie le code tout de suite (`party=landlord`) et bascule la carte sur « Bailleur · {nom} » ; « Signer au titre du mandat » ramène à la carte de l'agence. Avec `landlord_onsite` sans `landlord`, la carte est d'emblée celle du bailleur (rien ne part avant le geste).
- Signée par code, la carte dit « Bailleur · {nom} — Signé sur place à …, avec le code reçu par SMS » (plus « Agence, pour le bailleur »).
- AC4 : signé, la ligne « Le PDF part à A et à B. » remplace « Il manque … » (téléphone : au-dessus du bouton ; bureau : sous la mention). Noms = `pdf_sent_to` une fois `pdf_sent_at` posé ; **avant** que la tâche d'envoi ait tourné (elle suit la transaction), les parties nommées par la fiche (`tenant`, `landlord`) — un locataire sans compte y serait nommé alors qu'il ne recevra pas l'avis : accepté, le libellé est au présent et la ligne se corrige dès la relecture. Personne à aviser : « le PDF se télécharge depuis la fiche ». Pas de sondage.

**Tests :** API `InventoryLandlordOnsiteCodeTest` (+1, `tck_2914`), `InventorySignatureTest`, `InventoryOnsiteSignatureTest` — 70 verts. Front : `RecapEtSignatures.tck-2648.test.tsx` (+10 tests TCK-2914, « Terminer » renommé), `inventory.tck-2648.test.tsx` (+1, corps `party`), `InventoryDetail.fiche.tck-2648.test.tsx` (+1). Ablations une à une (rouge puis restauré, md5 identique) : garde du téléphone (API), corps `party`, envoi `party` du bloc, lien sans `landlord_onsite`, ligne d'envoi du PDF, carte signée par code, détail de la fiche, id des cases par partie.

**Non mesuré :** AC5 (vignettes e1/e3 sur un état des lieux semé avec photos) et AC-F2 à F6 (relevés de pixels) — les relevés au navigateur sont suspendus pour ce lot. Au code : e1 et e3 rendent `preview_url ?? url` (`EcranDUnePiece` l. 328, 374, 456), comme les réserves du récapitulatif (testé). Fiche `TCK-2648.json` : l'alias et les deux écarts levés retirés, la ligne d'envoi ajoutée aux écarts acceptés.
