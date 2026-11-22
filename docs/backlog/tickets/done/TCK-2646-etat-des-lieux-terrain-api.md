---
id: TCK-2646
title: "État des lieux de terrain côté API : signature du locataire sur place par code SMS, pièces proposées par type de bien, sortie préremplie par l'entrée, retenues, contestation réservée aux parties"
status: done
phase: P1
family: back
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2647, TCK-2648]
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#24-inventory-"
    - "docs/models-spec.md#82-leasesignature-"
tags: [back, inventory, signature, sms, audit-ux, app]
---

## Objectif utilisateur

L'agent fait l'état des lieux debout dans le logement : il part d'une liste de pièces et d'éléments proposée pour ce type de bien, et sa sortie reprend l'entrée élément par élément, avec les retenues sur caution. Le locataire signe sur le téléphone de l'agent, authentifié par un code reçu par SMS. Ainsi la remise des clés a sa preuve.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- **Pièces** :
  - elles vivent dans une colonne JSON `rooms` (`name`, `condition`, `notes`, `elements[]` avec `label`, `state` et `notes`) ;
  - `InventoryElementState` : `bon`, `usé`, `endommagé`, `manquant` ;
  - **aucun modèle** de pièces ni d'éléments. Le formulaire part de `rooms: []` ;
  - `POST /inventories` exige au moins une pièce ;
  - `PATCH` remplace tout `rooms`, sur un brouillon seulement.
- **Photos** : par pièce seulement (`POST …/room-photos`, `room_name`).
- **Signature** :
  - `POST inventories/{id}/sign` avec `role` et un tracé ;
  - `can_sign_as` (`InventorySignatureService::canSignAs`) donne le rôle locataire **au seul compte du locataire** ;
  - **aucun code à usage unique** pour l'état des lieux.
  - Le code du bail existe : `LeaseSignatureOtpService` (6 chiffres, 10 min, 60 s avant renvoi, 5 essais puis verrou de 15 min), par SMS sur le numéro vérifié, sinon par e-mail.
- **Sortie** : elle n'est pas préremplie depuis l'entrée. Aucune comparaison, aucun lien avec la restitution de caution : `RefundDepositRequest` ne prend pas d'état des lieux.
- **Contestation** : `DisputeInventoryRequest::authorize` n'exige que `view`. Le personnel de l'agence et celui qui a conduit l'état des lieux peuvent donc contester.

**À servir** (consommé par TCK-2647 et TCK-2648) :

- **Pièces proposées** : `GET /api/inventory-templates?property_id=` (ou `?property_type=`) rend le modèle Takussan pour ce type de bien. Le modèle est une liste de pièces, chacune avec ses éléments proposés.
- **Sortie préremplie** :
  - `POST /api/inventories` avec `type=move_out` copie, par défaut, les pièces et les éléments de la **dernière entrée signée du même bail** (ou de `from_inventory_id`) ;
  - chaque élément y porte `entry_state`, `entry_notes`, et la vignette d'entrée de sa pièce ou de l'élément.
- **Photo d'un élément** : `POST …/room-photos` accepte en plus `element_label`, gardé en propriété du média et rendu par la ressource.
- **Retenues** :
  - un élément de sortie peut porter `retention_amount` (décimal XOF) et `retention_reason` ;
  - la ressource rend `retention_total` ;
  - `GET /api/leases/{lease}/deposit-refund` rend `proposed_retention`, lu sur la dernière sortie signée.
- **Signature sur place** :
  - `POST /api/inventories/{id}/sign/onsite-code` envoie un code par SMS au **numéro vérifié du compte** du locataire du bail (le compte relié au `Customer`), jamais au téléphone de la fiche `Customer`, que l'agence saisit elle-même ([ADR-0098](../../../adr/0098-le-locataire-signe-l-etat-des-lieux-sur-place-par-code-sms.md) § 2) ;
  - `POST /api/inventories/{id}/sign` accepte, pour `role=tenant` signé par un membre du personnel, le champ `code`. La preuve garde `tenant_signature_method=onsite_otp`, `tenant_signed_via_user_id`, le canal, le numéro masqué, l'IP et l'heure ;
  - `can_sign_as` rend `tenant_onsite` au personnel habilité tant que le locataire n'a pas signé.

