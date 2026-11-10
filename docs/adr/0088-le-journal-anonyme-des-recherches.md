# ADR-0088 — Le journal des recherches est anonyme et agrégé, et une recherche n'est montrée qu'après cinq visiteurs distincts

- **Statut** : Accepté le 2026-11-04 par le porteur (option a) — modalités : décisions de la session, à revoir ; **amendé le 2026-11-09** (TCK-2511, quatrième sortie) et **le 2026-11-10** (TCK-2603, cinquième sortie, § 4)
- **Date** : 2026-11-04
- **Tickets** : TCK-2472 (journal), TCK-2473 (analyse de la saisie), TCK-2474 (index et route des suggestions), TCK-2475 (barre de recherche), TCK-2476 (variantes tenues par l'IA) ; amendements : TCK-2511 (quatrième sortie), TCK-2603 (cinquième sortie)
- **Dépend de** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md), [ADR-0076](0076-le-socle-ia.md)

## Contexte

Mesuré le 2026-11-04 sur `dev` `74506074b` :

- **Aucune recherche tapée n'est enregistrée.** Seules les recherches sauvegardées (`saved_searches.results_count`)
  disent une demande, et seulement celle de qui s'abonne à une alerte.
- La suggestion de la barre (`SuggestService`, TCK-335, TCK-507) ne propose que des termes isolés (villes, quartiers,
  types) : une saisie composée (« appart 3 chambres Almadies ») ne rend rien de composé, le champ vide ne propose rien,
  et elle ne connaît aucune recherche fréquente.
- Le porteur veut des recherches populaires dans la suggestion, et que la demande sans résultat nourrisse le Radar
  (ADR-0087 §6).
- Une saisie libre peut contenir un numéro de téléphone, un courriel ou un nom de personne.

## Décision

1. **Une ligne par jour et par recherche, rien par personne.** `search_query_stats` : le jour, la saisie normalisée
   (minuscules, sans accents, blancs repliés), la signature des critères structurés, le nombre de recherches, le nombre
   de visiteurs distincts, le nombre de recherches sans résultat et le dernier nombre de résultats. Ni compte, ni IP, ni
   identifiant durable.
2. **Le visiteur distinct se compte par une empreinte du jour.** `HMAC(IP, clé + date)`, gardée dans une table de
   travail purgée au-delà de 48 heures : elle ne rejoint ni un autre jour, ni un compte.
   *Amendement du 2026-11-04 (revue adverse, n° 7 et 8)* : l'empreinte porte aussi la recherche
   (`HMAC(jour | recherche | IP)`), pour que les recherches d'un même visiteur ne se relient pas entre elles, et le
   **seuil** du §4 compte les réseaux distincts — /24 en IPv4, /48 en IPv6 — et non les visiteurs, un abonné ou un
   hébergeur disposant de tout un préfixe (sous-compter est le sens sûr ; le compte affiché reste celui des visiteurs).
3. **Ce qui n'est jamais journalisé** : une saisie de plus de 80 caractères, qui porte six chiffres ou plus, ou un `@`.
   *Amendement du 2026-11-04 (revue adverse, n° 1)* : ni un courriel écrit sans `@` (« awa.diop gmail.com », « at gmail
   point com », un fournisseur de messagerie nommé, « arobase », « (at) »).
   Seule la recherche validée est journalisée (page 1 de la liste publique), jamais une frappe. Un nom propre tapé au
   hasard ne franchit pas le seuil du §4 : il ne se montre jamais.
