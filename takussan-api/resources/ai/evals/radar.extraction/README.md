# Jeu d'évaluation — `radar.extraction`

TCK-2386 (ADR-0077 §5, socle ADR-0076 §8). Joué par `php artisan ai:eval radar.extraction`.

## D'où viennent les cas (TCK-2403)

`provenance.json` le dit cas par cas ; `RadarExtractionEvalSetTest` garde qu'il décrit exactement les
cas du jeu et qu'**au moins la moitié sont réels**.

| Cas | Origine | Forme |
|---|---|---|
| `001` … `014` | **RÉELS** — [Expat-Dakar](https://www.expat-dakar.com), relevés le 2026-10-29, puis reformulés | la page d'annonce, dans la forme que `HtmlCleaner` rend au job (source `expat_dakar`) |
| `015` … `020` | **RÉELS** — [CoinAfrique](https://sn.coinafrique.com), relevés le 2026-10-29, puis reformulés | idem (source `coinafrique`) |
| `021` … `024` | synthétiques (ex-`014`, `013`, `015`, `018` de TCK-2386) | messages informels de type WhatsApp/Facebook : des formes que ces deux sites ne donnent pas (propriétaire direct, plusieurs offres, aucun prix, frais de dossier) |
| `025` … `030` | synthétiques | **captures** dessinées par GD, jouées sur le rôle `vision` |

**« Réel » veut dire : relevé sur une vraie annonce, puis réécrit.** Aucun cas n'est une annonce recopiée :
chacun reprend le type de bien, le contrat, le nombre de pièces, le quartier, la période, la nature de
l'annonceur et le style d'une annonce relevée, dans d'autres mots et avec d'autres chiffres (voir plus bas).
Le jeu mesure donc la lecture de pages d'annonces telles qu'elles se présentent — leur bruit (fil d'Ariane,
bloc de contact), leurs incohérences, leurs abréviations — pas la lecture d'un texte précis.

**Pas une seule capture réelle**, et ce n'est pas un oubli : une capture d'écran porte le numéro, le
nom et la photo de l'annonceur dans l'image, qu'aucune garde ne sait masquer. Les 20 cas réels sont donc
des textes ; les six captures restent des rendus de textes inventés. Ce que le jeu ne dit toujours pas :
la lecture d'une vraie capture (police, recadrage, thème du téléphone), ni la distribution des annonces
WhatsApp et Facebook, dont aucune ne se relève sans compte.

### ⚠ Règle : aucun document ne cite une donnée relevée

**Ni ce README, ni le ticket, ni un commentaire, ni un message de commit ne cite un numéro, une référence, une
URL, un nom ou une phrase relevés dans une vraie annonce, pas même « pour illustrer » un défaut.** Un document
décrit une forme (« un numéro étranger collé à son indicatif »), jamais un exemple pris sur le terrain : deux
vrais numéros cités comme exemples ont été publiés dans un README et un ticket avant que cette règle existe.
`RadarExtractionEvalSetTest` lit tous les fichiers de ce dossier et le ticket (numéros étrangers, avec ou sans
espace après le « + », formes nationales, numéros groupés ou collés, références avec ou sans libellé, liens,
arobases) ; il ne reconnaît pas un nom ni une phrase : la relecture humaine reste seule à les garder.

### Comment les cas réels ont été relevés et anonymisés

L'**anonymisation** ne se borne pas à remplacer les numéros et les noms (ce serait pseudonymiser : l'annonce
d'origine se retrouverait par son titre, et redonnerait le nom et le numéro).

1. Les pages ont été téléchargées (une requête par annonce, une seconde d'écart, sans compte), passées par
   **`HtmlCleaner`**, le nettoyeur du job, puis **réécrites** : le menu et le pied de page du site (constants),
   le second bloc de contact et les consignes de sécurité sont retirés.
2. **Chaque titre est reformulé** (même sens, autres mots), ainsi que toute phrase assez singulière pour
   retrouver l'annonce. **Les prix sont décalés d'un petit écart réaliste**, dans le texte ET dans l'attendu ;
   les surfaces de même quand elles identifient un bien. La date d'inscription du vendeur, son nombre
   d'annonces, l'heure de publication sont retirés.
3. Les **numéros** deviennent `[TELEPHONE]` ; le nom du vendeur, de l'agence ou de la personne à contacter devient
   `[NOM]` en gardant le mot générique qui est un indice de nature (`Cabinet immo. [NOM]`, `[NOM] IMMOBILIER`,
   `agence immobilière [NOM] vous propose`) ; la **référence de l'annonce** (qui redonne l'URL) devient
   `[REFERENCE]`.
4. **Les adresses sont ramenées au quartier** : ni rue, ni nom de résidence ou d'immeuble, ni repère qui identifie
   une parcelle (hôpital, immeuble voisin), ni date de livraison. Les quartiers, villes, équipements et repères
   publics banals restent.
5. **Aucune URL d'annonce n'est gardée**, ni ici ni dans `provenance.json` : seulement le site et la date du
   relevé. Les pages brutes n'ont pas été versées.
6. Texte anonymisé, puis `ExternalContent::wrap()` : la balise garde l'empreinte du texte anonymisé, pas celle
   de l'original.

**Relecture.** Les originaux ne sont plus là (voulu) : rien ne prouve la relecture au-delà de la parole de ses
auteurs. Chaque cas a été relu par l'implémenteur, puis par deux passes de vérification adverse (la première sur
une version antérieure du jeu, la seconde sur celle-ci), et `scripts/check-ai-evals-pii.mjs` et
`RadarExtractionEvalSetTest` sont verts. **Rien ne garde les noms** : le jeu doit encore être relu par le porteur, et
cette relecture est celle qui fait foi avant le passage payant.

```bash
node resources/ai/evals/radar.extraction/relecture.mjs            # les 20 cas réels : texte anonymisé et sortie attendue côte à côte
node resources/ai/evals/radar.extraction/relecture.mjs 007 012    # ceux-ci
node resources/ai/evals/radar.extraction/relecture.mjs --tous     # y compris les synthétiques
```

### Conventions des sorties attendues sur les cas réels

Les valeurs sont **ce que l'annonce dit**, rien de ce qu'on déduit d'un usage. Quatre règles, parce que ce
sont les endroits où une page est ambiguë :

- **Période du loyer** (décision du porteur) : `null` quand le texte n'en écrit aucune — on n'invente pas. La
  plupart des loyers d'Expat-Dakar affichent un prix sans « par mois ». `daily` quand il dit « tarif par jour » ou
  « à la nuitée », `monthly` quand il écrit « par mois ». Un modèle qui répond `monthly` partout invente au sens
  du prompt (« `null` si l'annonce ne la dit pas »), même si c'est la pratique commune.
- **Salles de bain** : un nombre **seulement si l'annonce l'écrit** (le champ « Salle de Bain N » de la page ou
  « N salles de bain » dans le texte) et que le texte ne le contredit pas ; sinon `null`. « Chaque chambre avec sa
  salle d'eau » n'est pas un nombre de salles de bain. Une règle, pour les 20 cas.
- **Ville et quartier** : *ville* = la commune que l'annonce nomme (Dakar, Rufisque, Guédiawaye, Pikine, Thiès,
  Mbour, Saly, Ngaparou, Saint-Louis…) ; *quartier* = ce qui est dans une ville ou dans l'agglomération dakaroise
  (Ngor, Point E, Mamelles, Yoff, Diamniadio, Malibu, Bango). Une localité nommée seule qui est une commune est la
  ville, quartier `null` (Saly, Ngaparou, comme le cas `026`). Une **région** écrite derrière une localité
  (« Saly Thiès ») n'est jamais la ville.
- **Prix** : le premier prix écrit sur la page, avec la graphie du site (« 880 000 F Cfa », « 315 000 CFA »).
  `text` ignore les blancs et la casse, pas la ponctuation.

## Ce qu'il contient

- `cases/001.json` … `024.json` : des annonces en texte (20 réelles reformulées, 4 synthétiques) ;
- `cases/025.json` … `030.json` : des annonces en **captures** (`captures/*.png`, un texte d'annonce
  rendu par GD), jouées sur le rôle `vision` comme en production (`AttachmentsUseVision`) ;
- `fields.json` : le type de chaque champ noté et le chemin de sa valeur dans la sortie ;
- `provenance.json` : l'origine de chaque cas (réel ou synthétique, site, date du relevé) ;
- `relecture.mjs` : l'affichage de relecture, dérivé des fichiers du jeu.

Un cas est `{ "input", "expected", "attachments"? }`. **`input` est exactement ce que le job
envoie** (`ExtractRadarListing`) : `ExternalContent::wrap(<source_site>, <texte rogné>)`, et un bloc
vide pour une saisie par captures, les images étant jointes. `RadarExtractionEvalSetTest` le
vérifie : un `input` écrit à la main, sans passer par `ExternalContent::wrap()`, y rougit.

## Ce qui est noté

Les **valeurs** des douze champs de `fields.json`, jamais les passages cités ni les confiances : la
sortie rend `{"price": {"value": …, "confidence": …, "evidence": …}}`, et `"path": "price.value"`
fait lire au `FieldScorer` la seule valeur. Ni `title`, ni `description`, ni `phones`, ni
`advertiser_name`, ni `nature_signals` ne sont notés.

- `price` : le texte tel qu'écrit (« 1M5 », « 450.000f/mois »), égalité sans casse ni espaces de bord ;
- `bedrooms`, `bathrooms` : nombres exacts ; `surface_m2` : nombre à 5 % près ;
- `amenities` : recouvrement de listes (Jaccard), chaque équipement tel qu'écrit ; `null` si aucun ;
- le reste : égalité (`null` compris — une valeur absente de l'annonce ne doit pas être inventée).

Une annonce à plusieurs offres (cas 022) attend la première ; une annonce sans prix (cas 023)
attend `price: null`.

## La référence (`baseline.json`)

Elle exige un vrai modèle : elle se fixe par un jeu **complet**
(`php artisan ai:eval radar.extraction --update-baseline`, sans `--role` ni `--model` — une
première référence d'un seul rôle est refusée, `ai.eval.baseline_needs_full_run`). Elle n'existe pas
encore : elle part avec le passage payant que le porteur lance à la main (TCK-2403, AC1), après avoir
relu les cas (`relecture.mjs`). Le jeu complet joue 24 cas sur le rôle `extraction` et 6 sur `vision`.

## Remplacer ces cas par de vraies annonces

1. Partir d'annonces dont l'équipe a vérifié les champs. ⚠ `php artisan ai:export-eval-cases`
   ne lit que les suggestions corrigées (`ai_suggestions`, décision `edited`), et le Radar du lot 1
   n'en écrit pas : il garde sa sortie dans `radar_listings.extracted`. Tant que c'est le cas, un cas
   se construit à la main : le texte brut de l'annonce et ses valeurs vérifiées passent d'abord par
   `EvalCaseAnonymizer::anonymize()` (noms, téléphones, courriels jetonnés dans le texte et les
   attendus), **puis** le texte anonymisé est enveloppé par `ExternalContent::wrap()`. Dans l'autre
   ordre, la balise garde l'empreinte du texte d'origine et `RadarExtractionEvalSetTest` rougit. Si
   le Radar écrit un jour des suggestions, l'export s'applique, mais ses attendus (`final_value`)
   seront à ramener aux clés de `fields.json`, et son entrée à la même vérification.
2. Relire chaque cas exporté : l'anonymiseur ne reconnaît un nom que dans un champ personnel ; un
   nom écrit ailleurs dans l'annonce reste à jetonner à la main (`[NOM]`). ⚠ **Un numéro étranger collé à son
   indicatif** (`+33…`, `+225…`) n'est reconnu ni par `PhoneMasker` ni par `check-ai-evals-pii.mjs` (TCK-2410) :
   le test du jeu les garde, mais le premier réflexe est de chercher un `+` dans le texte.
3. Garder la forme ci-dessus : `input` produit par `ExternalContent::wrap()`, `expected` limité aux
   clés de `fields.json`, captures sous `captures/`.
4. `node scripts/check-ai-evals-pii.mjs`, `php artisan test tests/Feature/Ai/RadarExtractionEvalSetTest.php`
   (ajuster le compte de cas qu'il attend), puis une nouvelle référence complète.
