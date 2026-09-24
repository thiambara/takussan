/**
 * TCK-571 — AUCUNE lecture `watch(…)` de react-hook-form dans `src/`, ni `getValues(…)` pendant le
 * rendu : une valeur affichée se lit par `useWatch({ control, name })`, une valeur ponctuelle
 * (clic, effet) par `getValues`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `next.config.ts` active le React Compiler (ADR-0015). Il tient le retour d'un hook pour
 * immuable : `form.watch('type')` lu pendant le rendu est mis en cache sur l'identité — stable pour
 * toute la vie du formulaire — de `form` ou de `watch`. Sortie relevée sur `CreateLeaseForm` :
 *
 * ```js
 * if ($[14] !== form) { t7 = form.watch("type"); $[14] = form; $[15] = t7; } else { t7 = $[15]; }
 * ```
 *
 * Le composant se re-rend, la valeur affichée ne bouge plus : un bail passé en « Vente » gardait le
 * champ « Loyer mensuel », l'aperçu de devise de l'agence restait en F CFA (mesurés sur la pile de
 * dev compilée ET sous vitest compilé, TCK-571). Le défaut n'existe QUE dans le code compilé :
 * `vitest` ne compile pas (`takussan-web/CLAUDE.md`, « Mémoïsation »), la suite reste verte. D'où
 * une garde de SOURCE, et non de comportement.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE — plus stricte que « pas dans le corps d'un composant », délibérément
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  · Une LECTURE — `watch()`, `watch('x')`, `watch(['x', 'y'])`, `watch(nom)` — est refusée
 *    PARTOUT, pas seulement dans le corps d'un composant. Décider de ce qui s'exécute « pendant le
 *    rendu » est précisément ce qu'une garde syntaxique fait mal : la garde de TCK-564 jugeait par
 *    le nom de la fonction englobante et a laissé passer `useState(() => form.getValues(…))` ; un
 *    rappel de `.map()` dans le JSX lui échapperait de même. Or aucune lecture `watch()` n'a
 *    d'usage légitime ailleurs : au clic ou dans un effet, l'idiome est `getValues`. Interdire
 *    partout ne coûte rien et ne demande pas de savoir où est le rendu.
 *  · Un ABONNEMENT — `watch((valeurs) => …)`, le rappel écrit EN LIGNE — est permis dans un effet
 *    (`useEffect`, `useLayoutEffect`, `useInsertionEffect`), et seulement là : c'est l'autosave de
 *    `PropertyWizard`, qui se désabonne au démontage. Hors d'un effet, il ré-abonnerait à chaque
 *    rendu sans jamais se désabonner : refusé aussi.
 *  · `getValues(…)` — lecture PONCTUELLE, juste au clic et dans un effet — est refusé là où il
 *    s'exécute PENDANT LE RENDU, puisqu'il y est figé exactement comme `watch()` (mutation
 *    `form.getValues('currency')` dans `AgencyConfigForm` : rouge sous compilation, et la première
 *    version de cette garde restait verte — vérification de TCK-571). « Pendant le rendu » se juge
 *    ici, faute de mieux, par une heuristique syntaxique (`getValuesAuRendu`) :
 *      – dans le corps d'un composant (nom en capitale) ou d'un hook (`useX`) ;
 *      – dans un rappel que ce corps fait exécuter tout de suite : `useState`, `useMemo`,
 *        `useReducer`, `useSyncExternalStore`, ou une méthode de tableau synchrone (`.map`,
 *        `.filter`, `.reduce`, `.find`…) — récursivement ;
 *      – dans une IIFE, `(() => form.getValues('x'))()`, jugée comme le corps où elle est écrite ;
 *      – dans une fonction NOMMÉE du composant que ce corps appelle ou passe à l'un d'eux (un
 *        niveau d'indirection) ;
 *      – dans une PROP DE RENDU — `render={…}` de `<Controller>` ou de tout autre élément, ou un
 *        enfant-fonction `<X>{(v) => …}</X>`, en ligne ou nommée — et ce QUEL QUE SOIT le
 *        champ lu et OÙ QUE soit écrit l'élément : le composant qui la reçoit l'exécute pendant
 *        son rendu. ⚠ La version précédente de cet en-tête admettait le `render` de
 *        `<Controller>` (« appelé par le Controller, pas mis en cache ») : FAUX, mesuré à la
 *        reprise du 2026-09-24. Le compilateur met l'ÉLÉMENT `<Controller>` en cache sur `form`,
 *        le Controller ne se re-rend que sur SON champ : `render={() => form.getValues('type')
 *        === 'sale' ? … : …}` posé dans `CreateLeaseForm` laissait cette garde verte et rougissait
 *        le test compilé. Le Controller fournit déjà `field.value` pour son propre champ ; un
 *        autre champ se lit par `useWatch`.
 *    Un gestionnaire (`onClick={() => …}`) — y compris écrit DANS une prop de rendu —, un
 *    `useCallback`, un effet : admis.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ CE QUE CETTE GARDE NE VOIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  · un ALIAS : `const { watch: regarder } = form; regarder('x')`, ou `const r = form.watch;` —
 *    seuls les appels nommés `watch` / `getValues` (propriété, `['…']` ou identifiant nu) sont
 *    lus ;
 *  · `form.watch.call(…)` / `.apply(…)` ;
 *  · pour `getValues` : un composant ANONYME (`export default function ({ form })`), une
 *    indirection de plus d'un niveau (`const b = () => a(); const a = () => getValues(); b()`),
 *    une fonction définie HORS du composant et appelée pendant son rendu (`lire(form)`) ou passée
 *    comme prop de rendu (`render={rendreHorsComposant}`), une prop de rendu sous un autre nom
 *    que `render` (`renderItem={…}`, `children={…}` écrit en attribut), une IIFE par
 *    `.call(…)`, une méthode de tableau hors de la liste, et tout ce qu'une heuristique de nom
 *    manque par construction. Les tests de comportement des formulaires font le reste — sous
 *    compilation seulement ;
 *  · les fichiers `__tests__` : ils ne partent pas en production (`sourcesDe` les exclut) ;
 *  · une autre bibliothèque exposant un `.watch()` : elle serait refusée à tort — aucune dans
 *    `src/` au 2026-09-24. Un abonnement dont le rappel est passé PAR NOM (`watch(sauver)`) est
 *    compté comme une lecture, faute de pouvoir le distinguer d'un `watch(nomDuChamp)` : écrire le
 *    rappel en ligne.
 */
import { readFileSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { RACINE_SRC, nommer, sourcesDe } from '@/test/analyse-statique';

const EFFETS = /^(?:useEffect|useLayoutEffect|useInsertionEffect)$/;

interface Releve {
  /** `ligne N — …` : ce qui est refusé. */
  readonly refus: string[];
  /** Les abonnements `watch(rappel)` admis, pour prouver que la voie permise est exercée. */
  readonly abonnementsAdmis: number;
}

/** Le nom d'un appelé : `f(…)`, `x.f(…)`, `x['f'](…)`. */
function nomAppele(appele: ts.Expression): string | undefined {
  if (ts.isIdentifier(appele)) return appele.text;
  if (ts.isPropertyAccessExpression(appele)) return appele.name.text;
  if (ts.isElementAccessExpression(appele) && ts.isStringLiteralLike(appele.argumentExpression)) {
    return appele.argumentExpression.text;
  }
  return undefined;
}

/** `noeud` est-il écrit à l'intérieur d'un rappel passé à un hook d'effet ? */
function dansUnEffet(noeud: ts.Node): boolean {
  for (let n: ts.Node | undefined = noeud.parent; n; n = n.parent) {
    if (!ts.isArrowFunction(n) && !ts.isFunctionExpression(n)) continue;
    const appel: ts.Node = n.parent;
    if (appel && ts.isCallExpression(appel) && appel.arguments[0] === n) {
      const nom = nomAppele(appel.expression);
      if (nom && EFFETS.test(nom)) return true;
    }
  }
  return false;
}

function relever(source: string, fichier: string): Releve {
  const racine = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const refus: string[] = [];
  let abonnementsAdmis = 0;

  const visiter = (noeud: ts.Node): void => {
    if (ts.isCallExpression(noeud) && nomAppele(noeud.expression) === 'watch') {
      const ligne = racine.getLineAndCharacterOfPosition(noeud.getStart()).line + 1;
      const texte = noeud.getText().replace(/\s+/g, ' ').slice(0, 80);
      const premier = noeud.arguments[0];
      const abonnement = premier !== undefined && (ts.isArrowFunction(premier) || ts.isFunctionExpression(premier));
      if (!abonnement) {
        refus.push(`ligne ${ligne} — lecture ${texte} : lire par useWatch({ control, name }), ou getValues hors rendu`);
      } else if (!dansUnEffet(noeud)) {
        refus.push(`ligne ${ligne} — abonnement ${texte} hors d'un effet : il ne serait jamais désabonné`);
      } else {
        abonnementsAdmis += 1;
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(racine);
  return { refus: [...refus, ...getValuesAuRendu(racine)], abonnementsAdmis };
}

/** Hooks qui exécutent leurs rappels PENDANT le rendu (le résultat est lu une fois, puis figé). */
const HOOKS_AU_RENDU = /^(?:useState|useMemo|useReducer|useSyncExternalStore)$/;
/** Méthodes de tableau qui exécutent leur rappel sur-le-champ : `lignes.map(() => …)` dans le JSX. */
const TABLEAU_SYNCHRONE =
  /^(?:map|flatMap|filter|reduce|reduceRight|some|every|find|findIndex|findLast|findLastIndex|forEach|sort|toSorted)$/;

const estComposantOuHook = (nom: string | undefined): nom is string =>
  Boolean(nom && /^(?:[A-Z]|use[A-Z])/.test(nom));

function fonctionEnglobante(noeud: ts.Node): ts.Node | undefined {
  let n: ts.Node | undefined = noeud.parent;
  while (n && !ts.isFunctionLike(n)) n = n.parent;
  return n;
}

/** Le nœud le plus haut qui n'ajoute que des parenthèses : `((() => …))` → la parenthèse externe. */
function sansParentheses(noeud: ts.Node): ts.Node {
  let n = noeud;
  while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent;
  return n;
}

/**
 * `expression` (une fonction, ou le nom d'une fonction) est-elle une PROP DE RENDU d'un élément
 * JSX ? Rend alors `la prop render de <Balise>` ou `l’enfant-fonction de <Balise>`, sinon `undefined`.
 *
 * Le composant qui la reçoit l'exécute pendant SON rendu — et le React Compiler met en cache
 * l'élément qui la porte sur l'identité de `form` : un `getValues` d'un autre champ y est figé
 * (mutation de TCK-571, reprise du 2026-09-24 : `<Controller name="notes" render={() =>
 * form.getValues('type') === 'sale' ? … : …} />` dans `CreateLeaseForm`, rouge sous compilation).
 */
function propDeRendu(expression: ts.Node): string | undefined {
  const conteneur = expression.parent;
  if (!conteneur || !ts.isJsxExpression(conteneur) || conteneur.expression !== expression) return undefined;
  const porteur = conteneur.parent;
  if (porteur && ts.isJsxAttribute(porteur) && porteur.name.getText() === 'render') {
    return `la prop render de <${porteur.parent.parent.tagName.getText()}>`;
  }
  if (porteur && ts.isJsxElement(porteur)) return `l’enfant-fonction de <${porteur.openingElement.tagName.getText()}>`;
  return undefined;
}

/** Le nom d'une fonction : `function Nom`, `const Nom = (…) =>`, `const Nom = memo(function …)`. */
function nomDeFonction(fonction: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(fonction) || ts.isFunctionExpression(fonction)) && fonction.name) {
    return fonction.name.text;
  }
  let parent = fonction.parent;
  while (parent && ts.isCallExpression(parent)) parent = parent.parent;
  return parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : undefined;
}

/** `appel` exécute-t-il ses rappels sur-le-champ ? Rend le nom de l'exécutant, sinon `undefined`. */
function executantImmediat(appel: ts.CallExpression): string | undefined {
  const nom = nomAppele(appel.expression);
  if (!nom) return undefined;
  if (HOOKS_AU_RENDU.test(nom)) return nom;
  // Une méthode de tableau s'appelle sur un objet : `x.map(…)`, jamais `map(…)` nu.
  return !ts.isIdentifier(appel.expression) && TABLEAU_SYNCHRONE.test(nom) ? `.${nom}` : undefined;
}

/**
 * Les `getValues(…)` exécutés PENDANT LE RENDU d'un composant ou d'un hook — voir l'en-tête pour
 * la règle et ses angles morts.
 */
function getValuesAuRendu(racine: ts.SourceFile): string[] {
  const trouvees: string[] = [];

  /** `conteneur` appelle-t-il `nom` dans son corps, ou le passe-t-il à un exécutant immédiat ? */
  const executeeAuRenduPar = (conteneur: ts.Node, nom: string): string | undefined => {
    let via: string | undefined;
    const parcourir = (n: ts.Node): void => {
      if (via) return;
      if (ts.isCallExpression(n) && fonctionEnglobante(n) === conteneur) {
        if (ts.isIdentifier(n.expression) && n.expression.text === nom) via = nom;
        const executant = executantImmediat(n);
        if (executant && n.arguments.some((a) => ts.isIdentifier(a) && a.text === nom)) via = `${nom} → ${executant}`;
      }
      // `<Controller render={rendreChamp} />` : la fonction nommée est une prop de rendu.
      if (ts.isIdentifier(n) && n.text === nom && fonctionEnglobante(n) === conteneur) {
        const prop = propDeRendu(n);
        if (prop) via = `${nom} → ${prop}`;
      }
      ts.forEachChild(n, parcourir);
    };
    parcourir(conteneur);
    return via;
  };

  const visiter = (noeud: ts.Node): void => {
    if (ts.isCallExpression(noeud) && nomAppele(noeud.expression) === 'getValues') {
      const ligne = racine.getLineAndCharacterOfPosition(noeud.getStart()).line + 1;
      const texte = noeud.getText().replace(/\s+/g, ' ').slice(0, 60);
      // Remonter les rappels exécutés sur-le-champ : ils sont jugés comme le corps qui les appelle.
      let englobante = fonctionEnglobante(noeud);
      const chemin: string[] = [];
      let prop: string | undefined;
      while (englobante) {
        const haut = sansParentheses(englobante);
        const appel = haut.parent;
        // IIFE : `(() => form.getValues('x'))()` s'exécute là où elle est écrite.
        if (appel && ts.isCallExpression(appel) && appel.expression === haut) {
          chemin.push('IIFE');
          englobante = fonctionEnglobante(appel);
          continue;
        }
        // Prop de rendu : exécutée au rendu de l'élément qui la reçoit, où qu'il soit écrit.
        prop = propDeRendu(haut);
        if (prop) break;
        if (!appel || !ts.isCallExpression(appel) || !appel.arguments.some((a) => a === haut)) break;
        const executant = executantImmediat(appel);
        if (!executant) break;
        chemin.push(executant);
        englobante = fonctionEnglobante(appel);
      }
      const nom = englobante ? nomDeFonction(englobante) : undefined;
      const par = chemin.length ? ` (${chemin.join(' ← ')})` : '';
      if (prop) {
        trouvees.push(`ligne ${ligne} — ${texte} lu dans ${prop}${par} : lire \`field.value\`, ou par useWatch`);
      } else if (estComposantOuHook(nom)) {
        trouvees.push(`ligne ${ligne} — ${texte} lu au rendu de ${nom}${par} : lire par useWatch`);
      } else if (englobante && nom && chemin.length === 0) {
        const conteneur = fonctionEnglobante(englobante);
        const nomConteneur = conteneur ? nomDeFonction(conteneur) : undefined;
        const via = conteneur && estComposantOuHook(nomConteneur) ? executeeAuRenduPar(conteneur, nom) : undefined;
        if (via) trouvees.push(`ligne ${ligne} — ${texte} lu au rendu de ${nomConteneur} (${via}) : lire par useWatch`);
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(racine);
  return trouvees;
}

describe('TCK-571 — aucune lecture `watch(…)` dans src/, le motif que le React Compiler fige', () => {
  const sources = sourcesDe(RACINE_SRC);
  const releves = sources.map((fichier) => ({
    fichier: nommer(fichier),
    ...relever(readFileSync(fichier, 'utf8'), fichier),
  }));

  it('inspecte réellement tout src/, les quatre formulaires de TCK-571 compris — une garde vide serait verte', () => {
    expect(sources.length).toBeGreaterThan(500);
    expect(releves.map((r) => r.fichier)).toEqual(
      expect.arrayContaining([
        'components/payments/CreatePayoutDialog.tsx',
        'components/payments/CreateInvoiceDialog.tsx',
        'components/leases/CreateLeaseForm.tsx',
        'components/admin-agency/AgencyConfigForm.tsx',
        'components/property-form/PropertyWizard.tsx',
      ]),
    );
  });

  it('la voie permise est exercée sur du vrai code : l’autosave de PropertyWizard s’abonne dans un effet', () => {
    const wizard = releves.find((r) => r.fichier === 'components/property-form/PropertyWizard.tsx');
    expect(wizard?.abonnementsAdmis).toBeGreaterThanOrEqual(1);
  });

  it('aucun fichier ne lit par `watch(…)` ni par `getValues(…)` au rendu, ni ne s’abonne hors d’un effet', () => {
    const fautifs = releves
      .filter((r) => r.refus.length > 0)
      .map((r) => `${r.fichier} : ${r.refus.join(' ; ')}`);
    expect(fautifs).toEqual([]);
  });

  it('attrape une réintroduction, sous toutes ses formes, et laisse passer l’abonnement dans un effet', () => {
    const coupable = `
      export function Recu({ form, methods, lignes }) {
        const a = form.watch('currency');
        const { watch } = form;
        const b = watch();
        const c = methods.watch(['x', 'y']);
        const d = lignes.map(() => form.watch('q'));
        const e = useMemo(() => form['watch']('t'), [form]);
        const surClic = () => form.watch('clic');
        form.watch((v) => console.log(v));
        useEffect(() => {
          const s = form.watch((v) => sauver(v));
          return () => s.unsubscribe();
        }, [form]);
        React.useLayoutEffect(() => { const s = watch(function (v) { sauver(v); }); return () => s.unsubscribe(); }, [watch]);
        const f = useWatch({ control: form.control, name: 'x' });
        // form.watch('commentaire') : un commentaire ne compte pas
        const g = 'form.watch("chaîne")';
        return <p onClick={() => form.watch('jsx')}>{a}{b}{c}{d}{e}{f}{g}</p>;
      }`;
    const { refus, abonnementsAdmis } = relever(coupable, 'sonde.tsx');
    expect(refus.map((r) => r.split(' — ')[0])).toEqual([
      'ligne 3',
      'ligne 5',
      'ligne 6',
      'ligne 7',
      'ligne 8',
      'ligne 9',
      'ligne 10',
      'ligne 19',
    ]);
    expect(refus[6]).toMatch(/abonnement .* hors d'un effet/);
    expect(abonnementsAdmis).toBe(2);
  });

  // Vérification de TCK-571 (repair-1) : la mutation `form.getValues('currency')` dans
  // `AgencyConfigForm` rougissait sous compilation et laissait CETTE garde verte.
  it('attrape `getValues(…)` exécuté pendant le rendu, et laisse passer la lecture au clic ou en effet', () => {
    const coupable = `
      export function Recu({ form, lignes }) {
        const a = (form.getValues('currency') || 'XOF').toUpperCase();
        const { getValues } = form;
        const b = getValues('x');
        const [c] = useState(() => form.getValues('y'));
        const d = React.useMemo(() => lignes.map((l) => form['getValues'](l)), [form, lignes]);
        const lire = () => getValues('z');
        const e = lire();
        function lireDevise() { return form.getValues('d'); }
        const f = useMemo(lireDevise, [form]);
        const surClic = () => form.getValues('clic');
        const rappel = useCallback(() => getValues('cb'), [getValues]);
        useEffect(() => { if (!form.getValues('n')) form.setValue('n', 1); }, [form]);
        const envoyer = form.handleSubmit(async () => { await api(form.getValues()); });
        const cellule = <Controller render={({ field }) => <i>{form.getValues('r')}</i>} />;
        return <p onClick={() => getValues('jsx')}>{a}{b}{c}{d}{e}{f}{lignes.filter(() => getValues('q')).length}</p>;
      }
      const Memo = memo(function ({ form }) { return <p>{form.getValues('m')}</p>; });
      function useDevise(form) { return form.getValues('h'); }
      function utilitaire(form) { return form.getValues('u'); }`;
    const { refus } = relever(coupable, 'sonde.tsx');
    expect(refus.map((r) => r.split(' — ')[0])).toEqual([
      'ligne 3',
      'ligne 5',
      'ligne 6',
      'ligne 7',
      'ligne 8',
      'ligne 10',
      'ligne 16',
      'ligne 17',
      'ligne 19',
      'ligne 20',
    ]);
    expect(refus[3]).toMatch(/\(\.map ← useMemo\)/);
    expect(refus[4]).toMatch(/\(lire\)/);
    expect(refus[5]).toMatch(/\(lireDevise → useMemo\)/);
    expect(refus[6]).toMatch(/lu dans la prop render de <Controller>/);
  });

  // Reprise du 2026-09-24 — deux angles morts MESURÉS : la garde restait verte, le test compilé
  // de `CreateLeaseForm` rougissait. (1) `<Controller name="notes" render={() =>
  // form.getValues('type') === 'sale' ? … : …} />` : le compilateur met l'élément en cache sur
  // `form`, le Controller ne se re-rend que sur SON champ, le `type` lu reste figé. (2)
  // `const type = (() => form.getValues('type'))();` : une IIFE s'exécute là où elle est écrite.
  it('attrape `getValues(…)` dans une prop de rendu et dans une IIFE, et laisse passer un gestionnaire qui y est écrit', () => {
    const coupable = `
      export function Bail({ form, lignes }) {
        const type = (() => form.getValues('type'))();
        const devise = (function () { return form.getValues('devise'); })();
        const champ = <Controller control={form.control} name="notes" render={() => form.getValues('type') === 'sale' ? <A /> : <B />} />;
        const propre = <Controller control={form.control} name="notes" render={({ field }) => <i>{field.value}</i>} />;
        const liste = <Controller name="l" render={({ field }) => <>{lignes.map((l) => form.getValues(l))}</>} />;
        const rendreChamp = ({ field }) => <i>{field.value}{getValues('x')}</i>;
        const nomme = <Controller name="x" render={rendreChamp} />;
        const enfant = <FormField name="f">{(field) => <i>{form.getValues('f')}</i>}</FormField>;
        const clic = <Controller name="c" render={({ field }) => <b onClick={() => field.onChange(form.getValues('c') + 1)} />} />;
        const plusTard = () => (() => form.getValues('tard'))();
        return <p onClick={() => (() => form.getValues('jsx'))()}>{type}{devise}{champ}{propre}{liste}{nomme}{enfant}{clic}</p>;
      }
      function horsComposant(form) { return <Controller name="h" render={() => form.getValues('h')} />; }`;
    const { refus } = relever(coupable, 'sonde.tsx');
    expect(refus.map((r) => r.split(' — ')[0])).toEqual([
      'ligne 3',
      'ligne 4',
      'ligne 5',
      'ligne 7',
      'ligne 8',
      'ligne 10',
      'ligne 15',
    ]);
    expect(refus[0]).toMatch(/lu au rendu de Bail \(IIFE\)/);
    expect(refus[1]).toMatch(/lu au rendu de Bail \(IIFE\)/);
    expect(refus[2]).toMatch(/lu dans la prop render de <Controller>/);
    expect(refus[3]).toMatch(/lu dans la prop render de <Controller> \(\.map\)/);
    expect(refus[4]).toMatch(/\(rendreChamp → la prop render de <Controller>\)/);
    expect(refus[5]).toMatch(/lu dans l’enfant-fonction de <FormField>/);
    expect(refus[6]).toMatch(/lu dans la prop render de <Controller>/);
  });
});
