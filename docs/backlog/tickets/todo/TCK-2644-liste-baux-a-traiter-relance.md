---
id: TCK-2644
title: "Liste des baux : la file « À traiter » qui nomme le locataire, et la relance d'un impayé par WhatsApp"
status: todo
phase: P1
family: full
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2642, TCK-2645, TCK-2658, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2639]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#50-tenantonboardingchecklist-"
tags: [front, back, leases, whatsapp, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agence ouvre « Baux » sur le travail du jour : chaque ligne dit quel locataire, quel bien, ce qui attend depuis quand, et propose un seul geste. Un impayé se relance par WhatsApp, avec un message déjà écrit et le lien de paiement.

## Contrat de données

- `GET /api/leases` avec `filter[a_traiter]`, `filter[motif]`, `filter[search]`, `filter[onboarding_pending]`, `include=tenant,property,agent`, `attention[]`, `next_due` et `sort=attention` (TCK-2642).
- `GET /api/leases/summary` pour les compteurs d'onglets, en un appel (TCK-2642).
- Relance :
  - `POST /api/lease-payments/{payment}/payment-link` (existant) rend le lien de paiement de l'échéance ;
  - le lien WhatsApp se construit par l'aide existante `whatsappHref(phone, message)` (`components/crm/contact.ts:17`) ;
  - la relance **se note** par `POST /api/lease-payments/{payment}/reminders {channel: whatsapp}` et se relit par `GET …/reminders`. Ces deux routes sont portées par **TCK-2658** (famille 6), à qui revient la source unique des relances (`LeasePaymentReminder`, [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md)). Tant que TCK-2658 n'est pas mergé, ce ticket ne démarre pas sa partie « Relancer ».
- « Relancer la signature » : `POST /api/leases/{lease}/signature-request`, qui existe et relance sur un bail `pending_signature`.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-baux&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écran « Liste — À traiter », au téléphone et au bureau.
- **Onglets** : « À traiter (n) · Actifs · En attente du locataire · Terminés ». Les brouillons restent atteignables par le filtre de statut.
- **Une carte par bail**, un seul geste par carte :
  - la carte porte le locataire, le bien, ce qui attend avec son âge (« À signer depuis 5 j », « Loyer de nov. en retard · 1 355 000 F · depuis 6 j »), et la couleur du motif (danger, attention, information) ;
  - le geste dépend du motif :

    | Motif | Geste |
    |---|---|
    | Signature qui traîne | « Relancer la signature » |
    | Préavis reçu | « Programmer l'état des lieux », vers `/app/inventories/new?lease=…&type=move_out` |
    | Impayé ou pénalité | « Relancer » |
    | Révision ouverte | « Réviser » (la fiche, feuille ouverte) |
    | Fin proche | « Proposer le renouvellement » |
    | Caution à rendre | « Restituer la caution » |
    | Entrée incomplète | « Relancer la locataire » |

- **La règle de la file est écrite en clair sous la liste** : « Un bail est à traiter quand… ». C'est le texte de la règle de TCK-2642, en vouvoiement.
- **Bureau (≥ 1280 px)** : tableau Locataire · Bien · Ce qui attend (texte + âge) · Loyer · Fin · Agent · geste en fin de ligne. Colonnes dès `lg`.
- **Téléphone (360-390 px)** : cartes avec un bouton ≥ 44 px, et recherche « Locataire, bien, référence… » en tête.
- **Relance WhatsApp** ([décision 13](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10)) :
  - le geste ouvre WhatsApp au numéro du locataire, avec un message prérempli que l'agent relit et envoie lui-même ;
  - pour un impayé, le message dit le mois, le montant (pénalité comprise, décision 8), le bien, le lien de paiement et l'agence ;
  - pour une signature ou une entrée incomplète, le message dit ce qui manque, sans lien de paiement.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0089](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md).

**Rien ne se perd** (audit famille 4, § 3, *Fonctions existantes* 1-4 et 15, lues dans `LeasesList.tsx` et `TenantOnboardingPendingList.tsx`) :

- « Nouveau bail », selon la capacité ;
- filtre de statut, y compris par `?status=` dans l'URL ;
- filtre par bien. Il devient une recherche, et `?property=` est gardé ;
- sur la ligne : référence, statut, bien, dates, loyer / mois ou prix de vente ;
- pagination ; squelettes ; erreur avec « Réessayer » ; vide avec « Nouveau bail » ; état sans agence ;
- **entrées en attente** : lien vers le bail, date de signature, éléments manquants, jours d'ouverture (pastille rouge au-delà de 14).

Autres contraintes :

