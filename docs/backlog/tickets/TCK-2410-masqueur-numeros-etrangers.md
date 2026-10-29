---
id: TCK-2410
title: "Socle IA : le masquage et la garde des jeux d'évaluation attrapent les numéros étrangers, et aucun document ne cite de numéro réel"
status: done
phase: P1
family: bug
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2400]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, garde, adr-0076]
---

## Objectif utilisateur

Le porteur peut envoyer une annonce à un modèle externe, la stocker (`ai_suggestions.input_snapshot`)
et verser des cas d'évaluation dans le dépôt sans qu'un numéro d'annonceur écrit à l'étrangère
(indicatif `+33`, `+225`, `00…`, numéro national à points) ne passe en clair — et sans qu'un prix,
une surface, une date ou une référence de bien soit pris pour un numéro.

## Contexte

Relevé le 2026-10-29 pendant l'anonymisation de vraies annonces pour TCK-2403. `App\Support\PhoneMasker`
et `scripts/check-ai-evals-pii.mjs` ne connaissent que le plan de numérotation sénégalais
(TCK-2400 : « hors périmètre : les numéros étrangers »). Re-mesuré sur `dev` (ce ticket) : **aucune**
de ces formes n'est masquée ni signalée, avec des numéros fictifs :

- indicatif étranger collé ou groupé — `+33612345678`, `+33 6 12 34 56 78`, `+2250712345678`,
  `+225 07 12 34 56 78`, `0033612345678`, `+44 7700 900123` ;
