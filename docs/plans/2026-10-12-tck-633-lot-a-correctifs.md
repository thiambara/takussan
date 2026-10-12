# TCK-633 — Lot A (correctifs) Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.
>
> **Dans TCK-633**, ce plan s'exécute par un sous-agent de la vague 1 du
> [plan maître](2026-10-12-tck-633-lot-retours-porteur.md) (`superpowers:subagent-driven-development`),
> dans l'**arbre partagé** : l'agent édite, la session commite. Cases `- [ ]` pour le suivi.

**Goal :** « Louer » avant « Acheter » dans le sélecteur de la barre publique et le menu mobile ; une
modale de suppression qui ne promet plus de restauration ; un drapeau global `media_watermark`, éteint
par défaut, qui coupe le filigrane partout où la règle se lit ; une commande qui retire le filigrane
des photos déjà filigranées.

**Architecture :** la règle du filigrane vit dans `AgencyWatermarkContext` et se lit par DEUX chemins
— `isEnabledFor()` (un bien dont l'agence est chargée) et `WatermarkRequirement::load()` (un lot de
biens, et tout bien sans agence chargée, dont l'écouteur de conversion et `ApplyWatermarkJob`). Le
drapeau est lu une fois par cycle (requête HTTP ou job) par une instance `scoped` du conteneur, et
injecté dans les deux chemins ; `PublicPhotoUrl::isServable()` et l'écouteur n'ont rien à changer :
ils lisent déjà la règle. Côté front, trois changements de données (ordre d'un tableau, ordre d'une
liste de liens, valeurs i18n), chacun épinglé par un test.

**Tech Stack :** Laravel 13 / PHP 8.4 / PostgreSQL 17 / spatie/laravel-medialibrary — Next.js 16 /
React 19 / next-intl / vitest 4 + Testing Library.

---

## Contraintes globales (reprises du plan maître, et ce qu'elles veulent dire ici)

- **Le ticket et le plan maître font foi ; re-mesurer avant de coder.** Chaque chemin, signature et
  numéro de ligne ci-dessous a été lu le 2026-10-12 sur `docs/tck-633-lot-retours-porteur`
  (`7e782f66`). Si un numéro a bougé (un autre lot a édité un fichier co-tenu), **relire avant
  d'éditer**, et noter l'écart au rapport.
- **Règle 1 — aucune commande git qui écrit.** Ni `add`, `commit`, `checkout`, `stash`, `restore`,
  `reset`, `switch`, `merge`, `push`. Les étapes « commit » du gabarit sont remplacées par
  **« signaler à la session les fichiers à commiter »** (liste dans le rapport, champ `fichiers`).
- **Règle 2 — territoire.** Ce lot tient seul : `takussan-web/src/components/search/SelecteurDeTransaction.tsx`,
  `takussan-web/src/data/navigation.ts`, `takussan-api/app/Services/Media/**`,
  `takussan-api/app/Listeners/Media/**`, `takussan-api/app/Jobs/Media/**`,
  `takussan-api/app/Console/Commands/Media/RegenerateWithoutWatermark*.php`,
  `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php`. Les fichiers **hors territoire**
  que ce plan doit toucher sont listés en § Écarts relevés (E7 à E10) : **ne pas les éditer sans
  l'accord de la session** — sans accord, le bloc prévu va dans `collisions` du rapport.
- **Règle 3 — fichiers co-tenus** (`app/Domain/Features/Flag.php` avec le lot C ;
  `src/messages/{fr,en,wo}.json` avec tous les lots) : **outil Edit uniquement**, par petits blocs
  ancrés sur un texte stable, jamais `sed`, script ou `Write`. Si Edit signale un changement :
  relire, rejouer.
- **Règle 4 — i18n.** Ce lot ne fait que **modifier des valeurs** existantes :
  `property.dashboard.actions.deleteBodyRow`, `property.dashboard.actions.deleteBodyDetail`,
  `nav.transactionPlaceholder` (ordre seul). Aucune clé neuve, aucun reformatage.
- **Règle 6 — tests.** Uniquement les classes de ce lot (`php artisan test <fichier>`,
  `npx vitest run <fichier>`). **Jamais la suite entière, jamais `php bin/impacted-tests.php`** :
  dans l'arbre partagé, le diff contient les migrations des lots C, D et F, et l'outil répondrait
  `SUITE ENTIÈRE`. Aucune commande de plus de 10 minutes.
- **Règle 7 — ablation** : sauvegarde par `cp` dans le scratchpad de l'agent, restauration par `cp`,
  preuve par `md5`. **Sur un fichier co-tenu** (`Flag.php`, `messages/*.json`), un `cp` écraserait
  l'édition qu'un autre lot aurait faite pendant l'ablation : y appliquer le
  **protocole co-tenu** de la tâche 0 (Edit inverse + double `md5`). Cf. écart E15.
- **PostgreSQL** : aucune migration dans ce lot. La sélection JSON de la commande passe par
  `whereJsonLength` (colonne `media.custom_properties` en `jsonb`, migration
  `2026_04_16_160445_create_media_table.php:24`).
- **Le front possède le texte** : fr, en, wo ; vouvoiement ; `npm run check:i18n` vert.
- **Avant de rendre** : `./vendor/bin/pint` **sur les seuls fichiers du lot** (jamais sans
  argument : il reformaterait les fichiers des autres lots), `npx tsc --noEmit`, `npm run lint`.
- **Rapport** : `docs/plans/rapports/tck-633-lot-a.json` (outil Write), **verdict en premier**, puis
  `fichiers`, `tests`, `ablations`, `ecarts_au_ticket`, `collisions`. Message final : **une ligne**.

## Ce que le lot NE fait pas

- La **déconnexion** vers l'accueil : lot B (plan maître, § Territoires).
- « Louer » avant « Acheter » **dans le panneau de filtres** (`FilterSidebar`, `SearchToolbar`) : lot E.
- `Navbar.tsx` n'est pas modifié : il passe ses libellés au sélecteur, l'ordre est interne au
  sélecteur.
- Aucune restauration de bien supprimé (D2, hors périmètre) : seul le **texte** change.

## Carte des fichiers

### Créés

| Fichier | Rôle |
|---|---|
| `takussan-web/src/components/search/__tests__/SelecteurDeTransaction.test.tsx` | ordre et pastille du sélecteur |
| `takussan-web/src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx` | texte de la modale, deux menus × trois langues |
| `takussan-api/app/Services/Media/MediaWatermarkSwitch.php` | valeur du drapeau lue pour un cycle |
| `takussan-api/app/Console/Commands/Media/RegenerateWithoutWatermark.php` | `media:regenerate-without-watermark` |
| `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php` | drapeau éteint / allumé, mémoire par cycle, commande |
| `takussan-api/tests/Support/FiligraneGlobalAllume.php` | *(hors territoire, E8)* allume le drapeau pour les classes écrites sous l'ancienne règle |

### Modifiés

| Fichier | Lignes lues | Changement |
|---|---|---|
| `takussan-web/src/components/search/SelecteurDeTransaction.tsx` | 15-27 (docblock), 29-32 (`choix`), 48 (pastille) | `rent` puis `sale` ; la pastille glisse sous `sale` |
| `takussan-web/src/data/navigation.ts` | 69-98 (docblock + `navLinks`) | `rent` puis `buy` |
| `takussan-web/src/data/__tests__/navigation.test.ts` | 89-99 (fin de fichier) | + un `describe` d'ordre |
| `takussan-web/src/messages/fr.json` | 88, 1213-1214 | `transactionPlaceholder` ; `deleteBodyRow` / `deleteBodyDetail` |
| `takussan-web/src/messages/en.json` | 88, 1242-1243 | idem |
| `takussan-web/src/messages/wo.json` | 250, 5453-5454 | idem |
| `takussan-web/src/components/home/__tests__/Navbar.transaction.test.tsx` | 1-2, 57, 70-95, 130-138 | *(hors territoire, E9)* nouvel ordre, nouveau nom de groupe |
| `takussan-api/app/Domain/Features/Flag.php` *(co-tenu A, C)* | 15-20 | `case MediaWatermark` ; `clientVisible()` faux pour lui |
| `takussan-api/app/Services/Media/AgencyWatermarkContext.php` | 1-7 (imports), 33-46 (`isEnabledFor`), 48-51 (docblock) | lit le drapeau ; `globallyEnabled()` |
| `takussan-api/app/Services/Media/WatermarkRequirement.php` | 70-76 (`load()`) | court-circuit drapeau éteint |
| `takussan-api/app/Services/Media/PublicPhotoUrl.php` | 17-19 (docblock seul) | dit la nouvelle condition |
| `takussan-api/tests/Feature/Api/Admin/FeatureFlagTest.php` | 45-53 | *(hors territoire, E7)* le catalogue n'est plus vide |
| classes de test existantes rougies par le défaut « éteint » | mesurées en tâche 7 | *(hors territoire, E8)* `use FiligraneGlobalAllume;` |

### Lus et NON modifiés (et pourquoi)

- `app/Listeners/Media/ApplyWatermarkOnConversionListener.php:70` lit `$property->requiresWatermark()`,
  qui passe par `WatermarkRequirement` (agence non chargée sur `$media->model`) : il suit le drapeau
  sans changement (E2).
- `app/Jobs/Media/ApplyWatermarkJob.php:53` relit `requiresWatermark()` avant de poser : un job mis
  en file avant l'extinction ne pose rien (épinglé en tâche 6).
- `app/Models/Property.php:674-681` (`requiresWatermark()`, co-tenu C/D/F) : inchangé, il délègue aux
  deux chemins modifiés.
- `app/Services/Features/FeatureFlagEvaluator.php:12-29` : un drapeau absent de la base vaut `false`
  (ligne 28) ; sans utilisateur, un drapeau segmenté vaut `false` (lignes 43-49).
- `app/Observers/AgencyObserver.php:61-62` lit `isEnabledInSettings()` — laissé pur exprès (E4).

---

## Task 0 : Préparation et protocole d'ablation

**Files :** aucun.

- [ ] **Step 1 : relever l'état de départ**

```bash
cd /Users/aminethiam/Documents/perso/takussan
uptime; sysctl -n hw.ncpu
git rev-parse --abbrev-ref HEAD           # lecture seule
S="<scratchpad de l'agent>/tck-633-lot-a"; mkdir -p "$S"; echo "$S"
```

Expected : la branche `feat/tck-633-lot-retours-porteur` (posée par la session, Étape 0) ; noter la
charge dans le rapport.

⚠ **Les variables du shell ne survivent pas d'un appel d'outil à l'autre** : toute commande de ce
plan qui emploie `$S` (ou `$F`) commence par sa propre affectation, `S="<scratchpad de l'agent>/tck-633-lot-a";`.

- [ ] **Step 2 : relever que les tests voisins sont verts AVANT toute édition**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/home/__tests__/Navbar.transaction.test.tsx src/data/__tests__/navigation.test.ts src/components/property-dashboard/__tests__/PropertyHeaderActions.test.tsx
cd ../takussan-api
php artisan test tests/Feature/Media/WatermarkActivationTest.php tests/Feature/Api/Admin/FeatureFlagTest.php
```

Expected : tout vert. Un rouge ici n'est pas du lot : le noter au rapport (`ecarts_au_ticket`) et
continuer sans le corriger.

- [ ] **Step 3 : retenir les deux protocoles d'ablation**

*Fichier tenu seul* (`SelecteurDeTransaction.tsx`, `AgencyWatermarkContext.php`…) :

```bash
F=<chemin>; cp "$F" "$S/$(basename "$F").ok"; md5 -q "$F" > "$S/$(basename "$F").md5"
# … retirer le correctif (Edit), lancer le test, constater le ROUGE …
cp "$S/$(basename "$F").ok" "$F"; md5 -q "$F" | diff - "$S/$(basename "$F").md5" && echo "restauré"
```

*Fichier co-tenu* (`Flag.php`, `messages/*.json`) : `md5 -q "$F" > "$S/avant.md5"` ; ablation par
**Edit** ; `md5 -q "$F" > "$S/ablate.md5"` ; test rouge ; **avant de restaurer**, `md5 -q "$F" | diff -
"$S/ablate.md5"` — identique : restaurer par `cp "$S/<fichier>.ok" "$F"` ; différent (un autre lot a
écrit pendant l'ablation) : restaurer par l'**Edit inverse**, puis vérifier par lecture que seule
l'édition de l'autre lot sépare le fichier de `$S/<fichier>.ok`. Dans les deux cas, écrire au rapport
les trois `md5`.

---

## Task 1 : « Louer » avant « Acheter » dans le sélecteur (ordre et pastille)

**Files :**
- Create : `takussan-web/src/components/search/__tests__/SelecteurDeTransaction.test.tsx`
- Modify : `takussan-web/src/components/search/SelecteurDeTransaction.tsx:15-32,48`
- Modify *(E9, accord requis)* : `takussan-web/src/components/home/__tests__/Navbar.transaction.test.tsx:1-2,57,70-95,130-138`
- Modify *(co-tenu, valeur seule)* : `takussan-web/src/messages/{fr,en,wo}.json` — `nav.transactionPlaceholder`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/components/search/__tests__/SelecteurDeTransaction.test.tsx` :

```tsx
/**
 * TCK-633 (AC5) — « Louer » d'abord : le locataire est le visiteur le plus fréquent, et le
 * sélecteur de la barre publique le reléguait en second.
 *
 * L'ordre se lit sur les BOUTONS, pas sur un tableau : un test qui relirait `choix` resterait vert
 * si le rendu les inversait. La pastille se lit sur la classe que l'animation interpole (jsdom
 * n'anime rien) : au repos sous la PREMIÈRE colonne, décalée d'une colonne sous la seconde.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelecteurDeTransaction, type Transaction } from '@/components/search/SelecteurDeTransaction';

const LIBELLES = { groupe: 'Louer / Acheter', sale: 'Acheter', rent: 'Louer' } as const;

function monter(valeur: Transaction) {
  const onChange = vi.fn();
  render(<SelecteurDeTransaction valeur={valeur} onChange={onChange} libelles={LIBELLES} />);
  const groupe = screen.getByRole('group', { name: 'Louer / Acheter' });
  const pastille = groupe.querySelector<HTMLElement>('[data-slot="pastille"]')!;
  return { groupe, pastille, onChange };
}

/** Le libellé VISIBLE de chaque bouton, dans l'ordre du DOM (le double réservé est `aria-hidden`). */
const libellesDansLOrdre = (groupe: HTMLElement) =>
  within(groupe).getAllByRole('button').map((b) => b.querySelector('span:not([aria-hidden])')?.textContent);

describe('SelecteurDeTransaction — « Louer » d’abord (TCK-633)', () => {
  it('rend « Louer » avant « Acheter »', () => {
    const { groupe } = monter('');
    expect(libellesDansLOrdre(groupe)).toEqual(['Louer', 'Acheter']);
  });

  it('« Louer » choisi : la pastille reste sous la première colonne', () => {
    const { pastille } = monter('rent');
    expect(pastille.className).not.toMatch(/translate-x-full/);
    expect(pastille.className).not.toMatch(/opacity-0/);
  });

  it('« Acheter » choisi : la pastille glisse d’une colonne', () => {
    const { pastille } = monter('sale');
    expect(pastille.className).toMatch(/translate-x-full/);
  });

  it('chaque bouton émet SA transaction, le premier « rent », le second « sale »', async () => {
    const user = userEvent.setup();
    const { groupe, onChange } = monter('');
    const [premier, second] = within(groupe).getAllByRole('button');

    await user.click(premier);
    expect(onChange).toHaveBeenLastCalledWith('rent');
    await user.click(second);
    expect(onChange).toHaveBeenLastCalledWith('sale');
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/search/__tests__/SelecteurDeTransaction.test.tsx
```

Expected : **4 échecs sur 4** — `expected [ 'Acheter', 'Louer' ] to deeply equal [ 'Louer', 'Acheter' ]` ;
la pastille de `rent` porte `translate-x-full` (le 2ᵉ cas rougit sur `not.toMatch(/translate-x-full/)`) ;
celle de `sale` ne la porte pas ; le premier bouton émet `sale` au lieu de `rent`.

- [ ] **Step 3 : implémentation minimale**

Dans `SelecteurDeTransaction.tsx`, Edit du docblock (ligne 16) :

```tsx
 * « Louer | Acheter » — le sélecteur segmenté de la barre de recherche publique.
```

(remplace `* « Acheter | Louer » — le sélecteur segmenté de la barre de recherche publique.`), puis
ajouter, juste avant la ligne ` * Ce sont deux boutons à bascule (`aria-pressed`)…` :

```tsx
 * **« Louer » d'abord** (TCK-633, AC5) : c'est la transaction la plus cherchée. La pastille repose
 * donc sous la PREMIÈRE colonne pour `rent`, et glisse d'une colonne pour `sale`.
 *
```

Edit du tableau (lignes 29-32) :

```tsx
  const choix = [
    { cle: 'rent', libelle: libelles.rent },
    { cle: 'sale', libelle: libelles.sale },
  ] as const;
```

Edit de la pastille (ligne 48) :

```tsx
          valeur === 'sale' && 'translate-x-full',
```

(remplace `valeur === 'rent' && 'translate-x-full',`).

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/components/search/__tests__/SelecteurDeTransaction.test.tsx
```

Expected : `4 passed`.

- [ ] **Step 5 : le nom du groupe suit l'ordre (valeur i18n, Edit par langue)**

`src/messages/fr.json` ligne 88 : `"transactionPlaceholder": "Acheter / Louer",` →
`"transactionPlaceholder": "Louer / Acheter",`
`src/messages/en.json` ligne 88 : `"transactionPlaceholder": "Buy / Rent",` →
`"transactionPlaceholder": "Rent / Buy",`
`src/messages/wo.json` ligne 250 : `"transactionPlaceholder": "Jënd / Luwaa",` →
`"transactionPlaceholder": "Luwaa / Jënd",`

- [ ] **Step 6 : réaligner `Navbar.transaction.test.tsx` *(E9 — seulement avec l'accord de la session)***

Il affirme l'ancien ordre et rougit maintenant (vérifier : `npx vitest run src/components/home/__tests__/Navbar.transaction.test.tsx`
→ rouge sur le nom de groupe `Acheter / Louer` introuvable). Edits :

Lignes 1-2 : `* « Acheter | Louer » — le sélecteur segmenté de la barre publique (`Accueil.dc.html`).` →
`* « Louer | Acheter » — le sélecteur segmenté de la barre publique (`Accueil.dc.html`) ; « Louer » d'abord depuis TCK-633.`

Ligne 57 :

```tsx
const groupe = () => screen.getByRole('group', { name: 'Louer / Acheter' });
```

Ligne 63 : `describe('Navbar — « Acheter | Louer » segmenté', () => {` →
`describe('Navbar — « Louer | Acheter » segmenté', () => {`

Ligne 72 : `expect(screen.queryByText('Acheter / Louer')).toBeNull();` →
`expect(screen.queryByText('Louer / Acheter')).toBeNull();`

Lignes 78-95, le test entier remplacé par :

```tsx
  it('choisir « Acheter » presse le bouton et glisse la pastille ; un second appui le retire', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(bouton('Acheter'));
    expect(bouton('Acheter')).toHaveAttribute('aria-pressed', 'true');
    expect(bouton('Louer')).toHaveAttribute('aria-pressed', 'false');
    expect(pastille().className).toMatch(/translate-x-full/);
    expect(pastille().className).not.toMatch(/opacity-0/);

    await user.click(bouton('Louer'));
    expect(bouton('Louer')).toHaveAttribute('aria-pressed', 'true');
    expect(pastille().className).not.toMatch(/translate-x-full/);

    await user.click(bouton('Louer'));
    expect(bouton('Louer')).toHaveAttribute('aria-pressed', 'false');
    expect(pastille().className).toMatch(/opacity-0/);
  });

  it('« Louer » précède « Acheter » dans la barre (TCK-633)', () => {
    monter();
    const ordre = within(groupe()).getAllByRole('button')
      .map((b) => b.querySelector('span:not([aria-hidden])')?.textContent);
    expect(ordre).toEqual(['Louer', 'Acheter']);
  });
```

Ligne 132 : `for (const nom of ['Acheter', 'Louer'] as const) {` → `for (const nom of ['Louer', 'Acheter'] as const) {`

```bash
npx vitest run src/components/home/__tests__/Navbar.transaction.test.tsx src/test/__tests__/surface-publique.contraste.test.ts
```

Expected : tout vert (le relevé de contraste lit les littéraux de `className`, inchangés).

Sans accord : ne pas éditer ; mettre le bloc ci-dessus dans `collisions` du rapport, et noter que
ce fichier reste rouge jusqu'à son application.

- [ ] **Step 7 : ablation**

```bash
F=src/components/search/SelecteurDeTransaction.tsx   # protocole « tenu seul » (Task 0)
```

Ablation : remettre `choix` dans l'ordre `sale`, `rent` et `valeur === 'rent' && 'translate-x-full'`.
`npx vitest run src/components/search/__tests__/SelecteurDeTransaction.test.tsx` → **4 rouges**.
Seconde ablation, la pastille seule (`valeur === 'rent' && 'translate-x-full'`, `choix` laissé dans
le nouvel ordre) → **2 rouges** (2ᵉ et 3ᵉ cas) : l'ordre et la glissade sont gardés séparément.
Restaurer par `cp`, prouver par `md5`, relancer → `4 passed`.

- [ ] **Step 8 : signaler à la session les fichiers à commiter**

`takussan-web/src/components/search/SelecteurDeTransaction.tsx`,
`takussan-web/src/components/search/__tests__/SelecteurDeTransaction.test.tsx`,
`takussan-web/src/messages/{fr,en,wo}.json` (une valeur chacun),
`takussan-web/src/components/home/__tests__/Navbar.transaction.test.tsx` (si accord).

---

## Task 2 : « Louer » avant « Acheter » dans le menu mobile

**Files :**
- Modify : `takussan-web/src/data/navigation.ts:69-98`
- Modify : `takussan-web/src/data/__tests__/navigation.test.ts` (ajout en fin de fichier, après la ligne 99)

- [ ] **Step 1 : écrire le test qui échoue**

Edit en fin de `src/data/__tests__/navigation.test.ts` (après le `describe('bande de catégories (TCK-628)'…` qui se ferme ligne 99) :

```ts

describe('menu mobile — « Louer » d’abord (TCK-633, AC5)', () => {
  it('propose Louer, puis Acheter, chacun vers SA transaction', () => {
    expect(navLinks.map((l) => [l.labelKey, l.href])).toEqual([
      ['rent', '/properties?contract_type=rent'],
      ['buy', '/properties?contract_type=sale'],
    ]);
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/data/__tests__/navigation.test.ts
```

Expected : 1 échec — `expected [ [ 'buy', … ], [ 'rent', … ] ] to deeply equal [ [ 'rent', … ], [ 'buy', … ] ]`.

- [ ] **Step 3 : implémentation minimale**

Edit lignes 95-98 :

```ts
export const navLinks = [
  { labelKey: 'rent', href: '/properties?contract_type=rent' },
  { labelKey: 'buy',  href: '/properties?contract_type=sale' },
] as const;
```

Et, dans le docblock (avant la ligne ` */` qui précède `export const navLinks`, ligne 94), ajouter :

```ts
 *
 * · **« Louer » d'abord (TCK-633, AC5)** : le même ordre que le sélecteur de la barre
 *   (`SelecteurDeTransaction`) et que le panneau de filtres. Un seul vocabulaire : Louer, Acheter.
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/data/__tests__/navigation.test.ts src/components/home/__tests__/Navbar.menu-modal.test.tsx src/components/home/__tests__/Navbar.menu-retour.test.tsx src/components/home/__tests__/Navbar.recherche.test.tsx
```

Expected : tout vert (les tests du menu trouvent les liens par leur nom, pas par leur rang).

- [ ] **Step 5 : ablation**

Protocole « tenu seul » sur `src/data/navigation.ts` : remettre `buy` avant `rent` →
`npx vitest run src/data/__tests__/navigation.test.ts` → **1 rouge** ; restaurer par `cp` ; `md5` ;
relancer → vert.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-web/src/data/navigation.ts`, `takussan-web/src/data/__tests__/navigation.test.ts`.

---

## Task 3 : modale de suppression sans promesse de restauration

**Files :**
- Create : `takussan-web/src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx`
- Modify *(co-tenu, valeurs seules)* : `takussan-web/src/messages/fr.json:1213-1214`,
  `en.json:1242-1243`, `wo.json:5453-5454`

Constat (re-mesuré) : `PropertyController::destroy` (`app/Http/Controllers/Api/PropertyController.php:203-209`)
fait un `delete()` sur un modèle `SoftDeletes` ; `routes/api/properties.php` n'a **aucune** route
`restore` ; aucun écran ne restaure. Les deux libellés promettent le contraire, et le premier parle
d'« archivé » alors que le menu porte un geste « Archiver » distinct. Les composants
(`PropertyRowActions.tsx:262`, `PropertyHeaderActions.tsx:260`, territoire du lot F) ne changent pas :
ils lisent ces deux clés par `t.rich(…, { title, b })`.

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx` :

```tsx
/**
 * TCK-633 (AC2) — la modale de suppression promettait une restauration « depuis l'administration ».
 * Aucune route ni aucun écran ne restaure un bien supprimé (D2 : la corbeille est hors périmètre).
 *
 * Éprouvé là où l'utilisateur le lit : la modale OUVERTE, depuis les deux menus, dans les trois
 * langues — une clé corrigée en français seulement resterait fausse en anglais et en wolof.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PropertyDetail, PropertyListItem } from '@/types/property';
import { PropertyHeaderActions } from '../PropertyHeaderActions';
import { PropertyRowActions } from '../PropertyRowActions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
// Le membre tient `properties.delete` : le cloisonnement a son propre fichier (TCK-587).
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

const DICTIONNAIRES = { fr, en, wo } as const;

/** Les libellés tels que l'écran les rend : `fr` sert de repli sous les autres (`src/test/intl.tsx`). */
const libelles = (locale: LocaleDeTest) => ({
  ...fr.property.dashboard.actions,
  ...DICTIONNAIRES[locale].property.dashboard.actions,
});

const BIEN = { id: 47, title: 'Studio à Ouakam', slug: 'studio-ouakam', status: 'available', visibility: 'public' } as const;

/** Toute promesse d'un retour en arrière, dans les trois langues, y compris le jargon d'origine. */
const PROMESSE = /restaur|restor|delloo|soft-delete|administration|admin area|njiit/i;

/** La phrase maison des actions irréversibles, reprise des dictionnaires (`adminSettings.integrations.confirmDelete`…). */
const IRREVERSIBLE = {
  fr: 'Cette action est irréversible.',
  en: 'This action cannot be undone.',
  wo: 'Jëf bii mënatul dellu.',
} as const;

const MENUS = {
  'ligne de la liste': () => <PropertyRowActions property={BIEN as unknown as PropertyListItem} />,
  'en-tête de la fiche': () => <PropertyHeaderActions property={BIEN as unknown as PropertyDetail} />,
};

describe.each(Object.entries(MENUS))('supprimer depuis « %s » (TCK-633, AC2)', (_nom, menu) => {
  it.each(['fr', 'en', 'wo'] as const)('en %s, la modale nomme le bien, ne promet rien et dit que c’est définitif', async (locale) => {
    const user = userEvent.setup();
    const a = libelles(locale);
    render(withIntl(menu(), locale));

    await user.click(screen.getByRole('button', { name: a.more }));
    await user.click(await screen.findByRole('menuitem', { name: a.delete }));
    const dialogue = await screen.findByRole('dialog', { name: a.deleteTitle });

    expect(dialogue).toHaveTextContent(BIEN.title);
    expect(dialogue.textContent).not.toMatch(PROMESSE);
    expect(dialogue).toHaveTextContent(IRREVERSIBLE[locale]);
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx
```

Expected : **6 échecs sur 6** — `expected 'Supprimer ce bien ?Le bien Studio à Ouakam sera archivé (soft-delete). Vous pourrez le restaurer…' not to match /restaur|…/i`
(et l'équivalent `restore` / `delloo` en anglais et en wolof).

- [ ] **Step 3 : implémentation minimale (Edit, une ligne par clé, sans reformater)**

`src/messages/fr.json` :

```json
        "deleteBodyRow": "Le bien <b>{title}</b> sera supprimé et retiré du site. Cette action est irréversible.",
        "deleteBodyDetail": "Le bien <b>{title}</b> sera supprimé de votre portefeuille et retiré du site. Cette action est irréversible.",
```

`src/messages/en.json` :

```json
        "deleteBodyRow": "The property <b>{title}</b> will be deleted and taken off the site. This action cannot be undone.",
        "deleteBodyDetail": "The property <b>{title}</b> will be removed from your portfolio and taken off the site. This action cannot be undone.",
```

`src/messages/wo.json` :

```json
        "deleteBodyRow": "Kër gi <b>{title}</b> dañu koy far, te du feeñati ci sit bi. Jëf bii mënatul dellu.",
        "deleteBodyDetail": "Kër gi <b>{title}</b> dañu koy dindi ci sa portfey, te du feeñati ci sit bi. Jëf bii mënatul dellu.",
```

Chaque Edit remplace exactement la ligne lue (fr 1213-1214, en 1242-1243, wo 5453-5454), indentation
de 8 espaces conservée.

- [ ] **Step 4 : le voir passer, et les gardes i18n**

```bash
npx vitest run src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx src/components/property-dashboard/__tests__/PropertyHeaderActions.test.tsx src/components/property-dashboard/__tests__/PropertyActions.capacites.test.tsx
npm run check:i18n
```

Expected : `6 passed` pour le nouveau fichier, voisins verts ; `check:i18n` vert (valeurs seules,
parité des clés inchangée).

- [ ] **Step 5 : ablation (fichier co-tenu : protocole co-tenu de la Task 0)**

Sur `src/messages/fr.json`, remettre l'ancienne valeur de `deleteBodyRow` par Edit →
`npx vitest run src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx`
→ **1 rouge** (`ligne de la liste` / `fr`) ; restaurer selon le protocole co-tenu ; les trois `md5`
au rapport.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-web/src/messages/{fr,en,wo}.json` (deux valeurs chacun),
`takussan-web/src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx`.

---

## Task 4 : `Flag::MediaWatermark` au catalogue, hors du client

**Files :**
- Create : `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php`
- Modify *(co-tenu A, C — Edit seul)* : `takussan-api/app/Domain/Features/Flag.php:15-20`

- [ ] **Step 1 : écrire le test qui échoue (squelette complet du fichier + premier cas)**

`takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php` :

```php
<?php

namespace Tests\Feature\Media;

use App\Domain\Features\Flag;
use App\Models\Agency;
use App\Models\FeatureFlag;
use App\Models\Property;
use App\Models\User;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-633 (lot A, AC7) — le filigrane est d'abord un choix de PLATEFORME : `media_watermark`,
 * ÉTEINT tant qu'aucune ligne ne l'allume. Éteint : aucune pose, et une photo dont le filigrane
 * n'est plus attendu est servie. Allumé : la règle d'avant, réglage d'agence compris.
 *
 * La règle se lit par DEUX chemins, et chacun a son cas ici : `AgencyWatermarkContext::isEnabledFor()`
 * (un bien dont l'agence est chargée — la fiche publique) et `WatermarkRequirement` (un lot, et tout
 * bien sans agence chargée — la liste publique, l'écouteur de conversion, `ApplyWatermarkJob`).
 */
class WatermarkGlobalFlagTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $public;

    protected function setUp(): void
    {
        parent::setUp();

        $this->public = RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
    }

    /**
     * Pose le drapeau en base, puis oublie la valeur retenue pour le cycle en cours : la lecture
     * suivante est celle d'une nouvelle requête ou d'un nouveau job.
     */
    private function drapeau(bool $allume): void
    {
        FeatureFlag::query()->updateOrCreate(
            ['key' => Flag::MediaWatermark->value],
            ['label' => Flag::MediaWatermark->value, 'enabled' => $allume, 'segments_json' => []],
        );
        app()->forgetScopedInstances();
    }

    private function agence(bool $filigrane): Agency
    {
        return Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => $filigrane],
        ]);
    }

    /** @return array{Property, Media} */
    private function photo(Agency $agency): array
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();

        return [$property, $media];
    }

    /** La fiche publique : son bien charge `agency` — chemin `isEnabledFor()`. */
    private function photosPubliques(Property $property): array
    {
        return $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data.photos');
    }

    /** La liste publique : elle ne charge pas `agency` — chemin `WatermarkRequirement`. */
    private function photoPrincipaleDeLaListe(): ?string
    {
        return $this->getJson('/api/public/properties')->assertOk()->json('data.0.main_photo_url');
    }

    // ── 1. Le drapeau ────────────────────────────────────────────────────────────────────

    public function test_the_flag_is_catalogued_off_by_default_and_never_served_to_the_client(): void
    {
        $this->assertSame(Flag::MediaWatermark, Flag::tryFrom('media_watermark'));
        $this->assertFalse(
            app(FeatureFlagEvaluator::class)->isEnabled(Flag::MediaWatermark->value),
            'Absent de la base : éteint.',
        );

        $this->actingAsRole('agency_admin');
        $this->drapeau(true);

        $this->assertArrayNotHasKey(
            Flag::MediaWatermark->value,
            $this->getJson('/api/feature-flags/me')->assertOk()->json('data') ?? [],
            'Décision serveur : le front n’a rien à en lire.',
        );
    }
}
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
```

Expected : `Error: Undefined constant App\Domain\Features\Flag::MediaWatermark`.

- [ ] **Step 3 : implémentation minimale (deux Edits, co-tenu)**

Edit 1 — ancre `enum Flag: string\n{\n` (ligne 15-16) ; insérer juste après l'accolade :

```php
    /**
     * TCK-633 (lot A) — le filigrane des photos de biens, pour toute la plateforme. ÉTEINT tant
     * qu'aucune ligne ne l'allume (`FeatureFlagEvaluator` : absent de la base ⇒ faux). Allumé, le
     * réglage `watermark_enabled` de chaque agence reprend la main. Lu SANS utilisateur par
     * `AgencyWatermarkContext::globallyEnabled()` : il s'allume globalement, jamais par segment
     * (un segment le laisserait éteint pour tous).
     */
    case MediaWatermark = 'media_watermark';

```

Edit 2 — ancre `        return true;` (le corps de `clientVisible()`, seule occurrence du fichier) :

```php
        // TCK-633 (lot A) — `media_watermark` est une décision serveur : le front n'a rien à en lire.
        return $this !== self::MediaWatermark;
```

Si le lot C a déjà inséré `case HostAutoSpace` à la même place : insérer `MediaWatermark` **avant**
lui, sans toucher sa ligne. Si C a déjà réécrit `clientVisible()`, relire et composer la condition
(`return ! in_array($this, [self::MediaWatermark, …], true);`) — et le noter au rapport.

- [ ] **Step 4 : le voir passer**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
node ../scripts/check-platform-catalogue-readers.mjs
```

Expected : `1 passed`. La garde **rougit** (`drapeau:media_watermark` sans lecteur) : c'est attendu,
le lecteur arrive en Task 5 ; ne pas la « réparer » ici.

- [ ] **Step 5 : ablation (protocole co-tenu)**

Remettre `return true;` dans `clientVisible()` → le test rougit
(`Failed asserting that an array does not have the key 'media_watermark'`) ; restaurer ; `md5` ×3.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-api/app/Domain/Features/Flag.php`, `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php`.
Signaler aussi : `tests/Feature/Api/Admin/FeatureFlagTest.php` rougit désormais (Task 9, E7).

---

## Task 5 : `isEnabledFor()` lit le drapeau, une fois par cycle

**Files :**
- Create : `takussan-api/app/Services/Media/MediaWatermarkSwitch.php`
- Modify : `takussan-api/app/Services/Media/AgencyWatermarkContext.php:1-7,33-51`
- Test : `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter aux `use` du test : `use App\Services\Media\AgencyWatermarkContext;` et
`use Illuminate\Support\Facades\DB;`. Puis, avant l'accolade finale de la classe :

```php
    // ── 2. Le chemin `isEnabledFor()` ─────────────────────────────────────────────────────

    public function test_off_no_agency_requires_a_watermark_even_when_its_setting_asks_for_one(): void
    {
        $sous = $this->agence(true);

        $this->assertFalse(AgencyWatermarkContext::isEnabledFor($sous), 'Éteint : le réglage d’agence ne suffit pas.');

        $this->drapeau(true);
        $this->assertTrue(AgencyWatermarkContext::isEnabledFor($sous), 'Allumé : le réglage de l’agence reprend la main.');
        $this->assertFalse(AgencyWatermarkContext::isEnabledFor($this->agence(false)));
        $this->assertFalse(AgencyWatermarkContext::isEnabledFor(null), 'Sans agence : jamais.');
    }

    public function test_the_global_switch_is_read_once_per_cycle_then_reread_by_the_next(): void
    {
        $this->drapeau(true);
        $agences = collect(range(1, 5))->map(fn () => $this->agence(true));

        DB::flushQueryLog();
        DB::enableQueryLog();
        $agences->each(fn (Agency $agency) => $this->assertTrue(AgencyWatermarkContext::isEnabledFor($agency)));
        $lectures = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], '"feature_flags"'))->count();
        DB::disableQueryLog();

        $this->assertSame(1, $lectures, "Le drapeau est lu {$lectures} fois pour 5 agences dans le même cycle.");

        $this->drapeau(false); // un nouveau cycle : requête suivante, job suivant
        $this->assertFalse(AgencyWatermarkContext::isEnabledFor($agences->first()));
    }
```

- [ ] **Step 2 : les voir échouer**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
```

Expected : 2 échecs — `Éteint : le réglage d’agence ne suffit pas. Failed asserting that true is false.`
et `Le drapeau est lu 0 fois pour 5 agences dans le même cycle. Failed asserting that 0 is identical to 1.`

- [ ] **Step 3 : implémentation minimale**

`takussan-api/app/Services/Media/MediaWatermarkSwitch.php` :

```php
<?php

namespace App\Services\Media;

/**
 * TCK-633 (lot A) — la valeur du drapeau global `media_watermark` pour UN cycle : une requête
 * HTTP, ou un job. Liée en `scoped` par `AgencyWatermarkContext::globallyEnabled()` : le worker
 * oublie les instances `scoped` entre deux jobs (`QueueServiceProvider`, `forgetScopedInstances()`),
 * si bien qu'un drapeau basculé dans la console vaut dès le job suivant, sans redémarrer le worker.
 */
final class MediaWatermarkSwitch
{
    public function __construct(public readonly bool $enabled) {}
}
```

`AgencyWatermarkContext.php`, Edit des imports (lignes 5-7) :

```php
use App\Domain\Features\Flag;
use App\Models\Agency;
use App\Models\Enums\WatermarkPosition;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Support\Facades\Storage;
```

Edit du bloc `isEnabledFor` (lignes 33-46, docblock compris) :

```php
    /**
     * LA règle d'activation du filigrane, écrite une fois (TCK-539, D3) : sans agence, pas de
     * filigrane ; drapeau global `media_watermark` éteint, pas de filigrane (TCK-633) ; sinon le
     * réglage de l'agence, `true` par défaut. Le job, son listener, la commande de régénération
     * et `PublicPhotoUrl` la lisent ici — une copie qui divergerait servirait une conversion nue
     * comme si elle était filigranée, ou la cacherait à tort.
     */
    public static function isEnabledFor(?Agency $agency): bool
    {
        if ($agency === null || ! self::globallyEnabled()) {
            return false;
        }

        return self::isEnabledInSettings($agency->settings);
    }

    /**
     * TCK-633 (lot A) — le drapeau global `media_watermark`, lu UNE fois par cycle
     * (`MediaWatermarkSwitch`). Une liste dont l'agence est chargée appelle `isEnabledFor()` par
     * bien : sans cette mémoire, une requête `feature_flags` par bien.
     *
     * Lu SANS utilisateur : le filigrane est une politique de plateforme, pas une préférence du
     * visiteur. Un drapeau segmenté vaut donc faux pour tous (`FeatureFlagEvaluator::evaluate()`) ;
     * absent de la base, il vaut faux — le filigrane est ÉTEINT par défaut.
     */
    public static function globallyEnabled(): bool
    {
        app()->scopedIf(MediaWatermarkSwitch::class, fn () => new MediaWatermarkSwitch(
            app(FeatureFlagEvaluator::class)->isEnabled(Flag::MediaWatermark->value),
        ));

        return app(MediaWatermarkSwitch::class)->enabled;
    }
```

Edit du docblock d'`isEnabledInSettings` (lignes 48-51) :

```php
    /**
     * La même règle, sur les `settings` d'une agence qui EXISTE, lus sans hydrater le modèle :
     * `WatermarkRequirement` les lit par lot, et `AgencyObserver` compare l'avant et l'après.
     *
     * ⚠ Elle ne lit PAS le drapeau global (TCK-633) : c'est le réglage d'agence SEUL. L'observateur
     * juge la transition de ce réglage, et `WatermarkRequirement` lit le drapeau une fois pour tout
     * le lot au lieu d'une fois par ligne.
     */
```

- [ ] **Step 4 : les voir passer, et la garde du catalogue**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
node ../scripts/check-platform-catalogue-readers.mjs
```

Expected : `3 passed` ; la garde est **verte** (`Flag::MediaWatermark` lu dans
`app/Services/Media/AgencyWatermarkContext.php`).

- [ ] **Step 5 : deux ablations (protocole « tenu seul » sur `AgencyWatermarkContext.php`)**

1. `if ($agency === null || ! self::globallyEnabled())` → `if ($agency === null)` : **2 rouges**
   (le premier test, et le second sur sa dernière assertion). Restaurer, `md5`.
2. Corps de `globallyEnabled()` →
   `return app(FeatureFlagEvaluator::class)->isEnabled(Flag::MediaWatermark->value);` (sans
   mémoire) : **1 rouge** — `Le drapeau est lu 5 fois`. Restaurer, `md5`, relancer → `3 passed`.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-api/app/Services/Media/MediaWatermarkSwitch.php`,
`takussan-api/app/Services/Media/AgencyWatermarkContext.php`, le test.

---

## Task 6 : `WatermarkRequirement` lit le drapeau — aucune pose, photo servie (AC7)

**Files :**
- Modify : `takussan-api/app/Services/Media/WatermarkRequirement.php:70-76`
- Modify (docblock seul) : `takussan-api/app/Services/Media/PublicPhotoUrl.php:17-19`
- Test : `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php`

Pourquoi ce second chemin : `$media->model` (écouteur, `ApplyWatermarkJob`) est un `Property` relu
sans relation, donc `requiresWatermark()` passe par `WatermarkRequirement::single()`, dont `load()`
appelle `isEnabledInSettings()` ligne par ligne (`WatermarkRequirement.php:78-86`) — pas
`isEnabledFor()`. Sans ce correctif, l'envoi pose encore le filigrane drapeau éteint.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter aux `use` : `use App\Jobs\Media\ApplyWatermarkJob;`, `use App\Services\Media\WatermarkService;`,
`use App\Services\Media\WatermarkTrace;`, `use Illuminate\Support\Facades\Queue;`. Puis :

```php
    // ── 3. Le chemin `WatermarkRequirement` : écouteur, job, liste ─────────────────────────

    /** AC7 — éteint, même pour une agence qui demande le filigrane : aucune pose, photo servie. */
    public function test_off_an_upload_is_not_watermarked_and_is_served(): void
    {
        Queue::fake([ApplyWatermarkJob::class]);
        [$property, $media] = $this->photo($this->agence(true));

        Queue::assertNotPushed(ApplyWatermarkJob::class);
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));

        $photos = $this->photosPubliques($property);
        $this->assertCount(1, $photos);
        $this->assertStringContainsString('-full.', $photos[0]['full']);
        $this->assertNotNull($this->photoPrincipaleDeLaListe());
    }

    /** `PublicPhotoUrl::isServable()` — une photo qui attendait son filigrane est servie dès qu'il n'est plus attendu. */
    public function test_turning_the_flag_off_serves_a_photo_still_awaiting_its_watermark(): void
    {
        $this->drapeau(true);
        Queue::fake([ApplyWatermarkJob::class]);
        [$property] = $this->photo($this->agence(true));
        $this->assertSame([], $this->photosPubliques($property), 'Précondition : allumé, la photo attend son filigrane.');
        $this->assertNull($this->photoPrincipaleDeLaListe(), 'Précondition : la liste la cache aussi.');

        $this->drapeau(false);

        $this->assertCount(1, $this->photosPubliques($property), 'Fiche (`isEnabledFor`) : servie.');
        $this->assertNotNull($this->photoPrincipaleDeLaListe(), 'Liste (`WatermarkRequirement`) : servie.');
    }

    public function test_a_watermark_job_queued_before_the_flag_went_off_applies_nothing(): void
    {
        $this->drapeau(true);
        Queue::fake([ApplyWatermarkJob::class]);
        [, $media] = $this->photo($this->agence(true));
        $nue = $this->public->get($media->getPathRelativeToRoot('full'));

        $this->drapeau(false);
        Queue::pushed(ApplyWatermarkJob::class)->each(fn (ApplyWatermarkJob $job) => $job->handle(new WatermarkService));

        $media->refresh();
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertSame($nue, $this->public->get($media->getPathRelativeToRoot('full')), '`full` reste nue.');
    }

    /** Allumé : le comportement d'avant, réglage d'agence compris. */
    public function test_on_the_agency_setting_decides_as_before(): void
    {
        $this->drapeau(true);
        Queue::fake([ApplyWatermarkJob::class]);

        [$sous] = $this->photo($this->agence(true));
        $this->assertEqualsCanonicalizing(
            Property::watermarkedConversions(),
            Queue::pushed(ApplyWatermarkJob::class)->map(fn (ApplyWatermarkJob $job) => $job->conversionName)->values()->all(),
        );
        $this->assertSame([], $this->photosPubliques($sous), 'Un envoi neuf sous filigrane attend son filigrane (fail-closed).');

        [$sans, $media] = $this->photo($this->agence(false));
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertCount(1, $this->photosPubliques($sans));
    }
```

- [ ] **Step 2 : les voir échouer**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
```

Expected : **3 échecs** — `test_off_an_upload…` (`The unexpected [App\Jobs\Media\ApplyWatermarkJob] job was pushed.`),
`test_turning_the_flag_off…` (`Liste (`WatermarkRequirement`) : servie. Failed asserting that null is not null.` —
la fiche, elle, passe déjà grâce à la Task 5), `test_a_watermark_job_queued…` (la trace contient
`thumbnail`, `preview`, `full`). `test_on_the_agency_setting…` est **vert dès maintenant** : c'est la
garde de non-régression, son ablation est au Step 5.

- [ ] **Step 3 : implémentation minimale**

`WatermarkRequirement.php`, Edit (lignes 73-77) :

```php
        if ($this->propertyIds === []) {
            return [];
        }

        // TCK-633 (lot A) — drapeau global éteint : aucun bien n'exige de filigrane, et aucune
        // agence n'est lue. Le drapeau se lit ici une fois pour tout le lot, pas par ligne.
        if (! AgencyWatermarkContext::globallyEnabled()) {
            return array_fill_keys($this->propertyIds, false);
        }

        // Une agence supprimée (soft delete) compte comme absente, comme le fait la relation.
```

(`AgencyWatermarkContext` est dans le même namespace : aucun `use` à ajouter.)

`PublicPhotoUrl.php`, Edit du docblock — après la ligne ` * produite quand l'agence n'en exigeait pas (`WatermarkTrace`, R1).` insérer :

```php
 * Drapeau global `media_watermark` éteint (TCK-633), AUCUN bien n'exige de filigrane : toute
 * conversion produite est servable, y compris celle qui attendait encore le sien. Ce fichier n'a
 * rien eu à changer pour cela — la décision vient de `$watermarkRequired`.
```

- [ ] **Step 4 : les voir passer**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php tests/Feature/Media/PublicPhotoUrlTest.php
```

Expected : `WatermarkGlobalFlagTest` → `7 passed`. `PublicPhotoUrlTest` peut rougir : c'est
l'objet de la Task 7, ne pas le corriger ici.

- [ ] **Step 5 : trois ablations**

1. `WatermarkRequirement.php` (tenu seul) : retirer le bloc `if (! AgencyWatermarkContext::globallyEnabled())`
   → **3 rouges** (les trois du Step 2). Restaurer, `md5`.
2. `AgencyWatermarkContext.php` : `if ($agency === null || ! self::globallyEnabled())` →
   `if ($agency === null)` → `test_turning_the_flag_off…` rougit sur **la fiche** (`Fiche (`isEnabledFor`) : servie.`)
   — preuve que les deux chemins sont gardés séparément. Restaurer, `md5`.
3. Garde de non-régression : corps de `globallyEnabled()` → `return false;` →
   `test_on_the_agency_setting…` **rouge** (aucun job poussé). Restaurer, `md5`, relancer → `7 passed`.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-api/app/Services/Media/WatermarkRequirement.php`,
`takussan-api/app/Services/Media/PublicPhotoUrl.php`, le test.

---

## Task 7 : les tests existants écrits sous « filigrane allumé par défaut » *(E8 — accord requis)*

**Files :**
- Create : `takussan-api/tests/Support/FiligraneGlobalAllume.php`
- Modify : chaque classe **mesurée rouge** au Step 1 (une ligne `use` + un import)

Le défaut change : avant, une agence filigranait sans autre condition. Les classes qui éprouvent la
règle d'agence (photo cachée en attente, trace `watermarked_conversions`, `ApplyWatermarkJob` poussé,
lecture de la règle comptée) éprouveraient désormais la plateforme éteinte. On leur rend la
condition qu'elles supposaient — on ne réécrit pas leurs assertions.

