---
id: TCK-2982
title: "Les liens d'action signés : un geste sur un objet, une fois, 7 jours, sans session, par le service et la politique de l'objet ; la carte relayée en lien"
status: todo
phase: P2
family: back
estimate: L
wave: 98
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2981, TCK-2958, TCK-2959]
blocks: [TCK-2983, TCK-2984]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
tags: [back, messagerie, le-fil, pont, liens-d-action, securite, non-fuite, adr-0132, adr-0128, adr-0051]
---

## Objectif utilisateur

- **Le plombier, le bailleur de la diaspora, le locataire joints par WhatsApp** : quand l'objet attend leur geste
  (confirmer une visite, accepter une intervention et son créneau, signer un état des lieux),
  ils reçoivent un lien qui ouvre une page à un seul geste, sans se connecter.
- **Le personnel** : sur la carte du fil, il voit le lien envoyé, ouvert, puis le geste fait.

## Contrat de données

Le contrat est [ADR-0132](../../../adr/0132-le-pont-whatsapp-et-sms-relaie-le-fil-et-les-liens-d-action-font-un-geste.md)
§ 5, et ADR-0128 § 4 (un seul chemin d'écriture).

**Prémisses mesurées (2026-11-19, `6a26d9701`)** — les gestes existent tous derrière `auth:sanctum` et
`$request->user()` :
- `POST property-visits/{visit}/confirm` → `PropertyVisitController::confirm` (`:703`) :
  `PropertyVisitPolicy::peutConfirmer`, puis `VisitSchedulingService::confirmOrFail` et le notifieur ;
- `POST maintenance-requests/{id}/accept` → `MaintenanceRequestController::accept` (`:409`) : le service avec
  `scheduled_at` ;
- `POST inventories/{inventory}/sign` → `InventoryController::sign` (`:182`) : `InventorySignatureService::sign`
  (rôle, signature, code facultatif d'ADR-0098) ;
- le paiement : `LeasePaymentLinkService` et le lien porteur `/api/pay/{token}` (ADR-0051), réutilisable jusqu'au
  paiement ; stockage `token_hash` SHA-256 (`2026_10_08_170000_create_lease_payment_links_table.php:23`) ;
- les codes qui attendent un geste (`'attend' => true`, `app/Services/Messaging/CodesDuFil.php:65`) :
  `lease_payment.due_soon|overdue|reminded`, `inventory.awaiting_signature|signed_by_party`,
  `visit.rescheduled`, `maintenance.quote_submitted|quote_awaiting_owner|slot_requested`. `maintenance.assigned`
  n'attend personne au catalogue.

**Schéma** — `action_links` : `token_hash` (char 64, unique), `gesture`, `subject_type` (clé de `SujetsDuFil`),
`subject_id`, `user_id` (FK `cascadeOnDelete` : le compte pour qui le lien agit), `phone` (E.164, le numéro qui
l'a reçu), `message_id` (FK `nullOnDelete`, la carte ou l'événement porteur), `message_relay_id` (FK
`nullOnDelete`), `expires_at` (+7 jours), `opened_at`, `used_at`, `revoked_at` (nuls), horodatages. Index
`(subject_type, subject_id)`, `(user_id, gesture)`.

**Registre fermé** `App\Services\Pont\GestesParLien` — par geste : type d'objet, codes d'événement qui l'émettent,
la politique à rejuger, le service à appeler, la projection minimale de la page :
- `property_visit.confirm` ← `visit.rescheduled` ;
- `maintenance_request.accept` ← `maintenance.assigned`, vers le prestataire assigné (`assigned_to`), tant que
  l'intervention n'est pas acceptée — le seul code émetteur sans `action_for` : la règle s'écrit dans le registre,
  avec son test ;
- `inventory.sign` ← `inventory.awaiting_signature`, `inventory.signed_by_party` ; un code à 6 chiffres envoyé au
  numéro du lien est exigé, comme pour une signature recueillie hors de la session du signataire (ADR-0098) ;
L'approbation d'un devis n'y est pas (ADR-0132, « Ce que ça ne règle pas »).

**Payer n'a pas de lien du pont, et aucun doublon** (ADR-0132 § 5) : les relances de loyer
(`SendLeasePaymentReminders`, codes `LeasePaymentDueSoon`/`Overdue` `mobile()` dans `NotificationCode.php:810`)
portent déjà au locataire, sur WhatsApp puis SMS, le lien porteur d'ADR-0051. `GestesParLien` déclare les codes
couverts par une notification mobile du même geste (`lease_payment.due_soon`, `overdue`, `reminded`) : ils
n'émettent aucun lien. Mesurer, pour chaque code émetteur du registre, qu'aucune notification mobile ne mène déjà
le même destinataire au même geste (`VisitRescheduled` est `mobile()` : vérifier son destinataire).

**Émission** — `App\Services\Pont\LiensDAction::emettre()` : quand un événement d'un code émetteur est écrit dans
un fil (`EvenementsDuFil` / `FilDeLObjet`), pour chaque compte de `action_for` (ou la règle du registre) qui est
**joint par le pont** dans ce fil (TCK-2981), un lien est émis et relayé (`purpose = action_link`) : gabarit
`pont_lien_action` (bouton d'URL) hors fenêtre, message interactif à bouton d'URL dans la fenêtre, SMS en secours —
par l'ordre de repli et les capacités déclarées des pilotes (ADR-0132 § 0) : un canal sans « boutons » reçoit
l'URL dans le texte.
**À l'accord ou à la jonction** d'une personne dans un fil (TCK-2981), les gestes que ce fil attend encore d'elle
(`NonLus::gesteToujoursAttendu`, et pour `maintenance.assigned` l'intervention non acceptée) émettent leur lien :
un prestataire joint après l'assignation reçoit le lien d'acceptation. Un nouveau lien pour le même (compte, objet,
geste) révoque le précédent. Le clair n'existe que dans le message
envoyé. L'URL est `{app.frontend_url}/{langue}/fil/a/{jeton}`, bâtie comme `LeasePaymentLinkService::url`
(`app/Services/Payments/LeasePaymentLinkService.php:290`), dans la langue du destinataire : c'est le contrat avec
la page de TCK-2983.

**Routes publiques** (`routes/api/action-links.php`, sans `auth`, limiteur nommé `action-link` par IP et par
jeton) :
- `GET /api/a/{token}` : `{gesture, state, object}` — `object` est la projection minimale du registre (quartier,
  créneau, motif ; ni adresse exacte, ni montant d'un autre, ni téléphone) ; pose `opened_at` à la première
  lecture ;
- `POST /api/a/{token}` : le geste, avec ses paramètres (`scheduled_at` pour accepter, `signature` et `code` pour
  signer) ; il rend `{state: done, object}` où `object` est ce que ce compte lit de l'objet **après** le geste,
  par la ressource de l'objet (pour le prestataire qui accepte : l'adresse et le contact sur place, que
  ADR-0122 lui ouvre à l'acceptation) — c'est la seule réponse qui en dit plus, et une seule fois ;
  `POST /api/a/{token}/code` pour l'envoi du code de signature ;
- lien expiré, utilisé, révoqué : **410** et le seul code `action_link.expired|used|revoked` ; jeton inconnu :
  **404**.

**Lecture du personnel** : `MessageResource`, pour une carte ou un événement porteur, rend `action_link`
`{sent_at, opened_at, used_at, expires_at}` au **seul** personnel actif de l'agence du fil.

## Contraintes strictes (métier)

- **Un seul chemin d'écriture** : le geste appelle le même service, après la même politique rejugée **au moment
  du geste**, pour le compte du lien ; aucune route « agir sur une carte ». Une logique copiée du contrôleur est un
  défaut : la factoriser hors du contrôleur si besoin.
- **Usage unique** : `used_at` se pose dans la transaction du geste réussi, sous verrou de la ligne ; un geste
  refusé (politique, machine d'état, validation) ne consomme pas le lien.
- **Sans session** : aucune réponse ne pose de cookie de session ni ne rend de jeton d'API.
- **Le jeton** : 32 octets aléatoires au moins, comparé par son empreinte, jamais journalisé (ni dans le journal
  des requêtes, ni dans `activity_log`).
- **Un lien mort ne dit rien** de l'objet, du geste ni de la personne.
- Codes d'erreur sous `LangGroupParity` ; `ProtectedActionsCoverageTest` / `PlatformAnyRouteExempt` selon la
  règle des routes publiques.

## Delta à produire

- [ ] Migration `create_action_links_table` (`down()`), modèle `ActionLink`.
- [ ] `GestesParLien`, `LiensDAction`, `ActionLinkController`, requêtes du geste et du code.
- [ ] Factoriser, si besoin, le cœur des gestes hors de `PropertyVisitController::confirm`,
  `MaintenanceRequestController::accept`, `InventoryController::sign`, appelé par la route et par le lien.
- [ ] Branchement de l'émission sur l'écriture des événements ; relais `purpose = action_link` (TCK-2981).
- [ ] Gabarit `pont_lien_action` (`notification_templates`, `fr`, `en`).
- [ ] Pilote WhatsApp : bouton `url` à suffixe variable dans un gabarit, message `interactive` `cta_url` dans la
  fenêtre (documentation de l'API Cloud de Meta) ; `LogWhatsappDriver` les journalise.
- [ ] `pont:effacer-numeros` (TCK-2980) efface aussi `action_links.phone` 90 jours après l'expiration.
- [ ] `MessageResource` : `action_link` pour le personnel.
- [ ] Tests :
  - `LienDActionTest` : chaque geste par lien produit le même état que par sa route ; usage unique ; expiration à
    7 jours (temps déplacé) ; nouveau lien → l'ancien révoqué ; droit perdu → refus de l'objet, lien non
    consommé ; geste refusé par la machine d'état → lien non consommé ;
  - `LienDActionMortTest` : 410 avec le seul code, corps strictement égal ; 404 pour un jeton inconnu ;
  - `LienDActionSansSessionTest` : ni cookie de session, ni jeton ;
  - `AucunDoublonTest` : une échéance due, en retard ou relancée n'émet aucun lien du pont vers le locataire joint
    (la relance de loyer part seule) ;
  - `LiensALaJonctionTest` : un prestataire joint après `maintenance.assigned` reçoit le lien d'acceptation ; un
    geste déjà fait n'en émet pas ;
  - `SignatureParLienTest` : sans code → refus ; code juste → signé, lien consommé ;
  - `EmissionDesLiensTest` : un événement émetteur vers un joint par le pont → un lien, un relais ; vers un non-joint
    → aucun ; une carte posée (`property.shared`) → aucun ;
  - `action_link` absent de la réponse pour le locataire et pour un agent d'une autre agence.

## Critères d'acceptation

- [ ] **AC1** — Confirmer une visite par lien passe par `PropertyVisitPolicy::peutConfirmer` rejugée : un bailleur
  dont l'agence a retiré `owners_confirm_visits` après l'émission est refusé. *Ablation : appeler le service sans
  la politique — rouge.*
- [ ] **AC2** — Un lien utilisé, expiré ou révoqué rend 410 et un corps qui ne contient que son code. *Ablation :
  rendre `object` avec l'erreur — rouge.*
- [ ] **AC3** — Un lien ne fait qu'un geste : un second `POST` après un geste réussi rend 410. Un geste refusé ne
  consomme pas. *Ablation : poser `used_at` avant le geste — rouge.*
- [ ] **AC4** — La base ne contient que l'empreinte du jeton. *Ablation : stocker le clair — rouge (test qui
  cherche le clair dans la table).*
- [ ] **AC5** — Un locataire joint par le pont ne reçoit, pour une échéance relancée, que la relance de loyer et
  son lien porteur : aucun lien du pont. *Ablation : retirer les codes couverts du registre — rouge (deux
  envois).*
- [ ] **AC5 bis** — Un prestataire joint après l'assignation reçoit le lien d'acceptation à la jonction.
  *Ablation : n'émettre qu'à l'écriture de l'événement — rouge.*
- [ ] **AC6** — La projection de la page ne porte ni adresse exacte, ni téléphone, ni montant d'un autre lecteur.
  *Ablation : rendre la projection du personnel — rouge.*
- [ ] **AC7** — Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- La page publique : TCK-2983. La trace sur la carte à l'écran : TCK-2984.
- Approuver un devis par lien ; un code pour d'autres gestes que la signature.
- Ouvrir une session depuis un lien.

## Notes d'implémentation

**Prémisse re-mesurée (2026-11-19, arbre partagé de `feat/le-fil-lots-3-5`)** — conforme. Les trois gestes sont
derrière `auth:sanctum`. `confirm` portait sa garde (`update` dans la FormRequest, puis `peutConfirmer`) et la suite
du bailleur (journal, avis) dans le contrôleur. `accept` est déjà dans `MaintenanceRequestService::accept` (verrou,
assignation relue). `sign` est déjà dans `InventorySignatureService::sign`. `VisitRescheduled` (`mobile()`) va au
VISITEUR, alors que `visit.rescheduled` attend le personnel ou le bailleur qui confirme (`action_for`) : pas de
doublon. Aucun gabarit du pont n'était inscrit à `notification_templates` (`pont_invitation`,
`pont_nouveau_message` non plus).

**Livré**
- `action_links` (migration `298201`, `down()`), `ActionLink` (non journalisé, `token_hash` et `phone` cachés).
- `GestesParLien`, registre fermé de trois gestes :
  - `property_visit.confirm` ← `visit.rescheduled` ;
  - `maintenance_request.accept` ← `maintenance.assigned` (règle du registre : le prestataire assigné, tant que ce
    n'est pas accepté) ;
  - `inventory.sign` ← `awaiting_signature` et `signed_by_party`, avec un code exigé.
  Avec ses projections (quartier, ville, créneau, titre, catégorie, priorité, type ; ni rue, ni téléphone, ni
  montant), `CODES_COUVERTS` (loyer) et `SANS_LIEN` (devis, créneau à choisir, engagements, chacun motivé).
- `RegistreDesGestesParLienTest` : chaque code `attend` du catalogue est rangé une seule fois.
- `ConfirmerUneVisite` : le cœur de `confirm` sort du contrôleur, et la route comme le lien l'appellent.
- `LiensDAction` :
  - le jeton : 32 octets aléatoires en base64 d'URL (43 caractères) ; seul le SHA-256 est en base ;
  - 7 jours ;
  - un nouveau lien révoque le précédent pour le même (compte, objet, geste) ;
  - l'URL suit le format `{frontend_url}/{langue}/fil/a/{jeton}` ;
  - `apresEvenement` et `aLaJonction`.
- `ActionLinkController` :
  - `GET` et `POST /api/a/{token}`, puis `POST /api/a/{token}/code` ;
  - le geste et `used_at` sont faits dans une transaction, sous verrou de la ligne ;
  - le compte du lien est posé sur la seule requête (`Auth::setUser`, sans `login`) ;
  - un lien mort rend 410 avec son seul code, un jeton inconnu rend 404 ;
  - un objet supprimé rend 410 `revoked`.
- Les jobs `EmettreLesLiensDAction` (après le commit d'`EvenementsDuFil::ecrire`, seulement pour un code émetteur)
  et `EmettreLesLiensALaJonction` (`AccordDuPont::lire`, à l'accord).
- Le limiteur `action-link` (IP et empreinte du jeton). Le code est limité à `throttle:5,10`.
- `PlatformAnyRouteExempt` : `act` et `sendCode` y sont `PUBLIC`.
- Les codes `action_link.*` dans `errors.php` (fr, en, wo = fr), le SMS `notifications.action_link_signature_code`,
  et `pont.lien_action`, `pont.gestes.*`, `pont.lien_action_gabarit`.
- Le gabarit `pont_lien_action` (migration `298202`, `pending`, fr et en ; variables : agence, geste, jeton).
- `pont:effacer-numeros` efface `action_links.phone` 90 jours après `expires_at`.
- `MessageResource.action_link` `{sent_at, opened_at, used_at, expires_at}`, en une requête par page, au seul
  personnel actif de l'agence du fil. Le super-admin ne le reçoit pas.

**Écarts et choix**
- Le code de signature par lien a sa propre portée dans `SignatureOtpService` (`lien:<rôle>`), distincte de la voie
  sur place d'ADR-0098. Il part au NUMÉRO DU LIEN (`Notification::route('sms', …)`), sinon au numéro vérifié du
  compte. La signature est enregistrée « dessinée » par son signataire (`sign(…, code: null)`) : la preuve du code
  n'est pas écrite dans les colonnes `*_otp_*` de l'état des lieux. À trancher si on veut la tracer.
- Un code juste est consommé (cache) même si `sign()` refuse ensuite. Les refus prévisibles (rôle, déjà signé)
  sont jugés AVANT l'essai du code.
- AC5 : le loyer n'a pas de geste dans la table. Retirer `CODES_COUVERTS` ne fait donc pas « deux envois », mais
  fait rougir le test du registre (code `attend` non rangé). Le test de comportement vérifie qu'une échéance due,
  en retard ou relancée n'émet aucun lien ni aucun envoi vers le locataire joint. Le départ de la relance de
  loyer elle-même n'est pas rejoué ici.
- La « jonction d'emblée » (`InvitationsDuPont::joindre`, accord déjà donné) : ce fichier était en cours
  d'édition par TCK-2981, et la ligne a été demandée à impl-2980. Seul l'accord par bouton (`AccordDuPont`) est
  branché ici.
- Pilote WhatsApp : le bouton `url` à suffixe variable et le `cta_url` dans la fenêtre ne sont pas posés
  (`WhatsappCloud`, fichier de TCK-2981). Le 3e paramètre du gabarit est le jeton, et l'URL complète part dans le
  texte libre et le SMS.

**Ablations** (chaque mutant a fait rougir sa cible ; chaque restauration a été vérifiée par md5) :
- AC1 : sans `Gate update` ni `peutConfirmer` dans `ConfirmerUneVisite`.
- AC2 : `gesture` et `object` ajoutés à l'erreur 410 (4 tests rouges).
- AC3 : `used_at` posé avant la transaction (2 rouges).
- AC4 : le jeton stocké en clair.
- AC5 : `CODES_COUVERTS = []` (2 rouges).
- AC5 bis : la ligne de `AccordDuPont` retirée.
- AC6 : la projection remplacée par `MaintenanceRequestResource`.
- Signature : le code non exigé (2 rouges).
- Trace : sans la garde du personnel.