- une espace après le `+` — `+ 33 6 12 34 56 78` ;
- le `(0)` de trunk — `+33 (0)6 12 34 56 78` ;
- un numéro national à deux chiffres par groupe, collé, espacé ou à points — `0612345678`,
  `06 12 34 56 78`, `06.12.34.56.78` (France, Côte d'Ivoire).

Un numéro de type `+33 768123456` est même masqué **à moitié** (`+33 [TELEPHONE]`) : sa fin ressemble
à un préfixe sénégalais.

Une fuite réelle en a résulté : deux vrais numéros d'annonceurs ont été cités en exemple dans un
document poussé. Le défaut du masqueur ne l'a pas causée ; la **règle** manquait.

## Contrat de données

- Aucun endpoint, aucune migration. Classes touchées : `App\Support\PhoneMasker` (nouvelle constante
  de masquage, `PATTERN` reste le motif **sénégalais**, dont `RadarPhone` et `RadarAmountParser`
  dépendent), `scripts/check-ai-evals-pii.mjs`, `tests/fixtures/ai/donnees-personnelles.json`.

## Contraintes strictes (métier)

- Le masqueur et la garde reconnaissent **le même ensemble** de formes (TCK-2400, inchangé) :
  le fixture partagé les éprouve des deux côtés.
- **Rien de ce qui n'est pas un numéro ne devient `[TELEPHONE]`** : prix (`1 500 000 F`, `+ 1 000 000`),
  surfaces, dates (`01/05/2026`, `01.05.2026`), références de bien (`TK-2026-AB12CD`), millésimes.
  Chaque non-cas est un test.
- Un numéro étranger n'est reconnu que s'il porte un **indicatif ITU valide précédé de `+` ou `00`**
  (ou, sans indicatif, la forme nationale à cinq paires `0X XX XX XX XX`) : jamais un nombre quelconque.
- `RadarPhone::fromText()` ne lit toujours que des numéros sénégalais.
- **RÈGLE** : aucun document du dépôt (ticket, plan, ADR, journal, commentaire, test, fixture, jeu
  d'évaluation) ne cite un numéro relevé dans la réalité, même comme exemple d'un défaut. Les
  exemples sont des numéros manifestement fictifs (`+33612345678`, `+221771234567`, `06 12 34 56 78`,
  `+1 202 555 0123`). Voir « Notes d'implémentation » pour ce qu'une garde peut en porter.

## Delta à produire

- [x] `PhoneMasker::MASK_PATTERN` = numéro sénégalais (`PATTERN`) OU numéro étranger ; `mask()` et
      `EvalCaseAnonymizer` l'utilisent ; `PATTERN` ne change pas.
- [x] `scripts/check-ai-evals-pii.mjs` : le même motif étendu.
- [x] Fixture partagé : une forme par ligne ci-dessus, et les non-cas (prix, surface, date, référence).
- [x] Tests : `PhoneMaskerTest`, `EvalCaseAnonymizerTest` ; appelants re-mesurés.
- [x] La règle « aucun numéro réel dans un document » : en garde si elle se porte sans faux positif,
      sinon écrite dans le ticket et l'en-tête de la garde.

## Critères d'acceptation

- [x] AC1 — Chaque forme étrangère du contexte est masquée par `PhoneMasker::mask()` et signalée par
      la garde (un cas de fixture, éprouvé des deux côtés).
- [x] AC2 — Les numéros fictifs actuels du fixture restent masqués ; les non-cas (prix, surfaces,
      dates, références, `+ 1 000 000`) ne sont ni masqués ni signalés.
- [x] AC3 — Un numéro étranger dans un champ `expected` d'un cas d'évaluation fait échouer la garde.
- [x] AC4 — `RadarPhone::fromText()` et `RadarAmountParser` ne changent pas de comportement sur leurs
      tests existants.
- [x] AC5 — Chaque nouveau cas rougit sans sa modification du motif (ablation consignée).
- [x] AC6 — La règle des numéros réels est écrite là où elle s'applique.

## Hors périmètre

- Les numéros étrangers écrits sans indicatif ni zéro initial (`612345678`, `7700 900123`) : ils ne se
  distinguent pas d'un nombre.
- Les numéros nationaux étrangers à autre forme que `0X XX XX XX XX`.
- Un nom de personne (aucun motif ne le reconnaît).

## Notes d'implémentation

2026-10-29, sur `fix/masqueur-numeros-etrangers`.

- **`PATTERN` ne change pas, `MASK_PATTERN` s'y ajoute.** `RadarPhone::fromText()` et `canonical()` lisent
  `PATTERN` comme « le numéro sénégalais » (leur `FOREIGN_PREFIX` écarte même la fin d'un numéro
  étranger), `RadarAmountParser::phoneSpans()` aussi. Élargir `PATTERN` aurait fait lire `+33 6 …` au Radar
  comme un contact. Le test `test_the_senegalese_pattern_does_not_read_a_foreign_number` l'épingle.
- **Un indicatif ITU valide, avec son nombre de chiffres, pas « `+` puis des chiffres ».** `+ 1 000 000`
  (une somme) aurait été un numéro : indicatif 1, six chiffres. Les trois jeux d'indicatifs (un, deux,
  trois chiffres) portent chacun la longueur que leur plan admet (10 pour `+1` et `+7`, 7 à 11 pour deux
  chiffres, 6 à 10 pour trois). La France (`+33`, 9 chiffres) passe avant : sans cela
  `+33 6 12 34 56 78 15 chambres` perdait `15`. Les indicatifs sont ceux de la recommandation ITU-T E.164
  (liste de mémoire, relue contre les numéros du dépôt) ; un indicatif absent laisse passer un numéro, un
  indicatif en trop n'en masque un qu'avec `+`/`00` et la bonne longueur.
- **`+221` n'est PAS dans le motif étranger**, par une mesure : les jeux d'évaluation du Radar écrivent leurs
  numéros fictifs en `+221 74 …`, préfixe que le plan de l'ARTP n'attribue pas, précisément pour qu'ils ne
  soient pas plausibles. Un `+221` + neuf chiffres quelconques les aurait fait rougir (32 occurrences). Le
  fixture épingle `+221 74 123 45 67` comme non masqué. **Convention à retenir : 74 est le préfixe des
  numéros fictifs d'évaluation** ; un `+221` à autre préfixe hors plan reste non masqué (cf. 34, TCK-2400).
- **Forme nationale `0X XX XX XX XX`** (France, Côte d'Ivoire), sans indicatif : collée, ou séparée à chaque
  paire par le MÊME caractère. Une première version à séparateurs libres masquait `01.05.2026 12 h` et, dans
  les documents, `load averages: 44.07 87.79 75.17` (la charge machine, citée partout dans ce dépôt).
- **Parenthèses** : seulement après l'indicatif (`(+33)`, `(0)`, `+1 (202)`). Admises partout, elles
  faisaient de `ADR-0064 (2026-10-14)` un `00` + indicatif 64.
- **Pas d'exclusion des montants pour les numéros étrangers** : avec elle, `+33 6 12 34 56 78 F. Dupont`
  laissait `78 F.` (le motif recule d'un groupe pour échapper à la marque). `+` + indicatif + longueur, ou
  dix chiffres commençant par 0, n'est pas un prix.
- **Limites assumées** : un numéro étranger sans `+`, `00` ni zéro initial (`612345678`) n'est pas reconnu ;
  `(+33) 6 …` laisse la parenthèse ouvrante (`([TELEPHONE]`) ; un groupe de deux chiffres ou plus qui suit
  un numéro d'un autre pays que la France (`+44 7700 900123 15 chambres`) peut être pris dans le masque
  tant que le total tient dans la longueur admise ; une référence numérique de dix chiffres commençant par 0
  est masquée (`0123456789`).
- **Les appelants, re-mesurés** : profitent du correctif `AiDataGuard::mask()` (usage `publique`, donc
  `ai_suggestions.input_snapshot` et le texte envoyé au modèle), `EvalCaseAnonymizer` (entrée, `expected`,
  clés personnelles) et `ConsentMessageComposer` (nom d'affichage et faits). Ne changent pas : `RadarPhone`,
  `RadarAmountParser`, `ExtractionNormalizer`, `RadarListingIntake` et `ExternalContent` (qui ne lisent que
  `normalizeDigits()`, `INVISIBLE` ou `PATTERN`). **Suite à ouvrir** : `RadarAmountParser::parse()` lit encore
  un numéro étranger collé comme un montant (`Appelez le 00 33 …` donne un « prix » de onze chiffres) ; lui
  faire lire `MASK_PATTERN` pour `phoneSpans()` le corrigerait, mais c'est le territoire du Radar.
- **La règle des numéros réels n'est pas portée par une garde, par une mesure** (2026-10-29) : balayé sur
  les fichiers suivis du dépôt, le motif trouve 455 chaînes distinctes pour 2 475 occurrences, presque
  toutes des numéros fictifs de tests (`+221 77 000 91 00`, `77 666 00 02`…). Un numéro fictif et un
  numéro réel ne se distinguent que par un jugement ; les heuristiques essayées (quatre chiffres répétés,
  suite croissante) laissent passer un vrai numéro qui en contient une, et feraient rougir les centaines de
  fictifs sénégalais sans marque. Restreinte aux numéros étrangers elle passerait aujourd'hui (tous les
  étrangers du dépôt portent une suite ou des zéros, sauf un gabarit SEO d'une compétence tierce), mais ce
  serait une garde qui rassure sans prouver. La règle est donc écrite ici et dans l'en-tête de
  `scripts/check-ai-evals-pii.mjs`, et la garde reste bornée aux jeux d'évaluation, où elle est exacte.
- **Parité PHP/JS mesurée hors fixture** : `MASK_PATTERN` et `TELEPHONE` rendent les mêmes correspondances
  sur 42 823 lignes distinctes de fichiers suivis (1 704 avec au moins un numéro), 0 écart.
- **Ablations** (chacune annulée ensuite, restauration prouvée par `cmp`) — PHP, `PhoneMaskerTest` +
  `EvalCaseAnonymizerTest` : sans motif étranger 45 rouges ; sans le national 11 ; sans `00` 6 ;
  indicatif à deux chiffres quelconque 4, à trois chiffres 3, à un chiffre à longueur libre 4 ; sans
  `(0)`/`)` 4 ; sans espace après `+` 2 ; `+221` dans les indicatifs 3 ; national à séparateurs libres 3,
  à séparateurs mêlés 3 ; France sans longueur exacte 2 ; sans garde du chiffre seul final 1 ; zone
  entre parenthèses 1 ; sans le `(?<![\d+])` initial 1 ; `EvalCaseAnonymizer` revenu à `PATTERN` 1.
  Garde JS : chacune des neuf ablations équivalentes la fait sortir en 1 sur la forme correspondante.
- **Vérifié** : 268 tests de `PhoneMaskerTest` et `EvalCaseAnonymizerTest` ; tests des appelants
  (`tests/Unit/Ai`, `RadarAmountParserTest`, `RadarPhoneTest`, `ConsentMessageComposerTest`, les épreuves
  du Radar et de l'IA) verts ; `node scripts/check-ai-evals-pii.mjs` vert sur les 73 fichiers des jeux ;
  toutes les gardes `scripts/check-*.mjs` vertes.
