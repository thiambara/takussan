# ADR-0135 — Chaque champ prend un profil de clavier et un placeholder

- **Statut** : Accepté le 2026-11-21 (maquette « L'écran économe », chantier 3 ; décisions « 1a 2a 3a » du porteur
  le même jour, et « ajoute un placeholder dans les champs qui ne l'ont pas »)
- **Date** : 2026-11-21
- **Tickets** : TCK-2991 (les profils, les primitives, la garde), TCK-2992 (les surfaces du téléphone),
  TCK-2993 (le reste de `/app`), TCK-2994 (la console d'exploitation et le reste : la garde à zéro)
- **S'appuie sur** : [ADR-0133](0133-une-mesure-de-la-fenetre-et-le-mode-saisie-des-formulaires-plein-ecran.md)
  (le clavier se mesure en un seul endroit), la maquette `playground/maquettes/ecran/profils.ts`

## Contexte

Relevé le 2026-11-21 sur `src/` (hors tests et playground) :

- **369 champs ouvrent un clavier.** Ils sont répartis en 296 `<Input>`, 145 `<input>` et 91 zones de texte,
  moins les fichiers, cases, radios, dates, heures, curseurs et champs cachés. S'ajoutent 136 appels de
  composants qui les enveloppent : `FormInput` (78), `PhoneInput` (28), `FormAmountInput` (15) et
  `FormTextarea` (15).
- **Le clavier n'est réglé presque nulle part.** On compte 1 `autoCorrect`, 7 `enterKeyHint` et
  8 `autoCapitalize`. Les 14 champs de recherche laissent donc le téléphone corriger « Almadies » en un mot
  du dictionnaire, et mettre une majuscule au premier mot.
- **47 champs sont en `type="number"`.**
  - Sur iPhone, ils ouvrent le clavier complet positionné sur les chiffres, pas le pavé numérique.
  - Au bureau, la molette et les flèches changent la valeur sous le pointeur.
  - Ils refusent tout séparateur de milliers. `FormAmountInput` les a déjà quittés pour ces raisons.
- **200 champs n'ont pas de placeholder.** Sur un petit écran, c'est le seul indice de la forme attendue
  qui reste sous les yeux quand le clavier masque l'aide.
- **La maquette a fixé la table des profils**, et le porteur l'a validée : un champ ne règle jamais son
  clavier à la main, il prend un profil.

## Décision

**Tout champ qui ouvre un clavier prend un profil nommé et porte un placeholder. Une garde à cliquet exact par
fichier l'impose et descend à zéro dans ce chantier.**

### 1. La table des profils — `src/lib/clavier.ts`

| Profil | `type` | `inputMode` | Touche Entrée | `autoComplete` | Correction | Majuscule |
|---|---|---|---|---|---|---|
| `recherche` | `search` | `search` | `search` | `off` | non | aucune |
| `lieu` | `text` | `text` | `next` | `off` | non | mots |
| `nom` (personne, agence) | `text` | `text` | `next` | `name` | non | mots |
| `mots` (repère, libellé court) | `text` | `text` | `next` | `off` | non | mots |
| `identifiant` (slug, identifiant technique, « courriel ou téléphone ») | `text` | `text` | `next` | `off` | non | aucune |
| `reference` (NINEA, référence de paiement, code de plan, expéditeur SMS) | `text` | `text` | `next` | `off` | non | capitales |
| `confirmation` (phrase recopiée : « SUPPRIMER ») | `text` | `text` | `done` | `off` | non | capitales |
| `phrase` (titre) | `text` | `text` | `next` | `off` | oui | phrase |
| `entier` (surface, quantité) | `text` | `numeric` | `next` | `off` | non | — |
| `decimal` (pourcentage, mesure) | `text` | `decimal` | `next` | `off` | non | — |
| `coordonnee` (latitude, longitude) | `text` | `text` | `next` | `off` | non | aucune |
| `montant` (XOF) | `text` | `numeric` | `next` | `off` | non | — |
| `telephone` | `tel` | `tel` | `next` | `tel-national` | non | — |
| `courriel` | `email` | `email` | `next` | `email` | non | aucune |
| `url` | `url` | `url` | `next` | `url` | non | aucune |
| `code` (SMS, 2FA) | `text` | `numeric` | `done` | `one-time-code` | non | — |
| `mot-de-passe` | `password` | — | `done` | `current-password` | non | aucune |
| `nouveau-mot-de-passe` | `password` | — | `next` | `new-password` | non | aucune |
| `texte-long` (zone de texte) | — | — | `enter` | `off` | oui | phrase |
| `message` (messagerie) | — | — | `send` | `off` | oui | phrase |
| `liens` (zone où l'on colle des liens) | — | `url` | `enter` | `off` | non | aucune |

`coordonnee` aussi : le pavé décimal d'iOS n'a pas de signe moins, et la longitude du Sénégal est négative ; le
clavier complet porte « − » et « , » sur sa rangée de chiffres. `identifiant`, `reference`, `confirmation` et `liens` ont été ajoutés pendant la migration (lot de la console d'exploitation, le
2026-11-21) : `mots` forçait une majuscule sur les identifiants techniques, la phrase de confirmation perdait ses
capitales, et une zone de liens retrouvait la correction automatique.

- **Un profil donne des valeurs par défaut.** Un appelant peut encore poser `autoComplete` (un prénom :
  `given-name`) ou `enterKeyHint` (le dernier champ : `done`). Il ne pose jamais `type`, `inputMode`,
  `autoCorrect`, `autoCapitalize` ni `spellCheck` : ces réglages-là sont ce que le profil décide.
- **Un profil numérique remet un nombre au formulaire, et l'écran garde ce qui a été tapé.** `FormInput` lit la
  frappe par `lireNombre` (`src/lib/clavier.ts`) : « 1 500 » → 1500, « 150,000 » (l'anglais) → 150000,
  « 12,5 » → 12.5 ; vide ou illisible, la chaîne part telle quelle et le schéma la juge. Un formulaire dont les
  valeurs sont du texte (la fiche d'agence) pose `garderLeTexte`. Les lectures de montant hors `FormInput`
  (schémas, recherches) passent par la même fonction, jamais par un `replace(',', '.')` qui lirait « 150,000 »
  150. Une coordonnée garde sa propre lecture (« 14,692 » n'est pas un millier). Chaque champ quittant
  `type="number"` est vérifié dans son formulaire : bornes, valeur vide, envoi.
- Chaque champ profilé porte `data-profil` : la mesure (ADR-0133) et les tests le lisent.

### 2. La forme

- **`Input` et `Textarea` prennent une prop `profil`.** Les composants qui les enveloppent la transmettent :
  `FormInput` et `FormTextarea` la reçoivent de l'appelant, `PhoneInput` pose `telephone` et `FormAmountInput`
  pose `montant`.
- **Un `<input>` ou un `<textarea>` natif** prend l'aide `{...profil('…')}`.

### 3. Le placeholder

- **Tout champ profilé porte un placeholder, sauf les mots de passe**, où un exemple n'a pas de sens ; la règle
  de longueur s'écrit dans l'aide du champ.
- **Il donne un exemple de la valeur attendue, ou sa forme. Il ne répète jamais le libellé.**
  - Exemples : « Ex. : Almadies », « Ex. : 150 000 », « 77 123 45 67 », « nom@exemple.sn ».
  - À ne pas faire : « Votre nom » sous le libellé « Nom ».
- **Il ne remplace jamais le libellé** : il disparaît à la première lettre, et un lecteur d'écran le lit après le nom.
- Son texte passe par next-intl (fr, en, wo). Le wolof est en pause : la clé `wo` porte le texte français.

### 4. La garde — `scripts/check-champs.mjs` (`npm run check:champs`, `web-ci.yml`)

- **Elle relève chaque champ qui ouvre un clavier.** Ce sont `Input`, `input`, `Textarea`, `textarea`,
  `FormInput`, `FormTextarea`, `FormAmountInput` et les composants partagés qui transmettent le profil de leur
  appelant (`ChampDeLaFiche`, `ZoneDeLaFiche`, `ChampChiffre`), hors types sans clavier et hors des primitives
  elles-mêmes.
  Pour chaque fichier, elle compte deux défauts : les champs **sans profil** et les champs **sans
  placeholder**.
- **Le cliquet est exact par fichier**, dans `scripts/champs-baseline.json` :
  - un compte qui monte échoue ;
  - un fichier neuf avec un défaut échoue ;
  - un compte qui descend échoue tant que la base n'est pas réécrite (`--update`).
  Un cliquet qui ne tient que dans un sens est une tolérance.
- **Elle refuse `type="number"`** sur un champ, et un réglage de clavier posé à la main à côté d'un profil.
- **À la fin du chantier (TCK-2994), la base est vide.** La garde devient alors une règle sans exception.

## Options écartées

- **Tout migrer avant d'activer la garde** : le premier résultat visible arrive à la fin seulement, et les
  champs ajoutés entre-temps échappent à la règle.
- **L'aide seule, posée à la main sur chaque champ** : la garde doit alors reconnaître une expression
  étalée au lieu d'une prop. Elle est plus fragile, et un composant qui enveloppe un champ perd le profil sans
  bruit.
- **Garder `type="number"` en ajoutant `inputMode`** : la molette, les flèches et le refus des séparateurs
  restent.
- **Rendre `profil` obligatoire dans le type** : l'obligation s'applique à tout le parc d'un coup, ou pas du
  tout. La prop sera rendue obligatoire une fois la base vide, si le typage sait distinguer les types sans
  clavier.

## Conséquences

- **Un nouveau champ choisit son profil et son placeholder dès sa première ligne**, sinon la CI rougit.
- **Une valeur numérique qui arrivait en `number` arrive en chaîne.** La conversion se fait dans le schéma.
- Environ 200 placeholders neufs, donc autant de clés de traduction. Le texte en dur est refusé par
  `check:i18n`.
- **Ce que seul un téléphone juge** : le clavier effectivement ouvert, et la barre de saisie automatique
  d'iOS pour le téléphone, le courriel et le code reçu par SMS.

## Application

- `src/lib/clavier.ts` : `PROFILS`, `profil()`, `NomDuProfil`.
- `src/components/ui/input.tsx`, `textarea.tsx`, `phone-input.tsx`, `src/components/forms/Form*.tsx` : la prop.
- `scripts/check-champs.mjs`, `scripts/champs-baseline.json`, `.github/workflows/web-ci.yml` : la garde.
- Les champs, surface par surface : TCK-2992, TCK-2993, TCK-2994.
