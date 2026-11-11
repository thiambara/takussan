---
id: TCK-2677
title: "`/app/payments` mène l'admin d'agence à « Argent », une fois qu'« Argent » sert tout ce que `PaymentsTabs` lui sert"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2659, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, finances, navigation, audit-ux, app]
---

## Objectif utilisateur

L'admin d'agence n'a qu'une page pour l'argent de l'agence : « Argent ». Un lien ancien, une
notification ou un favori qui vise `/app/payments` l'y mène, sur l'onglet qui correspond, sans
qu'il perde un geste qu'il avait sur l'ancien écran.

## Contrat de données

Aucun endpoint neuf. Ce que les deux écrans lisent aujourd'hui (relevé du 2026-11-10 sur `dev`) :

- `PaymentsTabs` (`/app/payments`, tout profil non client) — onglets `history`, `invoices`,
  `payouts`, `approvals` (si `payouts.approve`), `bills` (si `payouts.create`, factures des
  prestataires, TCK-594) ; gestes « Générer une facture » (`invoices.create`) et « Créer un
  reversement » (`payouts.create`) ; relevé du bailleur (`OwnerStatementPanel`, bailleur seulement).
- `AdminFinancesTabs` (`/app/agency/finances`, `PAGES_ADMIN` : `role: admin`) — onglets
  `encaissements`, `factures`, `reversements`, `a-approuver`, `impayes`. **Pas d'onglet des factures
  de prestataires.**
- Cibles de notification qui visent `/app/payments` (`App\Domain\Notifications\NotificationTarget`) :
  `payments`, `payouts` (`?tab=payouts`), `payout_approvals` (`?tab=approvals`),
  `service_provider_bills` (`?tab=bills`).

## Direction UX / Artistique

- Pas d'écran neuf : la destination est la page « Argent » de TCK-2659
  (maquette `/fr/playground/maquettes?p=app-argent&a=a`, référence de fidélité non versionnée,
  cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes)).
- La redirection est **serveur** (la page `/app/payments` aiguille avant tout rendu) : pas de flash
  de l'ancien écran, au téléphone comme au bureau.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 4 et § 7, [ADR-0089](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) (amendement du 2026-11-10, onglet « Argent »).

- **Inventaire d'abord** (ADR-0100 § 4 : la redirection n'arrive qu'« une fois qu'Argent sert tout ce
  que `PaymentsTabs` sert au personnel ») : le premier livrable est la table, écrite dans la PR, de
  chaque onglet, geste et filtre de `PaymentsTabs` visible d'un admin d'agence, avec son équivalent
  dans « Argent ». **Toute ligne sans équivalent se comble dans « Argent » avant la redirection.**
  Relevé du 2026-11-10 : l'onglet `bills` (factures des prestataires, à valider puis à payer) manque
  à « Argent » ; les filtres de l'historique (`PaymentsHistoryFilters`) sont à comparer à ceux de
  TCK-2659.
- **Qui est redirigé** : l'admin de l'agence active seulement (celui que `PAGES_ADMIN` laisse entrer
  dans `/app/agency/finances`).
  - **L'agent n'est PAS redirigé** : la section `/app/agency` lui est fermée, et il émet des
    reversements par `payouts.create` (TCK-528) depuis `/app/payments?tab=payouts` — c'est la cible
    que `RemindDuePayouts::targetFor` lui envoie. ADR-0100 § 4 range l'agent avec le personnel, mais
    aucune page « Argent » ne lui est ouverte : **décidé par le porteur le 2026-11-10, « Argent » reste
    fermé à l'agent**, qui garde l'écran d'aujourd'hui.
  - Le locataire, le client et le bailleur ne changent pas (ADR-0100 § 1-3, autres tickets) ;
    l'hôte (agence `individual`) garde `/app/payments` (ADR-0100 § 5).
- **Les paramètres se traduisent** (ADR-0100 § 7, « les liens profonds ne cassent pas ») :

  | `/app/payments` | `/app/agency/finances` |
  |---|---|
  | (aucun) ou `tab=history` | `tab=encaissements` |
  | `tab=invoices` | `tab=factures` |
  | `tab=payouts` | `tab=reversements` |
  | `tab=approvals` | `tab=a-approuver` |
  | `tab=bills` | l'onglet des factures de prestataires ajouté à « Argent » |

  Les filtres de l'historique passent avec leur valeur. Un paramètre inconnu tombe, sans erreur.
- **`/app/payments/return`** (retour d'un prestataire de paiement) **ne redirige pas** : il sert le
  payeur, pas le personnel.
- Les cibles de notification de l'API ne changent pas dans ce ticket : la redirection les rend justes.
- **i18n** : aucun libellé neuf attendu ; s'il en faut un, `fr` / `en` / `wo` (le `wo` porte le texte
  français tel quel), vouvoiement.

## Delta à produire

- [ ] Table d'inventaire `PaymentsTabs` → « Argent » pour l'admin d'agence, dans la description de la PR.
- [ ] Chaque écart comblé dans « Argent » (au moins l'onglet des factures de prestataires, avec ses
      gestes et sa capacité).
- [ ] Aiguillage serveur de `/app/payments` : admin de l'agence active → `/app/agency/finances`, avec
      la table de traduction des paramètres ; tous les autres profils inchangés.
- [ ] Tests : un cas par ligne de la table de traduction ; agent non redirigé ; locataire, bailleur,
      hôte non redirigés ; `/app/payments/return` non redirigé.

## Critères d'acceptation

- [ ] AC1 — Connecté en admin de l'agence de démo, `GET /app/payments?tab=approvals` répond par une
      redirection vers `/app/agency/finances?tab=a-approuver`, et la page rendue a l'onglet
      « À approuver » actif.
- [ ] AC2 — Même admin, `/app/payments?tab=bills` aboutit sur « Argent », onglet des factures de
      prestataires, qui liste **les mêmes factures** (mêmes identifiants) que l'ancien onglet `bills`
      relevé avant la PR sur la même base.
- [ ] AC3 — Connecté en agent qui porte `payouts.create`, `/app/payments?tab=payouts` rend 200, sans
      redirection, avec l'onglet des reversements et le bouton « Créer un reversement ».
- [ ] AC4 — Connecté en locataire, en bailleur, puis en hôte : `/app/payments` rend 200 sans
      redirection, chacun avec son écran d'avant la PR.
- [ ] AC5 — `/app/payments/return?…` rend 200 sans redirection pour l'admin.
- [ ] AC6 — La table d'inventaire de la PR ne compte aucune ligne « sans équivalent ».

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2677.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La page « Argent » elle-même (TCK-2659) et ses données (TCK-2657).
- Ouvrir « Argent » à l'agent (écarté par le porteur le 2026-11-10).
- Les pages Paiements du locataire et du bailleur (TCK-2650, TCK-2651).
- Retirer `PaymentsTabs` du code : il sert encore l'agent et l'hôte.

## Notes d'implémentation

_(à remplir par implementing-specs)_
