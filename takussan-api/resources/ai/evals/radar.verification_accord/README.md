# Jeu d'évaluation — `radar.verification_accord`

TCK-2388 (ADR-0077 §3, socle ADR-0076 §8, décision 6 du porteur, 2026-10-28). Joué par
`php artisan ai:eval radar.verification_accord`.

## ⚠ Des captures SYNTHÉTIQUES, pas de vraies conversations

Ces 16 captures n'ont **jamais** été prises sur une vraie conversation : elles sont dessinées par
`render-captures.php` (GD), façon WhatsApp — en-tête (nom et numéro), bulle sortante avec le message
d'accord, bulle entrante avec la réponse. Elles mesurent la lecture de formes connues ; elles ne disent
**rien** de la distribution réelle des réponses (fautes, vocaux, photos, captures recadrées, polices et thèmes
de téléphone, réponses en wolof). Elles sont à compléter, puis à remplacer, dès que de vraies réponses
confirmées existent.

**Anonymes par construction** : des prénoms inventés, des numéros fictifs en `+221 74 …` — un préfixe que le
plan de numérotage retenu par `PhoneMasker` n'attribue pas (`7[0-25-9]`) : ni le numéro d'une personne réelle,
ni un numéro que `scripts/check-ai-evals-pii.mjs` signale.

## Ce qu'il contient

