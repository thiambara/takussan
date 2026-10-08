# ADR-0037 — Le plafond de travaux du bailleur vit sur son profil d'agence

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-592](../backlog/tickets/TCK-592-maintenance-intervention-de-bout-en-bout.md)
- **Précise** : [ADR-0002](0002-role-est-un-profil-polymorphe.md) (le rôle est un profil polymorphe).
  Le profil `OwnerProfile` porte désormais une donnée du **contrat** entre le bailleur et l'agence, et
  plus seulement son identité de bailleur dans cette agence.

## Contexte

Mesuré le 2026-10-07 sur `dev` (`5f872f1f`) :

- **L'agent approuve n'importe quel montant.** `POST …/quote/approve` est gardé par
  `MaintenanceRequestPolicy::manageQuotes()`, qui délègue à `isPrincipalFor()` : bailleur du bien, ou
  personnel de l'agence du bien. Aucune borne de montant, aucune trace du bailleur dans la décision.
- **Le bailleur n'apprend même pas qu'un devis existe** quand un agent a ouvert la demande : la
  notification du devis allait à `$mr->requester ?? $property->owner` (`MaintenanceQuoteController.php:57`),
  donc à l'agent. TCK-592 (C) l'envoie désormais aux donneurs d'ordre — bailleur compris —, mais
  l'information ne donne pas de pouvoir.
- **Aucune notion de mandat n'existe.** `grep -rni "mandat\|mandate" app database/migrations` ne rend
  rien du domaine. Pas d'entité `ManagementMandate`, pas de commission, pas de fréquence de versement.
- **`owner_profiles` est la relation bailleur–agence, et elle est unique.** La table porte
  `unique(['user_id', 'agency_id'])` (migration de création) : un bailleur a **un** profil par agence.
  C'est précisément le couple dont relève un accord de travaux.

Dans la pratique sénégalaise de la gestion locative, l'accord est verbal ou tient dans une ligne du
contrat de gestion : « au-delà de tel montant, vous me demandez ». Il n'y a qu'un nombre.

## Décision

**Le plafond de travaux est une colonne `works_approval_threshold` (décimal, nullable) sur
`owner_profiles`. Au-delà de ce montant, l'approbation d'un devis par l'équipe de l'agence ne
l'approuve pas : elle le fait passer en `awaiting_owner`, et seul le bailleur du bien tranche.**

1. **Nul = pas d'accord requis.** Le comportement actuel est conservé tel quel pour tout bailleur dont
   le plafond n'est pas renseigné — c'est l'état de toutes les lignes existantes.
2. **Strictement au-delà.** Un devis égal au plafond est dans l'accord. Le montant comparé est
   `quote_amount`, calculé côté serveur depuis les lignes du devis (TCK-592, F) — jamais un montant
   saisi.
3. **Le profil qui compte est celui du couple (bailleur du bien, agence du bien)** :
   `OwnerProfile` où `user_id = property.user_id` et `agency_id = property.agency_id`. Un bien sans
   agence n'a pas de plafond : son seul donneur d'ordre est son bailleur.
4. **`awaiting_owner` est un statut de la machine d'état** (`MaintenanceStateMachine`) :
   `quote_submitted → awaiting_owner`, puis `awaiting_owner → approved | rejected | cancelled`. Il n'est
   jamais une cible de `PUT …/status` : on y entre par `quote/approve`, on en sort par `quote/approve`
   ou `quote/reject`.
5. **En `awaiting_owner`, approuver ou refuser n'appartient qu'au bailleur du bien.** L'équipe de
   l'agence reçoit 403 ; un autre bailleur de la même agence aussi (il n'est donneur d'ordre de rien
   ici). L'annulation reste ouverte au donneur d'ordre, comme depuis tout état de devis.
6. **Le bailleur qui approuve lui-même, depuis `quote_submitted`, approuve directement** : le plafond
   borne ce que l'agence décide pour lui, pas ce qu'il décide pour lui-même.
7. **Le bailleur est notifié** quand un devis l'attend (`maintenance.notifications.quote_awaiting_owner`,
   dans sa langue).

## Conséquences

- **Ce que ça coûte** : un statut de plus dans l'enum, dans la machine, dans les types du front et
  dans les trois dictionnaires. Un état d'attente peut s'enliser : un bailleur qui ne répond pas
  bloque l'intervention. L'agence garde l'annulation, et peut relancer par la messagerie ; aucune
  approbation implicite par délai n'est posée — un silence ne vaut pas accord sur une dépense.
- **Ce que ça interdit** : de faire porter le plafond par l'agence (un réglage global) — l'accord est
  par bailleur, et deux bailleurs d'une même agence n'ont pas le même. De créer une entité
  `ManagementMandate` tant que commission et fréquence de versement n'en ont pas besoin : une table
  d'une colonne utile serait un mandat vide, et c'est le jour où elle aura une seconde colonne qu'on
  saura ce qu'elle doit être.
- **Ce que ça laisse ouvert** : **aucun écran ni endpoint ne renseigne encore le plafond.** TCK-601
  possède `OwnerProfile` ; ce ticket n'y ajoute que la colonne (fillable + cast). Tant qu'aucun
  chemin ne l'écrit, toutes les lignes valent `null` et le comportement est celui d'avant — ce qui est
  le défaut sûr.
- **Si un mandat de gestion devient une entité**, la colonne y migre : la règle (« au-delà, le
  bailleur tranche ») ne change pas, seul l'endroit où se lit le nombre change.

## Application

- Migration `2026_10_07_130100_add_works_approval_threshold_to_owner_profiles` ;
  `OwnerProfile::$fillable` et cast `decimal:2`.
- `MaintenanceStatus::AwaitingOwner` ; `MaintenanceStateMachine::TRANSITIONS` (et absent de
  `GENERIC_TARGETS`).
- `MaintenanceQuoteWorkflow::approveQuote()` décide entre `approved` et `awaiting_owner` ;
  `MaintenanceRequestPolicy::decideQuote()` réserve `awaiting_owner` au bailleur du bien.
- `tests/Feature/Maintenance/MaintenanceOwnerApprovalThresholdTest.php` : seuil 50 000 / devis 75 000
  → `awaiting_owner` puis `approved` par le bailleur ; autre bailleur et agent → 403 ; devis 40 000 →
  `approved` ; seuil nul → `approved`. Chaque garde est prouvée par ablation (notes de TCK-592).
