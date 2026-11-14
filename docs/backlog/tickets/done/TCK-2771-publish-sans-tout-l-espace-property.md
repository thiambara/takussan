---
id: TCK-2771
title: "/publish ne reçoit plus tout l'espace `property` : l'assistant n'en lit qu'un tiers"
status: done
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2600]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [front, publish, i18n, performance, audit-ux]
---

## Objectif utilisateur

Le visiteur sans compte qui ouvre `/publish`, souvent au téléphone et sur un réseau mobile, ne
télécharge que les libellés de l'assistant de publication, pas ceux du tableau de bord, de la fiche
de bien, des avis ou des réservations.

## Contexte mesuré (2026-11-13, arbre de TCK-2600)

**Décision.** Porteur, 2026-11-13, liste du soir n° 31 : ticket de suivi (découper l'espace de traductions `property`).

- Depuis TCK-2600, `/publish` monte l'assistant entier (`AssistantDePublication`). La frontière
  `publish` de `src/i18n/namespaces.json` sert alors 7 espaces : `auth media nav owners profile
  property publishRedirect`, soit **20,1 % du dictionnaire** (41 941 o gzip). Le cliquet était à
  13 % ; TCK-2600 le relève à 21 % et le dit dans son message de commit (décision de la session
  principale du 2026-11-13).
- `property` pèse à lui seul **16 377 o gzip** (32 sous-clés). L'assistant et ses voisins
  (`components/property-form`, `publication`, `contact`, `media`) lisent `property.wizard`,
  `property.form`, `property.contacts`, `property.types`, `property.cards`, `property.moderation` et
  les énumérations de `PROPERTY_ENUM_NAMESPACES`.
- Ils ne lisent pas `property.dashboard` (6 048 o), `detail` (1 868), `visitDialog` (1 202),
  `reservation` (868), `reviews` (624), `report`, `retired`, `availabilityCheck`, `reviewReport`,
  `portfolio`, etc. À re-mesurer par le dérivateur, pas par ce relevé à la main.
- La garde (`scripts/check-i18n-namespaces.mjs`) raisonne par espace de premier niveau. Un
  sous-espace atteint fait servir l'espace entier.

## Delta à produire

- Choisir et écrire la voie, en ADR si elle touche au dérivateur. Deux voies :
  - (a) Scinder `property` en espaces de premier niveau (par exemple `propertyWizard`,
    `propertyForm`, ou les énumérations à part) dans les trois langues. Les appelants changent, la
    garde reste telle quelle.
  - (b) Rendre le dérivateur et `messagesPour` capables de servir un sous-arbre (`property.wizard`).
    La garde change, les appelants non.
- Ramener le cliquet de `publish` au plus près de la mesure après le découpage (`--update`, dit dans
  le message de commit).

## Critères d'acceptation

- [x] AC1 — `node scripts/check-i18n-namespaces.mjs --report` : la frontière `publish` ne sert plus
  `property.dashboard`, `property.detail` ni `property.reviews`, et sa part du dictionnaire baisse
  d'au moins 5 points par rapport aux 20,1 % du 2026-11-13.
- [x] AC2 — Aucun libellé de l'assistant ne s'affiche en chemin de clé brut : `/publish` (sans
  compte) et `/app/properties/new` (connecté) parcourus jusqu'à « Publier l'annonce » au navigateur,
  en `fr` et en `en`. Le relevé du DOM ne trouve aucune chaîne `property.` ni aucun nouveau nom
  d'espace.
- [x] AC3 — `npm run check:i18n` (parité) et `npm run check:i18n-namespaces` sont verts, et les
  tests de l'assistant passent sans changement de leurs attentes de libellés.

## Hors périmètre

- Le contenu des libellés et le wolof (en pause).
- Les autres frontières, même si la voie (b) leur profiterait.

## Notes d'implémentation (2026-11-14)

**Voie retenue : (a)**, décision de la session principale du 2026-11-14. Le dérivateur, `messagesPour`
et la garde ne changent pas, donc pas d'ADR. La voie (b) aurait touché le dérivateur, la fusion
d'`IntlProvider` et la règle d'identité des objets (`messagesPour` recopie des RÉFÉRENCES, TCK-1489) :
un sous-arbre servi par deux frontières y aurait demandé une fusion profonde par frontière.

**Ce qui sort de `property`.** Ce sont les treize sous-arbres que le graphe de `/publish` ne lit pas
(relevé fichier par fichier sur les 183 fichiers atteints) : `dashboard`, `detail`, `visitDialog`,
`reservation`, `reviews`, `report`, `retired`, `availabilityCheck`, `reviewReport`, `portfolio`,
`discovery`, `row` et `moderation`. Chacun devient l'espace de premier niveau `property<X>`
(`propertyDashboard`, `propertyDetail`…), dans les trois langues, sans changer aucun libellé.
`property.dashboard` n'est lu, sous `/publish`, que par une action serveur (`getTranslations`), qui
n'est pas servie au navigateur.
- `list` reste dans `property` : sorti, il fait servir `propertyList` à la coque publique par la
  section `playground`, et la règle E demande alors une frontière de plus. Gain : 132 o.
- `fields` reste aussi : aucun appelant n'existe. Ce sont des clés mortes, dont le retrait relève du
  contenu et sort du périmètre.

**Comment.** Un script de renommage, rejouable, travaille PAR CLÉS, jamais par lignes. Il refuse
un sous-arbre que l'arbre ne porte pas tel que HEAD le porte (par clés et par valeurs, l'ordre seul
n'est qu'une note), et un fichier de code qui diffère de HEAD : le travail non commité d'un autre
ticket ne part jamais sous celui-ci. Il est idempotent, et rien n'est écrit avant que tout soit vérifié. Il réécrit les appelants sous
trois formes : chaîne (`'property.detail…'`), accès d'objet (`fr.property.dashboard`) et chemin en
tableau (`['property', 'dashboard', …]`). Les nouveaux espaces se posent en fin de dictionnaire,
exactement là où la greffe `cles_i18n` de commit-ticket.py les pose sur HEAD (vérifié octet pour
octet sur `fr.json`).

