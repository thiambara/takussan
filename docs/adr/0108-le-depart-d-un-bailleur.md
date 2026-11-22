# ADR-0108 — Le départ d'un bailleur : refusé tant qu'il laisse quelque chose en cours, puis son profil devient inactif et son histoire reste

- **Statut** : Accepté le 2026-11-12 (décision 5 (a) du porteur : « refusé tant qu'il reste biens, baux en cours ou reste à verser ; profil → inactive ; journal et relevés gardés ; geste dédié, admin seul, double authentification ») ; **validé par le porteur le 2026-11-12** (nuit, point 4 de ses huit validations) : un bien archivé bloque (§ 1), ce que le bailleur doit à l'agence ne bloque pas (§ 3), aucun retrait par soi-même (§ 7), pas de retour d'un profil retiré (§ 9) — autres modalités (appels, codes, journal) : décisions de la session, à revoir
- **Date** : 2026-11-12
- **Tickets** : TCK-2753 ; s'appuie sur TCK-2760 (le solde cumulé)
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (un profil non actif ne confère rien ; le bailleur de tout statut garde son argent), [ADR-0100](0100-une-page-paiements-par-public.md), amendement du 2026-11-12 (le reste à verser est un solde cumulé), [ADR-0039](0039-les-sorties-d-argent.md) (reprises)

## Contexte

Relevé sur `feat/audit-ux-app-lot-2` (0bec981e2) le 2026-11-12, en lecture seule :

- **Aucun chemin ne retire un bailleur d'une agence.** `AgencyMemberRemovalService::remove()` refuse quiconque n'est pas du personnel : 422 `agency_member.not_staff` (TCK-591 § 8). Pour un bailleur, il n'existe que la suspension (`POST /api/agencies/{agency}/team/{user}/suspend`, TCK-587) : son profil passe `blocked`, et « Réactiver » le rend `active`.
- **Le retrait d'un agent est le parallèle.**
  - Il est refusé tant que son portefeuille n'est pas vide : 422 `agency_member.portfolio_not_empty`, avec les comptes par catégorie (`AgentPortfolio::inventory`).
  - Le dernier administrateur est compté sous verrou.
  - Il écrit un journal (`activity('Membership')`), puis éteint ce que la présence ouvrait.
  - Il **supprime** les profils d'agent et d'administrateur.
- **`OwnerProfileStatus::Inactive` existe et n'a aucun lecteur** dans `app/`.
  - `TeamMemberSuspensionService` ne touche pas un profil `inactive` : il ne suspend que `active` et ne réactive que `blocked` (verif-587, M2).
- **Deux règles valent pour un bailleur de tout statut**, tant que le profil existe (non supprimé) :
  - `BailleurDuBien::est` : la lecture de ses biens, baux, états des lieux et de leurs documents ;
  - `BeneficiaireDuReversement::est` : qui reçoit le reversement, qui lit le relevé (`OwnerStatementPolicy`), à qui part l'avis mensuel (`SendOwnerStatements`, seulement s'il y a un encaissement dans le mois).
- **Le retour d'un bailleur parti est impossible aujourd'hui.**
  - `owner_profiles` porte `unique(user_id, agency_id)`.
  - `OwnerInvitationService::assertNoActiveOwnerInAgency` refuse en 409 `already_member` tout profil de l'agence rattaché à un compte, quel que soit son statut.
- **Le carnet compte encore un profil non brouillon** : `OwnerDirectory::summary` compte `status <> draft` parmi les bailleurs.
- **La double authentification** des gestes d'équipe passe par `ProtectedActions::AGENCY_TWO_FACTOR`. Elle est toujours exigée d'un administrateur d'agence, et du personnel quand l'agence l'a cochée. `routes/api/owners.php` n'est pas une famille protégée.
- **Changer le titulaire d'un bien** n'existe que du personnel vers un bailleur (TCK-999), jamais d'un bailleur à un autre.

## Décision

**Un bailleur quitte une agence par un geste dédié de l'administrateur, sous double authentification, et seulement quand il n'y laisse plus rien en cours : ni bien, ni bail en cours, ni argent qu'on lui doit. Son profil passe `inactive`. Rien n'est supprimé.**

### 1. Les biens : le départ est refusé tant qu'il en reste

