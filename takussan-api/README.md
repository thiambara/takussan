# takussan-api

API Laravel de Takussan (PHP 8.4, PostgreSQL 17).

Ce fichier était le README par défaut de Laravel. Il ne disait rien de ce dépôt ; il a été remplacé
le 2026-11-03. La documentation qui fait foi vit ailleurs :

- [`../CLAUDE.md`](../CLAUDE.md) : l'état du projet, les commandes réelles, le workflow git ;
- [`CLAUDE.md`](CLAUDE.md) : les conventions de l'API (contrôleur de base, autorisation par
  capacités, pièges PostgreSQL des migrations) ;
- [`../docs/`](../docs/) : les specs, les ADR, le backlog et l'infrastructure.

Démarrer : `./dev.sh api` depuis la racine du dépôt. Tester : `php bin/impacted-tests.php --run`.
