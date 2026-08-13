# AGENTS.md

**Les instructions de ce dépôt vivent dans [`CLAUDE.md`](CLAUDE.md). Lis-le.**

Ce fichier ne les recopie pas, et c'est délibéré.

Il en portait auparavant une **copie**, qui avait divergé : elle affirmait — comme `CLAUDE.md` à
l'époque — que les deux applications étaient des squelettes vides, dans une version encore plus
ancienne (sans la section sur les pièges de migration MySQL), et pointait vers un dossier
`.Codex/commands/` qui n'existe pas.

Deux fichiers d'instructions à la racine d'un dépôt ne restent jamais d'accord. Celui qu'on ne
maintient pas devient un piège d'autant plus efficace qu'il ressemble à l'autre : un agent qui le lit
n'a aucune raison de se méfier. Une seule source, et un renvoi.

## Conventions par dossier

Chargées à la demande quand on travaille dedans :

- [`takussan-api/CLAUDE.md`](takussan-api/CLAUDE.md) — conventions du backend Laravel.
- [`takussan-web/CLAUDE.md`](takussan-web/CLAUDE.md) — conventions du frontend Next.js.

## À lire avant de planifier

- [`docs/ardoise.md`](docs/ardoise.md) — l'inventaire des manquements mesurés, avec leurs preuves.
- [`docs/adr/README.md`](docs/adr/README.md) — les décisions d'architecture.