- [ ] **Step 1 : mesurer les rouges (jamais deviner)**

Les candidates sont dérivées de la carte d'impact (les classes qui couvrent la règle), pas d'une
liste écrite à la main :

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
node -e '
const m=require("./tests/impact-map.json"); const s=new Set();
for (const f of ["app/Services/Media/AgencyWatermarkContext.php","app/Services/Media/WatermarkRequirement.php","app/Listeners/Media/ApplyWatermarkOnConversionListener.php","app/Jobs/Media/ApplyWatermarkJob.php"])
  for (const i of (m.files[f] ?? [])) s.add(m.classes[i]);
console.log([...s].sort().map(c => c.replace(/^Tests\\/, "tests/").replace(/\\/g, "/") + ".php").join("\n"));
' > "$S/candidats.txt"
wc -l < "$S/candidats.txt"                       # 81 au relevé du 2026-10-12
grep    'tests/Feature/Media/' "$S/candidats.txt" > "$S/lot1.txt"
grep -v 'tests/Feature/Media/' "$S/candidats.txt" | split -l 25 - "$S/lot-suite-"
php artisan test $(cat "$S/lot1.txt") 2>&1 | tee "$S/lot1.log" | tail -40
for f in "$S"/lot-suite-*; do php artisan test $(cat "$f") 2>&1 | tee "$f.log" | tail -25; done
```

Chaque lot reste sous 10 minutes ; si un lot approche cette durée, le recouper. Relever la liste des
classes rouges et, pour chacune, **le message** : il doit porter sur le filigrane (photo absente ou
cachée, trace attendue, job attendu, requête `agencies` attendue). Prédiction à confirmer, non à
appliquer telle quelle : `ApplyWatermarkJobTest`, `PhotoConversionFormatTest`,
`PropertyMediaConversionsTest`, `PropertyPhotoExposureTest`, `RegenerateAgencyWatermarksJobTest`,
`RegenerationFailureTest`, `WatermarkActivationTest`, `WatermarkListQueryCountTest`,
`WatermarkTraceDuringRegenerationTest`, `MediaResourceSplitDisksTest`, et peut-être
`PublicPhotoUrlTest`, `PropertyResourceRawFlagTest`, `PropertyCollaboratorsNotExposedTest`.

Une classe rouge **pour une autre raison** (budget de requêtes absolu qui compte la lecture de
`feature_flags`, erreur sans rapport) : **ne pas** lui ajouter le trait. Écrire au rapport le message,
les deux nombres s'il s'agit d'un budget, et la correction proposée (`collisions`).

- [ ] **Step 2 : le trait**

`takussan-api/tests/Support/FiligraneGlobalAllume.php` :

```php
<?php

