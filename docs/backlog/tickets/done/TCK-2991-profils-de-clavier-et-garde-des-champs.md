---
id: TCK-2991
title: Les profils de clavier, la prop des primitives et la garde des champs
status: done
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: []
blocks: [TCK-2992, TCK-2993, TCK-2994]
spec_refs:
  features: []
  models: []
tags: [front, mobile, formulaires, clavier, adr-0135]
---

## Objectif utilisateur

Aucun champ neuf ne peut plus ouvrir le mauvais clavier ni arriver sans placeholder : la CI le refuse.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0135 § 1 à § 4. La table des profils reprend la maquette `playground/maquettes/ecran/profils.ts` validée par
le porteur, complétée des profils `nom`, `decimal`, `url`, `mot-de-passe` et `nouveau-mot-de-passe`.

## Delta

- [x] `src/lib/clavier.ts` : `PROFILS`, `profil(nom)`, `NomDuProfil` ; `data-profil` posé.
- [x] `Input` et `Textarea` prennent `profil` ; les valeurs du profil passent AVANT les props de l'appelant
      (`autoComplete` et `enterKeyHint` restent surchargeables).
- [x] `FormInput` et `FormTextarea` transmettent `profil` ; `PhoneInput` pose `telephone`, `FormAmountInput`
      pose `montant`.
- [x] `scripts/check-champs.mjs` (`npm run check:champs`) : relevé par fichier des champs sans profil, sans
      placeholder, en `type="number"`, et des réglages de clavier posés à côté d'un profil ; base exacte
      `scripts/champs-baseline.json`, `--update`, `--report`. Branchée dans le job `statique` de `web-ci.yml`.

## Critères d'acceptation

- [x] AC1 — Chaque profil rend exactement les attributs de la table de l'ADR (test de la table).
- [x] AC2 — Un champ neuf sans profil, sans placeholder ou en `type="number"` fait rougir la garde ; un compte
      qui descend aussi, tant que la base n'est pas réécrite (tests de la garde sur des fixtures, vérifiés par
      ablation).
- [x] AC3 — Un `profil` passé à `FormInput` atteint l'`<input>` rendu ; un `PhoneInput` porte `telephone`.

## Relevé (2026-11-21)

Premier relevé de la garde : 202 fichiers fautifs — 404 champs sans profil, 206 sans placeholder, 50 en
`type="number"`, 0 réglage manuel à côté d'un profil. C'est la base de `scripts/champs-baseline.json`.

En route :
- `FormInput` à profil numérique remet un NOMBRE au formulaire (`lireNombre` : espaces et espaces fines
  retirés, virgule lue en point) et garde la frappe affichée tant qu'elle se lit comme la valeur, sans quoi
  la virgule d'un décimal s'effaçait à la frappe ;
- `PhoneInput` pose `telephone`, un exemple de numéro (`ui.phoneInput.placeholderNational` /
  `placeholderInternational`) et `tel-national` (l'indicatif est affiché à part) — `saisie-mobile.tck-913`
  suit ;
- la garde efface les commentaires avant de lire : 23 balises citées en commentaire comptaient.

Vérifié par ablation : 8 mutants (profil ignoré, surcharge perdue, frappe non gardée, profil non transmis
par `FormInput` ou `PhoneInput`, cliquet à sens unique, commentaires et lecture seule comptés), tous rouges.

## Complément pendant la migration (2026-11-21)

Cinq profils ajoutés à la table sur ce que les lots ont rencontré (ADR-0135 § 1) : `identifiant` (slug, identifiant
technique, « courriel ou téléphone »), `reference` (NINEA, référence de paiement, code de plan, en capitales),
`confirmation` (phrase recopiée), `coordonnee` (le pavé décimal d'iOS n'a pas de signe moins, la longitude du
Sénégal est négative), `liens` (zone de liens). `lireNombre` lit le séparateur de milliers de l'anglais
(« 150,000 ») ; `FormInput` prend `garderLeTexte` pour un formulaire dont les valeurs sont du texte (la fiche
d'agence). La garde juge aussi les appels de `ChampDeLaFiche`, `ZoneDeLaFiche` et `ChampChiffre`. La croix native
d'un champ `type="search"` est masquée (`globals.css`) : elle doublait le bouton « Effacer » de l'application.

Revue avant la PR (2026-11-22) : la règle des milliers de `lireNombre` lisait « 7,125 » 7125 ; un profil `decimal`
(et tout taux lu hors `FormInput`) la quitte (`lireNombre(v, false)`). La fiche d'agence refusait ses propres
exemples (« 8,5 » hors bornes, « 500 000 » seuil invalide) : son schéma lit les taux et le seuil par `lireNombre`.
La retenue d'un état des lieux de sortie lit « 150,000 » de même.
