# ADR-0061 — Les crédits appartiennent à l'espace, se tiennent en lots datés, et paient trois boosts dont la vedette passe par des emplacements tournants

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Tickets** : [TCK-633](../backlog/tickets/TCK-633-lot-retours-porteur-publication-recherche-boost.md)

## Contexte

Relu sur `dev` le 2026-10-11 :

- **Aucune notion de crédit, de portefeuille ni de boost.** La seule mise en avant est le booléen
  `properties.featured` : sans date de fin ni payeur, écrit par le seul super-admin au travers du
  PATCH générique du bien (`UpdatePropertyRequest`, `prohibitedIf(! isSuperAdmin())`), **sans aucun
  écran** pour le faire.
- **Son effet est partiel.** La liste publique et la recherche à requête vide trient
  `featured DESC, published_at DESC` (`PublicPropertyController`, `PropertySearchService`) ; dès
  qu'un mot est tapé, le tri est vide et la pertinence décide seule — un bien « mis en avant »
  n'y gagne rien. L'accueil (`HomepageDiscoveryService::ranked()`) les remonte dans toutes ses
  rangées.
- **Rien ne s'achète sur la plateforme pour son compte.** `PaymentGatewayService::PAYABLES` ne
  connaît que les acomptes, les loyers et les factures d'agence ; l'abonnement se paie hors ligne
  (TCK-222). `features.md` §1.12 annonçait une monétisation future « pay-per-listing ».

Le **2026-10-11**, le porteur a demandé un boost payant en crédits, achetés ou offerts, avec un
nombre élevé offert à chaque nouvel utilisateur au lancement, et sa gestion dans le super-admin.
Les arbitrages ci-dessous ont été tranchés avec lui le 2026-10-12 (D5, D6, D12 à D16 de la
conception).

## Décision

**Les crédits appartiennent à l'espace (l'agence), se tiennent en lots datés inscrits à un registre
qu'on ne réécrit jamais, et paient trois produits : la Remontée, la Vedette et le Badge. La Vedette
n'achète pas un rang : elle achète un tour dans des emplacements « Sponsorisé » tournants, au-dessus
de résultats dont l'ordre ne change pas.**

### 1. Le solde est celui de l'espace

- Un particulier est seul dans son espace : le solde est le sien. Une agence `standard` a **un**
  solde commun ; dépenser exige la capacité **`boost.spend`**, que le rôle système `agency_admin`
  reçoit avec les autres capacités assignables, et que l'agent n'a pas par défaut.
- Un agent qui quitte l'agence n'emporte rien : le bien boosté et la dépense sont ceux de l'agence.

### 2. Un registre en lots, jamais réécrit

- **`credit_lots`** — une entrée de crédits : espace, origine (`welcome`, `admin_grant`, `refund`,
  puis `purchase` en phase 2), montant initial, **montant restant**, date d'expiration (nulle pour un
  achat), auteur et motif s'il s'agit d'un octroi manuel, date du préavis d'expiration envoyé.
- **`credit_movements`** — chaque mouvement, signé (`grant`, `spend`, `refund`, `expire`,
  `admin_debit`), rattaché à son lot et, s'il y a lieu, au boost. **Insertion seule** : une erreur se
  corrige par un mouvement de sens contraire, jamais par une mise à jour.
- **Invariant** : pour chaque lot, montant initial + somme de ses mouvements négatifs = montant restant.
  Le solde de l'espace est la somme des restants des lots non expirés.
- **Ordre de consommation** : les lots qui expirent le plus tôt d'abord, les lots sans expiration en
  dernier, puis par ancienneté. Une dépense qui couvre plusieurs lots écrit un mouvement par lot.
- **Concurrence** : toute dépense verrouille d'abord **la ligne de l'agence**
  (`lockForUpdate()->firstOrFail()`), puis lit les lots — le verrou sur un agrégat est refusé par
  PostgreSQL et ne fermerait pas la course (CLAUDE.md, piège n°2).
- Les crédits sont des **entiers**. Ils ne passent jamais par la règle ×100 des montants : ce ne
  sont pas des montants. La phase 2 (achat) l'appliquera au **prix** du pack, pas aux crédits.

### 3. L'offre de bienvenue, une fois par numéro vérifié

- Elle est versée **au titulaire de l'espace** (`primary_admin_id`), **une seule fois par numéro
  vérifié** : au moment où l'espace naît si le numéro l'est déjà, sinon au moment où il le devient.
