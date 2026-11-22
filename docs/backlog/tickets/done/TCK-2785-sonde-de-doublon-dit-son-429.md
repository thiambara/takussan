---
id: TCK-2785
title: "La sonde de doublon dit quand elle ne peut plus vérifier : le 429 du seau épuisé ne passe plus pour « aucun doublon »"
status: done
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [front, crm, doublons, limiteur, 429, suite-de-tck-2590]
---

## Objectif utilisateur

L'agent qui saisit un client sait quand Takussan ne peut plus lui dire si ce numéro ou cet e-mail est déjà connu,
et jusqu'à quand, au lieu de croire qu'il n'y a pas de doublon.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 29 : ticket de suivi pour TCK-2590.

**La prémisse a changé depuis la liste, et ce ticket ne porte plus que la moitié front.** Re-mesuré sur l'arbre
du 2026-11-13 :

- **Moitié API, fermée.** Le n° 29 disait « une fois le seau épuisé, le 429 distingue encore une fiche masquée ».
  Ce n'est plus vrai depuis affb8e269 (troisième porte de TCK-2590) et f66b3972e :
  - seau vide, **toute** identité complète présentée à une porte de doublon rend le même 429, que la fiche soit
    masquée ou libre. C'est vrai pour la sonde, la création, le PATCH et la conversion de demande ;
  - c'est épinglé par `SignalementMasqueTroisiemePorteTest` (`test_seau_vide_cachee_et_libre_rendent_le_meme_429`)
    et `CustomerDuplicateProbeTest` ;
  - la contre-vérification de affb8e269 (verif-commercial) l'a rejoué en sonde jetable : sonde e-mail, sonde
    numéro, PATCH et création rendent 429 partout, avant 429/200.

  Aucun delta API n'est demandé ici. Si le porteur voit un cas que ces tests ne couvrent pas, il fait un ticket à
  part.
- **Moitié front, ouverte.** `useSondeDeDoublon` (`takussan-web/src/lib/queries/customer-duplicates.ts`) rend
  `doublons: requete.data?.data ?? []`. Sur une erreur, et donc sur le 429 du seau épuisé, la sonde rend une liste
  vide, exactement comme quand il n'y a pas de doublon. `CreationDuClient` n'affiche alors rien : l'agent poursuit
  en croyant le contact neuf. Il ne l'apprend qu'à l'envoi, où la création rend le même 429, que
  `messageErreurApi` traduit (« Réessayez dans N min »).
- Le corps du 429 porte `retry_after`, en secondes (`bootstrap/app.php`), et `ApiError.retryAfter` le lit déjà
  (TCK-622). L'en-tête `Retry-After`, lui, n'est pas exposé au navigateur (`config/cors.php`,
  `exposed_headers: []`) : il faut lire le corps, pas l'en-tête.

**Endpoint consommé (existant) :** `GET /api/customers/duplicates?phone=&email=`.

## Direction UX / Artistique

Calme et factuel, à la place de l'alerte de doublon et dans son style : une ligne neutre, ni rouge ni bloquante.
Elle dit que la vérification des doublons est en pause jusqu'à une heure donnée, à l'heure de Dakar, et que
l'enregistrement reste possible. Une erreur réseau ou une 5xx de la sonde ne se fait pas passer pour un 429 : la
ligne dit alors que la vérification n'a pas pu se faire. Rien de cela ne bloque « Enregistrer ».

## Contraintes strictes (métier)

- **Une erreur de la sonde ne se rend jamais comme « aucun doublon ».** La sonde distingue trois états : rien
  trouvé, trouvé, et vérification impossible (avec sa cause : 429 avec son attente, ou autre).
- La ligne du 429 ne dit **rien** qui distingue une fiche masquée d'une fiche libre. Elle est identique quelle que
  soit la saisie, comme la réponse de l'API.
- Un 429 n'est pas relancé en boucle par le cache de requêtes. Pas de `retry` automatique sur 429 : la prochaine
  sonde part à la prochaine saisie après l'attente.
