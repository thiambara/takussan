# Plan d'implémentation — audit UX de la partie connectée (familles 2 à 6), TCK-2578 → TCK-2692

> **Pour les agents :** chaque ticket s'implémente par la compétence `implementing-specs`
> (`.agent/skills/implementing-specs/SKILL.md`, relayée par `/implement-spec`). Ce plan ne la
> remplace pas : il dit **dans quel ordre**, **avec qui**, **sous quelles règles communes** et
> **avec quelle preuve**. Les cases `- [ ]` se cochent dans le journal en bas de page.

**But :** livrer les 115 tickets des vagues 86 à 91 de sorte que chaque écran de `/app` soit, à la
mesure, celui que le porteur a validé — téléphone, bureau 1440 et bureau 1280 — sans régression.

**Architecture :** d'abord le terrain (vague 91 : outil de fidélité, densité par jetons, primitives,
coque), en parallèle de **tout le back** (aucun ticket back ne dépend du terrain) ; puis trois
pages d'étalonnage ; puis les pages par famille, chaque famille tenue par des agents qui enchaînent
leurs tickets dans un **arbre partagé**, la session commitant par ticket.

**Pile :** Laravel 13 / PHP 8.4 / PostgreSQL 17 · Next.js 16 / React 19 / Tailwind 4 /
`@base-ui/react` · outil de fidélité de TCK-2684 (CDP, styles calculés, références JSON gelées).

- **Date** : 2026-11-11
- **Décidé par** : le porteur — « je valide tout, commit les docs puis PR vers dev […] concocte un
  plan pour implémenter tous les tickets avec les meilleures pratiques en web design. Je te fais
  confiance, gère tout. »
- **Sources** : [audit](../qa/audit-ux-2026-11/README.md) (familles 2 à 6),
  [fidélité au pixel](../qa/audit-ux-2026-11/fidelite-au-pixel.md) et ses annexes A à D,
  [ADR-0106](../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md),
  [ADR-0107](../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md), les tickets eux-mêmes.
- **Feu vert** : le 2026-11-11, après lecture du plan, le porteur : « suis ton plan
  d'implémentation et implémente tous les tickets selon tes propres recommandations ». Avec
  « gère tout », c'est une **délégation de fusion** au sens de la famille 1 : une PR fusionnée
  seulement sur CI verte, chaque ticket vérifié avant de passer à `done`.

## Contraintes globales (valent pour chaque ticket)

- **La maquette retenue fait foi au pixel** (ADR-0106), à taille réelle : téléphone 390 × 844 à
  `rem` 16 ; bureau 1440 × 900 à `rem` 16 et densité ×0,9 (ADR-0107) ; bureau 1280 là où une
  maquette 1280 existe ; sous 1280, la règle d'ADR-0106 § 4. **Trois exceptions seulement** :
  accessibilité mesurée, contrainte technique, incohérence entre maquettes (valeur majoritaire).
- **Aucune valeur arbitraire** dans `src/app/(dashboard)` et ses composants (`text-[13px]`,
  `shadow-[…]`…) : des jetons (TCK-2685), en `rem` calculés. Racine à 16 px partout (ADR-0107).
- **Densité au pointeur** : au doigt, contrôles de 44/48 px quelle que soit la largeur (TCK-2686,
  AC8). **Rail d'icônes de 60 px entre 768 et 1023 px** (TCK-2480) : on ne le retire pas.
- **Vouvoiement partout** (ADR-0095 amendée) ; « F » dans `/app`, « F CFA » sur l'offre et
  l'abonnement ; dates sans l'année de l'année en cours.
- **i18n** : une clé neuve part avec `fr`, `en` et `wo` ; **le wolof est en pause** — `wo` porte
  le texte français tel quel. Le front possède le texte ; l'API émet des codes.
- **Données** : sparse fieldsets (`fields[…]`), filtres côté serveur, `include=` ; le préfixe
  `/api` est écrit par l'appelant d'`apiRequest`/`useApiQuery`.
- **Autorisation** : capacités par profil (`Capability`, `MembershipCapabilityResolver`) ;
  l'agence est la frontière d'isolation ; jamais `Spatie\Permission`.
