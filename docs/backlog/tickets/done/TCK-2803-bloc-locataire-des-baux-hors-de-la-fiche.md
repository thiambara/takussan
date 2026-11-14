---
id: TCK-2803
title: "Le bloc locataire des baux, hors de la fiche : la liste borne fields[customers] et ne charge tenant que sous include, les gestes ne le rendent plus d'office"
status: done
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#7-customer"
tags: [back, front, baux, sparse-fieldsets, confidentialite, suite-de-tck-2780]
---

## Objectif utilisateur

Un écran qui lit la liste des baux, ou qui pose un geste sur un bail, ne reçoit du locataire que ce qu'il a demandé.
Celui qui n'a rien demandé ne reçoit ni son téléphone ni son e-mail.

## Contrat de données

**Origine.** Écart consigné par TCK-2780 (décision 2, notes « La forme lue ») : la fiche (`GET /api/leases/{id}`)
borne désormais le locataire, mais la liste et les autres réponses qui rendent `LeaseResource` ne le font pas.

**Constat, relu sur HEAD (`ebc494478`, fichiers sans modification locale) le 2026-11-14 :**

- **La liste charge toujours le locataire.** `LeaseController::index()` part de
  `Lease::query()->with(['property.address', 'property.media', 'tenant'])` : `tenant` est chargé que la requête porte
  `include=tenant` ou non. `LeaseResource` le rend alors par `whenLoaded('tenant', …)`, en bloc
  `CustomerResource` entier.
- **La liste valide `fields[customers]` sans s'en servir.** Mesuré par TCK-2780 le 2026-11-14 :
  `fields[customers]=id,first_name` rend 200 avec un bloc `tenant` entier, et `fields[tenants]` comme `fields[tenant]`
  rendent 400. Spatie cherche les champs d'une relation incluse sous `tenants`.
- **Sept réponses de gestes chargent `tenant` d'office**, et le rendent entier par `whenLoaded` :
  - `LeaseController::store` (`load(['property', 'tenant'])`) ;
  - `LeaseEarlyTerminationController::store`, `destroy` et `confirm` ;
  - `LeaseSignatureController::detail` (demande d'envoi en signature et signature) ;
  - `LeaseRenewalController::store` ;
  - `LeaseRentController::update`.
- **Quatre autres le rendent selon l'état de la relation** : `LeaseController::update` (`fresh()`), `activate` et
  `terminate`, et `LeaseDepositRefundController::store`. Ils ne chargent rien, mais une policy qui lit
  `$lease->tenant` (`LeasePolicy`, l. 111, 236, 353, 376) charge la relation avant le rendu. Le bloc sort alors
  entier, sans que la requête l'ait demandé.
- `LeaseChainController::index` ne charge pas `tenant` : il n'est pas concerné.
- `CustomerResource::toArray` rend `email` et `phone` sans condition, à quiconque reçoit le bloc.

**Fuite : non confirmée (lu, non exécuté).** Toutes les portes relues ne s'ouvrent qu'au bailleur du bail
(`bailleurEcrit`), au personnel de son agence, au locataire du bail ou au super-admin. Ce sont des lecteurs que
`LeasePolicy::view` admet déjà, et qui reçoivent le même bloc par `GET /api/leases/{id}?include=tenant`. Le défaut est
donc une sur-livraison au regard des champs demandés, comme TCK-2780, et pas un accès hors droit. **Le ticket passe en
P1 si AC1 trouve une porte qui admet un appelant que `view` refuse.**

**Endpoints touchés :** `GET /api/leases`, et les réponses des gestes listés ci-dessus.

## Contraintes strictes (métier)

- **La liste ne charge le locataire que sous `include=tenant`.** Sans lui, la clé `tenant` est absente de chaque ligne.
- **Sous `include=tenant`, `fields[customers]` borne le bloc de la liste** comme celui de la fiche : `id`, plus les
  clés demandées, par la même lecture (`CustomerResource::champsDemandesDuBloc()` et `borneeAuxChamps()`). La liste
  et la fiche acceptent la même forme. Il n'en naît pas une troisième.
- **Une clé demandée n'ouvre aucun droit** : les gardes de `CustomerResource` se jugent sur la fiche complète
  (leçon de TCK-2759 r3, reprise par TCK-2780).
- **Une réponse de geste ne rend pas `tenant` d'office.** Elle suit la même règle que la fiche (`include=tenant`
  explicite), ou elle ne rend pas le bloc du tout. Le choix est écrit dans les notes, geste par geste, avec l'appelant
  front qui lit la réponse.
