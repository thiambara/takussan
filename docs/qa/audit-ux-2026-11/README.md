# Audit UX 2026-11 — page par page, desktop et mobile

**Demande du porteur (2026-11-08)** : analyser toutes les pages du site public et de `/app`, sauf le
super admin. Pour chaque page, trois regards — business, ingénieur, client —, la navigation d'ensemble
en desktop et en mobile, et une conception mobile **propre à chaque page**, pas une règle générale
plaquée partout. Ambitieux : propositions de fond, pas seulement des corrections.

**Décisions de cadrage (porteur, 2026-11-08)** :

1. Audit d'abord, puis tickets, puis implémentation par lots validés.
2. Famille par famille, relue par le porteur entre deux familles.
3. La charte (`docs/design-guidelines.md`) peut être remise en question quand une page le justifie —
   chaque écart proposé est signalé comme tel (**⚑ écart de charte**).

4. **Toute proposition de design passe par une maquette statique avant d'être confirmée**
   (2026-11-08) : une route séparée, sans appel d'API, jusqu'à quatre approches par page, en mobile
   et en bureau, plusieurs pages présentées ensemble, une navigation simple entre les variantes. Le
   porteur choisit sur la maquette ; l'implémentation suit le choix.

## Maquettes

`http://localhost:3000/fr/playground/maquettes` sous `next dev` (404 en production, `noindex`).
Code : `takussan-web/src/app/[locale]/(public)/playground/maquettes/` — une visionneuse, un fichier
par page sous `pages/`, des données fictives (`donnees.ts`) et des photos libres d'Unsplash sous
`takussan-web/public/maquettes/`. Navigation : pages en haut, approches A–D (`←` `→`, `1`–`4`),
écrans d'un parcours, vues Téléphone / Bureau / Comparer (`t` `b` `c`) ; l'URL garde la position
(`?p=fiche&a=b&v=comparer`). Ouverte sur un téléphone, la visionneuse montre la maquette en plein
écran.

**Les maquettes ne sont PAS versionnées, et c'est voulu** (décision du porteur, 2026-11-09). Elles
vivent dans l'arbre de travail principal, sous
`/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/`
et `…/takussan-web/public/maquettes/`, exclues de git par `.git/info/exclude` (local, partagé par
les worktrees) : elles font rougir `check-i18n`, `check-champs-uniformes`, `check-locale-figee`,
`check-feedback-states` et `check-heritage-encre`, et on ne les aligne pas sur des gardes de
production pour un usage de référence.

**Pour l'agent qui implémente un ticket de cet audit** : la maquette citée par le ticket est la
**référence de fidélité** — mises en page, hiérarchie, libellés, états, téléphone et bureau. La lire
au chemin absolu ci-dessus (un worktree ne la contient pas) et, si possible, l'ouvrir sous
`./dev.sh` depuis l'arbre principal (`?p=<page>&a=<approche>&v=comparer`). Elle est statique et
écrite hors design system : on en reprend le **résultat**, jamais le code (vrais composants,
next-intl, `useFormatteurs()`). Les notes « Pour / Contre » d'une approche ont pu se tromper sur
l'API : le ticket fait foi. Le dossier se supprime avec le dernier ticket qui s'en sert.

## Familles

| # | Famille | Fichier | État |
|---|---|---|---|
| 1 | Site public (découverte, fiche, profils, outils, pages par lien) | [01-site-public.md](01-site-public.md) | maquettes choisies le 2026-11-08 ; premier lot : TCK-2493 → TCK-2506 (vague 84) ; second lot : TCK-2507 → TCK-2524 (vague 85) — toutes les pages de la famille ont leur approche retenue |
| 2 | Entrée : connexion, inscription, onboarding, publication | — | à faire |
| 3 | Coque de `/app`, accueil, tableaux de bord, messages, notifications, profil | — | à faire |
| 4 | Patrimoine et location : biens, baux, états des lieux, paiements, documents, maintenance | — | à faire |
| 5 | Commercial : CRM, pipeline, prospects, clients, visites, réservations, tâches, agenda | — | à faire |
| 6 | Agence : équipe, rôles, finances, rapprochement, KYC, modération, intégrations, crédits | — | à faire |

## Méthode

- **Au navigateur, jamais à la seule lecture du code** : chaque page à 1440 × 900 (bureau) et à
  390 × 844 en émulation tactile (téléphone), sur la base de démo (`migrate:fresh --seed`).
- **Le code en second regard** : états (chargement, vide, erreur), requêtes, SEO, cibles tactiles.
- **Sévérités** : P0 bloque la tâche · P1 gêne fortement ou coûte du business · P2 friction avec
  contournement · P3 finition.
- **Ce que l'audit ne juge pas** : le contenu de la base de démo (titres incohérents, « Villa Luxe
  5000m² » à 500 000 F, épingle de carte dans l'océan). Il est signalé une fois, pas compté comme
  défaut produit.

### Limite de l'environnement — les photos

La base de démo enregistre 3 451 médias de biens, mais `SEED_DOWNLOAD_MEDIA=false` (le défaut) ne
pose **aucun fichier** : au premier passage, toutes les cartes affichaient le texte de repli du
navigateur. Pour juger les mises en page avec des images, chaque média manquant a été relié
**localement** (liens symboliques sous `takussan-api/storage/app/public/`, ignoré par git) à l'une
des 53 images picsum présentes. Les images sont donc génériques (paysages, animaux) : leur
**présence** est réaliste, leur **contenu** ne l'est pas.

La revue précédente, [revue-design-2026-09-16](../revue-design-2026-09-16/), portait sur la finition
(jetons, débordements, cibles, i18n) et a corrigé ce qu'elle a trouvé. Cet audit ne la refait pas :
il porte sur les parcours, la valeur business et la conception mobile.