- **Montants** : décimal en base, entier ×100 à la frontière d'un driver de paiement.
- **Migrations** : pensées pour PostgreSQL ; `down()` juste ; jamais `migrate:fresh` sur la base
  de démo partagée (`php artisan migrate` seulement).
- **Tests** : TDD ; chaque test d'une règle vérifié **par ablation** (retirer le correctif, voir
  rouge, restaurer par `cp`, prouver par `md5`). Les agents ne lancent que **leurs** tests
  (`php artisan test <fichiers>`, `npx vitest run <fichiers>`, `php bin/impacted-tests.php
  --run --connus`) ; **jamais une suite entière, ni agent ni session** : la CI la joue.
- **Avant chaque commit** : `./vendor/bin/pint` (API) ; `npm run lint` + `npx tsc --noEmit` sur le
  front ; `npm run check:i18n` ; les gardes `scripts/check-*.mjs` touchées.
- **Modèle** : implémentation et vérification sur **Opus 5.5** ; un agent de test déclare son
  identifiant avant chaque lot.

## Les meilleures pratiques, rendues vérifiables

Le porteur demande « les meilleures pratiques en web design ». Elles ne s'ajoutent pas aux tickets
comme un vœu : chacune a sa **mesure** et son **moment**.

| Pratique | Règle | Où elle est prouvée |
|---|---|---|
| Une seule échelle, réglage de l'utilisateur respecté | racine 16 px, densité ×0,9 par jetons, texte en `rem` | TCK-2692 (police navigateur à 20 px → le texte grossit), garde de TCK-2685 |
| Contraste | texte ≥ 4,5:1, contour de contrôle et icône utile ≥ 3:1 (WCAG 1.4.3, 1.4.11) | test de contraste des jetons (TCK-2685), AC-F de chaque page |
| Focus visible | anneau plein, jamais retiré, jamais masqué par un en-tête collant (WCAG 2.4.7, 2.4.11) | AC-F, parcours clavier de chaque page à la PR |
| Cibles | 44 px au doigt, 24 px minimum partout (WCAG 2.5.8) | TCK-2686 AC1/AC8, vitrine |
| Reflow | aucune page ne défile horizontalement, de 320 à 1440 px (WCAG 1.4.10) ; une table défile dans son cadre | balayage de chaque page touchée à 390/768/1024/1280/1440 (§ Preuve) |
| Texte qui ne disparaît pas | aucun nom, montant, statut ni date tronqué ; un texte secondaire cède en ellipse, jamais en coupe nette | même balayage (ellipse ≠ coupe) |
| Champs | étiquette visible liée, erreur reliée (`aria-describedby`), `inputmode` et `autocomplete` justes, 16 px au téléphone (pas de zoom iOS) | AC des tickets de formulaire, `useApiForm` |
| États | chargement (squelette à la forme du contenu, pas de saut), vide utile (dit quoi faire), erreur qui dit comment s'en sortir | chaque page : les trois états relevés à la PR |
| Mouvement | `prefers-reduced-motion` respecté ; aucune animation porteuse de sens seule | revue de PR, garde existante s'il y en a une |
| Stabilité | pas de saut de mise en page (dimensions réservées, images dimensionnées) ; CLS < 0,1 sur les pages refaites | relevé Lighthouse de la page à la PR |
| Sémantique | un `h1` par page, titres en ordre, listes en `ul`, tables en `table`, landmarks | AC-F (rôles appariés par l'outil), revue |
| Composants | une primitive = un dessin ; jamais de copie locale d'une primitive | gardes existantes (`check-champs-uniformes`, `check-status-badge-unique`…) + revue |
| Responsive par le contenu | requêtes de conteneur là où un composant vit à plusieurs largeurs (ADR-0107 les rend possibles) ; `lg`/`xl` pour la page ; `min-[1440px]:` seulement là où la maquette 1280 l'exige | revue, balayage |

## Ordre

```
Vague 91 (terrain)                         Back (toutes familles)          Textes sans fidélité
  TCK-2684 outil + gel                       5 agents, un par famille        TCK-2615, 2616, 2683, 2676
     │                                       (aucune dépendance au terrain)
  TCK-2692 racine 16 / densité par jetons
     │
  TCK-2685 jetons
     ├── TCK-2686 densité ──┬── TCK-2688 primitives existantes 2
     │                      └── TCK-2689 primitives neuves 1
     ├── TCK-2687 primitives existantes 1
     └── TCK-2690 primitives neuves 2 ── TCK-2691 coque (avec 2686)
                                     │
                        Étalonnage : TCK-2617 (coque téléphone), TCK-2580 → TCK-2581 (P0 famille 5),
                                     TCK-2659 (Argent) — tolérances fixées sur ces trois-là
                                     │
                        Pages, par famille (§ Lots F)
```

### Étape 0 — avant toute ligne de code

- [x] Le porteur dit « on attaque » (2026-11-11, ci-dessus).
- [ ] Un compte de démo **locataire avec un bail actif** existe (TCK-2684, AC8) : le compte
      « locataire » de la démo montre aujourd'hui le menu d'un client.
- [ ] Les maquettes locales sont **sauvegardées hors du dépôt** (archive datée) : elles ne vivent
      que dans l'arbre principal, hors git, et le gel des références les lit.

### Étape 1 — le terrain (vague 91), en série

Un seul agent « terrain », qui enchaîne : chaque ticket touche `globals.css`, `src/components/ui/`
ou la coque, et le suivant lit ce que le précédent a posé.

- [ ] **TCK-2684** — l'outil de fidélité (`takussan-web/scripts/fidelite/`) et le **gel des
      références** (`docs/qa/audit-ux-2026-11/fidelite/references/`, JSON) des écrans retenus,
      téléphone, 1440 et 1280.
- [ ] **TCK-2692** — retirer `html { font-size: 90% }`, poser la densité ×0,9 par jetons ;
      preuve : comparaison avant/après **= 0** au-delà des tolérances sur le site public et `/app`,
      à 1440, 1280 et 1024 ; 390 inchangé.
- [ ] **TCK-2685** — les jetons de `/app` en `rem` calculés, la vitrine, la garde des valeurs
      arbitraires.
- [ ] **TCK-2686**, **TCK-2687**, **TCK-2690** — peuvent se suivre dans n'importe quel ordre ;
      2686 avant 2688 et 2689 ; 2690 et 2686 avant 2691.
- [ ] **TCK-2688**, **TCK-2689**, **TCK-2691**.
- [ ] **Point porteur n° 1** : la vitrine des primitives à 390 et 1440, et `/app/leases` dans la
      coque refaite. Il valide ou corrige avant qu'une page ne s'appuie dessus.

### Étape 1 bis — en parallèle de l'étape 1 : tout le back, et les textes

Aucun ticket back ne dépend du terrain. Cinq agents, un par famille, chacun enchaîne ses tickets
dans l'ordre de leurs `depends_on` :

| Agent | Tickets, dans l'ordre |
|---|---|
| back-entrée (86) | 2599 · 2605 · 2607 · 2609 → 2610 · 2612 · 2680 |
| back-coque (87) | 2620 · 2623 · 2626 · 2627 · 2630 · 2631 · 2633 |
| back-patrimoine (88) | 2679 → 2649 → 2640 · 2637 · 2642 · 2646 · 2652 · 2655 |
| back-commercial (89) | 2578 → 2583 → 2588 · 2579 → 2593 · 2591 (après 2588) · 2582 · 2585 · 2595 |
| back-agence (90) | 2657 → 2658 · 2661 · 2663 · 2665 · 2666 · 2669 → 2681 · 2672 · 2674 |
| textes | 2616 · 2683 · 2615 · 2676 (front sans dépendance au terrain : vocabulaire, vouvoiement, modale de bienvenue, matrice des rôles) |

**Zones tenues par un seul agent** (deux agents n'y écrivent jamais en même temps) :
`routes/api.php` (écrit par un agent à la fois, sous verrou `mkdir`), le modèle `Reservation`
(back-commercial), `Lease` et l'échéancier (back-patrimoine), les paiements et relances
(back-agence pour 2657/2658, back-patrimoine pour 2649 — **2649 attend 2657 s'ils se
recoupent : à re-mesurer au démarrage**), les invitations (back-entrée pour 2609/2610,
back-agence pour 2665 : 2665 passe après 2610).

### Étape 2 — étalonnage, trois pages

- [ ] **TCK-2617** (coque au téléphone), **TCK-2580 → TCK-2581** (la suite après une visite, le
      P0 de la famille 5), **TCK-2659** (page Argent).
- [ ] Les tolérances de l'outil (≤ 0,5 % de pixels sur zone à contenu identique, ±1 px de
      dimension, ±2 px de position, ±3/255 par canal) sont **ajustées sur ces trois PR** et écrites
      dans TCK-2684 et ADR-0106 § 5 si elles bougent.
- [ ] **Point porteur n° 2** : il compare ces trois écrans à leurs maquettes sur le rideau de la
      PR. Ce qu'il refuse ici corrige la méthode avant qu'elle ne s'applique à 100 pages.

### Étape 3 — les pages, par famille

Après l'étalonnage, les familles avancent en parallèle (au plus **quatre agents front** à la fois :
au-delà, la machine sature et les mesures de l'outil ne valent plus rien). Chaque agent enchaîne :

| Lot | Tickets, dans l'ordre (dépendances satisfaites) |
|---|---|
| F-coque (87) | 2618 → 2619 · 2621 · 2636 · 2635 · 2634 · 2632 |
| F-commercial (89) | 2586 · 2584 · 2587 · 2590 · 2589 · 2592 · 2594 · 2596 · 2597 |
| F-patrimoine (88) | 2638 → 2678 · 2643 · 2644 · 2645 · 2639 · 2641 · 2647 → 2648 · 2650 · 2651 · 2653 · 2654 · 2656 |
| F-agence (90) | 2660 → 2682 · 2677 · 2662 · 2664 · 2667 → 2668 · 2670 · 2671 · 2673 · 2675 |
| F-entrée (86) | 2598 → 2604 → 2606 · 2600 → 2601 → 2602 · 2603 · 2608 · 2611 · 2614 → 2613 |
| F-accueil (87, en dernier) | 2622 (après 2596, 2618) → 2624 (après 2660) · 2625 → 2628 → 2629 (après 2657) |

Les dépendances **entre familles** fixent l'ordre des lots : 2622 attend 2596 (commercial) ;
2624 attend 2660 (agence) ; 2629 attend 2657 (back-agence) ; 2667 attend 2641 (patrimoine) ;
2644 attend 2658 (back-agence) ; 2613 attend 2680 (back-entrée).

**Zones tenues par un seul agent** : la coque (`AppShell`, `AppSidebar`, `EnTeteMobile`,
`BarreDOnglets`, `src/data/navigation.ts`) → F-coque seul après la vague 91 ; les dictionnaires
`fr`/`en`/`wo` → **un outil d'écriture sous verrou**, pour tous (une clé perdue des trois
dictionnaires laisse la parité verte) ; `src/lib/queries/<domaine>.ts` → l'agent du domaine.