## Contraintes strictes (métier)

- **Signature sur place** ([décision 7 du porteur](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10), [ADR-0098](../../../adr/0098-le-locataire-signe-l-etat-des-lieux-sur-place-par-code-sms.md)) :
  - elle **amende §1.9**, « chacune […] pour elle-même seulement », pour le seul locataire, et seulement avec le code ;
  - **qui peut la lancer** : le personnel qui peut `update` l'état des lieux dans l'agence du bail. Jamais un collaborateur du bien qui n'est pas du personnel ;
  - **le code** :
    - **le même service** que le bail (`LeaseSignatureOtpService` généralisé, ou un service commun extrait), avec les mêmes bornes : 6 chiffres, 10 min, 60 s avant renvoi, 5 essais puis verrou de 15 min ;
    - **par SMS seulement**, sans repli par e-mail : le locataire est devant l'agent ;
    - envoyé au **numéro vérifié du compte** du locataire (ADR-0098 § 2) — le téléphone de la fiche `Customer` n'est **pas** une destination : l'agence le saisit, elle pourrait y mettre le sien ;
  - **erreurs** :
    - pas de compte locataire, ou compte sans numéro vérifié : 422 `inventory_signature.tenant_without_phone` ;
    - mauvais code : 422 sur `code` ;
    - verrou : **423**, comme le bail (ADR-0098 § 4) (`lease_signature.code_locked` côté bail) ; un renvoi avant 60 s rend 429, comme `lease_signature.resend_too_soon` ;
    - locataire qui a déjà signé : 409 ;
  - **le chemin existant ne change pas** : le locataire signe depuis son compte, sans code ;
  - l'empreinte et le gel à la seconde signature ne changent pas. Le PDF dit « Signé sur place, code envoyé au +221 ••• ».
- **Signature du bailleur** : la règle `LandlordSignatory` est inchangée (le bailleur, ou le personnel mandaté qui détient `leases.sign`, pour son compte).
- **Modèles** ([décision famille 4 n° 7a](../../../qa/audit-ux-2026-11/04-patrimoine-et-location.md)) :
  - un modèle Takussan par type de bien (studio, F2, F3, F4 et plus, villa, local commercial, bureau), défini en code et listé dans la spec (cf. `spec-delta.md`) ;
  - un type sans modèle rend un modèle générique ;
  - **le modèle propose, il n'impose rien** : pièces et éléments restent libres, ajoutés ou retirés ;
  - les bornes actuelles tiennent : au plus 20 pièces × 20 éléments.
- **Éléments** : l'énumération `InventoryElementState` est inchangée (quatre valeurs).
- **Sortie** :
  - la copie de l'entrée se fait à la création seulement ;
  - les états d'entrée sont **en lecture** : `entry_state` ne se modifie pas par `PATCH`, et la règle est vérifiée ;
  - sans entrée signée, la sortie démarre comme aujourd'hui.
- **Retenues** :
  - une retenue n'est qu'**une proposition**, ce n'est pas un débit : la restitution reste le geste existant, bornée par la caution encaissée (TCK-2375) ;
  - `retention_amount` ≥ 0, sur une sortie seulement.
- **Contestation** : seuls le locataire (le compte du `Customer` du bail) et le bailleur du bail contestent. Le personnel et celui qui a conduit l'état des lieux reçoivent 403. C'est un amendement de §1.9, cf. `spec-delta.md`.

## Delta à produire

