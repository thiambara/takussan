# ADR-0098 — Le locataire peut signer l'état des lieux sur le téléphone de l'agent, par un code SMS envoyé à son numéro vérifié

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 7 (a) : *sur le téléphone de l'agent, avec un code SMS*) — modalités : décisions de la session, à revoir
- **Date** : 2026-11-10
- **Tickets** : TCK-2646 (API), TCK-2648 (écran des signatures)
- **Prolonge** : [ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md) (signature du bail par code à usage unique), **sans en changer la règle pour le bail**
- **Amende** : `docs/features.md` § 1.9 (« chaque partie signe […] pour elle-même seulement »), pour le seul locataire et seulement avec le code

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **L'état des lieux se signe par un tracé.** Chaque partie signe pour elle-même (§ 1.9). `InventorySignatureService::canSignAs` ne donne le rôle locataire **qu'au compte du locataire**. L'agent qui fait l'entrée avec le locataire, pièce par pièce, ne peut donc pas recueillir sa signature sur place : le locataire doit rentrer chez lui, se connecter et signer. C'est le cas d'usage du terrain (audit famille 4, § 5).
- **Le bail a déjà une signature par code** ([ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md) § 2, `LeaseSignatureOtpService`). Le code a six chiffres et vaut 10 minutes. Le renvoi est espacé de 60 s. Cinq essais faux verrouillent pendant 15 minutes. Le canal est le SMS au numéro vérifié, sinon l'e-mail.
- `LandlordSignatory` permet au personnel qui détient `leases.sign` de signer **pour le bailleur**, pour le bail comme pour l'état des lieux. Personne ne signe pour le locataire.
- **Un numéro non vérifié ne prouve rien** ([ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) § 3). Le téléphone d'une fiche client (`Customer`) est saisi par l'agence elle-même.

## Décision

**Le personnel de l'agence du bail peut recueillir la signature du locataire sur son propre appareil. Le locataire trace sa signature, puis saisit le code reçu par SMS au numéro vérifié de son compte. Sans ce numéro, la voie sur place n'est pas offerte.**

1. **Qui lance la voie.** Le personnel qui peut `update` l'état des lieux dans l'agence du bail. Jamais un collaborateur du bien qui n'est pas du personnel ([ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md)).
2. **Où part le code : au numéro vérifié du compte du locataire du bail, et à lui seul.**
   - Pas au téléphone de la fiche client tant qu'il n'est pas celui d'un compte vérifié. L'agence saisit ce numéro elle-même : y envoyer le code reviendrait à laisser l'agent choisir le téléphone qui « prouve » la présence du locataire.
   - Sans numéro vérifié : 422 `inventory_signature.tenant_without_phone`. Le locataire signe alors depuis son compte, comme aujourd'hui.
3. **SMS seulement, sans repli par e-mail.** Le code prouve que le titulaire du numéro est **devant** l'agent. Un e-mail se lit de n'importe où.
4. **Un seul service de code.**
   - Le service du bail est généralisé. Sa portée est un bail ou un état des lieux, avec un rôle. Il garde **les mêmes bornes** que le bail : six chiffres, 10 minutes, 60 s avant renvoi, cinq essais puis verrou de 15 minutes, compteur non remis à zéro par un renvoi, code consommé. Il garde aussi le même limiteur par utilisateur et la même borne du canal SMS.
   - Les codes de réponse du verrou et du code faux sont ceux du bail ([ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md) § 2). TCK-2646 les aligne : il écrit aujourd'hui 429 pour le verrou, là où le bail rend 423.
   - Le bail garde exactement son comportement : SMS sinon e-mail.
5. **La trace est gardée en colonnes**, pas seulement dans le journal :
   - `tenant_signature_method` (`drawn` ou `onsite_otp`) ;
   - `tenant_signed_via_user_id`, le membre du personnel ;
   - `tenant_otp_channel`.

   S'y ajoutent l'heure, l'IP et le numéro **masqué**. L'IP ne sort jamais de l'API (comme [ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md) § 3). Le PDF de l'état des lieux dit « Signé sur place, code envoyé au » suivi du numéro masqué.
6. **Ce qui ne change pas** :
   - le locataire connecté signe toujours depuis son compte, sans code ;
   - le bailleur et le personnel ne signent **jamais** pour le locataire autrement que par cette voie ;
   - un collaborateur ne signe jamais pour le bailleur. `LandlordSignatory` est inchangé ;
   - l'empreinte et le gel à la seconde signature ne changent pas.
7. **Contestation.** Elle est réservée aux deux parties : le locataire du bail et son bailleur. Le personnel, et celui qui a conduit l'état des lieux, ne contestent pas l'état des lieux qu'ils ont dressé. C'est aussi un amendement du § 1.9 (TCK-2646).

## Conséquences

- **Le SMS a un coût par envoi.** Le renvoi est borné par le service. Un état des lieux appelle au plus un code par tentative de signature.
- **Un locataire sans compte, ou sans numéro vérifié, ne signe pas sur place.** C'est le prix du § 2, et c'est voulu : un code envoyé à un numéro que l'agent a saisi ne prouverait rien. L'écran le dit et propose la voie du compte.
- `docs/models-spec.md` § 24 gagne trois colonnes. Le § 1.9 de `docs/features.md` est amendé deux fois : la signature sur place et la contestation.
- **Extension possible, non ouverte** : la même voie pour le bail (§ 1.4). Elle demanderait un amendement d'[ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md), puisque le bail admet l'e-mail.

## Options écartées

