'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Le contrat de TRI, calqué sur la chaîne de tri spatie déjà en circulation.
 *
 * `value` est ce que l'URL porte (`-created_at`, `price`, …) et `onChange` reçoit la chaîne
 * suivante. C'est délibérément la forme du back plutôt qu'un couple `(colonne, direction)` :
 * les trois écrans qui trient aujourd'hui écrivent tous cette chaîne dans `?sort=`, et traduire
 * l'une vers l'autre à chaque bord aurait créé un troisième vocabulaire.
 */
interface DataTableSort {
  readonly value: string;
  readonly onChange: (next: string) => void;
}

interface DataTableColumn<Row> {
  /** Identifiant de colonne, unique dans la table. Sert de clé React. */
  readonly id: string;
  /** L'en-tête affiché. Déjà traduit — cf. le docblock d'`EmptyState`. */
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  /** `end` aligne à droite : c'est la colonne d'actions. */
  readonly align?: 'start' | 'end';
  /** Cache l'en-tête visuellement en le laissant aux lecteurs d'écran (colonne d'actions). */
  readonly headerSrOnly?: boolean;
  /**
   * Rend la colonne triable. La valeur est la clé de tri côté API (`price`, `created_at`) : le
   * composant compose lui-même `-clé` / `clé`.
   */
  readonly sortKey?: string;
  /** Libellé accessible du bouton de tri. Obligatoire dès que `sortKey` est posé. */
  readonly sortLabel?: string;
  /**
   * Largeur, troncature, alignement vertical — JAMAIS le padding, qui appartient à la densité.
   *
   * ⚠ Elle est posée sur le `<th>` **ET** sur les `<td>` de la colonne. C'est voulu — une largeur
   * qui ne vaudrait que pour le corps ne cadrerait rien — mais ça vaut aussi pour la typographie :
   * un `font-mono` ou un `text-destructive` écrit ici teinte l'en-tête. La mise en forme du
   * CONTENU se pose dans `cell`. Relevé pendant l'adoption par `/admin` (TCK-373) : deux en-têtes
   * passés en chasse fixe et un troisième en rouge, qu'aucun test ne voyait.
   */
  readonly className?: string;
}