## Le protocole d'un ticket (chaque agent, chaque ticket)

1. **Re-mesurer la prémisse.** Chaque affirmation du ticket (fichier, ligne, comportement, compte)
   est re-mesurée avant de coder ; ce qui diffère s'écrit dans « Notes d'implémentation ». *Sur un
   lot passé, 8 tickets sur 11 étaient contredits par la mesure.*
2. **Relever « avant »** : l'outil de fidélité sur la page réelle (téléphone, 1440, 1280 si la
   maquette existe), et le balayage (débord, coupe nette, ellipse) à 390/768/1024/1280/1440.
3. **TDD** : le test rouge d'abord (règle métier, autorisation par profil, isolation d'agence,
   rendu des états), puis le code minimal, puis vert.
4. **Fidélité** : `fidelite compare` contre les références gelées jusqu'à **0 écart hors
   tolérance**, ou un écart accepté par l'une des trois exceptions d'ADR-0106 § 2, écrit dans le
   tableau « écarts acceptés ».
5. **Ablation** de chaque test de règle (retirer, rouge, restaurer par `cp`, `md5`).
6. **Les trois états** de la page (chargement, vide, erreur) relevés et conformes.
7. **Accessibilité** : parcours clavier (ordre, focus visible, échappement des feuilles), noms
   accessibles des boutons-icônes, `h1` unique ; contraste par la garde.