- Les appelants front de la liste et des gestes sont mis à jour dans le même ticket : chacun demande le locataire
  seulement s'il le lit, et les seules colonnes qu'il lit.
- Pas de N+1 : le bornage de la liste ne recharge pas une fiche par ligne quand les traits jugés sont déjà chargés.

## Delta à produire

- [x] `LeaseController::index()` : `tenant` sort du `with()` d'office et n'est chargé que sous `include=tenant`.
- [x] `LeaseResource` : sur la liste, le bloc `tenant` est borné par `fields[customers]` comme sur la fiche.
- [x] Les onze réponses de gestes listées au constat suivent la règle retenue (`include=tenant`, ou aucun bloc).
- [x] Inventaire des appelants front de `GET /api/leases` et des onze gestes : ce qu'ils lisent du locataire, puis
  `include` et `fields` réduits à cela.
- [x] `docs/spatie-query-builder.md` dit que `fields[customers]` borne `tenant` sur la liste ET la fiche des baux.
- [x] Tests `BailLocataireDeLaListeEtDesGestesTest`, pour chacun des quatre lecteurs (bailleur, personnel,
  locataire, super-admin).

## Critères d'acceptation

- [x] AC1 — Pour chacune des onze portes de geste, un test confronte la porte à `LeasePolicy::view` : tout
  utilisateur admis par la porte est admis par `view`. Le test énumère les mêmes profils que ceux de
  `BailLocataireALaDemandeTest`, plus un bailleur suspendu et un membre parti de l'agence.
- [x] AC2 — `GET /api/leases` sans `include=tenant` : aucune ligne ne contient la clé `tenant`, et ni le téléphone ni
  l'e-mail du locataire n'apparaissent nulle part dans la réponse. La recherche porte sur les valeurs, pas seulement
  sur la clé.
- [x] AC3 — `GET /api/leases?include=tenant&fields[customers]=id,first_name,last_name` : chaque bloc `tenant` porte
  exactement `id`, `first_name` et `last_name`. Le test vérifie que `phone` et `email` sont ABSENTS
  (`assertArrayNotHasKey`), il ne compte pas les clés.
- [x] AC4 — `GET /api/leases?include=tenant` sans `fields` rend le bloc d'aujourd'hui, à l'instantané relevé sur
  l'arbre d'avant le changement.
- [x] AC5 — Pour chacun des onze gestes, la réponse sans `include=tenant` ne contient ni le téléphone ni l'e-mail du
  locataire. Pour les quatre réponses qui dépendent de la policy, le test passe par un lecteur dont la policy charge
  `tenant` (le locataire du bail).
- [x] AC6 — Les tests vitest des écrans qui lisent la liste et les réponses de gestes restent verts. Chaque requête
  front qui demande `include=tenant` porte aussi `fields[customers]`.
- [x] AC7 — Vérifié par ablation, une à la fois : `tenant` remis dans le `with()` de la liste rend AC2 rouge ; le bloc
  de la liste non borné rend AC3 rouge ; `load('tenant')` remis dans un geste rend AC5 rouge pour ce geste.

## Hors périmètre

- Décider si le bailleur doit lire le téléphone et l'e-mail du locataire : ce ticket rend la réponse fidèle à la
  demande, il ne change pas les droits de `CustomerResource`.
