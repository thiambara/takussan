---
id: TCK-2403
title: "Radar : le jeu d'évaluation de l'extraction passe à de vraies annonces anonymisées, et sa référence est fixée"
status: review
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-27
updated: 2026-10-29
depends_on: [TCK-2386, TCK-2388]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, evaluation, donnees-personnelles, adr-0076, adr-0077]
---

## Objectif utilisateur

Le porteur sait qu'un changement de modèle ou de prompt de l'extraction du Radar ne dégrade pas la
lecture des annonces telles qu'elles circulent réellement à Dakar, parce que le cliquet d'évaluation
la mesure sur de vraies annonces.

## Contrat de données

Aucune donnée ni route nouvelle. Le jeu vit sous `takussan-api/resources/ai/evals/radar.extraction/`
(format, notation et champs : son `README.md`, livré par TCK-2386) ; la référence est le
`baseline.json` que `php artisan ai:eval radar.extraction --update-baseline` écrit (socle,
ADR-0076 §8).

**Ajout de TCK-2388 (décision 6 du porteur, 2026-10-28)** : la référence du jeu
`takussan-api/resources/ai/evals/radar.verification_accord/` (16 captures **synthétiques** d'une
réponse au message d'accord, livrées par TCK-2388, format et notation dans son `README.md`) se fixe
dans le même passage payant. Ce jeu reste synthétique : une vraie capture de conversation WhatsApp
porte le numéro et le nom de l'annonceur dans l'image, qu'aucune garde ne sait masquer.

## Contraintes strictes (métier)

- **Sorti de TCK-2386 (son AC8), décision du porteur du 2026-10-27** : TCK-2386 a livré 30 cas
  **synthétiques** et aucune référence ; tant que `baseline.json` n'existe pas, le cliquet de
  l'usage `radar.extraction` ne garde rien.
- **De vraies annonces, anonymisées** : prises parmi les annonces saisies et relues dans le Radar
  (TCK-2387), numéros, noms de personne ou d'agence et courriels remplacés par les jetons du jeu
  (`[TELEPHONE]`, `[NOM]`). `scripts/check-ai-evals-pii.mjs` garde numéros et courriels ; **rien ne
  garde les noms** : relecture humaine de chaque cas.
- L'`input` de chaque cas reste exactement ce que le job envoie (`ExternalContent::wrap()`),
  ce que `RadarExtractionEvalSetTest` vérifie.
- **La référence s'écrit par un passage COMPLET** (rôles `extraction` et `vision`) : une première
  référence partielle est refusée (`ai.eval.baseline_needs_full_run`).
- **Le passage réel coûte** (appel au vrai modèle, une trentaine de cas) : il attend l'accord
  explicite du porteur, et se lance à la main, jamais depuis un test ni la CI.
- **Le jeu `radar.verification_accord` note un champ que le code écrase souvent** (revue de
  TCK-2388, tâche 7) : `number_matches` est la réponse brute du modèle, alors qu'en production
  `RadarConsentVerdict::from()` la remplace par la comparaison du code dès que `counterpart_phone`
  est lisible et canonique (`number_checked_by: code`). Le cas 016 (en-tête sans numéro ni nom
  lisibles, `number_matches: null`, discordance `identity_unverified`) couvre déjà le numéro
  illisible, le seul où le booléen du modèle compte. Avant de fixer la référence, trancher s'il faut
  aussi noter `counterpart_phone` normalisé. Les numéros fictifs du jeu (`+221 74…`) sont hors de
  `PhoneMasker::PATTERN` : `RadarPhone::canonical()` les rend `null`, donc le chemin « jugé par le
  code » n'est jamais exercé par ce jeu.
- **Risques résiduels de l'anonymisation à l'écriture** (TCK-2387, 2026-10-28) : depuis TCK-2387,
  chaque extraction enregistre une `ai_suggestion` dont l'`input_snapshot` est anonymisé par
  `EvalCaseAnonymizer` avec pour aiguilles le nom de l'annonceur et ses numéros. Trois trous, à
  relire cas par cas avant de verser une annonce au jeu :
  - un `advertiser_name` nul (le modèle n'a pas lu de nom) laisse dans l'instantané le nom que le
    texte porte ;
  - un nom d'agence qui contient un nom de quartier masque aussi le quartier dans le cas exporté,
    ce qui fausse la sortie attendue ;
  - le titre et la description libres ne sont pas des aiguilles : un nom ou un numéro écrit
    autrement y reste.

## Delta à produire

- [x] Remplacer ou compléter les cas synthétiques par des annonces réelles anonymisées (au moins
      la moitié du jeu, textes et captures), sorties attendues relues ; `README.md` mis à jour.
      *(20 cas réels sur 30, tous des textes : aucune capture réelle ne s'anonymise — voir les notes.)*
- [ ] Passage complet `php artisan ai:eval radar.extraction --update-baseline` (accord du
      porteur), `baseline.json` versionné.
- [x] `RadarExtractionEvalSetTest` : vert sur le jeu nouveau.
- [x] `radar.verification_accord` : décider de la notation de `number_matches` (contrainte
      ci-dessus) — *`counterpart_phone` noté en plus, voir les notes* ; [ ] passage complet `php artisan ai:eval radar.verification_accord
      --update-baseline` (accord du porteur, même passage payant), `baseline.json` versionné.

## Critères d'acceptation

- [ ] AC1 — `ai:eval radar.extraction` passe sur le jeu livré et en fixe la référence (ex-AC8 de
      TCK-2386).
- [x] AC2 — Au moins la moitié des cas viennent d'annonces réelles, et aucun ne porte de numéro, de
      courriel ou de nom réel (garde verte, relecture notée dans le `README.md`).
- [ ] AC3 — `ai:eval radar.verification_accord` passe sur le jeu de TCK-2388 et en fixe la
      référence (AC6 de TCK-2388, partie « référence réelle »).

## Hors périmètre

- Le jeu de `radar.message_accord` (TCK-2388 n'en livre pas : l'IA n'y écrit que la salutation et
  le résumé, que l'opérateur relit avant chaque envoi).
- Des captures réelles pour `radar.verification_accord` (voir le contrat de données).
- Un changement du prompt ou du modèle de l'extraction.

## Reste sur dev

Le code et les trente cas sont sur `dev` (PR #1584). Il reste le passage payant, à lancer par le porteur à
la main depuis l'arbre principal (`takussan-api/`) : `php artisan ai:eval radar.extraction --update-baseline`
puis `php artisan ai:eval radar.verification_accord --update-baseline`. Les deux `baseline.json` versionnés
ferment AC1 et AC3, et le ticket passe à `done`.

## Notes d'implémentation

**Reste pour le porteur** : AC1 et AC3 attendent le passage payant (les deux `--update-baseline`, à lancer à la
main depuis l'arbre principal, après sa relecture des cas). Le ticket passe à `done` quand les deux
`baseline.json` sont versionnés.

- **Les cas réels sont relevés sur Expat-Dakar (14) et CoinAfrique (6) le 2026-10-29, puis réécrits** : titres
  reformulés, prix et surfaces décalés d'un petit écart (texte ET attendu), date d'inscription, nombre d'annonces et
  heure retirés, adresses ramenées au quartier. Anonymiser, ce n'est pas remplacer un numéro : une annonce dont le
  titre et le prix restent s'y retrouve, et redonne le nom et le numéro. Le jeu garde le type, le contrat, les pièces,
  le quartier, la période, la nature de l'annonceur et le style des pages ; il ne garde aucune phrase.
- **Aucun document ne cite une donnée relevée** (règle du porteur, dans le README du jeu) : ni numéro, ni référence,
  ni phrase, même pour illustrer un défaut. Une première version de ces notes en citait deux, publiés avant d'être
  retirés ; `RadarExtractionEvalSetTest` lit désormais tous les fichiers du jeu et ce ticket.
- **Pas de capture réelle** : une capture porte le numéro, le nom et la photo de l'annonceur dans l'image. Les six
  captures restent des rendus GD, les quatre messages informels (WhatsApp/Facebook) restent synthétiques. Les cas
  réels sont `001`-`020`, les synthétiques `021`-`030`.
- **`PhoneMasker` et `check-ai-evals-pii.mjs` ne voient pas un numéro étranger collé à son indicatif** (lookbehind
  `(?<!\d)` : des chiffres qui suivent un indicatif non sénégalais ne le satisfont pas) : TCK-2410 les corrige. Hors
  périmètre ici ; la garde du jeu les couvre en attendant.
- **Conventions des attendus** (README, « Conventions ») : loyer sans période écrite → `null` (décision du porteur) ;
  salles de bain → un nombre seulement si l'annonce l'écrit et que le texte ne le contredit pas ; ville = commune
  nommée, quartier = ce qui est dans une ville ou dans l'agglomération dakaroise (Saly et Ngaparou sont des villes,
  comme dans le cas `026`) ; prix = le premier de la page, avec sa graphie.
- **`radar.verification_accord` : `counterpart_phone` est noté EN PLUS de `number_matches`** (type `text` du
  `FieldScorer`, qui retire les blancs : aucun code applicatif). Le booléen du modèle est écrasé en production dès que
  le numéro se lit en E.164 ; ce que le code compare, c'est le numéro transcrit. `number_matches` reste : il couvre le
  numéro illisible (cas 016). Limite : `text` n'est pas la forme canonique de `RadarPhone::canonical()` (un séparateur
  ou une forme nationale vaut 0) ; la noter demanderait un type de plus dans le scorer, hors de ce ticket. Seize
  fichiers de cas et `render-captures.php` changent d'une clé ; les PNG sortent identiques du rendu rejoué.
- **Un « immeuble » n'a pas de `PropertyType`** (ni `building`) : les annonces d'immeubles, fréquentes sur les deux
  sites, tombent dans `other`. Les cas réels n'en contiennent donc aucun, faute d'attendu défendable.
