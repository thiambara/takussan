# ADR-0007 — Pas de type `enum()` SQL : `string()` en base, enum PHP en code

- **Statut** : Accepté
- **Date de la décision** : 2026-04 · **Rédigé rétroactivement** : 2026-08-12

## Contexte

Le domaine est plein d'ensembles fermés : statut de réservation, statut de bail, type de bien, état
d'une demande de maintenance, catégorie de document, niveau de profil plateforme. Le dépôt en compte
**72**.

Le type `enum()` de MySQL semble fait pour ça. Il a deux défauts qui pèsent plus que son bénéfice.

**Ajouter une valeur est un `ALTER TABLE`.** Sur une table transactionnelle qui grossit, c'est une
migration verrouillante pour un changement qui, fonctionnellement, n'est rien. Retirer ou renommer
une valeur est pire.

**La portabilité.** Les tests tournent sur SQLite, qui n'a pas d'`enum()` — la colonne y devient un
`TEXT` sans contrainte. La garantie annoncée par le schéma n'existe donc que sur un environnement,
et c'est celui qu'on éprouve le moins.

## Décision

**Aucune colonne `enum()`. Une colonne `string()`, et un enum PHP *backed* qui porte les valeurs et
les règles.**

La validation passe par `Rule::enum(XEnum::class)`, le cast Eloquent fait la conversion, et un
endpoint public (`GET /api/enums/{key}`, en cache 300 s) sert le catalogue au frontend pour qu'il
n'ait pas à recopier les listes.

## Conséquences

**Ce qu'on gagne.** Ajouter une valeur est une ligne de PHP, sans migration. Les valeurs portent des
comportements — libellés traduits, regroupements, transitions autorisées — ce qu'un `enum()` SQL ne
peut pas faire. Et le front ne duplique aucune liste.

**Ce qu'on perd, et il faut le dire.** **Aucune contrainte de base ne garantit les valeurs.** Une
écriture qui contourne le modèle — un `DB::table()->update()`, une migration de données, un import —
peut poser n'importe quelle chaîne, et rien ne s'y oppose. La garantie est applicative, donc elle
vaut ce que vaut la discipline des chemins d'écriture.

Un `CHECK` en base donnerait le meilleur des deux (contrainte réelle, évolution par migration
légère). Ce n'est pas fait, et ce serait le complément naturel de cette décision plutôt qu'un
revirement.

**Où vivent les enums.** Dans **`app/Models/Enums/`** (72 fichiers) — il n'existe **pas** de
`app/Enums/`, et c'est le genre de détail qui fait créer un doublon à qui ne le sait pas.

## Application

- `app/Models/Enums/` — 72 enums · `app/Models/Bases/Enums/UserStatus.php` · `app/Domain/Features/Flag.php`.
- `routes/api/enums.php` — `GET enums/{key}`, cache 300 s.
- `app/Http/Controllers/Api/PropertyController.php:76-82` — `Rule::enum()` en usage.
- `CLAUDE.md` — piège de migration n°4.
- **La garde** : le job `migrations-mysql` de `api-ci.yml` rejoue les migrations sur MySQL 8.0 —
  le moteur de la production, mesuré le 2026-08-13 (ardoise D-43). Il
  n'interdit pas un `enum()` explicitement, mais c'est le seul endroit où un écart entre le schéma
  MySQL et le schéma SQLite peut désormais se voir.
