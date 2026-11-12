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

### Inventaire `PaymentsTabs` → « Argent » (admin d'agence) — AC6, à reprendre dans la PR

| `/app/payments` (ce que l'admin y avait) | « Argent » (`/app/agency/finances`) | Équivalent |
|---|---|---|
| Onglet Historique (`history`, défaut) | Encaissements (`?tab=encaissements`) | oui |
| Onglet Factures (`invoices`) + détail (`InvoiceDetailDialog`) | Factures + le même détail | oui |
| Onglet Reversements (`payouts`) + détail (`PayoutDetailDialog`) | Reversements + le même détail | oui |
| Onglet À approuver (`approvals`, `payouts.approve`) | À approuver, même capacité | oui |
| Onglet Interventions (`bills`, `payouts.create`) : valider (refacturer ou non), rejeter avec motif, « Payer le prestataire » qui ouvre le reversement créé | **comblé par ce ticket** : registre « Interventions » (`?tab=interventions`), même composant (`ServiceProviderBillsTable mode="agency"`), même capacité ; onglet au bureau, ligne de « Tout voir » au téléphone | oui (neuf) |
| Geste « Générer une facture » (`invoices.create`) | en-tête (bureau), « Créer » (téléphone), même capacité | oui |
| Geste « Créer un reversement » (`payouts.create`) | idem | oui |
| Filtre Statut | « Statut » (bureau : barre ; téléphone : feuille des filtres) | oui |
| Filtres Du / Au (`date_from`, `date_to`) | « Dates » Du / Au, mêmes paramètres | oui — **sens resserré par TCK-2659 (D2)** : la date d'encaissement (`paid_at`) sauf sous un statut non payé, là où l'historique retenait `paid_at` OU `period_start` |
| Historique sans borne (tout, par défaut) | le mois courant par défaut ; toute plage par Du / Au | oui, par Du / Au — **le défaut change** (décision de TCK-2659) |
| Type d'entité (bien, bail, réservation, client) + « ID d'entité » libre | Bien (choix) ; Payeur (= `customer`, mêmes colonnes côté API : `payer_id` d'une échéance, `customer_id` d'une réservation) ; un bail = Bien + Payeur ; `entity_type`/`entity_id` restent lus dans l'adresse (lien entrant, et la redirection les passe) | oui, par composition — plus de saisie d'un identifiant numérique |
| Pagination (`page`) | pagination du registre | oui (`page` ne suit pas la redirection : autre sélection) |
| Relevé du bailleur (`OwnerStatementPanel`, bailleur seulement) | — | sans objet : l'admin qui est AUSSI bailleur n'est pas redirigé (décision 2, ci-dessous) |

Aucune ligne sans équivalent.

### Ce qui est fait

- **« Argent »** : `interventions` rejoint `TAB_VALUES` (`lib/finances/vue-argent.ts`) ; `useGestesDeLArgent` expose
  `peutPayerLesPrestataires` (`payouts.create`, sans `canEmit`, comme l'ancien onglet) ; `ongletPermis` (gestes.tsx)
  fait retomber un registre sans sa capacité sur « Encaissements » **une fois les capacités lues** — tant qu'elles se
  lisent, `?tab=interventions` tient (pas d'encaissements le temps d'une lecture). Le titre de la table passe en
  `sr-only` dans « Argent » (`titreMasque`) : l'en-tête du registre le porte. 3 clés neuves (`admin.finances.tabs.interventions`,
  `admin.finances.argent.registres.interventions{,Detail}`), `wo` = `fr`.
- **La redirection** : `lib/finances/depuis-les-paiements.ts` (`adresseDeLArgent`, la table du ticket ; les filtres de
  l'historique ne suivent que vers « Encaissements », `page` et l'inconnu tombent) ; `lib/access/pages-admin-server.ts` :
  `menerALArgent` (admin d'agence, ni super-admin ni bailleur, `kind === 'standard'` lu POSITIVEMENT — illisible = ancien
  écran) et le terminateur `aiguillerVersLArgent`, appelé par `payments/page.tsx` avant tout rendu.
- **`payments/loading.tsx` est SUPPRIMÉ** (décision 1, ci-dessous) : un `redirect()` de page sous un repli du même
  segment rend 200. `etats-de-route.test.ts` compte `aiguillerVersLArgent` parmi ses terminateurs (REFUS) et l'exempte
  de la règle « a son repli », par propriété dérivée (`aiguilleDansSonRendu`), comme `garderPageAdmin`.
  `/app/payments/return` est synchrone et ne perd rien.

### Décisions envoyées au chef d'équipe le 2026-11-12 (recommandations appliquées, à confirmer)

1. Où vit la redirection — **a** : dans la page, `loading.tsx` retiré (b : un layout ne lit pas `searchParams` ;
   c : 200, AC1 rouge).
2. L'admin qui est aussi bailleur — **a** : non redirigé, il garde son relevé de gérance.

### Preuves (scratchpad du lot 2, `terrain-5/2677/`)

- AC1 / AC3 / AC4 / AC5 en HTTP (`ac-http.mjs`, sans suivre) : admin → **307** sur les six formes (`approvals` →
  `?tab=a-approuver`, etc.) ; `/return` 200 ; agent (`payouts.create` : oui) 200 ; locataire, bailleur, hôte (agence 4,
  `individual`, jeton frappé pour l'occasion), client 200. Au navigateur (`ac-navigateur.mjs`) : « À approuver » actif ;
  l'agent a « Reversements » actif et « Créer un reversement » ; chacun son écran d'avant.
- AC2 : **les mêmes 20 identifiants (37 → 18), les mêmes références, la même requête** sur `/app/payments?tab=bills`
  avant la PR et sur sa redirection après (`ac2-ecran-{avant,apres}.json`).
- Ablations : `loading.tsx` remis → la règle des refus rougit sur `payments/page.tsx` ; exemption retirée → « pages
  sans loading.tsx » rougit sur elle seule ; `aiguillerVersLArgent` retiré de REFUS → le repli remis passe en silence
  (d'où son entrée) ; redirection neutralisée → 7 tests rouges ; exclusion du bailleur retirée → 1 ; `kind` lu
  négativement → 1 ; ligne `bills` retirée → 1.

### Conditions du chef d'équipe sur 1 a et 2 a (2026-11-12)

**L'exemption est dérivée du code, et elle est bornée.** `aiguilleDansSonRendu` (`app/__tests__/etats-de-route.test.ts`)
n'exempte une page de la règle « a son repli » que si elle appelle `await aiguillerVersLArgent(` ET si chacune de ses
attentes est dans `ATTENTES_SANS_RESEAU` : `getMeAction` (`cache()`), `aiguillerVersLArgent` (l'agence, `cache()`ée par
rendu et déjà lue par le layout de `/app`), `getTranslations` (sans réseau), `searchParams`, `params`.
- Toute autre attente, c'est-à-dire une requête à l'API, retire l'exemption.
- Le `redirect(` n'est pas littéral dans la page, et ce n'est pas un choix : `check-auth-interrupts` refuse un
  `redirect` littéral dans une page de `/app`. Il vit dans le terminateur partagé `aiguillerVersLArgent`, comme
  `garderPageAdmin`, et c'est l'appel à ce terminateur que l'exemption reconnaît.

**Les deux ablations** (arbre restauré au md5 près) :
- `payments/loading.tsx` remis : la règle des refus rougit sur `payments/page.tsx`.
- `await apiRequest('/api/payments/summary')` ajouté dans la page : « chaque page qui attend une donnée serveur a son
  propre repli » rougit sur `payments/page.tsx`, qui perd l'exemption.

**AC1 au curl** (`curl -g -s -o /dev/null -w '%{http_code} %{redirect_url}'`, jeton passé par `-K -`) :

| Compte | Chemin | Code | Cible |
|---|---|---|---|
| admin | `/app/payments` | 307 | `/app/agency/finances?tab=encaissements` |
| admin | `?tab=approvals` | 307 | `?tab=a-approuver` |
| admin | `?tab=bills` | 307 | `?tab=interventions` |
| admin | `?tab=history&status=paid` | 307 | `?tab=encaissements&status=paid` |
| locataire, bailleur, agent | `/app/payments` | 200 | — |
| admin | `/app/payments/return` | 200 | — |

**Coût du retrait de `loading.tsx`.** Mesuré sur l'application lancée (`next dev`, bureau 1440, cinq chargements
froids par cas, médianes en ms, charge 1,3 à 2,8 sur 8 cœurs). « Titre » est l'apparition du `h1` « Paiements ».

| Compte | Sans `loading.tsx` (TTFB · FCP · titre) | Avec `loading.tsx` (TTFB · FCP · titre) |
|---|---|---|
| locataire | 347 · 408 · 385 | 352 · 412 · 394 |
| bailleur | 754 · 800 · 792 | 786 · 836 · 830 |

Aucune différence au-delà du bruit. La page n'attend rien que le layout n'ait déjà payé, donc le repli n'avançait
aucun octet : le premier octet part après le layout dans les deux cas, et la page arrive dans la même trame. Il n'y a
pas d'écran vide perceptible sans le squelette. L'écart entre le locataire et le bailleur tient au layout du bailleur,
pas à cette page.

**Cas ouvert (décision 2 a).** L'admin d'agence qui est aussi bailleur n'est pas redirigé : « Argent » ne porte pas son
relevé de gérance (`OwnerStatementPanel`). Quand « Argent » le portera, la redirection pourra le couvrir. C'est un
ticket à part (ci-dessous).

**Les deux tickets de suite** (à écrire par la session) :
- (a) *L'admin d'agence qui est aussi bailleur passe à « Argent »* : porter `OwnerStatementPanel` dans « Argent »
  (registre ou section du bailleur connecté), puis retirer l'exclusion `isOwner` de `menerALArgent` ; AC : le 307 le
  couvre, et son relevé reste à un geste.
- (b) *« Interventions » pagine* : `useServiceProviderBills` lit `per_page=20` sans page suivante, et la démo compte 37
  factures, dont 17 invisibles (avant comme après TCK-2677). Il faut la pagination du registre, celle des autres
  registres d'« Argent ».

**Clés i18n de ce ticket** (pour l'indexation partielle de `fr`/`en`/`wo`) : `admin.finances.tabs.interventions`,
`admin.finances.argent.registres.interventions`, `admin.finances.argent.registres.interventionsDetail`.

### Observé, hors périmètre

- L'onglet `bills` (et donc « Interventions ») ne pagine pas : `useServiceProviderBills` lit `per_page=20`, la base de
  démo en compte **37** — 17 factures sont invisibles, avant comme après. Ticket à écrire.
- Au téléphone, la table des interventions défile dans son conteneur, mais ses rangées montent à ~140 px (la colonne des
  gestes s'empile hors champ) : c'était déjà l'écran de `/app/payments` ; une forme carte demanderait une maquette.
