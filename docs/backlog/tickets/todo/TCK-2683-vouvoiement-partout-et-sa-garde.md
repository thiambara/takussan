---
id: TCK-2683
title: "Vouvoiement partout : les derniers textes du site public qui tutoient, la charte alignée, et une garde qui empêche le tutoiement de revenir"
status: todo
phase: P2
family: front
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, i18n, copy, ton, garde, audit-ux, app]
---

## Objectif utilisateur

Où qu'il soit — l'annuaire des agences, la fiche d'une agence, la publication d'une annonce, son
espace — le visiteur est vouvoyé. Takussan parle d'une seule voix, et elle ne change plus d'une page
à l'autre.

## Contrat de données

Aucun changement d'API. **Relevé sur `dev` (1bce3798a) le 2026-11-10** :

- `takussan-web/src/messages/fr.json` : **5 clés sur 10 512** tutoient, toutes sur la surface publique
  des agences :

  | Clé | Texte d'aujourd'hui | `wo` |
  |---|---|---|
  | `publicProfile.contact.sheetDescription` | « Choisis ton canal pour entrer en contact. » | wolof écrit |
  | `publicProfile.portfolio.emptyHint` | « Reviens bientôt — les annonces se renouvellent régulièrement. » | wolof écrit |
  | `publicProfileIndex.empty.body` | « Essaie une autre ville ou élargis ta recherche. » | wolof écrit |
  | `publicProfileIndex.join.title` | « Ton agence n'est pas encore là ? » | **copie du français** |
  | `publicProfileIndex.join.body` | « Une vitrine gratuite, tes annonces sur Takussan, … » | **copie du français** |

- Chaînes écrites en dur dans `takussan-web/src/` (hors `playground/maquettes/` et `__tests__/`) : **0** au tutoiement.
- Gabarits de l'API (`takussan-api/resources/views`, `takussan-api/lang`) : **0** au tutoiement.
- Le reste du site public vouvoie déjà : la famille 1 de l'audit a été livrée au vouvoiement (décision 17 de sa vague 1 ; TCK-2495, TCK-2503, TCK-2508).

**Commandes qui reprennent le relevé** (depuis `takussan-web/`) :

```bash
# pronoms (tu, toi, ton, ta, tes, t’) — rend 4 lignes le 2026-11-10
grep -nE "\": \"([^\"]*[^[:alpha:]’'-])?([Tt]u|[Tt]oi|[Tt]on|[Tt]a|[Tt]es|[Tt]’)[[:space:]]" src/messages/fr.json
# impératifs au singulier en tête de phrase — rend publicProfile.portfolio.emptyHint (« Reviens ») et .empty.body (« Essaie »)
grep -nE "\": \"([^\"]*[.!?] )?(Essaie|Reviens|Choisis|Découvre|Trouve|Publie|Ajoute|Contacte|Crée|Connecte|Inscris|Vérifie|Renseigne|Indique|Regarde|Laisse|Envoie|Écris|Partage|Garde|Reçois|Compare|Explore|Commence|Continue|Prends|Enregistre|Clique|Appuie|Saisis|Retrouve|Rejoins|Accède|Consulte|Modifie|Élargis|Tape|Mets|Fais) [a-zà-ÿ]" src/messages/fr.json
```

Le second motif rend aussi des faux positifs connus (« Choisis sur Takussan et partagés avec vous »,
participe ; descriptions de la console à la 3ᵉ personne : « Envoie un email de reset… »,
« Consulte la console… », « Modifie l'abonnement en cours… » ; le nom « Partage impossible ici »). Ils ne sont pas du tutoiement. Le 2026-11-10, ce motif rend 8 lignes, dont 3 vraies (les deux citées et « Choisis ton canal… », déjà rendue par le premier).

## Direction UX / Artistique

- Les textes neufs (vouvoiement, même sens, même longueur à ±10 %) :
  - « Choisissez votre canal pour entrer en contact. »
  - « Revenez bientôt — les annonces se renouvellent régulièrement. »
  - « Essayez une autre ville ou élargissez votre recherche. »
  - « Votre agence n'est pas encore là ? »
  - « Une vitrine gratuite, vos annonces sur Takussan, et l'atelier pour les visites, les baux et les loyers. »
- **Delta de charte** à appliquer dans `docs/design-guidelines.md`, § « Ton & Micro-copy », par ce
  ticket : remplacer la phrase *« Tutoyer sur les surfaces publiques de découverte (« Près de toi »,
  « Pour ton prochain logement »). »* par *« Vouvoyer partout, site public compris, connecté ou non
  ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)). Les maquettes ne sont pas une référence
  de ton. »*
