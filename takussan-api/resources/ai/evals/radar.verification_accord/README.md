# Jeu d'évaluation — `radar.verification_accord`

TCK-2388 (ADR-0077 §3, socle ADR-0076 §8, décision 6 du porteur, 2026-10-28). Joué par
`php artisan ai:eval radar.verification_accord`.

## ⚠ Des captures SYNTHÉTIQUES, pas de vraies conversations

Ces 15 captures n'ont **jamais** été prises sur une vraie conversation : elles sont dessinées par
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

Un cas est `{ "input", "expected", "attachments" }`. **`input` est exactement ce que le job envoie**
(`VerifyRadarConsentReply`) : `RadarConsentVerification::input(<message envoyé>, <numéro attendu>, <nom attendu>, 4)`,
le message étant celui de `ConsentMessageComposer::compose('fr', …)` sur `accord.v1.fr.md` ; les captures sont
jointes et se jouent sur le rôle `vision`, comme en production (`AttachmentsUseVision`).
`RadarConsentVerificationEvalSetTest` le vérifie.

Le numéro attendu est écrit comme le job l'envoie, en E.164 compact (`+22174…`, sans espaces) ; seule l'en-tête de la
capture l'affiche espacé (`+221 74 …`), comme un téléphone. Le modèle doit donc lire l'un et le comparer à l'autre,
comme en production. Ce jeu note la sortie BRUTE du modèle, avant la relecture du code (`RadarConsentVerdict`).

## Ce qui est noté

Trois champs (`fields.json`), jamais la transcription ni le nom :

- `classification` : égalité (`consent`, `refusal`, `stop`, `question`, `ambiguous`) ;
- `number_matches` : égalité (le numéro de l'en-tête est-il celui attendu) ;
- `clauses_found` : recouvrement de listes (Jaccard) des numéros de clauses lisibles sur la capture.

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

## Pas de référence (`baseline.json`)

Elle exige un **vrai** modèle : elle se fixe par un jeu complet
(`php artisan ai:eval radar.verification_accord --update-baseline`, sans `--role` ni `--model`). **Elle n'est
pas dans ce ticket** : la référence part avec le passage payant de TCK-2403.

⚠ **Le planning de nuit jouera ce jeu contre le vrai modèle** : `routes/console.php` lance `ai:eval --all` chaque
nuit, partout où un fournisseur a une clé (15 appels de vision, comptés `is_evaluation`, hors budget du jour).
Sans `baseline.json`, il ne compare à rien et n'échoue que si un appel échoue. Dans les tests, la commande est
jouée sur un FAUX modèle : jamais d'appel réel (`RadarConsentVerificationEvalSetTest`).
