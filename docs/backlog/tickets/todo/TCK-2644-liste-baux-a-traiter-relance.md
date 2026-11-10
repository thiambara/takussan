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
depends_on: [TCK-2642, TCK-2658]
blocks: [TCK-2639, TCK-2645]
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

## Hors périmètre

- La fiche du bail (TCK-2645) et la création (TCK-2643).
- Le renouvellement proactif à 90 jours, avec la proposition envoyée (ambition de l'audit).
- La relance graduée automatique : la relance automatique existe, et ne change pas.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