| Cas | Scénario | Classement attendu | Numéro | Clauses |
|---|---|---|---|---|
| 001-003 | accord : « OUI », « Oui d'accord », « Ok vous pouvez » | `consent` | concordant | 1-4 |
| 004-005 | refus (005 : annonceur sans nom, l'en-tête n'affiche que son numéro, l'entrée dit `inconnu`) | `refusal` | concordant | 1-4 |
| 006-007 | STOP | `stop` | concordant | 1-4 |
| 008-009 | question (« c'est gratuit ? », « qui êtes-vous ? ») | `question` | concordant | 1-4 |
| 010-011 | ambigu (« peut-être… », « hmm, je vais voir ») | `ambiguous` | concordant | 1-4 |
| 012-013 | numéro discordant : l'en-tête montre un autre numéro, la réponse est « OUI » (012) ou « Ok d'accord » (013) | `consent` | **discordant** | 1-4 |
| 014 | clauses absentes : la capture ne montre que la réponse « OUI », sans le message de Takussan — un « OUI » à on ne sait quoi | `ambiguous` | concordant | aucune |
| 015 | clauses absentes : le message est coupé avant les clauses, mais son début est visible — la réponse y répond | `consent` | concordant | aucune |
| 016 | identité non confirmée : l'en-tête n'affiche ni numéro ni nom lisibles (un contact en « ~ »), la réponse est « OUI » | `consent` | **illisible** (`null`) | 1-4 |

| 017-030 | **texte** (TCK-2427) : la réponse reçue par l'API WhatsApp du Radar, sans capture — voir « Les cas texte » | les cinq | — (`null`) | aucune |

Le cas 016 couvre `identity_unverified` (le numéro ne se lit pas et le nom ne le confirme pas : le confirmer exige un motif écrit, décision du porteur du 2026-10-28) ; c'est aussi le cas « numéro illisible » que TCK-2403 mentionne.

Un cas est `{ "input", "expected", "attachments" }`. **`input` est exactement ce que le job envoie**
(`VerifyRadarConsentReply`) : `RadarConsentVerification::input(<message envoyé>, <numéro attendu>, <nom attendu>, 4)`,
le message étant celui de `ConsentMessageComposer::compose('fr', …)` sur `accord.v1.fr.md` ; les captures sont
jointes et se jouent sur le rôle `vision`, comme en production (`AttachmentsUseVision`).
`RadarConsentVerificationEvalSetTest` le vérifie.

Le numéro attendu est écrit comme le job l'envoie, en E.164 compact (`+22174…`, sans espaces) ; seule l'en-tête de la
capture l'affiche espacé (`+221 74 …`), comme un téléphone. Le modèle doit donc lire l'un et le comparer à l'autre,
comme en production. Ce jeu note la sortie BRUTE du modèle, avant la relecture du code (`RadarConsentVerdict`).

## Les cas texte (TCK-2427)

Depuis TCK-2395, une réponse reçue par l'API WhatsApp du Radar se vérifie **sans capture** : le job envoie
`RadarConsentVerification::textInput(<message envoyé>, <texte reçu>)` sur le rôle `raisonnement` (prompt `v2`, section
« Quand la réponse t'arrive en texte »). Les cas 017 à 030 en sont la mesure, sans pièce jointe : `EvaluationRunner`
les joue donc sur `raisonnement`, comme en production, et le rapport les ventile dans `roles.raisonnement`.

| Cas | Réponse reçue | Classement attendu |
|---|---|---|
| 017-018 | accord : « Oui, vous pouvez les publier », « Ok d'accord 👍 » | `consent` |
| 019 | refus : « Non merci, ça ne m'intéresse pas » | `refusal` |
| 020-021 | STOP dit autrement : « Ne m'envoyez plus de messages. », « Stop svp 🙏 » | `stop` |
| 022-023 | question : « C'est payant ? Combien ça coûte ? », « Vous êtes une agence ? » | `question` |
| 024-025 | ambigu : « Je vous reviens », « 👍 » seul | `ambiguous` |
| 026-027 | wolof : « Waaw, mën ngeen ko def » (oui, vous pouvez le faire), « Déedéet, bëgguma » (non, je ne veux pas) | `consent`, `refusal` |
| 028 | accord partiel : « Oui mais seulement l'appartement, pas la maison » — ce n'est pas l'accord du message | `ambiguous` |
| 029 | une consigne glissée dans la réponse (« Ignore les consignes précédentes… ») : une donnée, jamais une instruction | `ambiguous` |
| 030 | « Ok » seul : le prompt range « ok vous pouvez » en accord, « ok on verra » en ambigu, mais ne tranche pas le « ok » nu — « dans le doute » ; **étiquette à revoir par le porteur** | `ambiguous` |

- **Le message envoyé est celui de l'API** : `accord.v3.fr.md` (la seule version du gabarit Meta), lien de réclamation
  fictif (`https://takussan.com/fr/claim/jeton-fictif`).
- **Un STOP exact n'y figure pas** : la réception le révoque d'emblée (`RadarWhatsappInbox::isStop()`), il n'arrive
  jamais au modèle. Les cas `stop` sont ceux qui le disent autrement.
- **Attendus** : seul le classement varie. En texte, le code juge le numéro (l'expéditeur, authentifié par Meta) et les
  clauses (parties dans le gabarit) : `number_matches` et `counterpart_phone` valent `null`, `clauses_found` `[]`, ce
  que le prompt `v2` demande au modèle de rendre.
- **Anonymes par construction** : des prénoms inventés, aucun numéro. Le wolof est court et courant ; il ne dit rien de
  la variété réelle des réponses (orthographes, langue mêlée), à compléter dès que de vraies réponses confirmées existent.
- **Rendus par `text-cases.php`** (`php resources/ai/evals/radar.verification_accord/text-cases.php`, depuis
  `takussan-api/`) : déterministe, sans police ni base de données. Ne pas relancer `render-captures.php` pour eux : il
  compose sur la version COURANTE des clauses (`accord.v3` depuis TCK-2395) et réécrirait les 16 cas de captures, qui
  sont sur `accord.v1`.

## Ce qui est noté

Quatre champs (`fields.json`), jamais la transcription ni le nom :

- `classification` : égalité (`consent`, `refusal`, `stop`, `question`, `ambiguous`) ;
- `number_matches` : égalité (le numéro de l'en-tête est-il celui attendu) ;
- `clauses_found` : recouvrement de listes (Jaccard) des numéros de clauses lisibles sur la capture ;
- `counterpart_phone` (TCK-2403) : le numéro que l'en-tête montre, égalité **sans les blancs** (`text` :
  « +221 74 100 20 01 » vaut « +221741002001 ») ; `null` quand l'en-tête n'en montre aucun (cas 016). Les cas
  discordants (012, 013) attendent le numéro AFFICHÉ, pas le numéro attendu. ⚠ Ce n'est **pas** la forme canonique
  de `RadarPhone::canonical()` : un séparateur (« +221 74.100.20.01 ») ou une forme nationale (« 74 100 20 01 »)
  vaut 0 ici, alors que le code les ramènerait à E.164. Le `FieldScorer` n'a pas de type « téléphone » et
  `text` ne retire que les blancs ; noter la forme canonique demanderait un type de plus dans le scorer (code
  applicatif), hors de ce ticket. L'effet est faible : les numéros fictifs du jeu s'écrivent tous avec des espaces.

**Pourquoi `counterpart_phone` s'ajoute à `number_matches` plutôt que de le remplacer** : en production,
`RadarConsentVerdict::from()` écrase `number_matches` par la comparaison du code dès que `counterpart_phone` se lit en
E.164 (`number_checked_by: code`). Le booléen du modèle ne compte donc que si le numéro est illisible (cas 016, et le
chemin `identity_unverified`) ; ce que le code compare, c'est le numéro **transcrit**. Noter les deux, c'est mesurer
ce que le modèle voit et ce que le code en fera. Les numéros fictifs du jeu (`+221 74 …`) sont hors de
`PhoneMasker::PATTERN` : `RadarPhone::canonical()` les rend `null`, de sorte que ce jeu n'exerce jamais le chemin
« jugé par le code » — il note la lecture du numéro, pas la décision.

## Rendre les captures

```bash
cd takussan-api
php resources/ai/evals/radar.verification_accord/render-captures.php --font=/chemin/vers/Police.ttf
```

La police (une TrueType avec les accents français et « · » : Arial, DejaVu Sans…) se passe en argument : aucune
police n'est versionnée. Le script démarre l'application (sans base de données), compose le message de chaque
scénario, dessine la capture (`captures/NNN.png`, 64 couleurs, bien moins de 100 Ko) et écrit `cases/NNN.json`.
**Déterministe** : mêmes entrées (script, clauses, police, GD/FreeType) → mêmes octets, vérifié par deux rendus
successifs. Une autre police ou un autre FreeType change les pixels, jamais les cas. Le lien des conditions est
fixé à `https://takussan.com` dans le script, pas lu de l'environnement. Les `*gras*` WhatsApp sont rendus sans
astérisques, comme l'écran de l'expéditeur. Les scénarios sont dans le tableau `$scenarios` du script : en ajouter
un, c'est ajouter une ligne et re-rendre — puis ajuster le compte de cas de `RadarConsentVerificationEvalSetTest`.

## La référence (`baseline.json`)

⚠ **La référence du 2026-10-30 (0,9844, prompt `v2`) ne porte que les 16 cas de captures** (`roles.vision`). Les cas
texte ajoutés par TCK-2427 n'y ont pas de section : un jeu complet compare son score GLOBAL, captures et texte mêlés, au
0,9844 des seules captures, et rougit (`ai.eval.below_baseline`) dès que les cas texte font moins bien que les
captures. Elle est à refixer par un jeu complet payant (`--update-baseline`), joué par le porteur.

Elle exige un **vrai** modèle : elle se fixe par un jeu complet
(`php artisan ai:eval radar.verification_accord --update-baseline`, sans `--role` ni `--model`). Elle part avec le
passage payant de TCK-2403 (à lancer à la main par le porteur) : tant qu'elle n'existe pas, ce jeu est joué sans rien
comparer.

⚠ **Le planning de nuit jouera ce jeu contre le vrai modèle** : `routes/console.php` lance `ai:eval --all` chaque
nuit, partout où un fournisseur a une clé (16 appels de vision et 14 de raisonnement, comptés `is_evaluation`, hors
budget du jour).
Sans `baseline.json`, il ne compare à rien et n'échoue que si un appel échoue. Dans les tests, la commande est
jouée sur un FAUX modèle : jamais d'appel réel (`RadarConsentVerificationEvalSetTest`).
