import { memo, type ComponentType } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: ({ lat, lng }: { lat?: number | null; lng?: number | null }) => (
    <div data-testid="carte" data-lat={lat ?? ''} data-lng={lng ?? ''} />
  ),
}));
vi.mock('@/hooks/useGeoSuggestion', () => ({
  useGeoSuggestion: () => ({ suggestion: null, defaults: {}, loading: false }),
}));

import { StepBien } from '../wizard/steps/StepBien';
import { StepCaracteristiques } from '../wizard/steps/StepCaracteristiques';
import { StepFinition } from '../wizard/steps/StepFinition';
import { StepLieu } from '../wizard/steps/StepLieu';
import { StepPrix } from '../wizard/steps/StepPrix';

/**
 * TCK-564 — W9 du retour testeur du 2026-09-23 : « j'ai cliqué Terrain et Vendre, aucun changement
 * de couleur ». Puis « même problème, j'ai sélectionné Bail ».
 *
 * ## Le mécanisme, mesuré
 *
 * Chaque étape lisait ses valeurs par `form.watch('type')` PENDANT LE RENDU, avec un `form` reçu en
 * prop. Le React Compiler (actif, ADR-0015) tient les props pour immuables : il a mis
 * `watch('type')` en cache sur l'identité de `watch` — stable pour toute la vie du formulaire —
 * et le parcours a mis `<StepX form={form} />` en cache sur l'identité de `form`, stable elle
 * aussi. Sortie du compilateur relevée sur `StepBien` :
 *
 * ```js
 * if ($[2] !== watch) { t2 = watch("type"); $[2] = watch; $[3] = t2; } else { t2 = $[3]; }
 * ```
 *
 * Le clic écrivait bien la valeur — le parcours laissait avancer, sa propre lecture n'étant pas
 * mise en cache — mais la pastille restait éteinte, pour toujours. Pire, sur les équipements, le
 * second clic réécrivait la liste figée : le premier équipement coché était PERDU.
 *
 * **vitest ne compile pas** (`vitest.config.ts` n'a pas le plugin) : la suite était verte sur un
 * défaut que seule la production exécutait. Rejouées sous le compilateur (configuration de mesure
 * hors dépôt, cf. le ticket), sept assertions EXISTANTES de `StepBien.test.tsx` et
 * `StepCaracteristiques.test.tsx` rougissaient.
 *
 * ## Ce que ce fichier garde, sans le compilateur
 *
 * 1. **Le comportement.** Chaque étape est montée sous un hôte qui la MÉMOÏSE (`memo`) — ce que
 *    fait le parcours compilé, mesuré : `if ($[57] !== form) t31 = <StepFinition form={form} />`.
 *    Une étape ne se re-rend alors que si ELLE s'est abonnée (`useWatch`) ; une lecture `watch()`
 *    rend la valeur du premier rendu, exactement comme en production.
 * 2. **La source.** Aucune lecture `watch(…)` pendant le rendu dans le parcours. `watch(callback)`
 *    — l'abonnement de l'autosave, dans un effet — n'est pas une lecture et reste permis.
 */

const WIFI: Tag = { id: 7, name: 'WiFi', slug: 'wifi', type: 'amenity', icon: null, color: null, description: null };
const PISCINE: Tag = { id: 8, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null, description: null };

type Etape = ComponentType<{ form: UseFormReturn<PropertyFormValues> }>;

/**
 * L'hôte du formulaire, et l'étape MÉMOÏSÉE comme le parcours compilé la mémoïse. `agir` reçoit le
 * formulaire pour écrire une valeur DEPUIS L'EXTÉRIEUR de l'étape (la carte, le sélecteur de
 * devise, le contrat) ; `sonde` expose le formulaire au test.
 */
