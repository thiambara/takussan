---
id: TCK-385
title: "Assistants d'onboarding — la pastille KYC en palette brute, dans le seul répertoire que deux gardes se renvoient"
status: doing
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: [TCK-450]
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

**Ce que la re-mesure du 2026-08-27 a confirmé, et ce qu'elle a contredit.**

Confirmé au chiffre près : la ligne 161, les deux familles (`bg-emerald-100`, `text-emerald-800`),
et le tableau des monteurs (Agent 3, Owner 3, Prestataire 2, console 0). Le ticket disait vrai.

Contredit : **`--accent` n'est plus le bon jeton pour dire « fourni / validé »**, et la contrainte
stricte du ticket a quand même été suivie. TCK-381 a créé `--success` le même jour, avec dans
`globals.css` un docblock qui nomme exactement ce cas — « un accent de marque et une confirmation
ne sont pas la même chose ». Mesuré sur la surface RÉELLE (aplat à 15 % sur le conteneur
`bg-muted/30` de ce composant) :

| | clair | sombre |
|---|---|---|
| avant — émeraude 800 sur émeraude 100 | 6,70:1 ✓ | ne basculait pas |
| après — `--accent` sur `accent/15` (ton `success` de `StatusBadge`) | **4,19:1 ✗** | **3,71:1 ✗** |
| le même aplat sur `--success` | 4,61:1 ✓ | 5,73:1 ✓ |

**Le contraste BAISSE sous AA (4,5:1), et c'est écrit plutôt que tu.** Le défaut n'est pas celui
du portage : c'est celui du ton `success` de `console/StatusBadge`, qui emprunte l'accent de
marque. Le corriger touche toutes les pastilles de la console d'un coup — décision de charte, hors
du delta d'un ticket `S`, et **à ouvrir**. Réemployer `StatusBadge` plutôt que recomposer une
pastille est ce qui rend cette correction possible EN UN POINT, ce qui est l'argument du ticket.

**La garde : un TROISIÈME ESPACE dans `check-super-admin-tokens.mjs`, et non une garde neuve.**
Le ticket proposait deux voies (étendre `check-app-tokens.mjs`, ou copier le mécanisme). Aucune
n'est prise : le fichier est déjà un moteur à espaces (`ESPACES`, `PERIMETRES`, `resteNonGarde`,
cliquet bilatéral, témoins), et une COPIE aurait divergé le jour même — c'est le défaut que la
moitié des gardes de ce dépôt existent pour attraper ailleurs. Coût : ~40 lignes de configuration,
zéro ligne de mécanisme.

Relevé à la naissance de l'espace : **8 fichiers gardés à zéro** (les sept de `src/app/onboarding`
plus `KycUploader.tsx`), **24 occurrences dans le reste** — 18 dans `src/components/onboarding`
(six assistants) et 6 dans `components/auth/TotpEnrollment.tsx`, que la clôture d'onboarding
atteint. `src/components/onboarding` n'entre PAS dans le périmètre : l'y mettre aurait fait rougir
la garde le jour de sa naissance. C'est exactement ce que le hors périmètre de ce ticket demande —
elles sont désormais comptées, nommées et sous cliquet.

⚠ Le test de l'AC3 ne monte PAS les trois assistants : il EXTRAIT leurs huit points de montage de
leur source et rend le composant avec chaque jeu de props réel. Monter un assistant aurait prouvé
UN montage — celui de l'étape atteinte — pour dix fois le coût.

**LE TON `success` DE `StatusBadge` — décision de la revue : TICKET SÉPARÉ, et voici la mesure
qui tranche.**

Le lead demandait de mesurer le rayon d'action puis de choisir entre corriger dans ce lot et
ouvrir un ticket. **Le rayon n'est pas modeste : 21 sites de résolution dans 20 fichiers**, et il
couvre le vocabulaire POSITIF entier de trois consoles. Ce ne sont pas 9 appels comme un premier
`grep` le suggère — la moitié passe par des tables `Record<…, StatusTone>` :

| Où | Ce qui devient vert |
|---|---|
| `(super-admin)/agency-upgrade-requests/{page,[id]/page}.tsx` | `approved` (×2) |
| `(super-admin)/users/page.tsx`, `admin/users/AdminUsersTable.tsx`, `admin/super/AgencyModerationCard.tsx` | `active` (×3) |
| `admin/super/kyc-queue.tsx`, `dashboard/admin/AgencyQueues.tsx`, `kyc/kyc-components.tsx` | `verified` (×3) |
| `billing/PayoutTable.tsx` | `paid` |
| `admin/super/SuperAdminPropertiesTable.tsx` | `available` |
| `admin/ModerationQueueList.tsx` | `approved` |
| `admin/AuditTrail.tsx` | `created` |
| `admin/super/announcements.tsx` | `success` (sévérité) et `live` |
| `admin/super/{system-health,feature-flags,user-detail,agency-detail}.tsx` | `ok`, `enabled`, ×2 littéraux |
| `(super-admin)/super-admins/page.tsx`, `(dashboard)/app/properties/page.tsx` | ×2 littéraux |
| `kyc/KycUploader.tsx` | la pastille de ce ticket |

**Trois raisons de ne pas le faire ici, dans l'ordre de poids :**

1. **C'est un changement VISIBLE par l'utilisateur sur 21 significations de statut**, pas un
   correctif interne. Le sage `--accent` (#5d6e4f) devient le vert `--success` (#3f6b45).
2. **Il révoque un partage délibéré.** `--accent` est documenté comme « sage discret pour badges
   *featured* » : aujourd'hui « mis en avant » (public) et « approuvé » (console) portent la même
   teinte. Les séparer est probablement JUSTE — ce sont deux sens différents — mais c'est une
   décision de charte, pas un effet de bord d'un ticket `S` sur une pastille KYC.
3. **Je ne peux pas le vérifier à l'écran** (aucun serveur de développement dans ce lot). Un
   changement de couleur sur 21 badges sans une seule capture n'est pas une livraison.

**Le ticket est prêt à 10 minutes près** — le diff tient en une ligne de
`console/StatusBadge.tsx` :

```
- success: 'bg-accent/15 text-accent',
+ success: 'bg-success/15 text-success',
```

et la mesure est faite : **4,19:1 clair / 3,71:1 sombre → 4,61:1 / 5,73:1**, donc au-dessus des
4,5:1 d'AA dans les deux thèmes, sur la surface réelle (aplat à 15 % sur `bg-muted/30`).

Le mécanisme de clôture d'import de `scripts/check-super-admin-tokens.mjs` (fonction
`clotureDeRendu`, plus `resteNonGarde`) est directement réemployable : il part d'un répertoire de
routes, suit les imports `@/` et relatifs, et se trompe toujours du côté prudent. Son en-tête
explique pourquoi un périmètre de répertoires ne suffit pas — c'est le raisonnement qui manque à
ce fichier-ci.