**Mesure à blanc** (extraction de HEAD 687016bd3, script appliqué, `--update`) : `/publish` sert
**15,0 %** du dictionnaire (33 689 o sur 225 036 o gzip, 13 espaces cumulés), contre 19,1 % sur la même
HEAD et 20,1 % le 2026-11-13. Le plafond régénéré passe à 20 %. Toutes les frontières restent
conformes au graphe. Sur une copie de l'arbre de travail (maquettes locales comprises), même
résultat : 15,0 % (33 644 o sur 224 734 o).

**Marge sous 15,1 % : 0,13 point, et elle ne viendra pas de `property`.** Ce qui reste dans
`property` (wizard, form, contacts, cards, amenityCatalog, énumérations) est lu par l'assistant. La
marge est dans les autres espaces de la frontière, hors du périmètre de ce ticket :
- `profile` : 7 606 o, dont l'assistant lit environ 1 211 o (`types`, `switcher`, `contact`) ;
- `nav` : 5 162 o, dont environ 115 o lus (`coque`) ;
- `owners` : 3 835 o, dont environ 501 o lus (`invite`, `update`).
Le même découpage y rapporterait de l'ordre de 6 points. C'est une estimation : les lecteurs par
gabarit de `profile` et `owners` n'ont pas été résolus. Il demande un ticket de suivi.

**Vérifié dans l'extraction** :
- `tsc --noEmit` et ESLint (87 fichiers) : propres ;
- `vitest related` (206 fichiers, 1 685 tests) et les dossiers de l'assistant (58 fichiers, 588 tests,
  attentes de libellés inchangées) : verts ;
- `check:i18n`, `check:i18n-namespaces`, `check:vouvoiement`, et à la racine `check-enum-namespaces`,
  `check-status-labels`, `check-status-unions`, `check-notification-codes` : verts.

Ablations :
- `BarreDuBien` remis sur `'property.dashboard.fiche'` fait rougir `property-dashboard/fiche`
  (`MISSING_MESSAGE`), puis le fichier est restauré et son md5 vérifié ;
- côté script, dans une copie : une valeur changée sous `property.dashboard`, une clé ajoutée sous
  `property.reviews`, ou un fichier de code qui diffère de HEAD → REFUS, sortie 1, aucun fichier
  écrit ;
- l'application propre rejouée deux fois → « déjà fait », aucun fichier au second passage.