- **Compte** : tout bien **non supprimé** de l'agence dont il est le bailleur (`properties.user_id` = lui, au sens de `BailleurDuBien`), **quel que soit son statut**, archivé et vendu compris.
- **Validé par le porteur le 2026-11-12** : un bien archivé bloque le départ.
- **Pourquoi l'archivé compte** : un bien archivé reste dans l'agence et peut être republié. Laissé à un bailleur parti, il serait un bien sans titulaire joignable.
- **Sortie** : supprimer le bien. La suppression est douce : l'histoire du bien, ses baux et ses paiements restent, et le relevé les relit avec `withTrashed`. Aucun changement de titulaire d'un bailleur à un autre n'est servi (TCK-999 ne le fait pas). S'il est voulu, ce sera un ticket à part.

### 2. Les baux : le départ est refusé tant qu'un bail est en cours ou à venir

- **Compte** : tout bail de l'agence dont il est le bailleur (`leases.landlord_id`), de statut `draft`, `pending_signature`, `active` ou `terminating`, **même si son bien est supprimé**. La suppression d'un bien ne vérifie pas ses baux, donc la condition 1 ne couvre pas celle-ci.
- **Ne compte pas** : `expired`, `terminated`, `renewed`. Ils sont l'histoire.
- **Sortie** : abandonner le brouillon, ou mener le bail à son terme ou à sa résiliation.

### 3. L'argent : le départ est refusé tant que l'agence lui doit quelque chose

Trois conditions, chacune avec son compte :

- **le solde cumulé est positif** (`balance.remaining_to_pay > 0`, au centime, [ADR-0100](0100-une-page-paiements-par-public.md), amendement du 2026-11-12). Un reste **de période** nul ne prouve rien : c'est le cas courant d'une agence qui verse le mois suivant ;
- **un reversement à lui est en cours** : statut de `PayoutStatus::upcoming()`, à approuver, en attente, programmé ou en traitement. De l'argent est en mouvement ;
- **une pièce reversable n'est encore portée par aucun reversement** : la règle de `AccountDeletionService::agenciesOwingPayout`, extraite et partagée, jamais recopiée.

**Ce que le bailleur doit à l'agence ne bloque pas** (validé par le porteur le 2026-11-12). Cela couvre deux cas :

- une **reprise en attente** (ADR-0039) : le reliquat de `PayoutClawbacks::outstanding`, qu'aucun reversement n'a encore absorbé. Elle ne se lit pas dans le solde : une reprise diminue le net et le versé du même montant (ADR-0100, amendement du 2026-11-12, § 1) ;
- un **trop-versé** : un solde négatif.

Sans loyer à venir, aucun reversement ne les absorbera jamais. Refuser ce départ le rendrait impossible pour toujours. Les deux montants s'écrivent au journal du départ, et l'agence les recouvre hors de la plateforme.

### 4. Le refus porte les comptes

422 `owner.departure_not_empty`, avec l'inventaire, sur le modèle de `portfolio_not_empty` :

```
properties, leases, positive_balance, upcoming_payouts, unpaid_out_pieces
```

Le même inventaire se lit **avant** le geste par `GET /api/owners/{ownerProfile}/departure`. La fiche dit ce qui bloque, et l'effet, avant d'agir.

- **Une seule méthode** compte pour la lecture, pour la garde du geste et pour le refus. Les trois disent la même chose, comme `AgentPortfolio`.
- La garde **recompte sous verrou**, dans la transaction du geste : ses biens d'abord, par identifiant croissant (l'ordre bien → utilisateur du dépôt), puis son profil.

### 5. Le profil passe `inactive` : ni supprimé, ni `blocked`

- **Pas supprimé.** Un profil supprimé (en douceur) n'est plus vu par `BailleurDuBien` ni par `BeneficiaireDuReversement`. Deux choses se perdraient :
  - son relevé ne se lirait plus ;
  - un arriéré encaissé après son départ, sur un bail terminé, ne pourrait plus lui être reversé.
  - De plus, la ligne supprimée occuperait toujours `unique(user_id, agency_id)`.