- Téléphone et bureau : aucun changement de mise en page ; vérifier à 360 px que « Votre agence n'est
  pas encore là ? » tient dans le bloc d'appel de l'annuaire sans casser la ligne de bouton.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md) (révisé le 2026-11-10 : vouvoiement partout).

- **Wolof en pause** : les deux `wo` qui recopient le français (`publicProfileIndex.join.title`,
  `.join.body`) prennent le nouveau texte français ; les trois `wo` écrits en wolof **ne se réécrivent pas**.
- `en` n'a pas de voix : inchangé.
- `node scripts/check-i18n.mjs` reste vert (parité des clés).
- **La garde** : `takussan-web/scripts/check-vouvoiement.mjs`, branchée dans `web-ci.yml` (`npm run check:vouvoiement`) :
  - lit `src/messages/fr.json` et les chaînes littérales de `src/**/*.{ts,tsx}` hors `__tests__/` et `playground/` ;
  - rougit sur les pronoms `tu`, `toi`, `ton`, `ta`, `tes`, `t’`/`t'` devant voyelle, `-toi`, `-tu`, et sur la liste fermée d'impératifs au singulier ci-dessus en tête de phrase ;
  - liste d'exceptions **par clé**, écrite dans le script, chacune avec sa raison (participe, 3ᵉ personne de la console) ; une exception sans raison rougit ;
  - **plafond 0**, sans cliquet : un retour du tutoiement rougit, toujours (règle des gardes : pas de tolérance à sens unique) ;
  - message d'échec qui nomme la clé ou le fichier:ligne, le mot trouvé, et renvoie à ADR-0095.
- Les mots bannis d'ADR-0095 § 5 ne sont pas dans cette garde (TCK-2616 les traite).

## Delta à produire

- [ ] Les 5 clés `fr` au vouvoiement ; les 2 `wo` copiés alignés.
- [ ] `docs/design-guidelines.md`, § « Ton & Micro-copy » : la phrase du tutoiement remplacée.
- [ ] `scripts/check-vouvoiement.mjs` + script npm + branchement dans `web-ci.yml`.
- [ ] Tests de la garde (`scripts/__tests__/` ou à côté, selon l'usage des autres `check-*` du front) : un texte au tutoiement rougit ; une exception avec raison passe ; une exception sans raison rougit ; une chaîne en dur au tutoiement dans un `.tsx` rougit.

## Critères d'acceptation

- [ ] AC1 — Les deux commandes `grep` du relevé, lancées sur la branche, ne rendent plus aucune clé des namespaces `publicProfile` et `publicProfileIndex`, et la première ne rend **aucune** ligne.
- [ ] AC2 — `npm run check:vouvoiement` est vert sur la branche ; remettre « Ton agence n'est pas encore là ? » dans `fr.json` le fait rougir en nommant `publicProfileIndex.join.title` (ablation).
- [ ] AC3 — Une chaîne `"Choisis ton bien"` ajoutée dans un composant de `src/components/` fait rougir la garde avec le fichier et la ligne.
- [ ] AC4 — Les trois `wo` en wolof (`publicProfile.contact.sheetDescription`, `publicProfile.portfolio.emptyHint`, `publicProfileIndex.empty.body`) sont identiques avant et après (diff).
- [ ] AC5 — `/fr/agencies` à 360 px : le bloc « Votre agence n'est pas encore là ? » ne fait pas défiler le document horizontalement.

## Hors périmètre

- Les surfaces d'entrée de la famille 2 : leurs tickets écrivent déjà au vouvoiement (TCK-2598, TCK-2600, TCK-2601, TCK-2604, TCK-2606, TCK-2611, TCK-2616).
- La traduction wolof.
- Les maquettes du playground (locales, non versionnées, hors garde).

## Notes d'implémentation

_(à remplir par implementing-specs)_