- **Le module `move_in_follow_up` quitte la liste fermée** (amendement du 2026-11-10 d'[ADR-0089](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md), point 4) : l'entrée « Entrées en attente » quitte le menu, le module sort d'`App\Models\Enums\AgencyModule` **et** de `MODULES_D_AGENCE` dans ce même ticket (la garde de parité rougit si un seul côté change), sa case disparaît de la section « Menu de l'équipe », et une valeur `move_in_follow_up` déjà enregistrée dans `hidden_modules` est ignorée à la lecture, sans erreur.
- **`/app/leases/onboarding-pending` redirige** vers l'onglet « En attente du locataire » ([décision famille 4 n° 3a](../../../qa/audit-ux-2026-11/04-patrimoine-et-location.md)). Les liens existants (notifications, `TenantOnboardingChecklistWidget`) continuent d'aboutir. Le retrait de l'entrée de menu relève de la coque (famille 3).
- **Relance** :
  - manuelle, sans rien changer aux relances automatiques (J-3, J+1, J+7, §1.4) ;
  - sans téléphone connu du locataire, « Relancer » cède la place à « Copier le lien de paiement », avec la raison ;
  - le texte du message est un libellé i18n, dans la langue de l'écran ;
  - **l'aide de construction du message et du lien est unique** : la fiche du bail (TCK-2645), la fiche du bien (TCK-2639) et la page Argent de la famille 6 (TCK-2660) s'en servent, sans recopie. Le premier des deux tickets mergé (celui-ci ou TCK-2660) l'écrit, et l'autre la reprend ;
  - l'ouverture de WhatsApp **enregistre** la relance (`channel: whatsapp`), comme dans TCK-2660. La carte affiche ensuite « relancé aujourd'hui », et les relances automatiques s'y lisent aussi ;
  - aucun « Lu le … » : rien ne le mesure.
- **Le locataire et le bailleur** ne voient ni l'onglet « À traiter » ni les gestes de l'agence :
  - un locataire qui n'a qu'un bail arrive sur la fiche de ce bail (« Mon bail ») ;
  - un locataire qui a plusieurs baux voit une liste simple, sans filtre d'agence ;
  - le bailleur voit ses baux avec le nom du locataire.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants et dates par `useFormatteurs()`.

## Delta à produire

- [ ] Onglets comptés. File « À traiter » avec motif, âge et un geste. Recherche. Règle écrite.
- [ ] Onglet « En attente du locataire », et redirection de l'ancienne route.
- [ ] Geste « Relancer » par WhatsApp : lien de paiement, puis message prérempli. Aide partagée, et repli « Copier le lien ».
- [ ] Vue du locataire (un bail : redirection vers la fiche) et vue du bailleur.
- [ ] Retrait du module `move_in_follow_up` : enum PHP, `MODULES_D_AGENCE`, entrée de menu et case de « Menu de l'équipe » ; lecture tolérante d'une valeur enregistrée.
- [ ] Tests :
  - un cas par motif ;
  - relance (appel du lien, puis URL `wa.me` avec le montant et le lien, puis `POST …/reminders`) ;
  - repli sans téléphone ;
  - redirection de l'ancienne route ;
  - locataire à un bail ;
  - une agence dont `hidden_modules` contient `move_in_follow_up` : le menu se rend sans erreur, et la valeur est ignorée.

## Critères d'acceptation

- [ ] AC1 — Pour le bail de Mamadou Seck, en retard de 6 jours, « Relancer » appelle `POST /api/lease-payments/{id}/payment-link`, puis ouvre `https://wa.me/221…?text=…`. Le texte décodé contient « novembre », « 1 355 000 » (pénalité comprise si elle est due) et l'URL rendue par l'appel. Un `POST …/reminders` part avec `channel: whatsapp` (vu au réseau).
- [ ] AC2 — Les compteurs des onglets égalent la réponse de `GET /api/leases/summary`. Le réseau montre un seul appel de comptage.
- [ ] AC3 — `/app/leases/onboarding-pending` aboutit sur l'onglet « En attente du locataire », qui liste les mêmes baux que l'ancien écran sur la démo, avec le nom du locataire.
- [ ] AC4 — Taper « seck » dans la recherche envoie `filter[search]=seck` et ne laisse que les baux de ce locataire.
- [ ] AC5 — Le locataire de la démo (un bail) qui ouvre `/app/leases` arrive sur `/app/leases/{id}`. Aucun sélecteur « Tous les statuts / Tous les biens » ne lui est rendu.
- [ ] AC6 — Un locataire sans téléphone : sa carte d'impayé porte « Copier le lien de paiement » et la phrase qui dit pourquoi, et aucun lien `wa.me`.
- [ ] AC7 — À 390 px, chaque carte porte exactement un bouton ≥ 44 px. À 1280 px, le tableau tient sans défilement horizontal.
- [ ] AC8 — `move_in_follow_up` n'apparaît plus ni dans `AgencyModule::cases()` ni dans `MODULES_D_AGENCE`, ni dans la section « Menu de l'équipe ». Une agence dont `hidden_modules` vaut `["move_in_follow_up"]` ouvre `/app` et ses réglages sans erreur, et `PATCH` de ses modules masqués réussit.
- ~~AC9 — Sur la fiche d'un bail en retard, « Relancer » produit la même URL `wa.me` que la file de ce ticket.~~ **Sorti en ticket propre le 2026-11-14 : [TCK-2818](TCK-2818-fiche-bail-relance-impaye.md)** (décision 5 b de team-lead). Ce ticket ne se juge plus sur lui.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2644.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La fiche du bail (TCK-2645), « Relancer » sur la fiche (TCK-2818), et la création (TCK-2643).
- Le renouvellement proactif à 90 jours, avec la proposition envoyée (ambition de l'audit).
- La relance graduée automatique : la relance automatique existe, et ne change pas.

## Notes d'implémentation

### Décisions du 2026-11-13 (relayées par team-lead)

1. **La pénalité restée due (`late_fee_unpaid`) : « Relancer » mène à l'échéancier de la fiche (option b).** La
   pénalité porte sur une échéance PAYÉE : ni lien de paiement ni note de relance ne s'y prennent (l'API rend 409), et
   un message WhatsApp ne laisserait aucune trace. Le geste ouvre `/app/leases/{id}?echeancier=toutes` : l'échéancier
   s'y ouvre déplié (l'échéance payée est rangée après les dues, souvent au-delà des six premières) et la page s'y
   porte. « Marquer la pénalité réglée » s'y trouve déjà. La variante WhatsApp est retirée, avec la clé
   `lease.liste.relance.message.penalite`. **Option (c), non codée — ticket possible du porteur :** une relance de
   pénalité notée par l'API (`POST …/reminders` admis sur une échéance payée dont la pénalité reste due), qui rendrait
   au geste sa trace.