- **Le tracé seul, sur l'appareil de l'agent** : rien ne prouverait que le locataire a tracé lui-même. L'agent pourrait signer pour lui.
- **Le code au téléphone de la fiche client** : l'agence en est l'auteur (§ 2).
- **Un second service de code pour l'état des lieux** : deux jeux de bornes qui dériveront. Le bail en a déjà payé les corrections (VERIF-596).
- **Le repli par e-mail** : il ne prouve pas la présence (§ 3).

## Application

- Migration `add_onsite_signature_columns_to_inventories`. Le service commun de code est extrait de `LeaseSignatureOtpService`. Route `POST inventories/{inventory}/sign/onsite-code`. `SignInventoryRequest` gagne `code`. `can_sign_as` rend `tenant_onsite`.
- Gardes (TCK-2646) :
  - `InventoryOnsiteSignatureTest` : code au numéro vérifié du compte, bon code, code faux, verrou, personnel non habilité, locataire déjà signé, preuve ;
  - `InventoryTenantOwnSignatureUnchangedTest` ;
  - `InventoryDisputeAuthorizationTest` ;
  - un test qui vérifie que la fiche client sans compte vérifié rend 422, même avec un téléphone saisi.

## Amendement du 2026-11-15 (TCK-2913) — le bailleur signe aussi sur place par code ; le PDF part aux parties

Relevé sur la branche `feat/audit-manques-2026-11-15` le 2026-11-15 : la voie du code n'existait que pour
le locataire ; à la seconde signature, l'état des lieux passait `signed` sans que rien ne parte — le PDF ne
se rendait qu'à la demande (`GET inventories/{inventory}/pdf`). Audit `audit-f4-patrimoine.md`,
app-etats-des-lieux e2.

**A. La voie du code s'ouvre au bailleur, aux mêmes conditions que le locataire.**

1. **Qui la lance** : le même personnel qu'au § 1 (l'agence du bail, `update` sur l'état des lieux), par la
   même route `POST inventories/{inventory}/sign/onsite-code`, avec `party=landlord` dans le corps
   (`party` absent : `tenant`, l'appel d'avant cet amendement). Jamais le bailleur lui-même : il signe
   depuis son compte.
2. **Où part le code** : au numéro **vérifié** du compte du bailleur DU BAIL (`leases.landlord_id`), à lui
   seul, SMS seulement (§ 2 et § 3, inchangés). Sans ce numéro : 422 `inventory_signature.landlord_without_phone`.
3. **Mêmes bornes, même service** (§ 4) : six chiffres, 10 min, 60 s avant renvoi, cinq essais puis verrou
   de 15 min ; le code est celui DU BAILLEUR sur cet état des lieux
   (`inventory-signature-…:{état}:{compte du bailleur}:landlord`), distinct de celui du locataire.
4. **Ce qui distingue les deux voies du bailleur** : la présence du `code` dans `POST …/sign` avec
   `role=landlord`. Sans code, rien ne change : le bailleur signe pour lui, ou le personnel qui détient
   `leases.sign` signe **pour son compte** (`LandlordSignatory`, inchangé). Avec un code, le membre du
   personnel habilité recueille la signature **du bailleur** : elle est enregistrée comme la sienne
   (`owner_signed_by_user_id` = le bailleur, `owner_signed_on_behalf_of_user_id` nul).
5. **La trace, en colonnes** comme au § 5 : `owner_signature_method` (`drawn` | `onsite_otp`),
   `owner_signed_via_user_id`, `owner_otp_channel`, `owner_otp_destination` (masqué), `owner_signed_ip`
   (ne sort jamais de l'API). Le PDF dit « Signé sur place, code envoyé au … » sous la signature du bailleur.
   `can_sign_as` rend `landlord_onsite`.

**B. À la seconde signature, le PDF part aux deux parties.**

1. Une tâche en file (`SendSignedInventoryPdf`), mise en file **après** la transaction de la signature :
   la réponse de la signature n'attend rien.
2. **Une fois par état des lieux** : la tâche réclame l'envoi par `UPDATE … WHERE pdf_sent_at IS NULL` ;
   rejouée, elle ne renvoie rien. Mieux vaut un envoi perdu (le PDF reste téléchargeable) que deux.
3. **Destinataires** : le compte du locataire du bail et le bailleur du bail, dédoublonnés. Un locataire
   sans compte ne reçoit rien par cette voie (il n'a ni cloche ni page où lire le PDF) ; la ressource rend
   les destinataires réellement avisés (`pdf_sent_to`, un id et un nom).
4. **Un lien, pas une pièce jointe** — patron de `document.archive_ready` (TCK-2812) : la notification
   `inventory.signed_pdf_available` (cloche + e-mail) ouvre `/app/inventories/{id}`, où le PDF se
   télécharge sous la session. Deux raisons : les octets d'un PDF ne voyagent pas dans une charge de file
   (ni dans `failed_jobs`), et un lien vers l'API ne s'ouvre pas sans jeton (leçon de TCK-575). L'URL ne
   porte que l'identifiant de l'état des lieux. Le PDF servi est celui de l'empreinte figée : il imprime
   `traceability_hash` et l'instantané des parties pris à la seconde signature (TCK-596, TCK-1792).
5. **Sans canal mobile** : comme `lease.signature_completed`, l'avis n'a pas d'interrupteur (un acte
   contractuel) et n'ouvre ni SMS ni WhatsApp — un SMS par partie et par état des lieux aurait un coût sans
   rien porter que la cloche et l'e-mail ne portent.
6. **Le journal** de l'état des lieux porte l'événement `inventory_pdf_sent` (destinataires, date).