namespace Tests\Support;

use App\Domain\Features\Flag;
use App\Models\FeatureFlag;

/**
 * TCK-633 (lot A) — allume le drapeau global `media_watermark` pour une classe écrite quand le
 * filigrane suivait le seul réglage d'agence. Sans lui, ces tests éprouveraient la plateforme
 * ÉTEINTE — le défaut — et non la règle qu'ils nomment.
 *
 * Laravel appelle `setUp<NomDuTrait>()` APRÈS `RefreshDatabase` (`setUpTraits()`) : la ligne est
 * posée dans la transaction du test, avant que la valeur n'ait été lue pour ce cycle.
 */
trait FiligraneGlobalAllume
{
    protected function setUpFiligraneGlobalAllume(): void
    {
        FeatureFlag::query()->updateOrCreate(
            ['key' => Flag::MediaWatermark->value],
            ['label' => Flag::MediaWatermark->value, 'enabled' => true, 'segments_json' => []],
        );
        app()->forgetScopedInstances();
    }
}
```

- [ ] **Step 3 : l'appliquer aux seules classes mesurées rouges pour le filigrane**

Dans chacune : Edit de l'import, après `use Tests\Support\…` ou avant `use Tests\TestCase;` :

```php
use Tests\Support\FiligraneGlobalAllume;
```

et Edit de la ligne de traits de la classe, `    use RefreshDatabase;` →

```php
    use FiligraneGlobalAllume, RefreshDatabase;
