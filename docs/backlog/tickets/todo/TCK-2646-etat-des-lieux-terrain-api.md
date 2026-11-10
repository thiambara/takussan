---
id: TCK-2646
title: "État des lieux de terrain côté API : signature du locataire sur place par code SMS, pièces proposées par type de bien, sortie préremplie par l'entrée, retenues, contestation réservée aux parties"
status: todo
phase: P1
family: back
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
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