- `GET /api/leases/{id}` (TCK-2780) et `GET /api/property-visits` (TCK-2779).
- `GroupContextLeaseResource` (contexte de conversation), qui ne passe pas par `LeaseResource`.

## Notes d'implémentation

**AC1 a trouvé une fuite : le ticket passe en P1 (signalé avant correction, 2026-11-14).**
`POST /api/leases/{id}/signature` (rôle `landlord`) admettait l'agent qui a saisi le bien, PARTI de
l'agence, à qui `GET /api/leases/{id}` rend 403. Mesuré par exécution : `/signature/otp` 202, puis
`/signature` 200 avec le bloc `tenant` entier (téléphone, e-mail). Il signait donc aussi le bail au nom
du bailleur. Cause : `LandlordSignatory::isLandlord` comparait `landlord_id` à l'utilisateur, sans
`BailleurDuBien::est`. Or `landlord_id` recopie l'agent créateur (TCK-1926). Correction : `isLandlord`
passe par `BailleurDuBien::est` (désigné, ET bail sans agence ou profil propriétaire dans son agence),
la règle de `view`. Effet sur les droits : l'agent créateur ne signe plus pour le bailleur à ce titre.
En poste, il signe par la voie du personnel mandaté (`leases.sign`) ; parti, plus du tout. La même
règle vaut pour la signature d'état des lieux, la voie papier (`ActivateLeaseRequest`), `can_sign_as`
et `can_activate_on_paper`, qui partagent ce prédicat. `onBehalfOf` garde sa comparaison brute :
l'agent créateur en poste qui signe par mandat reste « pour lui-même ». Deux fixtures de test
dessinaient un bailleur de bien d'agence sans profil dans l'agence, que `view` refuse déjà :
`PrintedIdentityFrozenTest` et `BailFermeLesAutresCandidaturesTest` lui donnent son profil propriétaire.

Les douze autres portes sont incluses dans `view` pour les treize profils testés (bailleur actif,
suspendu, parti ; personnel ; administrateur d'agence ; locataire ; super-admin ; membre parti ; agent
créateur parti ; autre bailleur de l'agence ; personnel d'une autre agence ; personnel de deux
agences ; inconnu).