8. **Gardes et vérifications** : ses tests, `impacted-tests --connus`, `pint`, `lint`, `tsc`,
   `check:i18n`, les `scripts/check-*.mjs` touchés.
9. **Rapport JSON sur disque** (verdict d'abord : AC par AC, mesuré ou non, ablations rejouées),
   message final d'une ligne. **Aucune commande git qui écrit** : la session commite.

## Vérification adverse, avant chaque PR

Un vérificateur par ticket, dont la valeur est de **refuser** : il rejoue les ablations lui-même,
relance l'outil de fidélité et le balayage, refuse tout AC coché sans exécution derrière, et rend
un booléen honnête (`ablation_rejouee`, `fidelite_rejouee`). Un refus repart à l'implémenteur ; la
contre-vérification est faite par un **autre** vérificateur.

## Rythme, PR et fusion

- **Une PR vers `dev` par lot terminé** (ou par vague de lots), commits **un par ticket**, en
  français, préfixés (`feat(web): … (TCK-2617)`).
- La PR porte : le tableau des écarts par écran, le rideau maquette ↔ page, les écarts acceptés et
  leur exception, les mesures de stabilité (CLS).
- La **CI joue les suites** pendant que le lot suivant avance ; personne ne lance une suite entière
  en local.
- **Fusion seulement sur CI verte** (délégation du porteur du 2026-11-11) ; après chaque fusion, relever le run du push sur `dev` (il diffère de celui de la
  PR : rapport de couverture).
- Le statut d'un ticket passe à `done` **après la fusion sur `dev`**, ticket par ticket, vérifié —
  jamais en bloc ; `node docs/backlog/ranger-tickets.mjs` range le fichier.
- Après la fusion d'un ticket qui modifie une spec : `/sync-specs`.

## Pièges déjà payés (à mettre dans chaque prompt)

- L'arbre peut bouger sous l'agent : une autre session peut commiter ; vérifier `git rev-parse dev`
  contre `HEAD` avant de brancher.
- Une commande de plus de ~10 minutes ne se délègue pas : elle est coupée sans rien dire.
- `timeout` n'existe pas sur ce poste : `perl -e 'alarm N; exec @ARGV'`.
- Ne jamais arrêter une tâche de fond sans lire sa commande : elle peut appartenir à un autre agent.
- Mesures au navigateur : **une passe à la fois**, sous le verrou
  `mkdir <scratchpad>/verrou-mesure` (rendu en `trap`) — à quatre agents simultanés, la charge
  monte à 300 sur 8 cœurs et les passes ne produisent plus rien.
- Mesurer le défileur de la page (`scrollWidth − clientWidth`), pas seulement `main` : un `sr-only`
  en position absolue dans une carte non positionnée élargit le défileur sans qu'un élément
  visible dépasse.
- Une ellipse n'est pas une coupe : l'outil distingue `text-overflow: ellipsis` d'un texte coupé
  net par un ancêtre `overflow-hidden`.
- `wo` = le texte français ; une clé neuve part avec ses trois langues.

## Risques

| Risque | Parade |
|---|---|
| TCK-2692 change un rendu tiers (Leaflet, react-day-picker) | comparaison avant/après de leurs pages dans la preuve de 2692 ; feuille de compensation ciblée |
| Les références gelées divergent des maquettes retouchées plus tard | une retouche après le gel produit une nouvelle référence, datée et nommée dans la fiche du ticket (ADR-0106) |
| Conflits sur les dictionnaires i18n | outil d'écriture sous verrou, refus d'écraser une valeur divergente |
| Une page dépend d'un back non fusionné | l'API partagée tourne sur `dev` ; un front ne démarre qu'après la fusion de son back |
| Données de démo absentes pour un état (vide, erreur, locataire avec bail) | seeders ciblés dans le ticket qui en a besoin, jamais `migrate:fresh` |
| Saturation de la machine | quatre agents front au plus, une passe de mesure à la fois, aucune suite locale |

## Journal

_(tenu par la session : date, lot, tickets livrés, refus du vérificateur, PR, fusion)_