- Les textes passent par next-intl (fr, en ; le wo porte le français tel quel, le wolof étant en pause).
- Les autres porteurs de la sonde (`CreationRapideDuLocataire`, `CustomerForm`, s'ils l'utilisent) suivent la même
  règle.

## Delta à produire

- [x] La sonde expose l'état « vérification impossible » et l'attente du 429, lue sur `retry_after`.
- [x] La création courte et les autres formulaires qui sondent affichent la ligne décrite plus haut.
- [x] Tests vitest : 429 avec `retry_after`, 429 sans `retry_after`, 5xx, erreur réseau, retour à la normale après
  l'attente, et aucun appel relancé automatiquement sur 429.

## Critères d'acceptation

- [x] AC1 — Sonde à 429 `{retry_after: 1800}` : la ligne s'affiche, avec une heure de reprise 30 minutes plus tard
  au fuseau de Dakar, et aucune alerte de doublon. Le test vérifie qu'elle est présente ; l'absence d'alerte ne
  suffit pas.
- [x] AC2 — Sonde à 200 `{data: []}` : aucune ligne et aucune alerte, comme aujourd'hui.
- [x] AC3 — Sonde à 500 ou en erreur réseau : la ligne « vérification impossible », sans heure.
- [x] AC4 — « Enregistrer » reste actif dans les trois cas d'erreur.
- [x] AC5 — Après un 429, aucun nouvel appel à `/api/customers/duplicates` ne part sans nouvelle saisie (compté sur
  le double réseau du test).
- [x] AC6 — Vérifié par ablation. Une sonde qui rend `[]` sur erreur, comme aujourd'hui, rend AC1 et AC3 rouges.

## Hors périmètre

- r2 de TCK-2590, le budget non atomique, qui reste ouvert dans ce ticket-là.
- Tout changement de l'API, du limiteur ou du seau.

## Notes d'implémentation

- **Prémisse re-mesurée (2026-11-14).** API : `NUMEROS_COMPLETS_PAR_HEURE = 20` par personne, un seau pour le numéro
  complet et l'e-mail complet ; seau vide, toute identité complète rend 429 (`budgeterLesSignalementsMasques`). Aucun
  delta API. Front : le nouveau test rougit 9 sur 10 sur l'ancien hook (la sonde rendait `[]` sur erreur).
- **Un seul porteur de la sonde** : `grep -rn customers/duplicates src` ne trouve que `CreationDuClient`.
  `CreationRapideDuLocataire` et `CustomerForm` ne sondent pas.
- `useSondeDeDoublon` rend `impossible` : `{cause: 'limite', reprise}` (429, `retry_after` du corps, reprise datée
  sur `errorUpdatedAt`) ou `{cause: 'autre'}` (5xx, réseau, sonde suspendue hors ligne). Une réponse déjà reçue pour
  la même saisie l'emporte sur l'échec de sa relecture.
- Pas de relance sur 4xx, explicite dans le hook ; focus, reconnexion et remontage ne relancent pas un 429 tant que son
  attente court (60 s faute de `retry_after`). Une nouvelle saisie sonde toujours, même pendant l'attente : les sondes
  par préfixe ne puisent pas dans le seau horaire, les taire cacherait de vrais doublons.
- Ligne neutre `SondeEnSuspens` (`role="status"`, encre `muted-foreground`, sans `border-warning`), à la place de
  l'alerte, jamais avec. Heure formatée par `formatDate` (fuseau `Africa/Dakar` par défaut de `lib/format`).
- Preuves : `CreationDuClient.tck-2785.test.tsx` (10 tests ; AC5 sur `createQueryClient()`, focus et réseau simulés). Ablations du hook, toutes
  rouges : sonde `[]` sur erreur (9), 429 classé « autre » (5), toute erreur classée 429 (4), succès affiché impossible
  (2), garde de relance au focus/réseau/montage retirée (1), relance sur 429 (1).
- Limite : Dakar est à UTC+0, le fuseau n'est donc pas prouvé par ablation sur une machine ou une CI en UTC.
