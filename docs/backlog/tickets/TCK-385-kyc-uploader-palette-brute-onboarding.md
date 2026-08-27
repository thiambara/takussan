---
id: TCK-385
title: "Assistants d'onboarding — la pastille KYC en palette brute, dans le seul répertoire que deux gardes se renvoient"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, tokens, onboarding, dette]
---

## Objectif utilisateur

Un document KYC fourni s'affiche de la même façon dans les trois assistants d'onboarding et dans
la console — même vert, celui du produit, et non celui d'une échelle Tailwind.

## Contexte

`takussan-web/src/components/kyc/KycUploader.tsx:161` rend la confirmation « document fourni »
ainsi :

```
inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium
text-emerald-800
```

Deux familles de l'échelle Tailwind pour un état qui a un jeton — `--accent` (sauge, `#5d6e4f`),
que `console/StatusBadge` emploie déjà sous le ton `success`.

**Ce ticket existe surtout à cause de l'endroit où ce fichier se trouve**, et c'est le point à ne
pas perdre. Mesuré le 2026-08-27 :

| Qui monte `KycUploader` | |
|---|---|
| `components/onboarding/AgentOnboardingWizard.tsx` | 3 usages |
| `components/onboarding/OwnerOnboardingWizard.tsx` | 3 usages |
| `components/onboarding/ServiceProviderOnboardingWizard.tsx` | 2 usages |
| console super-admin | **aucun** |

Il vit donc dans `src/components/kyc/`, aux côtés de `kyc-components.tsx` qui, lui, **est** monté
par la console (`admin/super/agency-detail.tsx`). TCK-358 a mis `kyc-components.tsx` sous garde
en le nommant fichier par fichier, précisément pour ne PAS embarquer ce voisin-ci : une garde de
console qui rougirait sur un écran d'onboarding se fait désactiver, ou pire, se fait ajouter une
exception.

**Résultat : ce fichier n'est couvert par rien.** Ni `check-super-admin-tokens.mjs` (il n'est pas
rendu par la console, il n'est pas dans sa clôture d'import, il n'apparaît donc même pas dans son
« reste non gardé »), ni `check-app-tokens.mjs` (qui ne surveille que le dialecte `app-*`). Il
n'est pas non plus dans le périmètre de TCK-381, qui part de la clôture de `/app` — les assistants
d'onboarding vivent sous `/onboarding`.

*Un fichier que deux gardes se renvoient l'une à l'autre n'est pas à moitié gardé : il ne l'est
pas du tout.* C'est la même forme de trou que TCK-358 a trouvée entre le périmètre et l'écran, un
cran plus loin.

## Contraintes strictes (métier)

- Traduire par RÔLE : cet état dit « fourni / validé », donc `--accent`, pas « un vert proche ».
- Ne pas ouvrir de périmètre de console sur `src/components/kyc/` en entier : c'est exactement la
  décision que TCK-358 a prise et documentée, et la rouvrir ferait rougir la garde super-admin sur
  un écran d'onboarding.
- Les trois assistants doivent être vérifiés, pas seulement l'un d'eux : ils montent le composant
  avec des `endpoint` et des `i18nNamespace` différents.

## Delta à produire

1. Porter `KycUploader.tsx:161` sur les jetons. La forme de référence est le ton `success` de
   `src/components/console/StatusBadge.tsx` ; réemployer ce composant plutôt que recomposer une
   pastille est le choix préférable, s'il n'impose pas de casser la mise en page de l'assistant.
2. **Poser une garde sur `/onboarding`**, sans quoi le point 1 se défait au premier écran neuf —
   c'est la leçon de TCK-245, citée dans l'en-tête de `check-super-admin-tokens.mjs`. Deux formes
   possibles, à trancher dans le ticket :
   - étendre `scripts/check-app-tokens.mjs` (qui parcourt déjà `src` entier) d'un contrôle de
     palette brute sur la clôture de `src/app/onboarding` ;
   - ou une garde propre, sur le modèle de `check-super-admin-tokens.mjs`, dont le mécanisme de
     clôture d'import et le cliquet de reste sont réutilisables tels quels.
3. Vérifier par ablation que la garde retenue refuse bien la forme retirée au point 1.

## Critères d'acceptation

- **AC1** — `grep -nE '(bg|text|border|ring)-(emerald|green)-[0-9]{2,3}'
  takussan-web/src/components/kyc/KycUploader.tsx` ne rend rien.
- **AC2** — une garde de ce dépôt sort en 1 quand on réintroduit `bg-emerald-100` dans ce fichier,
  en NOMMANT le fichier et la ligne. Le prouver par ablation, pas par lecture du script.
- **AC3** — `npx vitest run src/components/onboarding/__tests__ src/components/kyc/__tests__` vert,
  et les trois assistants rendent la pastille — le vérifier, un test de présence de composant ne
  suffit pas.
- **AC4** — `npm run lint` et `npx tsc --noEmit` verts.

## Hors périmètre

- `kyc-components.tsx`, déjà porté et déjà sous garde par TCK-358.
- Les primitives partagées de la console (`ui/`, `forms/`, `files/`) : c'est TCK-384.
- Le reste des assistants d'onboarding. Ce ticket porte UNE pastille et POSE la garde ; si le
  relevé de la garde révèle d'autres occurrences sous `/onboarding`, elles se traitent dans un
  ticket qui les aura comptées, pas dans celui-ci.

## Notes d'implémentation

Le mécanisme de clôture d'import de `scripts/check-super-admin-tokens.mjs` (fonction
`clotureDeRendu`, plus `resteNonGarde`) est directement réemployable : il part d'un répertoire de
routes, suit les imports `@/` et relatifs, et se trompe toujours du côté prudent. Son en-tête
explique pourquoi un périmètre de répertoires ne suffit pas — c'est le raisonnement qui manque à
ce fichier-ci.
