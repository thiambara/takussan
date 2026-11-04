# ADR-0088 — Le journal des recherches est anonyme et agrégé, et une recherche n'est montrée qu'après cinq visiteurs distincts

- **Statut** : Accepté le 2026-11-04 par le porteur (option a) — modalités : décisions de la session, à revoir
- **Date** : 2026-11-04
- **Tickets** : TCK-2472 (journal), TCK-2473 (analyse de la saisie), TCK-2474 (index et route des suggestions), TCK-2475 (barre de recherche), TCK-2476 (variantes tenues par l'IA)
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
3. **Ce qui n'est jamais journalisé** : une saisie de plus de 80 caractères, qui porte six chiffres ou plus, ou un `@`.
   Seule la recherche validée est journalisée (page 1 de la liste publique), jamais une frappe. Un nom propre tapé au
   hasard ne franchit pas le seuil du §4 : il ne se montre jamais.
4. **Une recherche n'est montrée qu'après cinq visiteurs distincts** sur un même jour, et seulement si elle rend encore
   des résultats. La demande sans résultat ne sort que vers l'usage `radar.cibles` (ADR-0087 §6), l'usage `search.variantes`
   (§7, en saisies normalisées seulement) et la console.
5. **Rétention** : les lignes du journal vivent 13 mois.
6. **`privacy.ts` le dit**, et `VERSION_DOCUMENTS` avance, dans la PR qui l'écrit.
7. **L'IA ne travaille jamais à la frappe.** La suggestion se calcule par du code et un index dédié. L'IA tient hors ligne
   les variantes d'écriture (« wakam » → Ouakam, « appart », F4…), à partir des recherches sans résultat ; une variante
   n'est retenue que si elle désigne un lieu, un type ou un terme qui existe.

## Conséquences

- La suggestion apprend des recherches réelles sans conserver de donnée personnelle.
- Les recherches rares (moins de cinq visiteurs) ne servent qu'en agrégat au Radar : elles ne se montrent jamais.
- Le comptage des visiteurs distincts est exact au jour, et rien au-delà : on ne sait pas si un visiteur revient.

## Application

Tickets TCK-2472 à TCK-2476. Tests : « une saisie avec un numéro n'est pas journalisée », « une recherche à quatre
visiteurs n'est pas proposée », « l'empreinte du jour ne survit pas 48 h ».