- [ ] Migration `add_onsite_signature_columns_to_inventories` : `tenant_signature_method`, `tenant_signed_via_user_id`, `tenant_otp_channel`.
- [ ] Service commun de code à usage unique : extraire de `LeaseSignatureOtpService`, avec une portée (bail ou état des lieux) et un rôle. Le bail garde son comportement.
- [ ] Route `POST inventories/{inventory}/sign/onsite-code` → `InventoryController@sendOnsiteCode`, et `SignInventoryRequest` élargie (`code`).
- [ ] `InventorySignatureService` : chemin `onsite_otp`, preuve, `can_sign_as.tenant_onsite`. Mention dans le PDF.
- [ ] Modèles : `config/inventory_templates.php` (ou une classe), route `GET /api/inventory-templates` → `InventoryTemplateController`.
- [ ] `InventoryService::create` : copie de l'entrée pour une sortie. `entry_state` protégé.
- [ ] `element_label` sur les photos. `retention_amount`, `retention_reason` et `retention_total`. `proposed_retention` sur la restitution.
- [ ] `DisputeInventoryRequest::authorize` restreint aux deux parties.
- [ ] Tests :
  - `InventoryOnsiteSignatureTest` : code envoyé au numéro vérifié du compte du locataire (et pas au téléphone de la fiche `Customer` quand les deux diffèrent), compte sans numéro vérifié 422, bon code, mauvais code, verrou après 5 essais, personnel non habilité 403, locataire déjà signé 409, preuve enregistrée ;
  - `InventoryTenantOwnSignatureUnchangedTest` ;
  - `InventoryTemplateTest` ;
  - `InventoryExitPrefillTest` ;
  - `InventoryRetentionTest` ;
  - `InventoryElementPhotoTest` ;
  - `InventoryDisputeAuthorizationTest`.

## Critères d'acceptation

- [ ] AC1 — Un agent de l'agence demande le code : le pilote SMS de test reçoit un message au numéro vérifié du compte du locataire — et aucun au téléphone de la fiche `Customer`, posé différent pour le test. `POST …/sign` avec `role=tenant`, le tracé et ce code rend 200, et la preuve porte `onsite_otp` et l'identifiant de l'agent.
- [ ] AC2 — Cinq mauvais codes, puis le bon : 423. Après le délai de verrou, le bon code passe.
- [ ] AC3 — Un collaborateur du bien qui n'est pas du personnel de l'agence reçoit 403 sur `…/sign/onsite-code`.
- [ ] AC4 — Le locataire connecté signe toujours sans code. Le test existant de ce chemin passe inchangé.
- [ ] AC5 — `GET /api/inventory-templates?property_id={F3}` rend au moins Séjour, Chambre 1, Chambre 2, Cuisine, Salle d'eau et WC, chacun avec ses éléments.
- [ ] AC6 — Une sortie créée sur un bail dont l'entrée est signée reprend ses pièces et ses éléments, avec `entry_state`. Un `PATCH` qui modifie `entry_state` le laisse inchangé.
- [ ] AC7 — Deux retenues de 35 000 F et 50 000 F sur une sortie signée donnent `retention_total=85000` et `proposed_retention=85000` sur la restitution du bail.
- [ ] AC8 — `POST …/dispute` : 403 pour l'admin de l'agence ; 200 pour le locataire et pour le bailleur.

## Hors périmètre

- Les écrans (TCK-2647, TCK-2648).
- **La modification des modèles par l'agence** (décision 7a, second volet) : elle demande un écran à maquetter d'abord. Ticket à écrire après maquette (cf. RAPPORT).
- La comparaison automatique par IA (§1.9, P3), et la note vocale.
- La signature sur place du bail (§1.4) : l'ADR la cite comme extension possible, sans l'ouvrir.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**2026-11-11 — implémentation (back-patrimoine-2).**