interface DataTableProps<Row> {
  /**
   * Sujet de la table, rendu en `<caption class="sr-only">`. **Obligatoire** : une table sans
   * légende oblige un lecteur d'écran à deviner ce qu'il parcourt à partir de la première
   * cellule.
   */
  readonly caption: string;
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string | number;
  /** Attributs posés sur la ligne — `data-testid`, `className` d'état sélectionné, … */
  readonly rowProps?: (row: Row) => Record<string, unknown>;
  readonly sort?: DataTableSort;
  /**
   * Rendu DANS le `<tbody>` quand `rows` est vide, ce qui garde les en-têtes à l'écran. Passer un
   * `<EmptyState>` — cette primitive le compose, elle ne le remplace pas.
   */
  readonly emptyState?: ReactNode;
  readonly density?: 'default' | 'compact';
  /**
   * Épingle la ligne d'en-tête en haut de la zone de défilement.
   *
   * ⚠ **Ajouté par TCK-380 pour NE PAS perdre un comportement existant, pas pour en offrir un
   * neuf.** La table du tableau de bord des biens portait déjà `sticky top-0 z-10 bg-muted/70
   * backdrop-blur` sur son `<thead>` ; convertir sans cette option l'aurait retiré en silence, et
   * un `<table>` conservé « à titre exceptionnel » aurait rouvert exactement ce que cette
   * primitive ferme (TCK-380, contraintes strictes).
   *
   * L'opacité et le flou viennent AVEC : un en-tête épinglé sur un fond translucide laisse voir
   * les lignes défiler dessous, et c'est ce que l'écran rendait déjà.
   */
  readonly stickyHeader?: boolean;
  /** Classes du cadre extérieur (marges, `col-span`, …). */
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * L'UNIQUE table de la console.
 *
 * Elle existe pour une raison mesurée : au 2026-08-26, onze écrans super-admin rendaient onze
 * `<table>` faites à la main, avec **cinq échelles de padding de cellule** (`px-2/3/4` × `py-2/3`)
 * et `<th scope="col">` sur 15 en-têtes pour 11 tables. La densité et l'accessibilité ne sont
 * pas des conventions à recopier : elles sont décidées ici, une fois.
 *
 * ## Ce qu'elle décide, et que l'appelant ne peut plus défaire
 *
 * - **Une seule échelle de padding** par densité, posée sur `<th>` ET sur `<td>`. Le `className`
 *   d'une colonne sert à la largeur et à la troncature ; un padding qu'on y écrirait serait
 *   fusionné par `twMerge` et rouvrirait exactement l'écart que cette primitive ferme.
 * - **`scope="col"` sur chaque en-tête** et **`<caption>` sr-only** sur chaque table.
 * - **Le défilement horizontal est encapsulé** : `<Table>` porte son propre conteneur
 *   `overflow-x-auto`, et le cadre extérieur est en `overflow-hidden`. La PAGE ne défile jamais
 *   à cause d'une table.
 *
 * ## Ce qu'elle ne fait pas
 *
 * Elle ne traduit rien et ne parle à aucune API. `header`, `caption` et `sortLabel` arrivent
 * déjà traduits, pour la même raison qu'`EmptyState` : deux des surfaces qui la consomment sont
 * rendues depuis des server components, et un `useTranslations` ici en ferait une frontière
 * client.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowProps,
  sort,
  emptyState,
  density = 'default',
  stickyHeader = false,
  className,
  'data-testid': dataTestId,
}: DataTableProps<Row>) {
  // La densité, en un seul endroit. `py` diffère entre les deux, `px` jamais : une table compacte
  // reste alignée sur les autres colonne par colonne.
  const cellPadding = density === 'compact' ? 'px-3 py-1.5' : 'px-3 py-2.5';

  return (
    <div
      className={cn('overflow-hidden rounded-xl bg-card ring-1 ring-border', className)}
      data-testid={dataTestId}
    >
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader
          className={cn(
            'bg-muted/60',
            stickyHeader && 'sticky top-0 z-10 bg-muted/70 backdrop-blur',
          )}
        >
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <DataTableHeaderCell
                key={column.id}
                column={column}
                sort={sort}
                padding={cellPadding}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} {...(rowProps?.(row) ?? {})}>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    cellPadding,
                    'align-top whitespace-normal',
                    column.align === 'end' && 'text-right',
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 && emptyState ? (
            <TableRow className="hover:bg-transparent">
              {/* `p-0` est délibéré : l'état vide apporte son propre cadre et son propre padding. */}
              <TableCell colSpan={columns.length} className="p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function DataTableHeaderCell<Row>({
  column,
  sort,
  padding,
}: {
  readonly column: DataTableColumn<Row>;
  readonly sort?: DataTableSort;
  readonly padding: string;
}) {
  const sortable = Boolean(column.sortKey && sort);
  const descending = sortable && sort!.value === `-${column.sortKey}`;
  const ascending = sortable && sort!.value === column.sortKey;
  const Icon = descending ? ArrowDown : ascending ? ArrowUp : ArrowUpDown;

  return (
    <TableHead
      scope="col"
      // `aria-sort` n'a de sens que sur une colonne triable : le poser à `none` partout
      // annoncerait une table entièrement triable, ce qu'aucune de ces tables n'est.
      aria-sort={sortable ? (descending ? 'descending' : ascending ? 'ascending' : 'none') : undefined}
      className={cn(
        padding,
        'h-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        column.align === 'end' && 'text-right',
        column.className,
      )}
    >
      {column.headerSrOnly ? (
        <span className="sr-only">{column.header}</span>
      ) : sortable ? (
        <button
          type="button"
          onClick={() => sort!.onChange(descending ? column.sortKey! : `-${column.sortKey}`)}
          // TCK-371 — l'en-tête de tri est un bouton ÉCRIT À LA MAIN : il n'hérite pas de
          // l'anneau de la primitive `Button`. Jeton `--ring` PLEIN, jamais `ring-ring/50`
          // (l'idiome de `Button`), qui mesure 2,12:1 sur `--card` — sous les 3:1 de
          // WCAG 1.4.11. Mesuré à pleine opacité sur les trois fonds possibles de cette
          // primitive partagée (console agence, console super-admin et `/app` la montent) :
          //   clair  — `--card` #ffffff 5,32:1 · `--background` #fcf9f3 5,06:1
          //            `bg-muted/60` sur `--card` (#f7f4ec, le fond RÉEL de cet en-tête) 4,82:1
          //   sombre — `--card` #2a2018 4,83:1 · `--background` #1f1812 5,31:1
          //            `bg-muted/60` sur `--card` (#34281f) 4,32:1
          className="inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={column.sortLabel}
        >
          {column.header}
          <Icon className="size-3" aria-hidden="true" />
        </button>
      ) : (
        column.header
      )}
    </TableHead>
  );
}

export type { DataTableColumn, DataTableProps, DataTableSort };