- Le registre **`credit_welcome_grants`** retient l'empreinte HMAC du numéro (comme
  `alert_subscribers.contact_hash`) : il survit à l'anonymisation d'un compte supprimé, qui efface le
  numéro, et empêche qu'un même numéro fasse naître des crédits deux fois. Comme un numéro vérifié
  n'appartient qu'à un compte (TCK-589), multiplier les comptes ne multiplie pas l'offre.
- Montant et validité sont des **réglages** (§6), lus au moment de l'octroi.

### 4. Les crédits offerts expirent ; les crédits achetés, jamais

- Un lot `welcome`, `admin_grant` ou `refund` porte une date d'expiration. La tâche planifiée
  l'expire (mouvement `expire` du restant) et, **une fois**, prévient l'espace quelques jours avant
  (réglage).
- Un lot `refund` hérite de l'expiration **la plus lointaine** des lots débités par le boost
  remboursé — nulle si l'un d'eux n'expirait pas. Un remboursement ne prolonge jamais un crédit
  offert, et ne fait jamais expirer un crédit acheté.

### 5. Trois produits, un catalogue

Le catalogue **`boost_products`** (genre, durée, variante de badge, prix en crédits, actif, ordre)
se règle dans le super-admin. **Le prix et la durée sont figés sur le boost à l'achat** : modifier le
catalogue ne touche pas un boost déjà acheté. Le front possède les libellés (principe 5) : un
produit se nomme par son genre, sa durée et sa variante.

| Genre | Effet | Règles |
|---|---|---|
| **Remontée** (`bump`) | Le bien repasse en tête du tri par récence. | Ponctuelle, jamais remboursée. Au plus une par bien et par délai réglé (24 h par défaut). |
| **Vedette** (`featured`) | Le bien entre dans la rotation des emplacements « Sponsorisé » et la rangée vedette de l'accueil, avec un badge, pour une durée. | Pas de cumul : en racheter une prolonge la date de fin. |
| **Badge** (`badge`) | « Urgent » ou « Prix en baisse » sur l'annonce, pour une durée. Aucun effet de rang. | Un seul actif par bien ; un nouveau remplace l'ancien, sans remboursement. |

Les boosts vivent dans **`property_boosts`** (bien, espace, produit, genre, variante, prix et durée
figés, début, fin, statut `active | paused | ended | cancelled | refunded`, secondes restantes à la
pause, auteur de l'achat ou de l'offre). Le bien porte les colonnes que la recherche lit :
**`ranked_at`** (date de tri par récence : la publication, ou la dernière remontée),
**`sponsored_until`**, **`badge`** et **`badge_until`**.

`featured` **cesse d'être une saisie** : il devient l'état dérivé « une Vedette est active », tenu
par le cycle de vie du boost, et plus aucune requête ne l'écrit. Le filtre public `featured=true`,
le badge « Mis en avant » et la rangée vedette continuent de le lire. Une mise en avant gratuite du
super-admin est **une Vedette offerte** (prix 0, auteur noté, aucun mouvement de crédit) : elle
laisse une trace et une fin, ce que le booléen ne faisait pas.

### 6. Réglages

Clés ajoutées à `EditablePlatformSettings`, avec ces défauts validés le 2026-10-12 :

| Clé | Défaut |
|---|---|
| `credits.welcome_amount` | 500 |
| `credits.welcome_validity_days` | 180 |
| `credits.expiry_notice_days` | 7 |
| `boost.bump_cooldown_hours` | 24 |
| `boost.sponsored_slots_per_page` | 3 |

Catalogue initial : Remontée 5 · Vedette 7 / 15 / 30 jours : 20 / 35 / 60 · Badge 7 jours : 10.

### 7. La vedette achète un tour, pas un rang