- **Pas `blocked`.** `blocked`, c'est la suspension : « Réactiver » la défait d'un clic (TCK-587). Un départ ne se défait pas par la réactivation, et `TeamMemberSuspensionService` laisse déjà `inactive` tel quel.
- **Ce que `inactive` confère** : **rien d'actif** (ADR-0031 § 3).
  - Le profil ne se résout jamais en profil actif : il n'ouvre pas d'espace bailleur dans cette agence. `ActiveProfileResolver::isActiveProfile` ne retient que `active`, et c'est déjà vrai.
  - **Il n'écrit rien, et c'est à coder.** La garde d'écriture du bailleur ne voit aujourd'hui que `blocked` : `HasProfiles::isBlockedOwnerAt`, son amorce `blocked_owner`, lue par `BasePolicy::landlordWrites` (et par `BasePolicy::bailleurEcrit`, qui l'appelle). Elle laisserait un bailleur parti écrire sur ses baux passés. Elle doit compter `blocked` **et** `inactive`.
- **Ce qui reste** : les règles « de tout statut ».
  - `BailleurDuBien` : la lecture de ses baux passés et de leurs pièces, par lien direct.
  - `BeneficiaireDuReversement` : un arriéré encaissé plus tard lui est reversé, son relevé se lit par le personnel, et l'avis mensuel part s'il y a un encaissement dans le mois.
- **Ses jetons** sont révoqués s'il ne garde aucun profil actif ailleurs, comme pour la suspension.

### 6. Ce qui est gardé

- **Tout.** Aucun bien, bail, paiement, reversement, relevé envoyé (`owner_statement_snapshots`), document, fil de conversation ou ligne de journal n'est supprimé ni réécrit.
- **Le journal** :
  - le changement de statut est audité par le modèle (`OwnerProfile::AUDIT_ONLY`) ;
  - le geste écrit `activity('Membership')`, évènement `owner_departed`, avec l'acteur, l'agence, le profil, l'inventaire (à zéro, par construction), la reprise en attente (`outstanding_clawback`) et le trop-versé (`negative_balance`), chacun à son montant ou `null`.
- **Les fils de conversation** de ses baux passés lui restent : il en est partie, comme l'agent retiré qui reste partie au bail. Aucun bail en cours ne subsiste, donc aucun fil actif ne le concerne.

### 7. Le geste

- **L'appel** : `DELETE /api/owners/{ownerProfile}`, un contrôleur dédié (`OwnerDepartureController@destroy`) et un service (`OwnerDepartureService`).
  - Il rend le profil avec son statut `inactive` et la date du départ.
  - C'est un départ de l'agence, du point de vue du carnet : la ligne en sort.
- **L'administrateur seul** :
  - un profil d'administrateur **actif** dans l'agence du profil (`isAgencyAdminAt`), ou le super-admin ;
  - ce n'est **pas une capacité** : un rôle personnalisé ne le délègue pas à un agent. C'est le précédent de `CustomerPolicy::viewSensitive`.
- **La double authentification** : l'action entre dans `ProtectedActions::AGENCY_TWO_FACTOR`, et son contrôleur dans `FAMILY_CONTROLLERS`, puisque `owners.php` n'est pas une famille. `ProtectedActionsCoverageTest` le garde.
- **Les refus propres** (le retrait par soi-même, validé par le porteur le 2026-11-12, est refusé sous ses deux formes : `owner.departure_self` et `owner.departure_individual`) :
  - un profil `draft` (invitation non acceptée) : 422 `owner.departure_draft`, il faut révoquer l'invitation ;
  - un profil déjà `inactive` : 422 `owner.already_departed` ;
  - **soi-même** : 422 `owner.departure_self`, comme `team.suspension_self`. Un autre administrateur le fait ;
  - **une agence `individual`** : 422 `owner.departure_individual`. L'hôte y est à la fois administrateur et bailleur : quitter sa propre agence n'est pas une fin de mandat, c'est fermer l'espace, un autre geste.
- **La date du départ** (`departed_at`) est celle de l'entrée `owner_departed` du journal. Il n'y a pas de colonne neuve : un seul écrivain pose `inactive`, et il écrit cette entrée dans la même transaction.

### 8. Le carnet et la fiche

- **`GET /api/owners`** ne liste plus un profil `inactive` par défaut. `filter[status]=inactive` les rend.
- **La somme de tête** (`summary.owners`) ne le compte plus.
- **La fiche** d'un bailleur parti reste lisible par le personnel : son histoire et ses relevés. Elle dit « Parti le … » et ne propose plus que la lecture : ni suspendre, ni réactiver, ni retirer.

### 9. Le retour d'un bailleur parti (la sixième question)

- **Validé par le porteur le 2026-11-12 : pas de retour d'un profil retiré.** Aucun geste ne rend `active` un profil `inactive` : ni « Réactiver » (§ 5), ni une invitation.
- **L'invitation d'un bailleur parti est refusée en 409.** Le message dit qu'il **a quitté** l'agence, et non qu'il en est « déjà membre » : le message d'aujourd'hui serait faux pour lui.
- **Si un retour est voulu un jour**, ce sera une décision du porteur et un amendement, pas un ticket de suite. La contrainte à connaître : `unique(user_id, agency_id)` interdit un second profil, donc un retour devrait réactiver le même, par une invitation que le bailleur accepte (un nouveau mandat demande son accord).

## Conséquences

- **Un départ est un geste de fin de mandat**, après que l'agence a fini son travail : biens retirés, baux finis, dernier reversement fait. L'écran le dit avant d'agir. Il n'est jamais un raccourci qui laisserait des biens ou de l'argent sans titulaire.
- **Le bailleur parti n'a plus de surface pour lire ses relevés.** Ils restent lisibles par le personnel, qui les lui envoie (PDF). Une surface « anciens mandats » serait un ticket à part.
- **Un arriéré encaissé après le départ** lui est reversé normalement, puisque le profil `inactive` reste bénéficiaire. Le départ ne fait perdre aucun argent au bailleur.
- **Ce que le bailleur doit encore** (reprise en attente, trop-versé) sort de la plateforme : l'agence le recouvre elle-même. Le journal en garde les montants.
- **Supprimer les biens** est le seul moyen de les retirer au bailleur dans l'agence. La suppression est douce et garde l'histoire. Mais elle retire le bien des listes : une agence qui voulait garder un bien après le départ de son bailleur (vente à un autre bailleur) n'a pas de geste. C'est le changement de titulaire d'un bailleur à un autre, non servi.
- **Un statut neuf prend un sens** : `inactive` n'avait aucun lecteur. Désormais il veut dire « parti ». Tout lecteur futur de `OwnerProfileStatus` doit le traiter comme tel.

## Options écartées

- **Supprimer le profil, comme pour l'agent** : relevés illisibles, arriéré non reversable, et la ligne occuperait encore l'unicité (§ 5).
- **`blocked` définitif** : la suspension et le départ se confondraient, et « Réactiver » défairait un départ (§ 5).
- **Laisser partir avec des biens ou des baux**, en les gardant dans l'agence sans titulaire actif : des loyers à reverser à quelqu'un qui ne peut plus rien lire. C'est la décision (a) du porteur qui l'exclut.
- **Bloquer sur le reste de période** : nul dans le cas mesuré d'un versement le mois suivant, alors qu'un mois entier reste dû.
- **Bloquer aussi sur ce que le bailleur doit** (reprise en attente, trop-versé) : sans loyer à venir, il ne pourrait jamais partir (§ 3).
- **Une capacité `owners.remove`** : un rôle personnalisé la donnerait à un agent, contre la décision « admin seul ».
- **Passer par `DELETE /api/agencies/{agency}/members/{user}`** : ce chemin est celui du personnel, avec sa passation et ses gardes d'administrateur. L'élargir mélangerait deux départs qui ne gardent pas les mêmes choses.

## Application

- **API** (TCK-2753) : `OwnerDepartureService`, avec l'inventaire, la garde sous verrou et l'effet ; `OwnerDepartureController` (`GET …/departure`, `DELETE`) ; `ProtectedActions` ; la garde d'écriture du bailleur (`isBlockedOwnerAt` et son amorce) ; `OwnerDirectory` (liste et somme) ; le message de refus de l'invitation.
- **Front** (TCK-2753) : « Retirer de l'agence » sur la fiche `/app/owners/[id]`, séparé des gestes de suspension, destructif, qui lit l'inventaire avant d'agir.
- **Gardes** :
  - un test par condition de refus, chacun vérifié par ablation de sa condition ;
  - la reprise en attente et le trop-versé, qui ne bloquent pas ;
  - le bailleur parti qui n'écrit plus, vérifié par ablation de `inactive` dans la garde d'écriture ;
  - le reste de période nul avec un solde cumulé positif, qui bloque ;
  - le profil `inactive` qui ne se résout pas en profil actif ;
  - l'arriéré encaissé après le départ, reversable ;
  - `ProtectedActionsCoverageTest` ;
  - le refus d'un agent à qui un rôle personnalisé donne toutes les capacités.
