# ADR-0068 — Le fil d'un prospect appartient au bien et suit son contact principal

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Tickets** : à écrire par l'implémenteur (piste P38.05) ; voisins : P38.02, P38.07
- **Précise** : [ADR-0053](0053-l-agent-principal-est-une-marque-unique-par-bien.md) (qui répond pour
  un bien) et la garde d'accès de TCK-592 (`ConversationAccess`)

## Contexte

Mesuré le 2026-10-17 par l'explorateur, puis par le mesureur (piste P38.05, test temporaire retiré
depuis) :

- Un agent collaborateur d'un bien reçoit le message d'un visiteur envoyé depuis la fiche (« Mon
  numero 77 000 00 00 »). Sa ligne `property_collaborators` est ensuite supprimée. Il **lit encore
  le fil** (`GET …/messages` → 200, numéro compris) et **y écrit** (`POST` → 201).
- La relance du visiteur par la fiche ouvre un **second fil**, chez le nouveau contact principal.
  L'historique reste chez l'ancien agent : le nouveau répond sans savoir ce qui a été dit, et le
  prospect voit sa conversation coupée en deux.

La cause : `ConversationAccess::allows()` ne juge que la participation active et, pour un fil
d'intervention, la demande (TCK-592). Un fil rattaché à un bien ne dépend ni du bien ni de son
agence. `PropertyConversationResolver` cherche ensuite un fil où le visiteur **et le destinataire
du moment** sont participants : quand le destinataire change, il ne trouve plus rien.

Le contact principal, lui, est défini en un seul endroit (`PrimaryPropertyContact`, TCK-502,
TCK-590, ADR-0053). Mais il change par beaucoup de chemins :

- désignation explicite (`PrimaryAgentDesignator`) ;
- retrait d'une collaboration ;
- passation du portefeuille (`AgentHandoverService`, TCK-591) ;
- et sans aucune écriture sur le bien : un agent bloqué, ou retiré de l'agence, cesse d'être
  éligible.

Aucune règle n'écrivait à qui appartient le fil d'un prospect. Le porteur l'a tranchée le
2026-10-17 (option a de P38.05).

## Décision

**1. Le fil d'un prospect appartient au bien, donc à son agence, et non à l'agent qui l'a reçu.**
Est un fil de prospect une conversation `direct` portant un `property_id`. Le **prospect** est
`created_by`, et l'autre participant est le **répondant**.

- Le seul écrivain de ces fils est `PropertyConversationResolver::firstOrCreate()`.
  `POST /api/conversations` accepte encore un `property_id` sur une directe, mais n'a aucun
  appelant au front (relevé par P38.03). L'implémenteur le re-mesure, et sans appelant, ce
  chemin refuse `property_id` sur une directe (422). La définition garde ainsi un seul
  écrivain.

**2. Seul le contact principal actuel du bien répond.** `ConversationAccess` gagne une troisième
branche, à côté de celle des interventions. Sur un fil de prospect, un participant autre que le
prospect n'a accès que s'il est `PrimaryPropertyContact::for($property)`.

- Lecture, écriture, liste, recherche de messages : tout passe déjà par `allows()`,
  `constrainListing()` et `participatingQuery()`. La branche s'y ajoute, rien ne la contourne.
- L'ancien répondant perd l'accès sur-le-champ, historique compris, quel que soit le chemin qui
  a changé le contact principal. C'est ce que TCK-592 a fait pour les fils d'intervention, et
  pour la même raison : *collaboration finie = plus d'accès*.
- Le super-admin garde son accès, comme partout.
- Le prospect n'est pas concerné par cette branche : son accès reste celui d'un participant.

**3. Le fil est transmis au nouveau contact principal, et ne se coupe pas en deux.**

- **Le transfert** : le nouveau répondant est attaché au fil (`joined_at` = maintenant, il voit
  tout l'historique). L'ancien reçoit `left_at`. Le prospect garde le même fil, il voit le nom de
  son nouvel interlocuteur.
- **Quand** : au plus tard au prochain passage du prospect par le résolveur (ouverture du fil ou
  relance depuis la fiche). Le résolveur cherche alors le fil du prospect sur ce bien, quel que
  soit le répondant, et le transmet avant d'écrire. Il ne crée un fil neuf que s'il n'en existe
  aucun.
- **Plus tôt quand c'est possible** : les chemins qui déplacent le contact principal par une
  écriture (désignation, retrait d'une collaboration, passation) appellent la même transmission,
  après leur transaction. Les changements sans écriture, comme un agent bloqué, ne transmettent
  qu'au passage suivant du prospect. La branche 2 ferme déjà la fuite entre-temps.
- **Une seule opération**, réutilisée par tous ses appelants, sous le verrou du fil, et
  idempotente. Le titulaire du bien, quand il est le contact principal faute d'agent, suit la
  même règle.

**4. Ce que cette décision ne touche pas.**

- Les groupes, les fils d'intervention (TCK-592), les fils de bail.
- La sourdine et l'archivage du répondant (P38.04) : le nouveau répondant arrive avec un pivot
  neuf.
- Le message de contact anonyme (TCK-161), qui ne crée pas de fil.

## Conséquences

- **Un agent retiré d'un bien perd ses conversations avec les prospects de ce bien.** C'est voulu :
  le numéro d'un prospect appartient à l'agence qui l'a reçu, pas à l'agent. C'est aussi la
  seule conséquence visible pour un agent, et il faut la dire dans la passation (TCK-591).
- **Le contact principal hérite de fils qu'il n'a pas ouverts.** Sa liste de conversations peut
  grossir d'un coup après une passation. Rien ne le prévient aujourd'hui. Une notification de
  transfert serait un code neuf (ADR-0032), hors de cette décision.
- **`allows()` dépend désormais du bien.** Il faut charger `PrimaryPropertyContact::eagerLoads()`
  sur les chemins de liste, sinon on paie une requête par fil.
- **P38.02 se règle dans ce cadre.** Le résolveur ne retient que les directes où le prospect est
  participant actif. Un groupe sur le bien ne capte plus le contact. Le répondant, lui, n'est plus
  un critère de recherche : c'est la transmission qui le met à jour.
- **Une directe ne se quitte plus** (P38.07). Hors transfert, un `left_at` sur un fil de prospect
  ne vient donc que des lignes antérieures à cette décision.

## Application

- `takussan-api/app/Services/Messaging/ConversationAccess.php` : la branche « fil de prospect » ;
- `takussan-api/app/Services/Messaging/PropertyConversationResolver.php` : la recherche par
  prospect, puis la transmission ;
- les appelants de la transmission : `PrimaryAgentDesignator`, le retrait d'une collaboration
  (`PropertyCollaboratorController`), `AgentHandoverService`.

Gardes attendues, chacune vérifiée par ablation :

- collaboration retirée → 403 en lecture et en écriture pour l'ancien répondant ;
- relance du prospect → même identifiant de fil, nouveau répondant participant actif, ancien
  répondant parti ;
- désignation d'un autre agent principal → le fil est transmis sans attendre le prospect ;
- un groupe sur le bien ne capte pas le contact (P38.02).