**Une divergence restante, nommée et assertée telle quelle dans AC1** (décision du porteur du lot,
2026-11-14 : exception nommée ici, ticket d'alignement à part) : le personnel de DEUX agences, sans profil actif dans celle du bail, signe pour
le bailleur (`isStaffAt`, mesuré : `/signature/otp` 202), alors que `view` le refuse (`staffAgencyId`,
profil actif, ADR-0031 §3 : show 403, bail absent de la liste). Il est du personnel de l'agence du
bail et y lit le bail en basculant de profil : pas un accès hors droit, et la réponse ne porte plus
le locataire. Aligner la signature sur le profil actif est proposé en ticket à part.

**L'agent créateur EN POSTE mène la signature au même état final qu'avant.** Test
`test_l_agent_createur_en_poste_mene_la_signature_jusqu_au_meme_etat_final` : bail d'agence saisi par
l'agent (rôle système `agent`, qui tient `leases.sign`), signé par le code SMS, puis voie papier, puis
état des lieux d'entrée. L'état final (statut, preuves de signature avec `user_id` et `on_behalf_of`,
preuves papier, `owner_signed_by` de l'état des lieux, journal, notifications) a été relevé sous
l'ancien code (ablation a5) et sous le nouveau : les deux instantanés sont IDENTIQUES. `onBehalfOf`
est la seule valeur de `LandlordSignatory` qui entre dans les enregistrements, et elle est inchangée.
Le PDF n'est pas comparé octet à octet : il est figé à la demande de signature, hors de cette classe.
Seul cas qui change : l'agent créateur en poste dont le rôle personnalisé n'a pas `leases.sign`.

**Chaque porte fermée tient seule** (tests `test_porte_fermee_*`, agent créateur parti), ablation par
porte, une à la fois :

| Porte | Garde retirée | Résultat |
|---|---|---|
| envoi du code + signature | `LeasePolicy::sign` seule | vert : `assertSigner` tient encore (deux verrous) |
| envoi du code + signature | `assertSigner` seule | vert : la policy tient encore |
| envoi du code + signature | les deux | `porte fermee l envoi du code` et `la signature` rouges |
| `rolesFor` (`can_sign_as`) | le prédicat bailleur | `porte fermee roles for` rouge |
| voie papier (`signOnPaper`) | le prédicat bailleur | `porte fermee la voie papier` rouge |
| voie papier (`ActivateLeaseRequest`) | le prédicat bailleur seul | vert : `LeasePolicy::update` refuse déjà l'agent parti |
| état des lieux (`InventorySignatureService::canSignAs`) | le prédicat bailleur | `porte fermee la signature d etat des lieux` rouge |

La porte de l'état des lieux n'a QUE ce prédicat : avant le correctif, l'agent créateur parti y
signait aussi l'état des lieux au nom du bailleur.

**Inventaire des autres comparaisons brutes à `landlord_id`** (`grep -rn landlord_id app`, relevé le
2026-11-14, NON corrigées ici, ticket à part) :

- `DocumentPdfController::mayReadReceipts` — `$lease->landlord_id === $user->id` ouvre la quittance
  PDF (`GET /api/leases/{id}/receipts/{payment}/pdf`) et la liste du coffre (`DocumentVault`, l.423).
  Même cause que la fuite corrigée : l'agent créateur parti y garde très probablement accès. Non mesuré.
- `PayoutPolicy::view` (l.40) et `PayoutController::index` (l.34) — le bénéficiaire du versement lit
  son versement. `landlord_id` y est le bénéficiaire, pas le désigné du bien : légitime en principe,
  à confirmer pour un versement d'un bail saisi par un agent.
- `LeaseResource` (l.257) — le téléphone du bailleur rendu au « bailleur » brut ; derrière `view`,
  donc fermé par la policy.
- `MarkLateFeePaidRequest` (l.49), `MarkPaidLeasePaymentRequest` (l.59) — seulement pour un bail SANS
  agence : la comparaison brute y est la bonne règle.
- Le reste (`OwnerStatement*`, `OwnerDirectory`, `OwnerDeparture`, `PayoutService`, `PaymentHistory`,
  `AccountDeletionService`, `ReviewEligibility`, `PropertyOwnerTransfer`, rapports) filtre par un
  bailleur déjà résolu, pas par l'utilisateur de la requête.

**Le choix des gestes : aucun bloc.** `LeaseResource` ne rend plus `tenant` sans une décision du
contrôleur (`avecLocataire`). Il n'y a plus de repli `whenLoaded` : l'état de la relation, chargée
par la policy ou un service, ne décide plus rien. Seules la fiche (TCK-2780) et la liste décident.
Les onze gestes ne rendent jamais le bloc, et leurs `load('tenant')` sont retirés. Aucun appelant
front ne lit `tenant` dans la réponse d'un geste : tous relisent par invalidation.

| Geste | Appelant front | Ce qu'il lit de la réponse |
|---|---|---|
| `POST /api/leases` | `CreateLeaseForm` (`useCreateLease`) | `data.id` |
| `PATCH /api/leases/{id}` | aucun appelant | — |
| `POST …/activate` | `LeaseSignaturePanel` (`useActivateLease`) | rien |
| `POST …/terminate` | aucun appelant | — |
| `POST/DELETE …/early-termination` | `EarlyTerminationDialog`, `EarlyTerminationBanner` | rien |
| `POST …/early-termination/confirm` | aucun appelant (job quotidien) | — |
| `POST …/signature-request` | `LeaseSignaturePanel`, `GesteDuBail`, `CreateLeaseForm` | rien |
| `POST …/signature` | `LeaseSignaturePanel` (`useSignLease`) | `data.status` |
| `POST …/renew` | `LeaseRenewalDialog` | `data.id` |
| `PATCH …/rent` | `FeuilleDeRevision` | rien |
| `POST …/deposit-refund` | `DepositRefundModal` | rien |

**La liste.** `tenant` sort du `with()`. Spatie le charge sous `include=tenant` (`$requestLoadable`),
et toujours entier : il chercherait `fields[tenants]`. `index()` rend chaque ligne par
`LeaseResource::make()->avecLocataire($inclus, champsDemandesDuBloc())->resolve()`, la lecture de la
fiche. `resolve()` et non `toArray()` : c'est ce que fait `ResourceCollection::toArray`, et il retire
les `MissingValue`. Pas de N+1 : le nombre de requêtes est le même à 3 et à 9 baux, pour le bailleur
et pour le personnel.

**Appelants front de `GET /api/leases`.**

| Appelant | Lit du locataire | Requête |
|---|---|---|
| `useBauxDeLAgence` (file et table de l'agence : `useLectureDuBail`, `GesteDuBail`) | `first_name`, `last_name`, `phone` | `fields[customers]=` `CHAMPS_DU_LOCATAIRE_DE_L_AGENCE` (id, first_name, last_name, phone) |
| `useBauxDuLecteur` (bailleur, locataire) | `first_name`, `last_name` | `fields[customers]=` `CHAMPS_DU_LOCATAIRE_DU_LECTEUR` |
| `useBauxAInventorier` (`InventoryLeasePicker`) | `first_name`, `last_name` | déjà `fields[customers]=id,first_name,last_name`, il borne désormais |
| `useLeases`, `useAllOngoingLeases` (signalement, lancement d'intervention), `agent-crm`, `useActiveLeaseSummaries`, le layout et la page du bail | rien | inchangés, sans `tenant` |

`BailDeLaListe.tenant.locale` est retiré du type : aucun lecteur. Garde du front :
`liste-des-baux-locataire.tck-2803.test.ts` refuse toute lecture de la liste qui demande `tenant` sans
`fields[customers]`, et vérifie que `index()` appelle encore `champsDemandesDuBloc`.

**Ablations** (une à la fois, fichier restauré et md5 vérifié) :

- a1 — liste : `$avecLocataire = true` (le locataire rendu d'office) : AC2 rouge.
- a2 — liste : `$champs = null` (bloc non borné) : AC3 et « aucun droit » rouges.
- a3 — `LeaseResource` : repli `whenLoaded` sans décision du contrôleur : AC5 rouge, sur
  `POST signature-request` et `POST signature` (`forViewer`, donc `rolesFor`, charge la relation).
- a4 (sonde, pas un mutant tué) — `load('tenant')` remis dans `PATCH …/rent` : reste VERT. C'est
  voulu : la ressource ne lit plus l'état de la relation, ce qui ferme aussi les quatre gestes où la
  policy ou un service chargent `tenant`. AC7 (« `load('tenant')` remis rend AC5 rouge ») supposait
  un repli `whenLoaded` : sa troisième clause n'est pas tenue à la lettre, par décision. a3 et a6
  sont les ablations qui tuent la garde réelle.
- a5 — `LandlordSignatory::isLandlord` revenu à la comparaison brute : les deux tests AC1 rouges.
- a6 — `LeaseResource` rend `tenant` toujours : AC5 rouge sur les DOUZE routes, nommées une à une
  (chaque vérification de geste sait rougir).
- f1 — `useBauxDuLecteur` sans `fields[customers]` : la garde du front rouge.

**Écart à AC5.** Les quatre gestes qui dépendaient de l'état de la relation (`update`, `activate`,
`terminate`, `deposit-refund`) sont refusés au locataire. Le test les joue donc avec le bailleur. Le
locataire joue les gestes qu'il peut poser (préavis, annulation, signature).
