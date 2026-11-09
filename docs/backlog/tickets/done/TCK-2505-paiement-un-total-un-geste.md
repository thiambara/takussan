---
id: TCK-2505
title: Paiement d'une échéance « Un total, un geste » : coque de lien nue, total en un montant, aucun cul-de-sac
status: done
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: [TCK-2504]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, payments, pay-link, mobile, audit-ux]
---

## Objectif utilisateur

Le locataire ouvre le lien reçu par SMS ou WhatsApp, voit en un montant ce qu'il doit, paie d'un geste — ou, si le paiement en ligne est fermé, sait comment payer autrement.

## Contrat de données

`GET /api/pay/{token}` (avec `late_fee_outstanding`, `late_fee_payable_online` existants, et `offline_payment`, `paid_at` de TCK-2504), `POST initiate` et `POST verify` existants.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=paiement&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « À payer », « Hors ligne », « Payé », « Déjà réglée », téléphone et bureau.
- **Coque de lien nue** : l'agence émettrice et « Paiement sécurisé », rien de la marketplace (ni recherche, ni favoris, ni comparateur, ni barre d'onglets). Cette coque servira ensuite la revendication, le partage de document et les désinscriptions.
- La période et le locataire sont nommés (« Loyer d'octobre 2026 », « Pour Fatou Ndiaye »).
- Un total en grand, son détail dessous ; deux boutons de paiement de même poids. Wave et Orange Money nommés en texte, sans logo ni couleur de marque.
- Hors ligne : numéros copiables, virement, Appeler / WhatsApp de l'agence.
- Payé : reçu partageable sur WhatsApp.

## Contraintes strictes (métier)

- **Le total dit ce qui est réellement payable en ligne.** Pénalité encaissée en ligne par l'agence (`late_fee_payable_online`) : un seul total, pénalité dans le détail. Sinon : le total payable en ligne, et la pénalité sur une ligne à part « à régler auprès de l'agence » — jamais un total qui la compte sans qu'on puisse la payer (réglage d'agence de TCK-593 inchangé).
- Le montant est celui que l'API rend, figé à l'ouverture du paiement ; le front ne calcule rien.
- Jamais de cul-de-sac : chaque état dit comment payer ou à qui s'adresser.

## Delta à produire

- [ ] Coque de lien réutilisable, sans la marketplace.
- [ ] Les quatre états de la page.
- [ ] Tests : total avec et sans pénalité en ligne ; état hors ligne avec et sans moyens déclarés ; état déjà réglé ; aucun élément de la marketplace dans la page.

## Critères d'acceptation

- [ ] AC1 — Échéance en retard, agence qui encaisse la pénalité en ligne : un seul montant affiché, égal à `amount_due`.
- [ ] AC2 — Même échéance, agence qui ne l'encaisse pas : le total payable et la ligne « à régler auprès de l'agence » sont distincts, et l'écran le dit en clair.
- [ ] AC3 — Paiement en ligne fermé : la page montre au moins un moyen de joindre l'agence, et les moyens hors ligne déclarés.
- [ ] AC4 — La page ne contient ni recherche, ni favoris, ni comparateur, ni barre d'onglets (vérifié au navigateur à 390 et 1440 px).

## Hors périmètre

- Les maquettes de la revendication et des pages par lien (lot suivant).
- Le choix d'un moyen de paiement préféré par l'agence.

## Notes d'implémentation

**Mesures avant de coder (2026-11-09, agent « liens », vague 2)** — ce que le ticket ou la maquette affirmait, ce que le code rend :