2. **AC1 est amendé.** La relance d'un loyer reprend telle quelle la `FeuilleDeRelance` de TCK-2660 : on voit
   l'échéance et le message, puis « Ouvrir WhatsApp » crée le lien et note la relance. Le lien n'est donc pas créé au
   clic sur « Relancer », mais à l'envoi, comme le veut la décision 1 (a) du 2026-11-12 de TCK-2660 (« le lien n'est
   créé qu'à l'ENVOI »). Le reste d'AC1 tient : novembre, 1 355 000, l'URL du lien et `POST …/reminders` avec
   `channel: whatsapp` se lisent au réseau.
3. **L'espace `admin` du dictionnaire est chargé par la liste (accepté, a).** `FeuilleDeRelance` lit ses libellés
   sous `admin` : `(dashboard)/app/leases/(liste)` est une frontière i18n qui l'embarque (`namespaces.json`). Les sortir
   de `admin` est l'objet de TCK-2758.
4. **Le tableau du bureau garde le montant de plusieurs loyers en retard et de la pénalité.** La colonne « Ce qui
   attend » tait le montant d'UN loyer en retard (« Loyer de nov. en retard ») : la ligne porte déjà le loyer. Elle
   l'écrit pour « 2 loyers en retard · 2 710 000 F » et « Pénalité non réglée · 22 500 F », que le loyer de la ligne ne
   dit pas. Les clés courtes `motifsCourts.rent_late_plusieurs` et `motifsCourts.late_fee_unpaid` sont retirées.
5. **Le filtre « Statut » est retiré de la file « À traiter ».** Il reste sur les autres onglets, et sur la file
   quand l'URL en porte un.


### 2026-11-14 — dépendance inversée avec TCK-2645, et l'AC9 venu de la fiche

- **Le frontmatter suit la décision de la session du 2026-11-12** (`decisions-2645`) : ce ticket dépend de
  TCK-2645 et ne le bloque plus. Raison, re-mesurée au HEAD : les gestes « Réviser », « Proposer le
  renouvellement » et « Restituer la caution » de la file mènent à la fiche avec `?geste=reviser|renouveler|restituer`
  (`components/leases/liste/GesteDuBail.tsx:89`), que la fiche lit (`components/leases/LeaseDetail.tsx:180-181`).
  C'est la liste qui a besoin de la fiche, pas l'inverse.
- **L'AC7 de TCK-2645 devient l'AC9 de ce ticket**, non cochée : au HEAD, `LeaseDetail.tsx` n'importe aucune aide
  de relance d'un impayé (`useRelanceDUnImpaye`). Ce ticket gagne donc un critère ouvert.
- **Dépendances de l'AC9 (décision 3 b de team-lead, 2026-11-14)** : TCK-2660 entre dans `depends_on`, avec le
  `blocks` réciproque. TCK-2758 n'y entre pas, parce qu'il fermerait un cycle : TCK-2644 → TCK-2758 → TCK-2639 →
  TCK-2644. La question est reposée à team-lead.
- **AC9 sorti vers TCK-2818** (décision 5 b de team-lead, 2026-11-14), qui dépend de TCK-2645 et de TCK-2660. TCK-2660
  quitte donc le `depends_on` de ce ticket. Seule la dépendance à TCK-2645 reste de ce changement.