```

(si la classe porte d'autres traits, ajouter `FiligraneGlobalAllume` en tête de la même ligne).

- [ ] **Step 4 : les voir repasser**

```bash
php artisan test <les classes modifiées, séparées par des espaces>
```

Expected : toutes vertes. Relancer aussi `tests/Feature/Media/WatermarkGlobalFlagTest.php` (il
n'utilise pas le trait : il doit rester à `7 passed`).

- [ ] **Step 5 : ablation du harnais**

Retirer `FiligraneGlobalAllume, ` de `WatermarkActivationTest` (protocole « tenu seul » sur ce fichier
de test) → `php artisan test tests/Feature/Media/WatermarkActivationTest.php` → rouge (au moins
`test_a_new_upload_under_watermark_is_not_exempt`). Restaurer, `md5`, relancer → vert.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-api/tests/Support/FiligraneGlobalAllume.php` et la liste exacte des classes modifiées.

---

## Task 8 : `media:regenerate-without-watermark`

**Files :**
- Create : `takussan-api/app/Console/Commands/Media/RegenerateWithoutWatermark.php`
- Test : `takussan-api/tests/Feature/Media/WatermarkGlobalFlagTest.php`

Conception (calquée sur `media:convert-photos-to-webp`, `app/Console/Commands/MediaConvertPhotosToWebp.php`) :
sélection des photos de biens dont la trace `watermarked_conversions` n'est pas vide ; lecture
paresseuse **par lots** (`lazyById(--chunk)`) ; un `RegeneratePhotoConversionsJob` par photo, en file
`media` (job borné, rejouable, fail-closed — `app/Jobs/Media/RegeneratePhotoConversionsJob.php`).
Drapeau éteint, chaque conversion réécrite est retirée de la trace par l'écouteur
(`ConversionWillStartEvent`) puis exemptée (`requiresWatermark()` faux) : la photo **sort** de la
sélection — c'est ce qui rend la commande **idempotente**. Allumée, la régénération referait chaque
filigrane : la commande **refuse** (sauf `--dry-run`, qui ne fait que compter).

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter aux `use` : `use App\Jobs\Media\RegeneratePhotoConversionsJob;`. Puis :

