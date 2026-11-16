---
id: TCK-2922
title: "Argent et commissions au bureau : « Relancer » sur chaque impayé du tableau, « Approuver » / « Refuser » en ligne, le menu ⋯ des impayés, la case « En attente » et l'icône « Relevé de l'agent »"
status: done
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#28-payout-"
tags: [front, agence, argent, commissions, impayes, reversements, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Au bureau, l'admin agit depuis le tableau du mois sans ouvrir chaque dossier : il relance un impayé, approuve ou refuse un reversement, et retrouve en un geste le relevé d'un agent.

## Contrat de données

Aucun endpoint neuf ; tout existe :

- relance d'un impayé : la feuille / le panneau de relance de TCK-2660 (`impayes/RelanceDUnImpaye.tsx`) ;
- reversements : `POST /api/payouts/{id}/approve` (step-up 2FA) et `POST /api/payouts/{id}/cancel` (`usePayoutApprove`, `usePayoutCancel`) ;
- encaissements : la lecture du mois déjà faite par `EncaissementsAgence` (statuts `pending`, moyens de paiement) ;
- commissions : le relevé de l'agent déjà servi à la vue admin (`VueAdmin.tsx`).

La spec ne détaille pas ces gestes de ligne : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** :
  - `app-argent`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-argent-a.tsx` (+ `app-argent-lignes.tsx`), visionneuse `?p=app-argent&a=a` — **e0 « Tableau du mois », bureau** (le téléphone est conforme) ; **e1 « Impayés et relance », bureau** (menu ⋯ en bout de rangée, `app-argent-a.tsx:545`) ; **e3 « Encaissements », bureau** (bande des totaux, `app-argent-a.tsx:818`).
  - `app-commissions`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-commissions.tsx` — **e1 « Vue admin par agent », bureau** : icône « Relevé de l'agent » en bout de rangée.
- Audit : `audit-f6-agence-entree.md`, § app-argent (e0, e1, e3), § app-commissions (e1), et « écarts couverts par les fiches » (TCK-2659 / TCK-2677 : colonne « Relancer » annoncée réinsérée par TCK-2660, jamais faite ; approbation en ligne « à trancher » jamais tranchée ; TCK-2660/2682 : ⋯ écarté).
- **Bureau seulement** dans ce ticket ; le téléphone de ces écrans est conforme et ne doit pas régresser.

## Contraintes strictes (métier)

- « Approuver » en ligne passe par le même step-up 2FA que depuis le détail ; « Refuser » demande le même motif que le refus du détail. Les deux ne paraissent qu'avec `payouts.approve`.
- La relance en ligne ouvre la même relance (WhatsApp, lien de paiement, journal « relancé il y a … ») que l'écran Impayés : aucune seconde implémentation.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français ; vouvoiement.

## Delta à produire

- [ ] Carte « À faire · impayés les plus anciens » (tableau du mois, bureau) : 3ᵉ colonne « Relancer » par ligne.
- [ ] Carte « À faire · reversements à approuver » : « Refuser » et « Approuver » sur chaque ligne (« Examiner » reste pour ouvrir le détail).
- [ ] Table des impayés (bureau) : menu ⋯ « Plus d'actions » en bout de rangée.
- [ ] Encaissements (bureau) : 3ᵉ case de la bande des totaux « En attente ».
- [ ] Commissions, vue admin (bureau) : icône « Relevé de l'agent » par rangée.
- [ ] Tests de chaque geste.

## Critères d'acceptation

- [ ] AC1 — À 1440, chaque ligne de « À faire · impayés les plus anciens » porte un bouton « Relancer » qui ouvre la relance de **cet** impayé (montant et locataire de la ligne) ; après envoi, la ligne dit « relancé à l'instant ».
- [ ] AC2 — Avec un reversement à approuver et la capacité `payouts.approve`, sa ligne porte « Approuver » (qui appelle `POST /api/payouts/{id}/approve` après le second facteur, puis retire la ligne) et « Refuser » (qui demande un motif puis appelle `POST /api/payouts/{id}/cancel`). Sans la capacité, ni l'un ni l'autre n'est rendu.
- [ ] AC3 — Dans la table des impayés au bureau, chaque rangée a un bouton « Plus d'actions » (⋯) qui ouvre un menu offrant au moins « Fiche client », « Encaisser un paiement » et « Voir le bail » de cette rangée.
- [ ] AC4 — La bande des totaux des encaissements au bureau rend, en 3ᵉ case, « En attente » : lecture `status=pending` **bornée par l'échéance** (la règle D2 de TCK-2659, comme « Échoué » : `EncaissementsAgence.tsx:160-171`), montant et sous-ligne « N virement(s) annoncé(s) » quand le moyen est un virement, sinon « N paiement(s) en attente ». Avec un paiement `pending` de 1 800 000 F par virement échu dans le mois, la case dit « 1 800 000 F · 1 virement annoncé ». « Restant » quitte la bande (la maquette n'en a pas) ; le reste dû du mois se lit dans la tuile « Impayés » du point du mois.
- [ ] AC5 — Dans la table « par agent » des commissions au bureau, chaque rangée porte l'icône « Relevé de l'agent » (libellé accessible), qui ouvre le relevé de cet agent ; le lien vers ses lignes (`?agent=`) reste.
- [ ] AC6 — Vérifier au navigateur, avec au moins un reversement à approuver en base de démo, la carte « reversements à approuver » et les lignes conditionnelles de « À faire » (non vérifiables par le code selon l'audit) ; corriger si absentes.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches de fidélité des tickets d'origine (TCK-2659, TCK-2660, TCK-2677, TCK-2682, TCK-2662) mises à jour : les entrées `ecarts_acceptes` couvertes par ce ticket sont retirées.
- [ ] AC-F2 — À 1440 × 900 (densité ×0,9), `fidelite compare` sur argent e0, e1, e3 et commissions e1 ne rend aucun écart non expliqué ; à 390 rien ne régresse.
- [ ] AC-F3 — Largeurs intermédiaires (ADR-0106 § 4) : à 1024 et 768, les tables défilent dans leur conteneur, aucun défilement horizontal du document.

## Hors périmètre

- Le téléphone de ces écrans (conforme).
- Un statut « virement annoncé par le locataire » distinct de `pending` (il n'existe pas ; la case lit `pending`).

## Notes d'implémentation

**2026-11-15 — implémenté (agent délégué).**

Prémisses re-mesurées, et ce qui différait :

- **« Refuser » n'existait pas dans le détail** : `PayoutDetailDialog` n'offre « Annuler » qu'aux statuts
  `pending/scheduled/processing`, sans motif, et `POST /api/payouts/{id}/cancel` n'en prenait aucun. « Le même
  motif que le refus du détail » n'existait donc pas. Corrigé ici plutôt que d'envoyer un motif jeté : l'API
  accepte `reason` (facultatif, ≤ 500, `CancelPayoutRequest`, autorisation inchangée `PayoutPolicy::update`),
  gardé dans `metadata.cancel_reason` (non exposé par `PayoutResource` : aucune clé de ressource neuve). Le
  « Refuser » en ligne l'exige. Test `PayoutTest::test_cancel_keeps_the_refusal_reason`.
- **L'annulation n'est pas gardée par `payouts.approve`** mais par `PayoutPolicy::update` (le préparateur, ou
  `payouts.create`) : « Refuser » suit `gestes.peutAnnulerUnReversement` (= `payouts.create`) ou le préparateur ;
  la carte entière reste sous `payouts.approve` (AC2).
- **« Approuver » en ligne = le geste du détail** : même mutation (`usePayoutApprove`, step-up 2FA résolu par
  `useApiMutation`), sans `payout_method_id` (le détail garde par défaut la destination PRÉVUE). Sans destination
  prévue (hors caution rendue), le détail en préselectionne une : la ligne ouvre alors le détail au lieu
  d'approuver sans. Le préparateur voit « Approuver » désactivé, avec la raison du détail (quatre yeux).
- **« relancé à l'instant »** : la ligne le dit quand la NOTE de la relance a été prise (la promesse que
  `FeuilleDeRelance` passe à `onFermer`) ; une note refusée ne marque rien. La relance est la `FeuilleDeRelance`
  de l'écran Impayés (panneau latéral dès `md`) : aucune seconde implémentation.
- **AC4** : « Restant dû » remplacé par « En attente » (`status=pending`, borné par l'échéance, règle D2) ;
  « N virement(s) annoncé(s) » seulement si une seconde lecture `payment_method=bank_transfer` compte autant que
  la première (ou si le moyen filtré est le virement), sinon « N paiement(s) en attente ». Clés `totaux.restant`
  et `totaux.aEncaisser` retirées (plus lues).
- **AC5** : l'export des commissions n'a pas de filtre par bénéficiaire (`from`, `to`, `limit`) ; le relevé de
  l'agent est celui que la vue admin sert déjà (`?agent=`, contrat du ticket). L'icône de la rangée (déjà un
  `FileText` vers `?agent=`, nommée « Lignes de {nom} ») devient « Relevé de l'agent — {nom} » (+ `title`) ; le
  lien `?agent=` reste. Clé `commissions.admin.lignesDe` retirée.
- **AC3** : le menu ⋯ (`TableDesImpayes`, partagé avec Rapports : options TCK-2868 intactes) — « Fiche client »,
  « Encaisser un paiement » (`LeasePaymentDialog`, monté par `Impayes`, `onEncaisser` facultatif), « Voir le
  bail ». Le clic d'un élément du menu (portail) remontait à la rangée et aurait ouvert le dossier : la garde de
  la rangée ignore `[role=menuitem]`. Colonne des gestes 9,5 → 11,75 rem.
- Garde `check-i18n-namespaces` : un import de `DialogueDeGeste` (commissions) depuis « Argent » franchissait la
  frontière ; le dialogue de refus est écrit sur les primitives `Dialog`.

Tests (ablation une à une, restauration vérifiée par md5) : `argent/__tests__/gestes-en-ligne.tck-2922.test.tsx`
(10), `argent.tck-2659` (N1 « Restant dû » → 2 tests AC4), `impayes.tck-2660` (2 tests ⋯), `commissions.tck-2662`
(1 test AC5), `PayoutTest` (1). Fiches de fidélité : entrées couvertes retirées de TCK-2659, 2677, 2660, 2682
(TCK-2662 n'en portait aucune pour l'icône).

**Non mesuré** (pas de navigateur dans ce lot) : AC6, AC-F2, AC-F3 — à relever au navigateur par la session.

