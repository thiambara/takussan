import { ChevronLeft, ChevronRight } from 'lucide-react';

import { LienLocalise } from '@/components/shared/LienLocalise';

type Props = {
  readonly base: string;
  /** Les paramètres COURANTS, `page` comprise — la pagination réécrit `page` et garde le reste. */
  readonly params: URLSearchParams;
  readonly page: number;
  readonly dernierePage: number;
  readonly libelles: {
    readonly navAria: string;
    readonly precedent: string;
    readonly suivant: string;
    readonly position: (page: number, total: number) => string;
  };
};

/**
 * La pagination des index de profils — TCK-436.
 *
 * De vrais `<a>` et non des boutons : ces pages sont rendues côté serveur, chaque page EST un
 * document. Un explorateur les suit, le visiteur peut les ouvrir dans un onglet, et le retour
 * arrière fonctionne sans état client. C'est aussi ce qui rend la règle de canonique de
 * `src/lib/canonique-profils.ts` nécessaire : ces URL existent réellement.
 *
 * ⚠ Les paramètres de filtre sont CONSERVÉS d'une page à l'autre. Les perdre renverrait le
 * visiteur au catalogue complet à son premier clic sur « suivant ».
 */
export function ProfilePagination({ base, params, page, dernierePage, libelles }: Props) {
  if (dernierePage <= 1) return null;

  function href(cible: number): string {
    const prochains = new URLSearchParams(params.toString());
    if (cible <= 1) prochains.delete('page');
    else prochains.set('page', String(cible));
    const chaine = prochains.toString();
    return chaine === '' ? base : `${base}?${chaine}`;
  }

  const classe =
    'inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-2 text-sm ' +
    'text-foreground transition-colors hover:border-primary/40';

  return (
    <nav aria-label={libelles.navAria} className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <LienLocalise href={href(page - 1)} rel="prev" className={classe}>
          <ChevronLeft className="size-4" aria-hidden />
          {libelles.precedent}
        </LienLocalise>
      ) : (
        <span />
      )}

      <p className="text-sm tabular-nums text-muted-foreground">
        {libelles.position(page, dernierePage)}
      </p>

      {page < dernierePage ? (
        <LienLocalise href={href(page + 1)} rel="next" className={classe}>
          {libelles.suivant}
          <ChevronRight className="size-4" aria-hidden />
        </LienLocalise>
      ) : (
        <span />
      )}
    </nav>
  );
}