- **Code commun** : `App\Services\Signature\SignatureOtpService` (portée `Lease|Inventory`), extrait de
  `LeaseSignatureOtpService`, qui en hérite sans rien redéfinir. Les clés du bail restent octet pour octet
  `lease-signature-{kind}:{bail}:{user}:{role}` (`LeaseSignatureTest` et `OtpLateFailureResendTest` verts sans
  modification) ; l'état des lieux a les siennes, `inventory-signature-…`. L'empreinte que le code atteste : le
  contrat figé pour le bail ; pour l'état des lieux, état général, pièces, notes et identifiants des photos de pièces
  (un brouillon modifié entre l'envoi et la saisie invalide le code).
- **Le code, son verrou et son délai de renvoi sont ceux du LOCATAIRE** (son compte) sur cet état des lieux, jamais
  du membre du personnel : un second agent ne rouvre pas cinq essais.
- **Qui lance la voie** : `InventorySignatureService::canSignOnsite` — personnel de l'agence DU BAIL
  (`MembershipCapabilityResolver::isStaffAt`) ET `InventoryPolicy::update` appelée en direct (hors `Gate::before`).
  Le locataire lui-même, le bailleur, un collaborateur, le personnel d'une autre agence, le super-admin : 403. Ordre
  sur `…/sign` : 409 (non signable) → 403 → 409 (déjà signé) → code ; un appel refusé ne consomme aucun essai.
- **Le personnel qui poste `role=tenant` sans code reçoit 422 sur `code`** (`inventory_signature.code_required`) ;
  un code faux ou expiré, 422 sur `code` (`inventory_signature.invalid_code`, en erreur de validation) ; le
  verrou 423 `inventory_signature.code_locked` ; le renvoi précoce 429 `inventory_signature.resend_too_soon` ; le
  SMS qui n'est pas parti 503 `inventory_signature.sms_not_sent`.
- **La notification** est `LeaseSignatureCodeNotification` avec un texte d'état des lieux
  (`TEXTS_INVENTORY`, SMS seulement) : une seconde classe aurait dû entrer dans les trois listes fermées qui gardent
  celle-ci (hors préférences, synchrone, compte non joignable).
- **`OtpPreview`** enregistre aussi ce code (hors production, drapeau allumé, comme tout code SMS) : en préproduction,
  le code revient donc à l'appareil de l'agent — c'est l'outil de recette, jamais la production (P71.02).
- **Colonnes** : en plus des trois du ticket, `tenant_otp_destination` (numéro masqué, imprimé par le PDF),
  `tenant_signed_ip` (caché) et `entry_inventory_id` (l'entrée reprise par une sortie). Les états des lieux déjà
  signés par le locataire reçoivent `tenant_signature_method = drawn`.
- **Route de signature** : `throttle:lease-signature` posé sur `POST inventories/{id}/sign` (limiteur partagé avec la
  saisie du code du bail, ADR-0098 §4) ; `throttle:lease-signature-code` sur `…/sign/onsite-code`.
- **Modèles** : `App\Domain\Inventory\InventoryTemplates` (clés en code, noms dans
  `lang/*/inventory_templates.php`, wolof = français) ; complété pour le F4 et plus et le générique — le contenu
  est à reporter dans `docs/features.md` §1.9 par `/sync-specs` (cf. « Pour /sync-specs » ci-dessous). `GET /api/inventory-templates` rend `key`, `property_type` et `rooms[]` (`key`, `name`,
  `elements[]` : `key`, `label`) dans la langue de la requête. `property_id` lisible (`view`) sinon 403, ou
  `property_type` (+ `bedrooms`) ; les deux, ou une liste, 422.
- **Sortie** : `entry_state`, `entry_notes` et `entry_photo_id` sont reposés par le serveur à chaque écriture des
  pièces (création et `PATCH`), par correspondance nom de pièce + libellé d'élément avec l'entrée reprise
  (`entry_inventory_id`) ; la
  validation les retire de ce que le client envoie. `show` rend `entry_thumbnail_url` (URL signée de la `preview`,
  à défaut l'original), résolue à la lecture. Une sortie sans pièces reprend celles de l'entrée (état d'entrée comme
  état de départ, sans notes) et son état général ; sans entrée signée, 422 sur `rooms` et `general_condition`.
- **Retenues** : `retention_total` (nul pour une entrée) ; `GET /api/leases/{id}/deposit-refund` rend
  `proposed_retention` et `proposed_retention_inventory_id`, lus sur la dernière sortie au statut `signed` (une sortie
  contestée ne propose rien). Le PDF n'imprime pas encore les retenues ni les états d'entrée.
- **Arbitrages de la session (team-lead, 2026-11-11), pour le porteur** :
  1. modèles : clés stables en code, noms rendus dans la langue de la requête (wo = fr) ;
  2. **la sortie reprend une entrée signée du bail OU d'un bail qu'il renouvelle** (`renewed_from_lease_id`, au même
     locataire et au même bien — au-delà, c'est une autre occupation) : un renouvellement ne refait pas d'entrée,
     et exclure la chaîne rendait impossible la sortie d'un bail renouvelé. Défaut : la plus récente entrée signée
     de la chaîne ; hors chaîne, 422 sur `from_inventory_id` ;
  3. **contestation** : le locataire et le bailleur du bail seulement ; le bailleur qui a conduit l'état des lieux
     lui-même le conteste comme partie ; le personnel (admin compris), le conducteur du personnel et le
     super-admin reçoivent 403.
- **Contestation** : `InventoryPolicy::dispute`, jugée en direct par `DisputeInventoryRequest::authorize` — le
  locataire de l'état des lieux (`tenant_id`, recopié du bail) et `leases.landlord_id` ; le bailleur qui l'a conduit
  lui-même reste partie.


**2026-11-11 — reprise après le plantage de la machine (reprise-2646).** Le code de back-patrimoine-2 était dans
l'arbre, non commité ; son rapport et ses sauvegardes d'ablation étaient perdus.

- **Aucune ablation restée en place** : les 8 classes (7 neuves + `InventorySignatureTest`) jouées d'un coup au
  premier plan, **100 verts (617 assertions)** avant toute modification.
- **Arbitrage 2 vérifié** : `InventoryExitPrefill::entryFor()` / `tenancyChain()` — même bail, ancêtres par
  `renewed_from_lease_id` au même locataire ET au même bien, défaut = la plus récente entrée signée de la chaîne,
  hors chaîne 422 sur `from_inventory_id`. Testés : même bail, ancêtre (deux renouvellements), autre locataire, bail
  étranger. **Ajouté** : `test_un_ancetre_d_un_autre_bien_n_est_pas_repris` — sans lui, retirer la condition « même
  bien » restait vert.
- **Ablations rejouées** (une à une, premier plan, `--filter`, restauration par `cp` + `md5`) — toutes rouges :
  marche de la chaîne (`$parentId = null`), condition « même bien », condition « même locataire », filtre de chaîne
  sur `from_inventory_id` (bail étranger), contestation jugée par `view` (admin d'agence 200), contestation par
  `can('dispute')` (super-admin 200 par `Gate::before`), `isStaffAt` retiré (le bailleur lance la voie : 202),
  garde entière de `canSignOnsite` (AC3, 4 collaborateurs : 202), verrou des 5 essais (AC2 : 422 au lieu de 423),
  `phone_verified_at` (compte non vérifié : 202), `attach()` au `PATCH` (AC6).
  ⚠ Retirer seulement `isStaffAt` laisse AC3 vert : un collaborateur n'a pas `update` (double garde) ; c'est le
  test « ni le bailleur ni le super-admin… » qui tient `isStaffAt`.
- **AC4** : le test du locataire qui signe depuis son compte est inchangé ; **une** assertion de
  `InventorySignatureTest` change (`test_show_exposes_can_sign_as_for_the_viewer` : le personnel reçoit
  `['landlord', 'tenant_onsite']`) — c'est le nouveau contrat, pas le chemin du locataire.
- **Specs** : le Delta ne demande aucune édition de spec ; les hunks posés dans `docs/features.md` et
  `docs/models-spec.md` sont retirés (fichiers revenus à `HEAD`) et reportés ci-dessous. ⚠ `HEAD` dit encore
  « F4 et plus : contenu à fixer par TCK-2646 » et « générique : à fixer par TCK-2646 ».
- **Migration** `2026_11_11_170100` jouée vers le haut sur la base de démo (`php artisan migrate`, seule en
  attente) : sans elle, `POST /api/inventories` de l'API locale échouait sur `entry_inventory_id`. `down()` relu
  (index, deux FK nommées, six colonnes), pas d'aller-retour.
- Gardes : `pint --test` vert ; `RessourceUniqueResolueTest`, `ExistsSurTableASuppressionDouceTest`,
  `AgencyIdIsIndexedTest` verts ; gardes racine : rouges seulement les 5 des maquettes et `check-design-sync-entry`
  (primitives `panneau-droit`/`radio-group` de TCK-2690, front). Aucun `->event()` neuf, aucun `NotificationCode`
  neuf. **Non joués (CI)** : `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`,
  `DateInventoryByValueTest`, `LangGroupParity` — route GET neuve `inventory-templates` (sans paramètre d'URL,
  422 sans `property_id`) et clés de ressource neuves.
- **Reste** : le PDF n'imprime ni les retenues ni les états d'entrée d'une sortie ; les libellés front des codes
  `inventory_signature.*` relèvent de TCK-2648.

**Pour /sync-specs** (contenu retiré des specs, à y reporter après fusion) :

- `docs/features.md` §1.9, « Modèles de pièces (TCK-2646) » : défini en code (`App\Domain\Inventory\InventoryTemplates`,
  servi par `GET /api/inventory-templates`), noms dans `lang/*/inventory_templates.php` ; **studio** (et chambre,
  appartement sans chambre) : pièce principale, coin cuisine, salle d'eau ; **F2** (1 chambre) : séjour, chambre 1,
  cuisine, salle d'eau, WC ; **F3** (2 chambres) : séjour, chambre 1, chambre 2, cuisine, salle d'eau, WC ; **F4 et
  plus** (3 chambres et plus) : séjour, chambres 1 à N (N = chambres du bien, 3 au moins, 8 au plus), cuisine, salle
  de bain, salle d'eau, WC ; **villa** : séjour, salle à manger, chambres 1 à N (4 au moins, 8 au plus), cuisine,
  salles d'eau 1 et 2, terrasse, cour ; **local commercial, bureau** : espace principal, réserve, sanitaires —
  l'espace principal d'un local propose vitrine et rideau métallique, celui d'un bureau prises réseau et
  climatisation ; **générique** (tout autre type, ou appartement au nombre de chambres inconnu) : pièce principale,
  cuisine, salle d'eau, WC. Éléments par défaut : murs, sol, plafond, porte, fenêtres, prises, interrupteurs,
  éclairage ; la chambre ajoute un placard ; la cuisine évier, plan de travail, robinetterie, plaques de cuisson et
  placards ; la salle d'eau (et la salle de bain) douche ou baignoire, lavabo, robinetterie et joints ; WC, réserve,
  sanitaires, terrasse et cour ne proposent que ce qui s'y trouve. Chaque modèle tient dans 20 pièces × 20 éléments.
- `docs/models-spec.md` §2.4 `inventories` : `rooms` — pour une sortie, chaque élément porte `entry_state`,
  `entry_notes` et `entry_photo_id` (photo de l'entrée : celle de l'élément, sinon de sa pièce — rendue en
  `entry_thumbnail_url` signée par `show`), **reposés par le serveur depuis l'entrée à chaque écriture** (pas
  seulement à la création) ; colonnes neuves `tenant_otp_destination` string(120) (numéro masqué, imprimé par le
  PDF), `tenant_signed_ip` string(45) (cachée, `$hidden`), `entry_inventory_id` FK inventories
  (`inventories_entry_inventory_fk`, `nullOnDelete`, indexée) — l'entrée reprise, d'un bail de la chaîne de
  renouvellement ; relation `entryInventory()` → belongsTo Inventory.
