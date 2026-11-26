# Le dossier Takussan

`takussan.html` explique Takussan sur les plans business et technique, pour le présenter aux acteurs
(propriétaires, agences, partenaires) ou à un ingénieur qui arrive. Il s'ouvre seul dans un navigateur :
double-cliquer sur le fichier suffit.

Ce qu'il contient :

- **Les 7 acteurs** : comment chacun entre dans le système, son parcours, ses espaces, ses droits.
- **125 fonctionnalités principales**, chacune avec ses écrans, ses appels à l'API, un diagramme de
  séquence, le schéma des tables qu'elle touche, ses règles et ses notifications.
- **Le modèle de données** : 155 tables en 16 domaines, une carte des domaines, un schéma par domaine et
  une fiche par table (colonnes, relations, fonctionnalités qui s'en servent).
- **L'architecture** : la pile, la vie d'une requête, les profils et capacités, l'asynchrone, le
  déploiement, la CI et le guide du premier jour.
- Deux **visites guidées** (présenter Takussan, parcours ingénieur), un mode **Business** qui masque le
  détail technique, une recherche (⌘K ou `/`), un thème clair ou sombre.

> ⚠️ **C'est un relevé daté, pas une source de vérité.** Il a été pris sur `dev` le 2026-11-26 (le
> commit est écrit dans la page). Les sources restent `docs/features.md`, `docs/models-spec.md` et le
> code. Les chiffres de la page « En chiffres » sont donnés avec la commande qui les produit : relancez-la
> plutôt que de recopier le chiffre.

Polices (Google Fonts) et mise en page des schémas (dagre, cdnjs) se chargent depuis Internet. Hors
ligne, la page s'affiche avec des polices de repli et une mise en page simplifiée des schémas.

## Régénérer la page

`source/` contient le générateur : `template.html` (gabarit et styles), `app.js` (rendu des vues, des
schémas de base, des séquences et des graphiques), `copy.js` (tous les textes éditoriaux) et `build.mjs`.

```bash
node docs/presentation/source/build.mjs . docs/presentation/takussan.html
```

Sans relevé neuf (`source/data/*.json`), le script relit les données déjà embarquées dans
`takussan.html` : on peut donc retoucher un texte ou un style et régénérer sans refaire le relevé. Le
catalogue (`docs/features-by-actor.md`) et le commit sont relus à chaque génération. Un relevé neuf se
refait avec des agents en lecture seule, un par groupe d'acteurs, plus un pour le modèle de données et un
pour l'architecture : le format attendu de chaque fichier se lit dans `build.mjs` et `app.js`.