- **Les résultats organiques ne lisent plus `featured`.** Le tri par défaut devient `ranked_at DESC`
  (liste, recherche à requête vide, rangées de l'accueil) ; avec un mot, la pertinence décide, comme
  aujourd'hui.
- **En tête de chaque page** de résultats, jusqu'à N emplacements « Sponsorisé » (réglage) sont tirés
  parmi les biens **en vedette active qui satisfont les mêmes filtres** : une seconde requête
  Meilisearch, mêmes filtres plus `is_sponsored = true`, ne rapatrie que des identifiants.
- **La rotation est déterministe** : la liste est mélangée par une graine faite des filtres
  normalisés et de l'heure courante, et la page *p* en prend la tranche *p* (en bouclant). Deux
  visiteurs voient la même chose dans la même heure — la page reste cacheable — et chaque bien en
  vedette passe à son tour.
- Les emplacements sortent dans un champ **`sponsored`** de la réponse, **hors** pagination et hors
  `total`. Un bien sponsorisé garde sa place organique en dessous.
- La rangée vedette de l'accueil applique la même rotation, filtrée sur la zone de la rangée.

Pourquoi pas « vedettes d'abord » : avec une offre de bienvenue généreuse, une large part des
annonces sera en vedette ; les trier en tête rendrait le boost sans effet et enterrerait les autres
annonces. Pourquoi pas un simple départage : il ne se verrait pas, et ne se vendrait pas.

### 8. Un boost suit la vie du bien

- **Le bien quitte la surface publique** (dépublié, mis en pause, agence suspendue) : les Vedettes et
  Badges actifs passent `paused`, avec leurs secondes restantes. **Il y revient** : ils reprennent
  avec ce qui restait.
- **Le bien est loué, vendu, ou supprimé par l'annonceur** : le boost est `refunded` ; les jours
  pleins restants sont rendus au prorata du prix figé, en un lot `refund` (§4).
- **Le bien est retiré par la modération** (verrou plateforme, décision de signalement « masquer » ou
  « retirer ») : le boost est `ended` **sans** remboursement — les crédits ne paient pas une annonce
  frauduleuse. Le super-admin peut rembourser à la main.
- Remontée et Badge ne sont jamais remboursés automatiquement.

### 9. Une tâche planifiée, unique

`boosts:tick` (toutes les 5 minutes) termine les boosts échus, tient `featured`, `sponsored_until`,
`badge` à jour et réindexe les biens touchés, expire les lots échus et envoie les préavis. Elle est
**idempotente** : deux passages qui se recouvrent ne débitent, n'expirent ni ne notifient deux fois.

### 10. Mesure

Les impressions d'un emplacement sponsorisé sont comptées par boost et par jour (compteur en cache,
vidé par la tâche dans `property_boost_daily_stats`) ; un clic est une vue de la fiche arrivée par
un lien d'emplacement (`src=sponsored`). Le super-admin lit le taux de clic des emplacements.

### 11. Phase 2 : l'achat

L'achat de packs par Wave ou Orange Money **n'est pas dans ce lot**. Il ajoutera un payable
`CreditPurchase` à `PAYABLES`, sur l'intégration globale de la plateforme, appliquera la règle ×100
au prix, et créera un lot `purchase` sans expiration. Le registre est conçu pour l'accueillir sans
migration de ses tables.

## Conséquences

- **Le classement public change pour tous.** Les biens aujourd'hui `featured` perdent leur place de
  tête dans la liste organique et la gagnent dans les emplacements. Les seeders qui posent `featured`
  posent désormais une Vedette offerte.
- **Le booléen `featured` n'a plus d'écrivain direct.** Toute écriture hors du cycle de vie du boost
  est un défaut ; le PATCH du bien le refuse pour tout le monde.
- **Deux requêtes Meilisearch par page de résultats** au lieu d'une ; la seconde ne rapatrie que des
  identifiants.
- **Un registre en insertion seule** coûte une table de plus et interdit la correction en place :
  c'est le prix d'un solde qu'on peut toujours reconstituer et justifier ligne à ligne.
- **L'expiration crée une obligation d'information** : prévenir avant, et montrer la date de chaque
  lot sur la page « Crédits ».
- **La comparaison avec le taux de clic organique n'est pas mesurée** : elle exigerait de compter
  l'impression de chaque résultat. Hors de ce lot.

## Application

À écrire par TCK-633 au moment de l'implémentation : les tests de l'invariant des lots, de la
consommation par expiration croissante, de la course de deux dépenses simultanées sur un solde
juste, de l'unicité de l'offre par numéro (compte supprimé compris), de la rotation (même page, même
heure, même tirage ; toutes les vedettes servies sur un cycle), de la pause et du remboursement au
prorata, et de l'idempotence de `boosts:tick` ; et la mise à jour de `docs/models-spec.md` pour les
cinq tables.
