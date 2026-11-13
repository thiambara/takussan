---
id: TCK-2764
title: "Abandonner un brouillon de bail jamais envoyé en signature : il cesse d'occuper le bien, sans rien effacer ni rouvrir"
status: todo
phase: P1
family: full
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2747]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
tags: [back, front, leases, bookings, candidature, audit-ux]
---

## Objectif utilisateur

L'agent qui a préparé un bail pour un candidat qui se désiste l'abandonne. Le logement peut alors être promis à un autre candidat, sans attendre un bail qui ne sera jamais signé.

## Contrat de données

Constat (relevé le 2026-11-12, HEAD 3796d9052, rapport de back-4 sur TCK-2747) :

- **Depuis TCK-2747** (décision 6 du porteur), `BookingService::confirm()` refuse en 409 `booking.property_already_leased` la candidature d'un bien qui porte un bail `draft`, `pending_signature`, `active` ou `terminating` couvrant le début demandé (`BookingService::bauxQuiOccupent`). Le bail du candidat lui-même est excepté.
- **Un brouillon abandonné bloque donc les autres candidatures du bien sans limite de temps.**
  - Aucune route ne supprime un bail (`routes/api/leases.php`).
  - `LeaseService::terminate` n'accepte que `active` et `pending_signature` : un brouillon n'a aucune sortie.
- **Le modèle `Lease` est déjà `SoftDeletes`.** `bauxQuiOccupent` part de `Lease::query()`, qui écarte les lignes supprimées.
- **Un brouillon peut porter une caution saisie** avant l'activation. `generateSchedule` exige `active`, mais une échéance `deposit` peut exister (P46.04, TCK-957).
- **Un renouvellement ne naît jamais brouillon** : `LeaseRenewalService` le crée `pending_signature` ou `active`. Aucun bail parent n'est touché par l'abandon d'un brouillon.
- **Décision 7 du porteur** (TCK-2734) : les autres candidatures ne se ferment qu'à l'**envoi en signature**, plus à la création du brouillon. **Aucune candidature n'a donc été fermée par un brouillon.**

À servir :

- **`DELETE /api/leases/{lease}`** : l'abandon d'un brouillon. Corps facultatif `{ reason?: string(500) }`.
  - 200 → `{ data: { id, abandoned_at, origin_booking: { id, status } | null } }` ;
  - 422 `lease.not_draft_abandon` si le bail n'est pas `draft` ;
  - 422 `lease.abandon_has_payments` s'il porte un paiement non annulé ;
  - 403 hors de la règle d'autorisation.

## Décision : suppression douce, plutôt qu'un statut « abandonné »

**Retenu : la suppression douce (`deleted_at`)**, validée par le porteur le 2026-11-12 (nuit, point 6 de ses huit validations). Trois raisons, et un coût :

- **Un brouillon n'a engagé personne.** Rien n'est signé, rien n'est dû, aucun échéancier n'existe. Le faire disparaître des listes est juste, et l'histoire reste en base (`withTrashed`, journal).
- **Aucun lecteur ne change.** `bauxQuiOccupent`, les listes, la file « À traiter », les comptes et les rapports écartent déjà les lignes supprimées par Eloquent. Un statut neuf devrait, lui, entrer dans chaque lecteur de `LeaseStatus` :
  - les filtres et les comptes de `GET /api/leases/summary` ;
  - les unions de statuts du front (`check-status-unions`) et leurs libellés en trois langues ;
  - les rapports.

  Chacun serait un oubli possible, et un oubli remettrait le brouillon dans un compte.
- **Le modèle le porte déjà** (`SoftDeletes`), sans migration.
- **Ce qu'on perdrait** : un brouillon abandonné ne se voit plus dans l'historique du bien. C'est acceptable, puisqu'il n'a rien produit. Le journal en garde la trace, avec son auteur et son motif.

**Écarté : un statut `abandoned`.** Il est plus visible, mais il coûte tous les lecteurs ci-dessus pour un objet qui n'a jamais eu d'effet. Si l'historique des brouillons abandonnés devient un besoin, ce sera un filtre `withTrashed` sur la chaîne du bien, pas un statut.

**Les candidatures.** L'abandon ne rouvre et ne ferme **aucune** candidature.
- **Les autres candidatures du bien.** Rien ne les a fermées à la création du brouillon (décision 7). Elles redeviennent acceptables dès l'abandon, parce que le brouillon ne compte plus dans `bauxQuiOccupent`.
- **La candidature d'origine** (`leases.booking_id`) reste dans son état, `pending` ou `confirmed`.
  - Pendant qu'elle reste `confirmed`, la règle « une seule candidature acceptée par bien » (TCK-2734) empêche toujours d'en accepter une autre. **C'est voulu** : le brouillon peut être abandonné pour être refait pour le même candidat.
  - L'écran le dit, et propose de la fermer par son **propre** geste, après l'abandon : `POST /api/bookings/{id}/reject` si elle est `pending`, `POST /api/bookings/{id}/cancel` si elle est `confirmed`. Ce sont deux gestes existants, avec leurs avis.
  - L'abandon ne la ferme pas en douce : fermer une candidature prévient le candidat, et l'agent doit le décider.

