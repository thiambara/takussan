# ADR-0042 — Un bail se signe par un code à usage unique sur un PDF figé et haché ; la preuve garde le signataire, l'empreinte, l'heure, l'IP et le canal ; `activate` devient la voie « papier »

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-596](../backlog/tickets/TCK-596-cycle-locatif-conge-annulation-signature-edl.md) (O17)
- **Précise** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (qui signe pour
  le bailleur, bailleur suspendu), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (notifications par
  code).

## Contexte

Mesuré sur la branche de TCK-596 après son §5 :

- `POST leases/{lease}/activate` → `LeaseService::activate` pose `active` et `signed_at = now()`, sur la
  seule autorité de `LeasePolicy::update`. **Aucune preuve de consentement** n'existe : ni de qui, ni de
  quoi, ni quand, ni d'où. Le locataire n'intervient pas.
- `activate` n'accepte que `draft`. Un renouvellement créé `pending_signature` (réglage
  `lease.require_signature`) n'a **aucun chemin** vers `active`.
- `leases.sign` (`Capability`) n'a pour lecteur que la signature d'état des lieux (§5 de TCK-596,
  `LandlordSignatory`).
- `Gate::before` accorde tout au super-admin : une policy seule le laisserait signer pour n'importe
  quelle partie.
- Transport d'un code : `PhoneVerificationService::sendSms` ne fait que journaliser ;
  `DeletionStepUpService` a choisi l'e-mail pour cette raison. Le canal SMS réel existe
  (`SmsChannel` → `SmsRouterDriver`), borné à 5 SMS par heure et par utilisateur, et il refuse tout
  numéro non vérifié (`phone_verified_at`).
- Le PDF du contrat (`pdf.leases.contract`) est **rendu à la volée** à chaque téléchargement, avec la
  date de génération dans son pied de page : deux rendus du même bail n'ont pas la même empreinte.

## Décision

**Un bail se signe sur un document figé : à la demande de signature, son PDF est rendu une fois,
stocké en privé et haché ; chaque partie signe CETTE empreinte par un code à usage unique ; la seconde
signature active le bail. `activate` ne reste que pour la signature hors plateforme, contrat numérisé
à l'appui.**