**Reste à faire** :
- appliquer le script dans l'arbre au créneau donné par la session (trois agents y écrivent encore) ;
- AC2 au navigateur après l'application, sur `/publish` et `/app/properties/new`, et aussi sur
  `/app/properties`, une fiche `/app/properties/[id]` et une fiche publique `/properties/[slug]`,
  où vivent les espaces déplacés.

⚠ Un ticket non encore commité qui ajoute une clé sous `property.dashboard` (ou un autre sous-arbre
déplacé) la recréerait à son commit : la greffe de son manifeste viserait l'ancien chemin. Le script
le refuse avant l'application. Après l'application, cette clé doit viser `property<X>`.

### Relevé au navigateur (2026-11-14, CDP direct, 1280 px, base de démo en lecture seule)

- Pages rendues, fr ET en, zéro `MISSING_MESSAGE` / `IntlError`, aucune clé brute (motifs `property[A-Z]\w*\.` et `property\.\w+\.`), aucune erreur console : `/publish` (sans compte), `/app/properties/new` et `/app/properties` et `/app/properties/593` (persona `admin`), `/{fr,en}/properties/villa-ac1-2601-a-dakar-0zPlB7` (sans compte).
- `/publish`, parcours réel fr et en (type + contrat, lieu, caractéristiques, prix, photos, titre) : aucune clé brute, aucune erreur Intl à aucun écran. Arrêt à l'écran « Un titre, et c'est prêt » : l'écran suivant demande le numéro et un code SMS, donc un envoi réel. « Publier l'annonce » n'a pas été atteint.
- `/app/properties/new` : premier écran seulement (le brouillon connecté s'enregistre côté serveur = écriture).
- AC1 : `check-i18n-namespaces.mjs --report` → `publish` : 7 espaces, 13 cumulés, 33 899 o gzip, **15,1 %** (plafond affiché 21 %, non encore abaissé à 20 % dans l'arbre).
- AC3 : `npm run check:i18n-namespaces` vert (50 frontières). `npm run check:i18n` ROUGE : 105 écarts, tous des fichiers `playground/maquettes/pages/*.tsx` locaux hors baseline (maquettes non commitées), aucun lié à ce ticket. Tests de l'assistant : non rejoués ici.
- AC2 et AC3 laissés non cochés : AC2 faute du dernier écran (SMS), AC3 faute d'un `check:i18n` vert dans cet arbre.

### Suite du relevé (2026-11-14, écritures de démo autorisées par la session)

- AC1 tenu : `publish` 20,1 % → 15,1 % (−5,0 points, 33 899 o gzip) ; `fr.json` n'a plus `property.dashboard`, `detail` ni `reviews` (devenus `propertyDashboard`, `propertyDetail`, `propertyReviews`). Le texte de l'AC ne parle pas du plafond affiché (21 %) : il n'exige pas 20 %. Marge de 0,0 point sur le seuil des 5 points.
- AC2 tenu : `/publish` sans compte parcouru jusqu'au bout en fr ET en (type, lieu, caractéristiques, prix, photos, titre, numéro, code, prénom/nom, « Publier mon annonce ») puis « Votre annonce est en ligne » : zéro `MISSING_MESSAGE`/`IntlError`, zéro clé brute à chaque écran. `/app/properties/new` (compte 201) : tous les écrans jusqu'à « Publier l'annonce » (non cliqué), fr et en, même résultat.
- Lignes écrites en base de démo (5433), à effacer à la réinitialisation : `users` 201 (tél. +221 77 123 45 67) et 202 (+221 77 123 45 68) ; leurs `owner_profiles` 38 et 39, `agency_admin_profiles` 17 et 18, agences 13 et 14 ; `properties` 594 et 595 ; `wizard_drafts` 26 (brouillon connecté du compte 201) ; `personal_access_tokens` (4 lignes, comptes 201 et 202, dont 101 et 102 posés par le relevé). Aucun SMS réel : aucune intégration `sms_*` en base, le code est lu dans l'aperçu hors production (`otp_preview`) et jamais imprimé.
- 2026-11-14, session : AC3 tenu au HEAD 8edd98aea sur un extrait propre (`git archive`, sans maquettes locales) : `check:i18n` vert (parité 0/0 sur 16171 clés), `check:i18n-namespaces` vert ; les tests de l'assistant ont passé à la vérification du commit 19167d93a, et ses retouches de tests ne changent que des chemins de clés (`property.dashboard` → `propertyDashboard`…), aucun libellé attendu.