## Direction UX / Artistique

- Sur la fiche d'un bail **brouillon**, une action « Abandonner le brouillon », en ton destructif, sous les actions principales. Elle n'apparaît pas pour un autre statut.
- Le dialogue dit l'effet en une phrase : « Le brouillon disparaît des listes et le logement peut être proposé à un autre candidat. Rien n'est envoyé au locataire. » Le motif est facultatif.
- **Quand le brouillon vient d'une candidature**, le dialogue la nomme (« Candidature de Awa Ndiaye, acceptée »). Il propose une case « Fermer aussi cette candidature », **décochée**, et dit que, tant qu'elle reste acceptée, aucune autre ne peut l'être. Cochée, l'écran enchaîne le geste existant après l'abandon.
- Si une caution est saisie, l'action n'est pas proposée. Une phrase dit pourquoi, et quoi faire d'abord : annuler ou rembourser la caution.
- Après l'abandon, retour à la liste des baux, et un message de confirmation.
- i18n : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Contraintes strictes (métier)

- **`draft` seulement.** `pending_signature` a déjà une sortie, `terminate`. Ses candidatures ont été fermées à l'envoi (décision 7), et les rouvrir est un autre sujet.
- **Refus si le brouillon porte une échéance non annulée**, de tout type, caution comprise : 422 `lease.abandon_has_payments`. De l'argent saisi ne disparaît pas avec un brouillon.
- **Le contrôle se fait sous le verrou du bien, puis de la ligne du bail**, relue. C'est l'ordre bien → bail de `confirm()` : un abandon concurrent d'une signature demandée ne laisse pas un bail `pending_signature` supprimé.
- **Qui** : la règle de `LeasePolicy::update` (le bailleur qui écrit, le personnel de l'agence), exercée par une ability `abandon` qui y ajoute la condition `draft`. Pas de capacité neuve.
- **L'effet** : `deleted_at` posé, et rien d'autre en base que le journal. Les garants rattachés, les documents et la candidature d'origine restent.
- **Journal** : `activity('Lease')`, évènement `lease_draft_abandoned`, avec `lease_id`, `property_id`, `booking_id`, `reason` et l'acteur. L'audit du modèle (`Auditable`) garde sa trace de suppression.
- **Les documents** rattachés au brouillon ne se lisent plus que par leur téléverseur (`DocumentPolicy::view` : un porteur supprimé n'est plus atteint). C'est voulu, et le ticket le dit dans son test (AC7).
- **Codes d'erreur** : `lang/{fr,en,wo}/errors.php`, avec la parité de `LangGroupParity`.

## Delta à produire

- [ ] Route `DELETE leases/{lease}` → `LeaseController@destroy` (ou un contrôleur dédié), `AbandonLeaseDraftRequest` (`reason` facultatif, 500 au plus).
- [ ] `LeaseService::abandonDraft(Lease, User, ?string)` : verrous, refus, suppression douce, journal.
- [ ] `LeasePolicy::abandon`.
- [ ] Codes `lease.not_draft_abandon`, `lease.abandon_has_payments` (fr, en, wo).
- [ ] Front : l'action et son dialogue sur la fiche d'un bail brouillon (cf. Direction UX), avec l'enchaînement facultatif du geste de la candidature d'origine.
- [ ] Tests : `LeaseDraftAbandonTest` (back), et le test du dialogue (front).

## Critères d'acceptation

Fixture : un bien P, une candidature A `confirmed` (client CA), un brouillon de bail L tiré de A (`booking_id = A`), et une candidature B `pending` (client CB) sur P, dont le début demandé est couvert par L.

- [ ] **AC1 — La prémisse.** Avant l'abandon, confirmer B rend 409 `booking.property_already_leased`. Ce test est vert sur le code d'avant le ticket.
- [ ] **AC2 — L'abandon débloque le bien.**
  - `DELETE /api/leases/{L}` → 200.
  - L a `deleted_at`, et `GET /api/leases/{L}` → 404.
  - L n'est plus dans `GET /api/leases` ni dans les comptes de `GET /api/leases/summary`.
  - Ensuite, après la fermeture de A (`cancel`), confirmer B passe. Sans la fermeture de A, confirmer B rend le refus de TCK-2734 (une seule candidature acceptée), **et non** `booking.property_already_leased`.
  - Ablation : faire lire `bauxQuiOccupent` avec `withTrashed()` rend la confirmation de B rouge.
- [ ] **AC3 — Aucune candidature ne bouge.** Après l'abandon, A reste `confirmed` et B reste `pending`. Aucun avis de réservation n'est envoyé : le faux des notifications est vide.
- [ ] **AC4 — `draft` seulement.**
  - Un bail `pending_signature`, `active`, `terminating` ou `terminated` → 422 `lease.not_draft_abandon`.
  - La ligne est inchangée, et aucun journal n'est écrit.
- [ ] **AC5 — L'argent saisi.**
  - Le brouillon porte une échéance `deposit` `pending` → 422 `lease.abandon_has_payments`, et L reste.
  - Une fois cette échéance `cancelled`, l'abandon passe.
  - Ablation : retirer ce contrôle rend le test rouge.
  - **Un état des lieux** sur le brouillon, signé ou non → 422 `lease.abandon_has_inventory`, et L reste (décision du 2026-11-13, réserve r1 de la vérification d'ace044c18).
- [ ] **AC6 — Qui.**
  - Le personnel actif de l'agence de L → 200.
  - Le bailleur de L (bien sans agence, bailleur particulier) → 200.
  - Le personnel d'une autre agence, le locataire désigné (CA), un bailleur bloqué de l'agence → 403.
- [ ] **AC7 — Ce qui reste.**
  - Les garants rattachés, les documents et A sont inchangés.
  - L se relit par `Lease::withTrashed()`.
  - Le journal porte `lease_draft_abandoned`, avec le motif.
  - Un document joint à L par l'agent X reste lisible par X (200), mais plus par un autre membre du personnel (403).
- [ ] **AC8 — La course.** Une demande de signature (`POST /api/leases/{L}/signature-request`) et l'abandon, lancés ensemble, ne laissent jamais un bail `pending_signature` supprimé : l'un des deux échoue proprement.
- [ ] **AC9 — Le front.**
  - L'action n'est rendue que sur un brouillon.
  - Avec une caution saisie, elle est remplacée par sa raison.
  - Avec un état des lieux (`has_inventory`), elle est remplacée par sa raison propre.
  - Le dialogue nomme la candidature d'origine, et sa case est décochée.
  - Décochée, un seul `DELETE` part. Cochée sur une candidature `confirmed`, `DELETE` puis `POST …/cancel`.

## Hors périmètre

- **Retirer de la signature un bail `pending_signature`** pour le ramener au brouillon, et rouvrir les candidatures que l'envoi a fermées. `terminate` reste la sortie d'aujourd'hui.
- **L'expiration automatique** d'un brouillon resté sans suite. Elle se décidera si l'abandon manuel ne suffit pas.
- **Restaurer un brouillon abandonné.** On recrée le bail depuis la candidature.

## Notes d'implémentation

### Réserve r1 de la vérification d'ace044c18 — l'état des lieux (décision du 2026-11-13)

- **Le constat.** Un état des lieux pouvait se créer sur un brouillon (`InventoryController::store` autorise par
  `update` du bail, quel que soit son statut). Après l'abandon, il restait sans bail : sa fiche rendait `lease: null`,
  et il restait listé. Aucune route ne supprime un état des lieux.
- **La règle.** `LeaseService::abandonDraft()` refuse en 422 `lease.abandon_has_inventory` tant qu'un état des lieux
  existe sur le brouillon, signé ou non. Le contrôle suit celui des échéances, sous le même verrou. La prose est en
  fr/en/wo dans `lang/*/errors.php`.
- **La course inverse.** `InventoryService::create()` prend maintenant le bien puis le bail
  (`LeaseService::verrouillerLeBienPuisLeBail()`) avant d'écrire. De l'abandon et de la création lancés ensemble, le
  second relit la ligne : l'abandon voit l'état des lieux (422), ou la création ne trouve plus le bail (404).
- **La fiche.** `has_inventory` sert le même lecteur qu'`origin_booking`. `raisonDAbandonEmpeche()`
  (`fiche/gestes.ts`) remplace le geste par sa raison : l'échéance d'abord, puis l'état des lieux
  (`lease.fiche.gestes.abandonEmpecheEtatDesLieux`).
- **Les tests.** API, `LeaseDraftAbandonTest::test_r1_*` (4). Front, un cas dans
  `AbandonnerLeBrouillon.tck-2764.test.tsx` et un dans `LeaseDetail.fiche.tck-2645.test.tsx`.
- **Les ablations, toutes rouges puis restaurées :**
  - contrôle retiré de `abandonDraft` → `test_r1_un_etat_des_lieux_refuse_l_abandon` rouge ;
  - verrou retiré de `create` → 2 rouges (`ne_nait_pas_sur_un_brouillon_abandonne`, `prend_le_bien_puis_le_bail`) ;
  - `has_inventory` toujours faux → `test_r1_la_fiche_dit_qu_un_etat_des_lieux_existe` rouge ;
  - front, la raison `etatDesLieux` retirée → 1 rouge dans chacun des deux fichiers ;
  - front, le libellé unique → 1 rouge dans la fiche.
- **Limite.** Un brouillon qui porte un état des lieux ne s'abandonne plus, et aucune route ne supprime un état des
  lieux. Une seule sortie reste : envoyer le bail en signature, puis le résilier (`terminate` accepte
  `pending_signature`). Mais cet envoi ferme les autres candidatures du bien (décision 7, TCK-2734). Le cas est remonté
  à team-lead le 2026-11-13.

### Décision 4a du porteur (2026-11-13 ~18:50) — les brouillons d'état des lieux partent avec le bail (back-4)

- **La règle, qui assouplit r1.** Seul un état des lieux **engagé** refuse l'abandon (422 `lease.abandon_has_inventory`) :
  sorti du brouillon (`pending_signature`, `signed`, `disputed`), ou portant une signature quelle qu'elle soit
  (`tenant_signed`, `owner_signed`, `tenant_signed_at`, `owner_signed_at`, `signed_at`). Le prédicat est écrit une
  fois, `Inventory::engage()`, et lu par l'abandon comme par la fiche. Des brouillons jamais signés sont supprimés en
  douceur avec le bail, dans la même transaction ; tout ou rien : un seul état des lieux engagé retient aussi les
  brouillons. ⚠ La ligne d'AC5 « un état des lieux, signé ou non → 422 » et la « Limite » de r1 ci-dessus ne valent
  plus que pour un état des lieux engagé.
- **Les verrous.** Bien → bail → états des lieux du bail (`lockForUpdate`, par `id`), puis les écritures. Tout
  écrivain d'un état des lieux (`InventoryService::underLock` : modifier, soumettre, contester, photos ;
  `InventorySignatureService::sign`) prend la ligne de l'état des lieux seule, sans bail ni bien ensuite (relu :
  `submit`/`dispute` n'écrivent que la ligne, sans toucher de clé étrangère ; `sign` lit le bien sans verrou ;
  l'observateur d'onboarding n'écrit que la checklist) : aucun cycle avec l'ordre de l'abandon. Un envoi en signature
  concurrent passe avant (l'abandon le relit, 422) ou après (sa ligne est supprimée, 404).
- **Le journal** `lease_draft_abandoned` porte en plus `inventory_ids`, les brouillons partis avec le bail.
- **La fiche.** `has_inventory` vaut désormais pour un état des lieux **engagé** : un brouillon d'état des lieux ne
  remplace plus le geste par sa raison. Le texte de l'erreur (`lang/*/errors.php`) le dit (« un état des lieux
  engagé — envoyé en signature, signé ou contesté »). Côté front, à reprendre (signalé à team-lead et terrain-8) :
  `lease.fiche.gestes.abandonEmpecheEtatDesLieux` (« l'état des lieux resterait sans bail ») et le commentaire de
  `types/lease.ts` ; le dialogue peut dire que les brouillons d'état des lieux partent avec le bail.
- **Les tests** (`LeaseDraftAbandonTest`, 4a) : `test_4a_un_etat_des_lieux_engage_refuse_l_abandon` (huit formes
  engagées), `test_4a_les_brouillons_d_etat_des_lieux_partent_avec_le_bail` (deux brouillons supprimés, celui d'un
  autre bail intact, 404 au détail, absent de la liste, `inventory_ids` au journal),
  `test_4a_un_seul_etat_des_lieux_engage_retient_aussi_les_brouillons`, `test_4a_l_etat_des_lieux_se_juge_sur_la_ligne_relue`,
  `test_4a_l_abandon_verrouille_les_etats_des_lieux_avant_de_les_supprimer`, et `test_r1_la_fiche_dit_qu_un_etat_des_lieux_existe`
  réécrit (brouillon → faux, chaque forme engagée → vrai). Voisins (états des lieux, fiche et abilities du bail) : 139 verts.
- **Les ablations (4a), toutes rouges puis restaurées :** contrôle `engage()` retiré de l'abandon → 3 rouges ;
  boucle de suppression retirée → 2 ; `lockForUpdate` des états des lieux retiré → 1 (l'épingle de l'ordre) ;
  `has_inventory` remis à `exists()` → 1 ; `inventory_ids` retiré du journal → 1 ; une clause d'`engage()`
  (`tenant_signed_at`) retirée → 2.