```php
    // ── 4. La commande de rattrapage ──────────────────────────────────────────────────────

    /** @return array{Property, Media, string} une photo filigranée par la chaîne réelle, et les octets de sa `full` */
    private function photoFiligranee(): array
    {
        $this->drapeau(true);
        [$property, $media] = $this->photo($this->agence(true));
        $media->refresh();
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::KEY, []), 'Précondition : filigranée.');

        return [$property, $media, $this->public->get($media->getPathRelativeToRoot('full'))];
    }

    public function test_the_command_refuses_to_run_while_the_flag_is_on(): void
    {
        $this->photoFiligranee();
        Queue::fake([RegeneratePhotoConversionsJob::class]);

        $this->artisan('media:regenerate-without-watermark')
            ->expectsOutputToContain('`media_watermark` est allumé')
            ->assertFailed();

        Queue::assertNotPushed(RegeneratePhotoConversionsJob::class);
    }

    public function test_the_command_counts_then_strips_the_watermark_and_is_idempotent(): void
    {
        [$property, $media, $filigranee] = $this->photoFiligranee();
        $this->photo($this->agence(false)); // exemptée : pas dans la sélection
        $this->drapeau(false);

        $this->artisan('media:regenerate-without-watermark', ['--dry-run' => true])
            ->expectsOutputToContain('1 photo(s) filigranée(s) à régénérer sans filigrane')
            ->assertSuccessful();

        $this->artisan('media:regenerate-without-watermark', ['--chunk' => 1])
            ->expectsOutputToContain('1 photo(s) mises en file `media`, par lots de 1')
            ->assertSuccessful();

        $media->refresh();
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNotSame($filigranee, $this->public->get($media->getPathRelativeToRoot('full')), '`full` est réécrite, nue.');
        $this->assertCount(1, $this->photosPubliques($property));

        $this->artisan('media:regenerate-without-watermark')
            ->expectsOutputToContain('0 photo(s) mises en file')
            ->assertSuccessful();
    }

    public function test_the_chunk_must_be_a_positive_integer(): void
    {
        $this->artisan('media:regenerate-without-watermark', ['--chunk' => '0'])
            ->expectsOutputToContain('--chunk attend un entier')
            ->assertExitCode(2);
    }
```

