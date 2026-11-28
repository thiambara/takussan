# ADR-0138 — « Qui peut lire » s'écrit une fois, dans un module à deux faces que la liste et la fiche partagent

- **Statut** : Accepté le 2026-11-27 (relevé d'architecture du 2026-11-27, recommandations validées par le porteur : « corrige tout de A à Z »)
- **Date** : 2026-11-27
- **Tickets** : TCK-3006
- **Prolonge** : [ADR-0099](0099-le-coffre-de-documents-la-liste-suit-la-lecture.md) (« une liste ne montre que ce qu'un `show` ouvrirait, par un seul prédicat »), étendu du coffre de documents à tous les modèles lus par liste et par fiche
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md), [ADR-0004](0004-profil-actif-resolu-par-middleware.md), [ADR-0006](0006-lecture-api-par-query-builder.md)

## Contexte

Relevé sur `dev` (4e3a929f7) le 2026-11-27. Pour un même modèle, la règle « qui peut lire » est écrite deux fois :

- en SQL pour la liste : dans un `index()` de contrôleur, un `scopeVisibleTo` ou un module (`VisitesLisibles`) ;
- en PHP pour la fiche : dans `XPolicy::view`.

Les deux écritures ne tiennent ensemble que par un commentaire (« comme `XPolicy::view` », 7 occurrences). Trois formes coexistent pour la liste : scope de modèle (Lease, Customer, MaintenanceRequest, CommissionEntry), module séparé (PropertyVisit), contrôleur (Invoice, Payout, Booking, Inventory, Task, Guarantor). Seuls les documents ont un test de parité entre la liste et la fiche (`DocumentListReadParityTest`).

Le relevé a trouvé trois divergences réelles, vérifiées en lisant le code :

1. **Caution** : la liste ne rend au personnel que les cautions qu'il a lui-même ajoutées (`GuarantorController::index`, `where('added_by_id', …)`), alors que `GuarantorPolicy::view` ouvre toute caution de l'agence au personnel.
2. **État des lieux** : `Inventory::property()` ne charge pas un bien supprimé en douceur. `InventoryPolicy::view` appelle alors `auteurEncoreMembre(…, null)`, qui répond vrai sans condition d'appartenance. Un agent qui a quitté l'agence garde la fiche ; la liste, elle, l'écarte par `whereHas('property')`.
3. **Visite** : le même défaut existe dans `PropertyVisitPolicy::view` (`$property === null || …`). Task l'avait déjà corrigé avec `parentIsMissing()` ; la correction n'avait pas été reportée.

## Décision

**Pour chaque modèle lu par une liste et par une fiche, la règle « qui peut lire » vit dans un seul module à deux faces : `restreindre(Builder, User)` pour la liste, `peut(User, Model)` pour la fiche. `index()` applique la première ; `XPolicy::view` délègue à la seconde. Un test de parité générique garde les deux faces ensemble.**

1. **Le module** s'appelle `<Modèle>Lisibles` (patron de `VisitesLisibles`, de `BailleurDuBien::est` / `restreindre`) et vit sous `app/Services/Lecture/`, à côté de son domaine si le domaine a déjà un dossier (`app/Services/Visit/VisitesLisibles`). Ses deux faces sont écrites côte à côte, dans le même fichier, branche par branche.
2. **Deux écritures, pas une.** La fiche n'est pas jugée par `visibleTo()->whereKey()->exists()` : la policy `view` sert aussi `update`, les `can_*` des ressources et les jugements préchargés en mémoire (`MembershipCapabilityResolver::primed`, ADR-0099). Une seule écriture SQL les priverait de tout ça, au prix d'une requête par jugement.
3. **La parité est un test, pas un commentaire.** `tests/Feature/Lecture/ListeEtFicheParityTest.php` part d'un jeu d'acteurs (super-admin, personnel actif, personnel parti, bailleur, locataire, client, étranger à l'agence, profil dans deux agences) et vérifie, pour chaque modèle migré, **dans les deux sens** : tout ce que la liste rend s'ouvre en fiche, et toute ligne qui s'ouvre en fiche est dans la liste.
4. **Le parent supprimé en douceur se juge sur son agence.** Une ligne dont le bien est supprimé en douceur se juge sur l'agence de ce bien, chargée avec `withTrashed`. « Parent supprimé » ne veut jamais dire « pas d'agence » : un auteur parti n'y a plus accès, l'agence oui.
5. **L'agence qui compte est celle du profil actif** (`staffAgencyId()`, ADR-0004). Une exception (aujourd'hui : Task, qui lit dans toutes les agences du personnel pour la couverture d'absence, ADR-0035) s'écrit dans le docblock du module, avec sa raison.

## Conséquences

- **Une liste ne peut plus montrer ce que la fiche refuse, ni cacher ce qu'elle ouvre** : la divergence devient un rouge du test de parité.
- Un modèle neuf lu par liste et fiche doit avoir son module et entrer au test de parité.
- Les trois divergences changent un comportement visible :
  - le personnel voit dans la liste toutes les cautions de son agence ;
  - un auteur parti ne lit plus un état des lieux ou une visite dont le bien est supprimé ;
  - une ligne d'un bien supprimé reste lisible par le personnel de l'agence, en liste comme en fiche.
- Coût : un fichier de plus par modèle, et la discipline d'écrire les deux faces ensemble.
- Ce n'est pas une traduction automatique PHP → SQL : les deux faces restent écrites à la main. C'est le test qui les tient.

## Application

- Modules : `app/Services/Lecture/*Lisibles.php`, `app/Services/Visit/VisitesLisibles.php`.
- Les policies `view` des modèles migrés délèguent à `<Modèle>Lisibles::peut()`.
- Garde : `tests/Feature/Lecture/ListeEtFicheParityTest.php`, qui énumère les modèles migrés.
- Modèles migrés par TCK-3006 : Inventory, PropertyVisit, Guarantor, Invoice, Payout, Booking, Task, Lease, Customer, MaintenanceRequest. CommissionEntry (sans route `show`) et Document (ADR-0099) restent dans leur forme actuelle ; ServiceProviderBill partage déjà une seule règle entre liste et fiche.
