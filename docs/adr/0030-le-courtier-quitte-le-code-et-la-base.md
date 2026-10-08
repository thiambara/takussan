# ADR-0030 — Le courtier quitte le code et la base

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Tickets** : [TCK-586](../backlog/tickets/TCK-586-retrait-complet-du-courtier.md)
- **Remplace** : [ADR-0027](0027-le-courtier-sort-de-la-surface-commutable.md) (« le courtier sort de la surface
  commutable, sans quitter la base »). Précise l'application d'[ADR-0002](0002-role-est-un-profil-polymorphe.md) :
  la liste des profils polymorphes compte désormais cinq types, pas six.

## Contexte

ADR-0027 a retiré le courtier de tout ce qui se **choisit** (sélecteur d'espaces, `roles`, menus) et a
gardé tout ce qui se **lit** : modèles, tables, relation `User::brokerProfile()`, seeders, et trois
lectures publiques. Son argument était l'asymétrie de risque : une table supprimée ne se recrée pas
avec ses lignes, alors qu'un profil seulement masqué « se réexpose le jour où il a un produit
derrière lui ».

Mesuré le 2026-10-06, sur `origin/dev` (`e3ab4a4e`) :

- **Aucune ligne réelle n'existe à protéger.** Aucun chemin applicatif n'a jamais créé de
  `BrokerProfile` (constat d'ADR-0027, toujours vrai : `php artisan route:list` ne contient aucune
  route courtier, et aucun service ne crée le profil). Les seules lignes viennent des seeders
  (`database/seeders/Core/UserSeeder.php:184,200-207`, `TestSeeder.php:40,67`) et des factories.
  `user_customer_relationships.relationship_type = 'broker_client'` n'est écrit que par
  `UserCustomerRelationshipSeeder.php:54` : l'API n'écrit que `agent_client`
  (`CustomerController.php:135`). L'API n'a jamais servi en production (`CLAUDE.md`, § Workflow git).
- **Ce qui est resté en base a continué d'agir — et mal.** Trois lectures « justes » selon ADR-0027 §5
  présentent publiquement tout titulaire d'un `BrokerProfile` comme un professionnel de l'agence, sans
  collaboration ni échéance : `PropertyResource.php:284` (`return $user->hasProfile(BrokerProfile::class)`),
  `PublicProfileFacts.php:307`, `PublicAgencyController.php:293`. Et la console super-admin lit
  `brokerProfile->status` sur une colonne qui n'existe pas (`UserDetailResource.php:53` ; la migration
  `2026_05_02_000003` n'a pas de `status`) — `null` en silence. *Une donnée gardée « pour plus tard »
  n'est pas inerte : le code qui la lit continue de décider avec elle.*
- **L'empreinte** : 30 fichiers applicatifs côté API (modèles, contrôleurs, ressources, services,
  migrations, factories, seeders), 9 fichiers de test, 17 fichiers côté web (dont 3 dictionnaires),
  deux sections de `docs/models-spec.md` (§36, §38) et une note de `docs/features.md` (§2.1).

Le 2026-10-06, après l'analyse par acteur, **le porteur a décidé que le courtier sort à 100 % du code.**

## Décision

**Le courtier n'existe plus dans Takussan : ni profil, ni table, ni relation, ni valeur d'énumération,
ni fixture, ni libellé.**

1. Une migration **nouvelle** supprime `broker_agency_collaborations` puis `broker_profiles`. Les
   migrations de création d'origine restent (l'historique des migrations ne se réécrit pas).
2. Une migration de données supprime les lignes `user_customer_relationships` de type `broker_client`,
   puis le cas `RelationshipType::BrokerClient` disparaît.
3. `BrokerProfile`, `BrokerAgencyCollaboration`, leur factory, la relation `brokerProfile()`, et toutes
   leurs lectures disparaissent, y compris les trois lectures publiques ci-dessus, la console
   super-admin et l'export de données personnelles.
4. Seeders et `TestSeeder` ne fabriquent plus de compte courtier.
5. Côté web, les derniers restes (types, libellés, badge, commentaires) disparaissent.

**Hors décision, à ne pas toucher** : le « password broker » de Laravel (`Password::broker()`,
`config/auth.php`, `app('auth.password.broker')`) — homonyme sans rapport avec l'acteur.

## Pourquoi on accepte ce qu'ADR-0027 refusait

ADR-0027 refusait la migration de suppression parce que son `down()` « recrée un schéma vide, jamais
les lignes ». L'argument tenait pour des lignes qui portent quelque chose. Ici, il n'y en a aucune qui
ne soit une fixture : le coût de l'irréversibilité est nul, et le coût du maintien est mesuré (trois
affirmations publiques fausses, une colonne fantôme lue en silence). **Le `down()` recrée les deux
tables vides avec leur schéma d'origine** — c'est un `down()` juste pour ce qu'il peut promettre, et il
le dit dans son commentaire.

## Conséquences

- **Réintroduire un courtier est une fonctionnalité neuve**, à instruire de zéro : spec, ADR, porte
  d'entrée, capacités déclarées, écrans, tables. Rien de ce qui disparaît ici ne doit être ressuscité
  par `git revert` : le modèle d'origine portait les défauts listés au Contexte.
- **Les gardes posées par TCK-494/TCK-495 restent** (`AppSidebar.audience.test.tsx`,
  `user-roles.parity.test.ts`, `ProfileSchemaTest` réécrit) : elles affirment désormais l'absence du
  courtier, et rougissent si une partie revient sans le reste.
- `docs/models-spec.md` §36 et §38 sont retirés, et la note de `docs/features.md` §2.1 est réécrite,
  **après** la fusion de TCK-586, par `/sync-specs` — `scripts/check-models-spec.mjs` exige que tout
  modèle présent dans le code soit dans la spec : retirer les sections avant le code ferait rougir la CI.
- ADR-0027 passe au statut « Remplacé par ADR-0030 » ; son texte reste, il explique pourquoi les
  gardes existent.

## Application

TCK-586. Ce qui empêche le retour en silence : un test de schéma qui affirme que les deux tables
n'existent pas, la disparition de la classe (toute référence résiduelle casse à l'autoload ou à
l'analyse), et les gardes de parité front existantes.
