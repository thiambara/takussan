---
id: TCK-570
title: "Débordements du retour testeur du 2026-09-23 : ce que les vérifications ont trouvé hors des 28 points"
status: done
phase: P2
family: bug
estimate: M
wave: 69
created: 2026-09-23
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, back, mobile, dette, retour-testeur]
---

## Objectif utilisateur

Les défauts rencontrés en vérifiant le retour testeur, mais qu'aucun de ses 28 points ne décrivait,
ne se perdent pas dans les rapports d'agents : chacun est ici, avec sa preuve, pour être trié.

## Contexte

Lot de la vague 69 (TCK-560 à TCK-569). Chaque groupe de correction a été relu par un vérificateur
adverse ; ce qui suit a été relevé **hors périmètre**, puis laissé ouvert délibérément. Le défaut
le plus lourd du même lot a son propre ticket : TCK-571 (`watch()` figé dans quatre formulaires).

1. **Bandeaux cachés sous la barre publique.** `app/layout.tsx` rend `MaintenanceBanner`
   (`sticky top-0 z-50`) et `GlobalAnnouncementBanner` (dans le flux) AVANT la page ; la `Navbar`
   publique est `fixed top-0 z-50` et les recouvre. Mesuré à 320 px : une annonce de 69 px ou moins
   est invisible et impossible à fermer, et pousse toute la page vers le bas (+67 px) — c'est le
   seul mécanisme trouvé qui reproduise le « padding trop large » du point M1 (TCK-563), sans
   preuve que la capture en vienne.
2. **Annuaire des agents à 320 px.** Les puces de villes mesurent 36 px de haut (`min-h-9`), sous
   les 44 px ; le placeholder « Nom d'un agent » est tronqué (`components/public/index/`).
3. **Brouillons infidèles.** Le middleware global `ConvertEmptyStringsToNull`
   (`takussan-api/bootstrap/app.php`) enregistre `null` à la place de `''` dans `wizard-drafts`. Le
   front le compense (`sansNulls`, TCK-564 ; relecture après fusion, TCK-566) ; tout autre lecteur
   doit le savoir.
4. **Téléphone sous un indicatif étranger.** `composerTelephone` ne retire pas le `0` du préfixe
   national : `0612345678` sous `+33` devient `+330612345678`, accepté par la règle E.164 de l'API
   (TCK-566).
5. **Montant en euro (ou dollar).** Un séparateur décimal tapé en premier (`,5`) donne `50` au lieu
   de `0,5` ; un 3e chiffre après un point gardé (`10.505`) fait passer la lecture de décimales à
   milliers. Sans effet en XOF, qui n'a pas de décimales (TCK-564).
6. **Courriel « Votre export de données est prêt »** rédigé en français en dur côté API
   (`DataExportReadyNotification`) — dette D-24 (TCK-567).
7. **Messagerie, nouveau groupe** : la liste des biens à rattacher est plafonnée à 100 sans
   recherche ; mesuré pour `agent1` : 106 des 206 biens visibles ne peuvent pas être rattachés
   (TCK-565).
8. **Propriétaire sous `/agents/<username>`** : sa page le présente comme « Agent immobilier »
   (titre, balisage `RealEstateAgent`). C'est la décision TCK-436 (b) ; le « cas de property
   owner » du testeur peut aussi viser cela. **Décision produit.**
9. **Comparateur à 360 × 740** : le premier critère commence vers 505 px, sous les cartes-photos
   qui défilent horizontalement — la partie « du mal à tout voir sans scroller » du point M7
   subsiste en partie. **Décision produit** (TCK-561).

## Tri — 2026-09-24

Le porteur a délégué toutes les décisions de ce ticket (« je te donne la main pour la section
“To decide”, corrige tout »). Aucune entrée n'est « acceptée » en l'état : chacune a un ticket,
et c'est ce ticket qui porte la mesure, le correctif et le verdict.

| # | Entrée | Ticket | Décision |
|---|---|---|---|
| 1 | Bandeaux cachés sous la barre publique | TCK-572 | correctif |
| 2 | Annuaire des agents à 320 px | TCK-573 | correctif |
| 3 | Brouillons infidèles (`ConvertEmptyStringsToNull`) | TCK-574 | correctif à la source, côté API |
| 4 | Téléphone sous un indicatif étranger | TCK-574 | correctif |
| 5 | Montant en euro ou en dollar | TCK-574 | correctif |
| 6 | Courriel d'export rédigé en français en dur | TCK-575 | correctif, plus la revue des délais promis dans l'interface |
| 7 | Biens à rattacher plafonnés à 100 | TCK-576 | recherche côté serveur |
| 8 | Propriétaire présenté comme « Agent immobilier » | TCK-573 | **décidé** : la page reste sous `/agents/<slug>` (aucun lien ne casse), mais il y est présenté comme propriétaire — titre, libellé, données structurées `Person` |
| 9 | Comparateur à 360 × 740 | TCK-577 | **décidé** : en-tête des biens compacté, premier critère dans le premier écran, bureau inchangé |

S'y ajoutent deux points que ce lot laissait en suspens :

- **Point W11 du testeur (« 5 jours ouvrés »)** : aucun mécanisme de délai n'existe côté API pour
  l'examen d'une demande de passage en pro, et une autre page promettait 48 h. Les deux textes
  (`agency.upgrade.page.benefits.sla`, `nav.proUpgrade.pendingBody`) ne promettent plus de délai
  chiffré. *Une promesse que rien ne tient n'est pas un engagement, c'est une réclamation à venir.*
- **Point M3 (recherche mobile)** : décidé dans TCK-563 et TCK-572 — la pastille reste dans la barre
  (compacité, TCK-549), et un appui ouvre un champ de saisie déjà focalisé.

## Critères d'acceptation

- [x] Chaque entrée est triée : ticket propre, correctif, ou « accepté » avec sa raison, écrit ici.
- [x] Les deux décisions produit (8, 9) sont tranchées — par le porteur, qui les a déléguées le
      2026-09-24 ; la décision et sa raison sont écrites ci-dessus et dans TCK-573 / TCK-577.

## Hors périmètre

- Les 28 points du retour testeur eux-mêmes : TCK-560 à TCK-569.