- [ ] **Step 2 : les voir échouer**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
```

Expected : 3 échecs — `The command "media:regenerate-without-watermark" does not exist.`

- [ ] **Step 3 : implémentation minimale**

`takussan-api/app/Console/Commands/Media/RegenerateWithoutWatermark.php` :

```php
<?php

namespace App\Console\Commands\Media;

use App\Jobs\Media\RegeneratePhotoConversionsJob;
use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkTrace;
use Illuminate\Console\Command;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-633 (lot A) — retire le filigrane des photos de biens qui le portent déjà, une fois le
 * drapeau global `media_watermark` éteint. Éteindre le drapeau sert les photos à venir et celles
 * qui attendaient leur filigrane ; celles qui le portent déjà le garderaient sans cette commande.
 *
 * Sélectionne les photos dont la trace `watermarked_conversions` n'est pas vide, les lit PAR LOTS
 * (`--chunk`), et met en file `media` un `RegeneratePhotoConversionsJob` par photo — borné,
 * rejouable, fail-closed. Chaque conversion réécrite sort de la trace (l'écouteur, à
 * `ConversionWillStartEvent`) puis est exemptée, le filigrane n'étant plus exigé : la photo sort
 * de la sélection. **Idempotente** : relancée une fois la file vidée, elle ne trouve plus rien ;
 * relancée AVANT, elle remet en file des photos pas encore traitées, ce qui ne duplique rien.
 *
 * **Refuse quand le drapeau est allumé** : la régénération referait chaque filigrane.
 * `--dry-run` compte dans les deux cas. Opération manuelle : rien ne la planifie.
 */
