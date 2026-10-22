import type { ReactNode } from 'react';

import type { ApiError } from '@/lib/api';

/**
 * Les pièces communes aux deux formulaires des demandes de droits (TCK-601 G) — sorties de
 * `PrivacyRequestsConsole.tsx` par TCK-1198 (P104.03), quand le formulaire de création est passé
 * dans son propre fichier, chargé à l'ouverture de son dialogue.
 */

/** La date du jour, au format `AAAA-MM-JJ` du navigateur. */
export function aujourdhui(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}`;
}

/**
 * Un champ de formulaire : son libellé, puis l'aide et l'erreur HORS du `<label>` — sinon elles
 * entrent dans le nom accessible du champ, que le lecteur d'écran relit à chaque focus. Elles lui
 * sont reliées par `aria-describedby` ({@link decritPar}).
 */
export function Champ({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function decritPar(id: string, avecAide: boolean, erreur: string | undefined): string | undefined {
  const ids = [avecAide ? `${id}-hint` : null, erreur ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/** Le message de validation d'un champ, depuis un 422 de Laravel. */
export function erreurDe(err: ApiError | null, champ: string): string | undefined {
  return err?.validationErrors?.[champ]?.[0];
}
