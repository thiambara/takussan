# ADR-0019 — L'erreur d'API porte un code, la surface de rendu porte le texte

- **Statut** : Accepté
- **Date** : 2026-08-20
- **Tickets** : TCK-292 (le chantier qui l'a rendue nécessaire)

> ⚠️ **Cet ADR est écrit APRÈS l'implémentation, et c'est une entorse à la règle du dépôt**
> (« toute nouvelle décision structurelle s'écrit en ADR AVANT l'implémentation »). Il est consigné
> tel quel plutôt que rétrodaté : la décision est née d'une mesure faite en cours de chantier — un
> vérificateur adverse qui exécute le même code depuis un troisième contexte — et personne ne
> l'avait vue venir. Le noter est plus utile que de faire comme si l'ordre avait été respecté.

## Contexte

TCK-292 devait sortir le texte affiché du code source. En traitant les route handlers BFF, on a
mesuré que **42 messages en prose** vivaient dans 25 des 31 handlers, tous envoyés au client :
19 × `Not authenticated.`, 8 × `invalid profile id`, 9 × `Failed to …`, etc. Une session qui expire
pendant un téléversement KYC affichait donc **« Not authenticated. »** en bannière et en toast, dans
une interface française.

Le premier correctif a fait émettre des **codes** par les handlers — bon geste, et cette moitié n'a
jamais été remise en cause. Mais il a fait dépendre `ApiError.displayMessage` d'un traducteur rangé
dans une **variable de module**, enregistrée par `QueryProvider`.

**Ça ne pouvait pas marcher, et la mesure l'a montré :** `QueryProvider` est `'use client'`, alors
que **17 modules `'use server'`** lisent cette valeur et la renvoient au client pour affichage.
Exécuté :

```
getMyProfilesAction() avec ApiError(401, { message: 'Unauthenticated.' })
  → { ok: false, message: "errors.api.unauthenticated" }     ← une CLÉ i18n, à l'écran
getMyProfilesAction() avec ApiError(500, null)
  → { ok: false, message: "errors.api.unknown" }
```

On avait troqué de l'anglais contre une clé brute, sur le chemin de chaque soumission de formulaire
— **exactement le défaut qu'on venait de corriger** sur les messages de validation (18 messages
rendus en clé brute). Deux aggravants mesurés : `src/app/actions/auth.ts` écrivait
`err.displayMessage || t('updateProfileFailed')`, or **une clé est *truthy*** — le repli français
était mort ; et un global de processus Node est **partagé entre requêtes concurrentes**, donc la
locale d'un visiteur aurait fui sur celle du suivant.

## Décision

**Un objet d'erreur ne produit jamais de texte destiné à l'écran. Il porte une donnée — un code —
et chaque surface de rendu le traduit avec la primitive de son contexte.**

| contexte | primitive |
|---|---|
| composant client | `useMessageErreurApi()` (bâti sur `useTranslations`) |
| module `'use server'` (`src/app/actions/`) | `getTranslations()` de `next-intl/server` |
| `useApiForm`, gestionnaires React Query | `messageErreurApi(err, t, repli)` avec le `t` de l'appelant |

C'est le **principe non négociable n°5** du dépôt (« le front possède le texte affiché ; l'API émet
des codes et des données ») appliqué un cran plus bas que d'habitude : il ne vaut pas seulement à la
frontière Laravel↔Next, il vaut à l'intérieur du front, à la frontière entre une classe d'erreur et
un composant.

**Corollaire tenu par le compilateur, et non par une convention :** `extractApiErrorMessage` prend un
traducteur **obligatoire**. Sa version précédente l'acceptait en option et retombait, à défaut, sur
des libellés **français écrits en dur** — c'est-à-dire qu'elle rendait du français à un anglophone
sans que rien ne rougisse. Rendre le paramètre obligatoire a fait sortir `TS2554: Expected 3
arguments, but got 2` **exactement sur le site défectueux** (`BookingTunnel.tsx:163`) et sur les cinq
tests qui gardaient ces replis. Le type system fait l'inventaire ; aucune garde n'a besoin de le
faire.

## Conséquences

1. `ApiError` expose `codeErreur` (donnée) et `proseServeur` (la prose *déjà localisée* par Laravel,
   ou `undefined`). Il n'expose plus de libellé prêt à afficher.
2. `API error <n>` — la valeur native de `Error.message` — ne doit plus atteindre l'écran. Les sites
   qui rendaient `{query.error.message}` ont été convertis.
3. **Trois gardes, chacune prouvée par mutation**, parce que ce défaut a traversé trois vagues
   d'agents et deux vérifications avant d'être vu :
   - un **recensement statique** des modules `'use server'`, qui voit les modules qu'aucun test ne
     monte — c'est ainsi que le défaut a duré : les actions fautives *avaient* des tests, verts, qui
     ne regardaient pas la chaîne renvoyée ;
   - `attendAucuneCleBrute()` (`src/test/cles-brutes.ts`), qui refuse dans le DOM rendu les formes
     `validation.*`, `errors.api.*` et `API error <n>` ;
   - la parité `fr`/`en`/`wo` du dictionnaire, plafond **0 dans les trois langues**.
   Les deux premières **échouent si elles ne scannent rien** — mode de défaillance que ce dépôt a
   déjà payé trois fois (ardoise D-15, D-18, D-44).
4. Le recensement statique reste une **heuristique de texte**, pas un analyseur : il a lui-même été
   pris en défaut par deux mutations (`message: apiErr.message`, `message: repli || 'errors.api.…'`)
   et élargi le 2026-08-20. Son en-tête dit ce qu'il ne voit pas.

## Alternatives écartées

- **Enregistrer un traducteur côté serveur aussi.** Impossible sans risque : la traduction serveur
  est *par requête* (`getTranslations()` est asynchrone et lié au contexte de la requête), alors
  qu'une variable de module est *par processus*. Les deux ne peuvent pas coïncider sous
  concurrence.
- **Laisser `displayMessage` retomber sur du français.** C'est l'état d'avant : correct pour un
  francophone, faux pour tous les autres, et **silencieux** — aucun test ne peut distinguer « repli
  volontaire » de « traduction oubliée ».
- **Traduire côté route handler.** Déplacerait la faute au lieu de la corriger : le BFF est du
  front, et le principe n°5 lui interdit d'inventer de la prose destinée à l'écran.