1. **L'objet signé.** `POST leases/{lease}/signature-request` (gestionnaire du bail) rend le PDF du
   contrat, le range dans la collection média privée `signed_contract` (un seul fichier), et pose
   `leases.contract_sha256` (SHA-256 des octets stockés) et `signature_requested_at`. Le bail passe
   `pending_signature`. Une signature lie **cette** empreinte (`document_sha256`) ; seules comptent
   celles dont l'empreinte est l'empreinte courante. Toute modification du bail en attente (colonne
   du contrat, garant attaché ou détaché) **défige** le contrat (`contract_sha256 = null`) : les
   signatures déjà posées cessent de compter, une nouvelle demande refige un nouveau PDF.
   **Le contrat imprime tout ce que le bail exécute** (amendé après VERIF-596, M2) : chaque colonne
   de `Lease::CONTRACT_PRINTED_TERMS` — dont la pénalité de retard (taux, délai de grâce), les
   conditions particulières, le préavis et l'indemnité de résiliation anticipée applicables — a sa
   ligne dans `pdf.leases.contract`, et un test rend la vraie vue terme par terme. Une fois le bail
   signé, ces termes ne se modifient plus par `PATCH` (422 `lease.terms_locked`) : la pénalité
   exécutée reste celle que les parties ont lue. Avant la signature, la modification défige.
   **Un terme lu dans un réglage global est figé sur le bail avec le contrat** (amendé après
   VERIF-596 passe 2, N1) : l'indemnité de départ anticipé (`lease.early_termination_penalty_months`)
   et le plafond de révision du loyer (`lease.rent_review_max_pct`) étaient imprimés (ou absents)
   au contrat, puis relus dans le réglage **au jour** de l'exécution — un réglage changé changeait
   l'indemnité de tous les baux signés. Les colonnes `leases.early_termination_penalty_months` et
   `leases.rent_review_max_pct` sont posées par la demande de signature et par la voie papier (la
   valeur négociée sur le bail, sinon le réglage du moment), imprimées, et lues par
   `EarlyTerminationService::computePenalty` et `RentReviewService` ; nulles (bail antérieur), le
   réglage s'applique. Elles suivent la règle des termes imprimés (`lease.terms_locked`).
   **Un renouvellement les hérite du parent** (amendé après VERIF-596 passe 3, N1') :
   `LeaseRenewalService::renew` les recopie comme les autres termes imprimés, sauf valeur renégociée
   dans le corps du renouvellement (`RenewLeaseRequest`, mêmes bornes que le `PATCH`). Un enfant né
   `active` sans signature exécute donc les termes signés sur le parent — et non le réglage du jour,
   ce qui n'est **pas** la sémantique d'un bail antérieur : le parent a une valeur figée et signée.
   Un enfant `pending_signature` hérite de la valeur, que sa demande de signature fige et imprime.
   Seul un parent antérieur (colonnes nulles) donne un enfant nul.
   **Un renouvellement qui change un terme signé est un avenant, et se signe** (amendé après VERIF-596
   passe 4, m-d, décision de session réversible, signalée au porteur) : si le parent est figé
   (`contract_sha256` posé, ou termes d'exécution figés) et que le renouvellement change un terme
   imprimé renégociable (loyer, caution, pénalités de retard, indemnité, plafond, clauses,
   conditions — `LeaseRenewalService::RENEGOTIABLE_SIGNED_TERMS`), l'enfant naît `pending_signature`
   quel que soit `lease.require_signature`, et ne s'exécute qu'une fois signé, par code ou sur papier.
   Sans cela, un renouvellement à J+1 à +50 % s'exécutait le lendemain sans le locataire, au-dessus du
   plafond que `force` ne passe plus. Un renouvellement sans changement de terme, ou d'un parent
   antérieur, suit le réglage comme avant.
   **Toutes les voies de résiliation lisent le terme figé** (amendé après VERIF-596 passe 4, M-T) : la
   résiliation anticipée formelle (`EarlyTerminationService`) comme la résiliation immédiate
   (`POST leases/{id}/terminate`, `LeaseService::terminate`) facturent
   `EarlyTerminationService::computePenalty` — le terme figé, borné aux mois restants ; le réglage
   seulement pour un bail antérieur. Un bail figé à 0 ne produit aucune ligne de pénalité. La
   résiliation immédiate facturait auparavant `min(mois restants, 3)` loyers en dur, quel que soit le
   contrat signé. Elle juge statut et indemnité sur la ligne verrouillée.
   **Le PDF figé est celui de la ligne verrouillée** (amendé après VERIF-596 passe 4, M-R) : le rendu
   reste hors verrou (en production, un aller-retour réseau), puis, sous le verrou et avant de figer,
   la ligne est comparée au rendu — termes imprimés (dont les deux termes d'exécution), parties,
   garants. Un écart rend 409 `lease_signature.terms_changed` ; rien n'est figé, aucun média n'est
   créé, et le client relance.
   `late_fees.cap_percent` n'est **pas** figé, délibérément : ce plafond ne peut que **baisser** la
   pénalité de retard imprimée, il ne joue jamais contre le locataire. **La dérogation
   `leases.rent_review_force` ne dépasse pas un plafond figé** (tranché après VERIF-596 passe 3, m-b,
   décision de session, réversible) : le contrat signé imprime « Variation de N % au plus » sans
   réserve, et la plateforme n'exécute pas une exception qu'aucune partie n'a lue. Au-dessus d'un
   plafond figé, la révision rend 422 `lease.rent_review_above_contract_cap`, même avec `force` et la
   capacité ; le dépassement d'un plafond contractuel passe par un renouvellement (qui peut le
   renégocier) ou un avenant signé. `force` ne vaut plus que pour un bail antérieur, dont la colonne
   est nulle et le plafond, le réglage global. L'autre voie — imprimer la réserve au contrat — a été
   écartée : elle aurait fait signer au locataire une clause que la plateforme seule déclenche.
   **Le contrat figé est une preuve** (amendé après la vérification adverse VERIF-596, B1) : aucune
   route générique ne le supprime — `DELETE /api/media/{id}` refuse la collection `signed_contract`
   (et les `room_photos` d'un état des lieux sorti du brouillon) **avant** la policy, super-admin
   compris (`media.evidence_locked`, 403). Et tout lecteur **ferme à l'échec** : un contrat figé
   introuvable, ou dont les octets n'ont plus l'empreinte enregistrée, n'est jamais remplacé par un
   rendu à la volée — téléchargement 409 et signature 409 (`lease_signature.contract_missing`).
2. **Le canal du code.** SMS si le signataire a un numéro **vérifié**, sinon e-mail (`users.email` est
   toujours renseigné). Code à 6 chiffres, valable 10 min, lié au bail, au signataire, au rôle et à
   l'empreinte ; renvoi espacé de 60 s ; **5 essais faux verrouillent** la signature de ce signataire
   sur ce bail pendant 15 min (aucun nouveau code pendant le verrou) — le compteur vit la durée du
   verrou et **un renvoi ne le remet pas à zéro** (amendé après VERIF-596, m1) ; le faux qui pose le
   verrou rend déjà 423 ; un code juste est **consommé**
   (un rejeu est refusé). La route d'envoi porte un limiteur par utilisateur (3/min, 10/h), en plus
   de la borne du canal SMS. Patron `DeletionStepUpService`, avec le compteur d'essais en plus.
3. **Ce qui est conservé** (`lease_signatures`) : bail, rôle (`tenant` | `landlord`), méthode (`otp` |
   `paper`), signataire, `on_behalf_of_user_id`, `document_sha256`, `signed_at`, adresse IP, agent
   utilisateur, canal du code et destination **masquée** ; pour `paper`, l'auteur de l'enregistrement.
   Unicité `(lease_id, role, document_sha256)`. L'IP et l'agent utilisateur ne sortent **jamais** de
   l'API : ce sont des pièces de preuve, pas des données d'écran.
4. **Pour le compte du bailleur** (option par défaut du ticket). Le bailleur signe lui-même s'il a un
   compte, sauf s'il est suspendu dans l'agence du bail (ADR-0031 §2). Sinon un membre du personnel
   de l'agence du bail titulaire de `leases.sign` **dans cette agence** signe pour son compte, au titre
   du mandat de gestion : `LandlordSignatory`, le prédicat déjà partagé avec l'état des lieux. Le
   service **revérifie** le signataire (locataire du bail, ou `LandlordSignatory::allows`) et répond
   403 sinon, super-admin compris. La mention « pour le compte de » est portée par la **preuve** et
   par l'écran ; elle n'est **pas** écrite dans le PDF signé, parce que l'écrire changerait l'empreinte
   que les deux parties ont signée.
5. **Le locataire sans compte** (option par défaut du ticket). La v1 exige un compte : la demande de
   signature est refusée (422) si le locataire du bail n'a pas de compte. La voie est alors la
   signature hors plateforme (§6).
6. **Le sort d'`activate`.** Elle devient la voie **papier** : contrat numérisé **obligatoire** (PDF ou
   image, 10 Mo), rangé dans `signed_contract`, haché, et une preuve `method = paper` par partie, avec
   l'auteur de l'enregistrement. Elle accepte `draft` **et** `pending_signature`. Elle émet toujours
   l'échéancier et `LeaseActivated`. Parce qu'elle enregistre une preuve **pour le bailleur**, elle
   exige le gestionnaire du bail **et** `LandlordSignatory::allows` — la règle de la voie par code
   (amendé après VERIF-596, M1 : un agent sans `leases.sign` activait le bail avec n'importe quelle
   image). Le super-admin n'a **pas** de voie papier. L'écran lit `can_activate_on_paper`.
7. **La sortie de l'impasse `pending_signature`.** Un renouvellement `pending_signature` atteint
   `active` par la demande de signature puis les deux codes, ou par la voie papier.
8. **L'activation à la seconde signature** se fait dans la transaction de cette signature, sous le
   verrou de la ligne du bail, une seule fois (relecture du statut sous verrou) : `active`,
   `signed_at`, échéancier après validation de la transaction, `LeaseActivated`.
9. **Notifications par code** : « bail à signer » à chaque partie à la demande ; « bail signé par X »
   à l'autre partie ; « bail signé » à toutes à l'activation.

## Conséquences

- `POST leases/{lease}/activate` sans fichier est refusé (422) : l'écran « Activer » du bail devient
  « Activer sur contrat papier » et demande le scan. Les appels de service (`LeaseService::activate`)
  restent possibles pour le code interne.
- Le PDF servi par `GET leases/{lease}/contract/pdf` est le PDF figé dès qu'il existe ; avant, il reste
  rendu à la volée (brouillon).
- Un bail modifié pendant l'attente doit être redemandé, et les deux parties re-signent : c'est voulu,
  ce qu'elles ont lu n'est plus ce qui serait exécuté.
- Un SMS refusé par la borne du canal (5/h) ne part pas, sans erreur pour l'appelant : le code reste
  valable, le renvoi suivant peut partir par le même canal une fois la fenêtre passée.
- Le locataire sans compte ne signe pas en ligne en v1.

## Application

- Migrations du 2026-10-08 : `create_lease_signatures_table`, `add_contract_signature_columns_to_leases`.
- `app/Models/LeaseSignature.php`, collection `signed_contract` de `Lease`.
- `app/Services/Lease/LeaseSignatureService.php`, `app/Services/Lease/LeaseSignatureOtpService.php`,
  `app/Services/Lease/LandlordSignatory.php`.
- `LeaseSignatureController`, `LeasePolicy::sign` / `requestSignature`, `LeaseController::activate`,
  `DocumentPdfController::leaseContract`.
- Tests : `LeaseSignatureTest` (parcours, verrou, rejeu, bail modifié, tiers, super-admin, agent avec et
  sans `leases.sign`, preuve, renouvellement) et `LeaseTest` (voie papier).
