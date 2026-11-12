import type { ReactNode } from 'react';

/**
 * Les initiales du locataire choisi, avec les jetons de l'avatar de la liste des clients
 * (`InitialesDuClient`, taille 44). Pas d'import de `customer-dashboard/liste/pieces` : ce module
 * lit `crm` et `agentCrm`, et la frontière `(dashboard)/app/leases` ne les transporte pas
 * (`check:i18n-namespaces`).
 */
export function InitialesDuLocataire({ texte }: { readonly texte: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-avatar-44 flex-none items-center justify-center rounded-full bg-fond-avatar text-avatar-44 font-semibold text-encre-avatar"
    >
      {texte}
    </span>
  );
}

/**
 * TCK-2643 — un choix fait, en une ligne (maquette `app-baux` a, `BureauACreation`) : la vignette du
 * bien ou les initiales du locataire, son nom, une ligne de détail, et « Changer », qui rend le
 * sélecteur. Le bien et le locataire préremplis ne se présentent plus en liste déroulante.
 */
export function LigneChoisie({
  visuel,
  titre,
  detail,
  libelleChanger,
  nomDuGeste,
  onChanger,
}: {
  readonly visuel: ReactNode;
  readonly titre: string;
  readonly detail: string | null;
  readonly libelleChanger: string;
  /** Le nom accessible du geste : « Changer le bien », « Changer le locataire ». */
  readonly nomDuGeste: string;
  readonly onChanger: () => void;
}) {
  return (
    <div data-slot="ligne-choisie" className="flex items-center gap-3 rounded-lg border border-border p-3">
      {visuel}
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm font-semibold">{titre}</p>
        {detail ? <p className="truncate text-ui tabular-nums text-muted-foreground">{detail}</p> : null}
      </div>
      <button
        type="button"
        aria-label={nomDuGeste}
        onClick={onChanger}
        className="plancher-tactile-10 flex-none rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
      >
        {libelleChanger}
      </button>
    </div>
  );
}