class RegenerateWithoutWatermark extends Command
{
    protected $signature = 'media:regenerate-without-watermark
        {--chunk=500 : Photos lues par requête}
        {--dry-run : Compter sans rien mettre en file}';

    protected $description = 'Met en file la régénération sans filigrane des photos de biens déjà filigranées, drapeau `media_watermark` éteint (TCK-633).';

    public function handle(): int
    {
        $chunk = filter_var($this->option('chunk'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

        if ($chunk === false) {
            $this->error('--chunk attend un entier supérieur ou égal à 1.');

            return self::INVALID;
        }

        $query = Media::query()
            ->select(['id'])
            ->where('model_type', Property::class)
            ->where('collection_name', 'photos')
            ->whereJsonLength('custom_properties->'.WatermarkTrace::KEY, '>', 0);

        if ($this->option('dry-run')) {
            $this->info('media:regenerate-without-watermark — '.$query->count().' photo(s) filigranée(s) à régénérer sans filigrane.');

            return self::SUCCESS;
        }

        if (AgencyWatermarkContext::globallyEnabled()) {
            $this->error('Le drapeau `media_watermark` est allumé : la régénération referait chaque filigrane. Éteignez-le d\'abord.');

            return self::FAILURE;
        }

        $mises = 0;

        $query->lazyById($chunk)->each(function (Media $media) use (&$mises) {
            RegeneratePhotoConversionsJob::dispatch((int) $media->getKey());
            $mises++;
        });

        $this->info("media:regenerate-without-watermark — {$mises} photo(s) mises en file `media`, par lots de {$chunk}.");

        return self::SUCCESS;
    }
}
```

- [ ] **Step 4 : les voir passer, et la garde des préfixes**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php
php artisan list media | grep regenerate-without-watermark
node ../scripts/check-command-prefixes.mjs
node ../scripts/check-media-getpath.mjs
```

Expected : `10 passed` ; la commande est listée (découverte récursive de `app/Console/Commands`,
comme `Billing/`) ; les deux gardes vertes.

- [ ] **Step 5 : trois ablations (protocole « tenu seul » sur la commande)**

1. Retirer le bloc `if (AgencyWatermarkContext::globallyEnabled()) { … }` → `test_the_command_refuses…`
   **rouge** (le job est poussé, la sortie ne contient pas le refus).
2. Retirer `->whereJsonLength(…)` → `test_the_command_counts…` **rouge** (`2 photo(s)` au lieu de 1,
   puis `1 photo(s)` au troisième passage au lieu de 0).
3. Retirer le bloc `if ($chunk === false) { … }` → `test_the_chunk_must…` **rouge**.

Restaurer après chacune, `md5`, relancer → `10 passed`.

- [ ] **Step 6 : signaler à la session les fichiers à commiter**

`takussan-api/app/Console/Commands/Media/RegenerateWithoutWatermark.php`, le test.

---

## Task 9 : `FeatureFlagTest` — le catalogue n'est plus vide *(E7 — accord requis)*

**Files :**
- Modify : `takussan-api/tests/Feature/Api/Admin/FeatureFlagTest.php:45-53`

`test_the_catalogue_is_empty_and_carries_no_label` affirme `assertSame([], Flag::cases())` et une
console vide : il rougit depuis la Task 4, et rougira aussi par le lot C (`host_auto_space`). La
version ci-dessous tient pour les deux lots, dans n'importe quel ordre d'arrivée.

- [ ] **Step 1 : constater le rouge**

```bash
php artisan test tests/Feature/Api/Admin/FeatureFlagTest.php
```

Expected : 1 échec — `Failed asserting that an array is identical to an empty array` (ou la sortie
JSON exacte qui diffère).

- [ ] **Step 2 : remplacer le test (Edit, lignes 45-53)**

```php
    /**
     * AC15 — le catalogue ne sert ni libellé ni description, et la console liste EXACTEMENT ses
     * entrées, dans leur ordre. TCK-633 : il n'est plus vide (`media_watermark`, lot A ;
     * `host_auto_space`, lot C) ; un drapeau serveur n'est pas servi au client.
     */
    public function test_the_catalogue_carries_no_label(): void
    {
        $this->actingAsRole('super_admin');

        $lignes = $this->getJson('/api/admin/feature-flags')->assertOk()->json('data');

        $this->assertSame(array_map(fn (Flag $flag) => $flag->value, Flag::cases()), array_column($lignes, 'key'));
        foreach ($lignes as $ligne) {
            $this->assertArrayNotHasKey('label', $ligne);
            $this->assertArrayNotHasKey('description', $ligne);
        }
        $this->assertArrayNotHasKey(
            Flag::MediaWatermark->value,
            $this->getJson('/api/feature-flags/me')->assertOk()->json('data') ?? [],
        );
    }
```

- [ ] **Step 3 : le voir passer**

```bash
php artisan test tests/Feature/Api/Admin/FeatureFlagTest.php
```

Expected : `5 passed`.

- [ ] **Step 4 : ablation**

Dans `FeatureFlagController::index` il n'y a rien à retirer pour ce lot ; l'ablation porte sur la
propriété que le test garde : ajouter temporairement `'label' => $flag['key'],` dans le tableau
rendu par `index()` (`app/Http/Controllers/Api/Admin/FeatureFlagController.php:24-29`, hors
territoire : **seulement si la session l'accorde**, sinon noter `ablation_rejouee: false` avec ce
motif) → rouge ; restaurer par `cp`, `md5`.

- [ ] **Step 5 : signaler à la session les fichiers à commiter**

`takussan-api/tests/Feature/Api/Admin/FeatureFlagTest.php` (si accord), ou le bloc dans `collisions`.

---

## Task 10 : gardes, style, rapport

- [ ] **Step 1 : Pint sur les seuls fichiers du lot**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
./vendor/bin/pint app/Domain/Features/Flag.php app/Services/Media/AgencyWatermarkContext.php \
  app/Services/Media/MediaWatermarkSwitch.php app/Services/Media/WatermarkRequirement.php \
  app/Services/Media/PublicPhotoUrl.php app/Console/Commands/Media/RegenerateWithoutWatermark.php \
  tests/Feature/Media/WatermarkGlobalFlagTest.php tests/Support/FiligraneGlobalAllume.php \
  tests/Feature/Api/Admin/FeatureFlagTest.php <classes modifiées en Task 7>
```

Expected : `PASS` ou des corrections de style seulement ; relancer alors les classes touchées.

- [ ] **Step 2 : toutes les classes du lot, une dernière fois**

```bash
php artisan test tests/Feature/Media/WatermarkGlobalFlagTest.php tests/Feature/Api/Admin/FeatureFlagTest.php $(cat "$S/lot1.txt")
cd ../takussan-web
npx vitest run src/components/search/__tests__/SelecteurDeTransaction.test.tsx src/data/__tests__/navigation.test.ts \
  src/components/home/__tests__/Navbar.transaction.test.tsx \
  src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx \
  src/test/__tests__/surface-publique.contraste.test.ts
npx tsc --noEmit
npm run lint
npm run check:i18n
cd ..
for g in scripts/check-platform-catalogue-readers.mjs scripts/check-command-prefixes.mjs scripts/check-media-getpath.mjs scripts/check-test-base-classes.mjs; do node "$g" || echo "✗ $g"; done
```

Expected : tout vert. `tsc` et `lint` portent sur tout l'arbre : un rouge situé dans un fichier d'un
autre lot se note au rapport, ne se corrige pas.

- [ ] **Step 3 : écrire le rapport** `docs/plans/rapports/tck-633-lot-a.json` (outil Write)

```json
{
  "verdict": "PRÊT | PRÊT AVEC COLLISIONS | BLOQUÉ",
  "fichiers": ["<chemin exact>", "…"],
  "tests": [{ "commande": "…", "resultat": "N passed" }],
  "ablations": [{ "fichier": "…", "retrait": "…", "rouge_observe": "…", "md5_avant": "…", "md5_ablate": "…", "md5_apres": "…" }],
  "ecarts_au_ticket": ["E1 …", "…"],
  "collisions": [{ "fichier": "…", "raison": "…", "bloc_propose": "…" }]
}
```

`fichiers` est la liste des fichiers à commiter (règle 1) ; `ablations` reprend chaque ablation des
Tasks 1 à 9 ; `ecarts_au_ticket` reprend les écarts ci-dessous **tels qu'observés**, plus tout
nouveau ; `collisions` porte les blocs non appliqués faute d'accord (E7, E8, E9) et toute classe de
la Task 7 rouge pour une autre raison que le filigrane.

- [ ] **Step 4 : message final, une ligne**

`lot A : <verdict>, <N> tests neufs verts, <M> ablations rejouées, rapport docs/plans/rapports/tck-633-lot-a.json`

---

## Écarts relevés

Mesurés en écrivant ce plan (2026-10-12). Chacun contredit ou précise le ticket ou le plan maître.

- **E1 — Périmètre.** Le ticket range dans le lot A la déconnexion (« Déconnexion du menu utilisateur
  vers l'accueil », et ses « tests front … de la redirection de déconnexion ») et le panneau de
  filtres ; le plan maître les donne aux lots **B** et **E**. Ce plan suit le plan maître.
- **E2 — `PublicPhotoUrl::isServable` et l'écouteur n'ont rien à changer.** `isServable()`
  (`PublicPhotoUrl.php:67-78`) rend déjà `true` quand `$watermarkRequired` est faux ; l'écouteur
  (`ApplyWatermarkOnConversionListener.php:70`) et `ApplyWatermarkJob` (`:53`) lisent déjà
  `requiresWatermark()`. Le correctif est dans la **règle**, pas chez ses lecteurs ; y ajouter une
  lecture directe du drapeau serait la copie que le docblock d'`AgencyWatermarkContext` interdit.
  Seul le docblock de `PublicPhotoUrl` change. Les AC du ticket sont tenus et éprouvés (Task 6).
- **E3 — La règle se lit par DEUX chemins, le ticket n'en nomme qu'un.** `WatermarkRequirement::load()`
  appelle `isEnabledInSettings()` ligne à ligne, sans passer par `isEnabledFor()` ; c'est le chemin
  de l'écouteur, du job et de la liste publique. Ne modifier que `isEnabledFor()` laissait la pose
  du filigrane intacte (Task 6, Step 2, mesuré par l'ablation).
- **E4 — `isEnabledInSettings()` reste pur, exprès.** `AgencyObserver:61-62` (hors territoire) juge la
  transition du réglage d'agence par cette méthode. Drapeau éteint, une agence qui active son réglage
  met encore en file `RegenerateAgencyWatermarksJob` : sans effet visible (les photos ressortent nues
  et exemptées), mais du travail inutile. Suite possible, hors lot : court-circuiter l'observateur
  sur `globallyEnabled()`.
- **E5 — Allumer le drapeau ne refiligrane pas l'existant.** Rien n'observe la table `feature_flags` :
  les photos téléversées drapeau éteint restent exemptées, donc servies nues, jusqu'à une
  régénération (`POST /api/agencies/{agency}/regenerate-watermarks`, `routes/api/agencies.php:54`,
  par agence, ou `media:regenerate-property-conversions`). « Allumé ⇒ comportement actuel » vaut pour les envois
  neufs et pour le réglage d'agence. À dire au porteur, et dans `docs/features.md` §2.7 à
  l'intégration.
- **E6 — Un drapeau à allumer SANS segment.** Le filigrane se juge sans utilisateur
  (`FeatureFlagEvaluator::evaluate()`, lignes 43-49 : segments non vides et pas d'utilisateur ⇒
  faux). Un super-admin qui ciblerait un rôle ou un pourcentage l'éteindrait pour tous. Écrit dans
  le docblock du `case` ; la console ne l'empêche pas.
- **E7 — Collision : `tests/Feature/Api/Admin/FeatureFlagTest.php`** (hors de tout territoire)
  affirme un catalogue vide ; il rougit par le lot A **et** par le lot C. Bloc de remplacement prêt
  (Task 9), valable quel que soit l'ordre d'arrivée des deux lots. Proposition : l'accorder au lot A.
- **E8 — Collision : les tests existants écrits sous « filigrane par défaut ».** Le défaut « éteint »
  rougit une dizaine de classes (`tests/Feature/Media/**` surtout), hors du territoire listé (qui ne
  nomme que `WatermarkGlobalFlagTest.php`). Le correctif est un trait neuf
  (`tests/Support/FiligraneGlobalAllume.php`) et une ligne par classe **mesurée** rouge (Task 7).
  Proposition : étendre le territoire du lot A à ces fichiers.
- **E9 — Collision : `components/home/__tests__/Navbar.transaction.test.tsx`** affirme l'ordre
  « Acheter | Louer » et le nom de groupe `Acheter / Louer` ; il rougit par le changement du
  sélecteur (lot A) alors que `Navbar.tsx` est au lot E. Bloc prêt (Task 1, Step 6). Proposition :
  l'accorder au lot A — le lot E ne le touche pas.
- **E10 — Fichiers neufs hors de la liste du territoire** : `SelecteurDeTransaction.test.tsx`,
  `suppression-sans-promesse.test.tsx`, l'ajout à `data/__tests__/navigation.test.ts`,
  `MediaWatermarkSwitch.php` (sous `app/Services/Media/**`, donc dans le territoire). Les tests
  sont des fichiers neufs ou adjacents à des fichiers du lot : aucun autre lot n'y écrit.
- **E11 — `nav.transactionPlaceholder` change de valeur** (« Louer / Acheter ») : c'est le nom
  accessible du groupe ; le laisser à « Acheter / Louer » contredirait l'ordre affiché. Conforme à
  l'espace `nav.*` (ordre seul) du plan maître.
- **E12 — `clientVisible()` devient faux pour `media_watermark`.** Non demandé par le ticket. Sans
  cela, `/api/feature-flags/me` servirait au navigateur une décision purement serveur, et changerait
  de forme. Une ligne, dans un fichier co-tenu avec C (`return $this !== self::MediaWatermark;`,
  compatible avec tout `case` que C ajoute).
- **E13 — Le docblock de `Flag` ment dès la Task 4** (« vide, délibérément », lignes 8-13). Fichier
  co-tenu : ce plan ne le réécrit pas, pour ne pas croiser l'édition du lot C. **À réécrire par la
  session à l'intégration**, une fois les deux `case` posés. De même `docs/features.md` §2.7
  (médias) et `docs/models-spec.md` §58 (FeatureFlag) : écrivain unique, Étape 3.
- **E14 — Le territoire `app/Support/**Watermark**` n'est pas employé** : la valeur du drapeau vit
  dans `app/Services/Media/MediaWatermarkSwitch.php`, à côté de la règle qu'elle sert.
- **E15 — Règle 7 et fichiers co-tenus.** Restaurer `Flag.php` ou un dictionnaire par `cp` écraserait
  une édition d'un autre lot faite pendant l'ablation. Ce plan ajoute le protocole co-tenu de la
  Task 0 (Edit inverse et triple `md5`), qui tient la preuve par `md5` sans ce risque.
- **E16 — Le wolof des deux phrases de suppression** reprend la formule maison d'irréversibilité
  (« Jëf bii mënatul dellu. », déjà dans `adminSettings.integrations.confirmDelete`) ; le reste
  (« du feeñati ci sit bi ») est à faire relire par le porteur.
- **E17 — « Par lots ».** Le ticket ne dit pas lequel ; ce plan lit par lots (`lazyById(--chunk)`) et
  met un job par photo en file, le patron de `media:convert-photos-to-webp`. Aucune limite de photos
  par exécution n'est ajoutée (YAGNI) ; `--dry-run` compte avant.
- **E18 — Le front n'expose aucun interrupteur de filigrane d'agence** (`watermark_enabled` n'apparaît
  que dans un test, `AgencyConfigForm.penalites.test.tsx`) : rien à masquer côté écran quand le
  drapeau est éteint.