4. **Une recherche n'est montrée qu'après cinq visiteurs distincts** sur un même jour, et seulement si elle rend encore
   des résultats. La demande sans résultat ne sort que vers l'usage `radar.cibles` (ADR-0087 §6), l'usage `search.variantes`
   (§7, en saisies normalisées seulement) et la console.
   *Amendement du 2026-11-09 (TCK-2511)* : une quatrième sortie, **un agrégat et rien d'autre** — le nombre de
   recherches des 30 derniers jours dont le filtre de quartier est le quartier commun des annonces d'un lien de
   réclamation du Radar, montré au seul porteur de ce lien signé, et seulement à partir de
   `radar.claim.demand_min_searches` (50). Aucune saisie, aucune recherche, aucun compte de visiteurs ne sort ; sous le
   seuil, rien. Le seuil de cinq réseaux ne s'applique pas : il protège une recherche *montrée*, et un total par quartier
   n'en montre aucune. `privacy.ts` le dit (§6).
   *Amendement du 2026-11-10 (TCK-2603 ; audit UX famille 2, décision n° 1 (a) du porteur, publier sans compte —
   [ADR-0093](0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md))* : une cinquième sortie, **publique**, et
   elle aussi **un agrégat et rien d'autre**. C'est le nombre de recherches des 7 derniers jours dont le **filtre de ville**
   est une ville du référentiel, servi par `GET /api/public/publish/demand?city=` au départ de la publication (« 1 240
   recherches à Dakar cette semaine »).
   - **Granularité** : la ville seule. Ni quartier, ni type, ni prix, ni jour, ni aucune autre ventilation. Une seule
     ville par appel.
   - **Seuil** : `publish.demand_min_searches` (200, valeur décidée par le porteur le 2026-11-10). Sous le seuil, `null`, et rien ne s'affiche.
   - **Arrondi** à la dizaine inférieure : le total n'est pas une mesure exacte qui se compare d'un jour à l'autre.
   - **Cache** d'une heure, et limiteur `public-read`.
   - Sans ville demandée, la réponse porte la ville qui a le plus de recherches sur la période. C'est le seul classement
     qui sorte, et il ne nomme qu'une ville.
   - Aucune saisie, aucune recherche et aucun compte de visiteurs ne sort.
   - Le seuil de cinq réseaux ne s'applique pas, pour la raison de la quatrième sortie : il protège une recherche
     *montrée*, et un total hebdomadaire par ville n'en montre aucune.
   - **Pourquoi elle peut être publique, quand la quatrième est réservée au porteur d'un lien signé** : un total de ville
     au-dessus de 200 ne dit rien d'une personne ni d'une recherche, là où un total de **quartier**, petit, approche la
     recherche isolée. Le seul risque est concurrentiel : un tiers apprend la demande par ville. Il est accepté, c'est un
     chiffre de vitrine.
   - `privacy.ts` le dit, et `VERSION_DOCUMENTS` avance dans la PR qui l'écrit (§ 6).
5. **Rétention** : les lignes du journal vivent 13 mois.
6. **`privacy.ts` le dit**, et `VERSION_DOCUMENTS` avance, dans la PR qui l'écrit.
7. **L'IA ne travaille jamais à la frappe.** La suggestion se calcule par du code et un index dédié. L'IA tient hors ligne
   les variantes d'écriture (« wakam » → Ouakam, « appart », F4…), à partir des recherches sans résultat ; une variante
   n'est retenue que si elle désigne un lieu, un type ou un terme qui existe.
   *Amendement du 2026-11-04 (revue adverse, n° 3)* : et si elle en est une écriture PROCHE (faute, phonétique simple,
   abréviation), qui n'est ni un mot courant ni le nom d'une autre cible — une variante est créée active sans relecture.
   *Amendement du 2026-11-04 (revue adverse, 13a)* : le passage hors ligne ne part que si un réglage explicite
   (`search_alias_settings`, une ligne, créée éteinte) est allumé, au nom de celui qui l'a allumé — jamais d'un
   `super_admin` choisi d'office. Opérateur disparu : aucun passage, issue `search.aliases.operator_missing`.

## Conséquences

- La suggestion apprend des recherches réelles sans conserver de donnée personnelle.
- Les recherches rares (moins de cinq visiteurs) ne servent qu'en agrégat au Radar : elles ne se montrent jamais.
- Le comptage des visiteurs distincts est exact au jour, et rien au-delà : on ne sait pas si un visiteur revient.

## Application

Tickets TCK-2472 à TCK-2476. Tests : « une saisie avec un numéro n'est pas journalisée », « une recherche à quatre
visiteurs n'est pas proposée », « l'empreinte du jour ne survit pas 48 h ».