function monter(
  EtapeBrute: Etape,
  defauts: Partial<PropertyFormValues>,
  agir?: (form: UseFormReturn<PropertyFormValues>) => void,
) {
  const EtapeMemo = memo(EtapeBrute);
  const sonde: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Hote() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', currency: 'XOF', city: '', furnished: false, tag_ids: [], ...defauts,
      } as PropertyFormValues,
    });
    sonde.form = form;
    return (
      <>
        {agir ? <button type="button" onClick={() => agir(form)}>agir</button> : null}
        <EtapeMemo form={form} />
      </>
    );
  }
  render(withIntl(<Hote />));
  return sonde;
}

describe('TCK-564 — une étape mémoïsée par le parcours voit ce qu’on vient de choisir', () => {
  it('W9 étape 1 — « Terrain » et « Vendre » s’allument au clic', async () => {
    const user = userEvent.setup();
    monter(StepBien, {});

    await user.click(screen.getByRole('radio', { name: /^terrain$/i }));
    await user.click(screen.getByRole('radio', { name: /^vendre$/i }));

    expect(screen.getByRole('radio', { name: /^terrain$/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^vendre$/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('W9 étape 3 — « Bail » s’allume au clic, et s’éteint au second', async () => {
    const user = userEvent.setup();
    const sonde = monter(StepCaracteristiques as Etape, { type: 'land', contract_type: 'sale' });

    const bail = screen.getByRole('button', { name: /^bail$/i });
    await user.click(bail);
    expect(bail).toHaveAttribute('aria-pressed', 'true');
    expect(sonde.form?.getValues('title_type')).toBe('bail');

    await user.click(bail);
    expect(bail).toHaveAttribute('aria-pressed', 'false');
    expect(sonde.form?.getValues('title_type')).toBeUndefined();
  });

  it('les équipements s’additionnent : le second clic ne PERD pas le premier', async () => {
    const user = userEvent.setup();
    function AvecTags({ form }: { form: UseFormReturn<PropertyFormValues> }) {
      return <StepCaracteristiques form={form} tags={[WIFI, PISCINE]} />;
    }
    const sonde = monter(AvecTags, { type: 'villa', contract_type: 'sale' });

    await user.click(screen.getByRole('button', { name: 'WiFi' }));
    await user.click(screen.getByRole('button', { name: 'Piscine' }));

    expect(sonde.form?.getValues('tag_ids')).toEqual([7, 8]);
    expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('le compteur de la description suit la frappe', async () => {
    const user = userEvent.setup();
    monter(StepFinition, { type: 'villa', contract_type: 'sale' });

    await user.type(screen.getByLabelText(/description/i), 'Belle vue');
    expect(screen.getByText(/9\s+caractères/)).toBeInTheDocument();
  });

  it('la position posée hors de l’étape atteint la carte', async () => {
    const user = userEvent.setup();
    monter(StepLieu as Etape, { type: 'land', contract_type: 'sale' }, (form) => {
      form.setValue('latitude', 14.7, { shouldDirty: true });
      form.setValue('longitude', -17.4, { shouldDirty: true });
    });

    await user.click(screen.getByRole('button', { name: 'agir' }));
    expect(screen.getByTestId('carte')).toHaveAttribute('data-lat', '14.7');
    expect(screen.getByTestId('carte')).toHaveAttribute('data-lng', '-17.4');
  });

  it('le bloc de location s’ouvre quand le contrat passe en location', async () => {
    const user = userEvent.setup();
    monter(StepPrix, { type: 'apartment', contract_type: 'sale' }, (form) =>
      form.setValue('contract_type', 'rent', { shouldDirty: true }),
    );
    expect(screen.getByTestId('bloc-location')).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'agir' }));
    expect(screen.getByTestId('bloc-location')).not.toHaveAttribute('aria-hidden', 'true');
  });
});

describe('TCK-564 — la garde de source : aucune lecture `watch(…)` ni `getValues(…)` pendant le rendu du parcours', () => {
  const racine = path.resolve(__dirname, '..');
  const fichiers = [
    'PropertyWizard.tsx',
    // L'hôte du formulaire d'ÉDITION : sa lecture `watch()` n'était pas figée, mais par un effet
    // de la sortie du compilateur, pas par contrat — `AgencyConfigForm` montre qu'une lecture
    // d'hôte peut l'être (revue adverse, mesuré par exécution le 2026-09-23).
    'PropertyForm.tsx',
    ...readdirSync(path.join(racine, 'wizard'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => path.join('wizard', f)),
    ...readdirSync(path.join(racine, 'wizard', 'steps'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => path.join('wizard', 'steps', f)),
  ];

  it('inspecte réellement les six étapes, le parcours et l’édition — une garde vide serait verte', () => {
    expect(fichiers).toEqual(
      expect.arrayContaining([
        'PropertyWizard.tsx',
        'PropertyForm.tsx',
        ...['StepBien', 'StepLieu', 'StepCaracteristiques', 'StepPrix', 'StepPhotos', 'StepFinition'].map(
          (n) => path.join('wizard', 'steps', `${n}.tsx`),
        ),
      ]),
    );
  });

  it.each(fichiers)('%s', (fichier) => {
    const source = readFileSync(path.join(racine, fichier), 'utf8')
      // Les commentaires citent le motif interdit pour l'expliquer : ils ne comptent pas.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // `watch('x')`, `watch("x")`, `watch(['x', 'y'])`, `watch()` : des LECTURES. `watch((v) => …)`
    // est un abonnement — seul motif admis.
    const lectures = source.match(/\bwatch\(\s*(?:['"`[]|\))/g) ?? [];
    expect(lectures, `${fichier} : lire par useWatch({ control, name }), pas par watch()`).toEqual([]);
  });

  // Revue adverse, repair-2 (mutation survivante) : `currency={form.getValues('currency')}` dans
  // l'hôte d'édition laissait TOUT vert — l'hôte se re-rend aujourd'hui par un autre abonnement
  // (`formState.dirtyFields`), et la garde ne cherchait que `watch(`. `getValues` est une lecture
  // PONCTUELLE, sans abonnement : juste au clic ou dans un effet, figée si on l'affiche. La garde
  // lit donc l'arbre syntaxique, pas le texte, et ne refuse `getValues(…)` que là où il s'exécute
  // PENDANT LE RENDU : directement dans le corps d'un composant ou d'un hook.
  it.each(fichiers)('%s — aucun `getValues(…)` dans le corps d’un composant ou d’un hook', (fichier) => {
    const source = readFileSync(path.join(racine, fichier), 'utf8');
    expect(
      lecturesPonctuellesAuRendu(source, fichier),
      `${fichier} : une valeur AFFICHÉE se lit par useWatch ; getValues se lit au clic`,
    ).toEqual([]);
  });

  it('la garde syntaxique attrape la mutation qui lui a échappé, et laisse passer les lectures au clic', () => {
    const coupable = `
      export function Hote({ form }) {
        const { getValues } = form;
        const surClic = () => getValues('title_type');
        const rappel = useCallback(() => form.getValues('x'), [form]);
        useEffect(() => { getValues('y'); }, []);
        return <Champ currency={form.getValues('currency')} onClick={() => getValues('z')} />;
      }
      const Memo = memo(function ({ form }) { return <p>{form.getValues('a')}</p>; });
      function useDevise(form) { return form.getValues('currency'); }
      function utilitaire(form) { return form.getValues('b'); }`;
    expect(lecturesPonctuellesAuRendu(coupable, 'sonde.tsx')).toEqual([
      'Hote, ligne 7',
      'Memo, ligne 9',
      'useDevise, ligne 10',
    ]);
  });

  // Revue adverse v2 (mutation MV1, survivante de la garde) : une flèche ANONYME passée à
  // `useState` — `useState(() => [form.getValues('type')])` — n'a pas de nom, et la garde jugeait
  // par le nom de la fonction englobante. Or l'initialiseur de `useState`, la fabrique de
  // `useMemo`, l'init de `useReducer` et le `getSnapshot` de `useSyncExternalStore` s'exécutent
  // PENDANT LE RENDU : la valeur y est lue une fois, puis figée. Ils sont jugés comme le corps du
  // composant qui les appelle ; `useCallback` et `useEffect`, qui ne tournent pas au rendu, non.
  it('la garde attrape aussi une lecture dans un rappel de hook exécuté PENDANT le rendu', () => {
    const coupable = `
      export function StepBien({ form }) {
        const [[type, contrat]] = useState(() => [form.getValues('type'), form.getValues('contract_type')]);
        const devise = React.useMemo(() => form.getValues('currency'), [form]);
        const [etat] = useReducer(r, null, () => form.getValues('x'));
        const snap = useSyncExternalStore(s, () => form.getValues('y'));
        const rappel = useCallback(() => form.getValues('z'), [form]);
        useEffect(() => { form.getValues('w'); }, [form]);
        const surClic = useMemo(() => () => form.getValues('clic'), [form]);
        return null;
      }`;
    expect(lecturesPonctuellesAuRendu(coupable, 'sonde.tsx')).toEqual([
      'StepBien (useState), ligne 3',
      'StepBien (useState), ligne 3',
      'StepBien (useMemo), ligne 4',
      'StepBien (useReducer), ligne 5',
      'StepBien (useSyncExternalStore), ligne 6',
    ]);
  });
});

/** Les appels `getValues(…)` exécutés PENDANT LE RENDU : ceux dont la fonction englobante la plus
 *  proche est un composant (nom en capitale) ou un hook (`useX`). */
function lecturesPonctuellesAuRendu(source: string, fichier: string): string[] {
  const racineAst = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trouvees: string[] = [];

  const nomDe = (fonction: ts.Node): string | undefined => {
    if ((ts.isFunctionDeclaration(fonction) || ts.isFunctionExpression(fonction)) && fonction.name) {
      return fonction.name.text;
    }
    // `const Nom = (…) => …`, `const Nom = memo(function (…) { … })`, `forwardRef(…)`.
    let parent = fonction.parent;
    while (parent && ts.isCallExpression(parent)) parent = parent.parent;
    return parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
      ? parent.name.text
      : undefined;
  };

  const fonctionEnglobante = (noeud: ts.Node): ts.Node | undefined => {
    let englobante: ts.Node | undefined = noeud.parent;
    while (englobante && !ts.isFunctionLike(englobante)) englobante = englobante.parent;
    return englobante;
  };

  /** Le hook dont `fonction` est un ARGUMENT direct, s'il l'exécute pendant le rendu. */
  const hookQuiExecuteAuRendu = (fonction: ts.Node): string | undefined => {
    const appel = fonction.parent;
    if (!appel || !ts.isCallExpression(appel) || !appel.arguments.some((a) => a === fonction)) return undefined;
    const appele = appel.expression;
    const nomHook = ts.isIdentifier(appele)
      ? appele.text
      : ts.isPropertyAccessExpression(appele)
        ? appele.name.text
        : '';
    return /^(?:useState|useMemo|useReducer|useSyncExternalStore)$/.test(nomHook) ? nomHook : undefined;
  };

  const visiter = (noeud: ts.Node): void => {
    if (ts.isCallExpression(noeud)) {
      const appele = noeud.expression;
      const nom = ts.isIdentifier(appele)
        ? appele.text
        : ts.isPropertyAccessExpression(appele)
          ? appele.name.text
          : '';
      if (nom === 'getValues') {
        let englobante = fonctionEnglobante(noeud);
        // Un rappel qu'un hook exécute AU RENDU (`useState(() => …)`) est jugé comme le corps du
        // composant qui l'appelle — la flèche anonyme échappait à la garde (MV1).
        const hook = englobante ? hookQuiExecuteAuRendu(englobante) : undefined;
        if (hook && englobante) englobante = fonctionEnglobante(englobante);
        const nomEnglobante = englobante ? nomDe(englobante) : undefined;
        if (nomEnglobante && /^(?:[A-Z]|use[A-Z])/.test(nomEnglobante)) {
          const ligne = racineAst.getLineAndCharacterOfPosition(noeud.getStart()).line + 1;
          trouvees.push(`${nomEnglobante}${hook ? ` (${hook})` : ''}, ligne ${ligne}`);
        }
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(racineAst);
  return trouvees;
}