- **« Pour Fatou Ndiaye » : le nom du locataire n'est PAS rendu par l'API** (`PublicPaymentLinkController::present`, docblock : « ne révèle ni le nom ni le téléphone du locataire »), et TCK-2504 interdit d'exposer davantage de données du locataire au porteur du lien. La page ne nomme donc pas le locataire.
- **« Loyer d'octobre 2026 » : le type d'échéance (loyer, charges, caution, régularisation, pénalité) n'est pas rendu.** Le titre dit « Échéance d'octobre 2026 » (élision faite par un `select` ICU), « Échéance du … au … » pour une période sur plusieurs mois, « Échéance du {date} » sans période.
- **Le bouton WhatsApp de l'agence n'a pas de source** : `agency_whatsapp` n'est jamais rendu (TCK-2504). Ni « WhatsApp », ni « Prévenir l'agence de mon paiement », ni « Demander le reçu » : l'agence se joint par `offline_payment.agency_phone` (`tel:`), présent quand l'agence a un téléphone ET qu'il reste quelque chose de dû.
- **« Payé » et « Déjà réglée » de la maquette** : l'API rend 410 trente jours après le paiement, donc l'écran « reçu plus téléchargeable » n'existe que pour une échéance REMBOURSÉE (`status: refunded`, `receipt_available: false`). Une échéance payée a toujours sa quittance sur ce lien.
- **Le montant payé n'est pas rendu** une fois l'échéance réglée (`amount_due: 0`) : la carte de reçu dit la date et la référence, pas un montant (aucun chiffre non sûr).
- **Le rappel « Me rappeler avant la prochaine échéance »** de la maquette n'a aucune API : non livré.
- **« Aide »** : le site n'a ni page d'aide ni numéro d'assistance ; « Aide » et « Besoin d'aide ? » ouvrent le courriel de contact de l'éditeur (`EDITEUR.courriels.contact`, celui des mentions légales).
- **Le dock du comparateur se montait en bureau sur toutes les pages publiques**, paiement compris (seule la pastille du téléphone s'effaçait, TCK-2493) : `estPageDeLien` (`lib/navigation/barre-publique.ts`) l'efface aussi en bureau sur `pay`, `claim`, `share`, `search-alerts`, `notifications`.

**Décisions non évidentes**

- **Coque de lien** : `components/lien-public/` — `CoqueDeLien` (serveur : bandeau de marque et carte de 480 px en bureau, pleine page au téléphone ; `<main id="contenu-principal">`), `EnTeteDeLien` (émetteur ou marque + mention, collé en haut au téléphone), `BasDeLien` (action collée en bas au téléphone, pied de carte en bureau), `PiedDeLien` (Aide · Confidentialité · langue), `CarteDeLien` et `LienMort` (TCK-2514). L'en-tête est posé par le composant client, seul à connaître l'émetteur (l'agence vient de l'API).
- **Partager la quittance** : le FICHIER part par la feuille de partage du téléphone (`navigator.share({ files })`), jamais l'URL du lien — son jeton est le droit de lire l'échéance et de télécharger la quittance. Sans partage de fichier (bureau), un message WhatsApp SANS lien dit le règlement.
- Le numéro copié est la forme qu'on tape dans Wave ou Orange Money (sans `+221`) ; l'affichage reste `+221 77 123 45 67`.
- Les clés de la page passent sous `lienPublic.paiement` ; `payLink` ne garde que `metaTitle` et `providers`.

**Preuves (2026-11-09).** `PayLinkReception.test.tsx` (19 verts), `barre-publique.test.ts` et
`CompareFloatingBar.test.tsx` ; 7 ablations rouges puis restaurées par `cp`, `md5` identique (pénalité réputée
incluse, pénalité à part tue, moyens hors ligne retirés, `+221` gardé à la copie, élision coupée, remboursée traitée
en réglée, dock du comparateur rendu aux pages par lien). Clés `payLink.*` devenues mortes retirées (restent
`metaTitle` et `providers`). Navigateur : état hors ligne (390 et 1440) et lien périmé (390) sur des jetons de dev ;
l'état réglé (≤ 30 j) et le paiement en ligne avec fournisseurs n'existent pas dans le jeu de dev — tests seuls.
En bureau, l'en-tête de carte sans émetteur ne répète plus le logo du bandeau de marque (`EnTeteDeLien`).

**Limite du contrat pour AC3 (revue du 2026-11-09).** « Au moins un moyen de joindre l'agence » n'est pas garanti :
quand l'agence n'a déclaré aucun moyen hors ligne ET n'a pas de téléphone, l'API rend `offline_payment: null` et rien
d'autre (pas d'adresse, pas de courriel, jamais `agency_whatsapp`). La page nomme alors l'agence (« Adressez-vous à
votre agence, {agence}, pour régler ») et ne propose que le courriel de l'éditeur (`mailto:` de « Besoin d'aide ? ») — aucun contact
n'est inventé. Tenir l'AC dans ce cas demande un champ de contact de l'agence dans `GET /api/pay/{jeton}` (ticket API
à part, non ouvert).

**Corrections de revue (2026-11-09).** Hors ligne, la pénalité à part rejoint le total « À régler à l'agence » (loyer
et pénalité compris, avec son détail) au lieu d'un encart qui parlait du « montant à payer en ligne ». Le détail se
calcule depuis le total arrondi moins la pénalité arrondie : sa somme égale toujours le total (pénalité en ,5
éprouvée). Le nom de l'agence se dit seul (« à régler auprès de {agence} », « adressez-vous à {agence} ») : plus de
« l'agence Agence Teranga ». Tests de PAGE pour `/pay`, `/claim`, `/share`, `/notifications/unsubscribe` (témoins de
`Navbar`, `NavbarSpacer`, `Footer`) ; double clic du refus de réclamation gardé. Chacun vérifié par ablation.

**Contre-vérification (2026-11-09).** « auprès de {agence} » donnait « auprès de Agence Teranga », fautif, et une
élision calculée sur le nom ne tient pas pour tous les noms. Aucune tournure ne colle plus de préposition au nom : il
vient en apposition (« à régler auprès de votre agence, {agence} », « adressez-vous à votre agence, {agence} »), ou
derrière une étiquette dans le texte partagé à un tiers (« Échéance {reference} réglée le {date}. Agence : {agence}. »).
`tournures-agence.test.ts` le garde sur le dictionnaire `fr` et `en`. Les tests de page rendent aussi les `layout.tsx` de
leurs segments (`pageDansSesLayouts`), confrontés au disque : une Navbar posée dans un layout de lien rougit, et un
layout ajouté plus tard ne peut pas être oublié. Chacun vérifié par ablation.
