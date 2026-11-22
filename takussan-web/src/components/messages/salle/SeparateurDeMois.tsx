'use client';

import { useFormatteurs } from '@/lib/format/useFormatteurs';

/**
 * TCK-2963 (maquette `fil-salle-bail` A, `SeparateurDate`) — le séparateur d'un mois PASSÉ dans une salle :
 * « Septembre », avec l'année quand ce n'est pas l'année en cours (« Novembre 2025 »). Même filet que le
 * séparateur de jour (`MessageDateSeparator`).
 */
export function SeparateurDeMois({ date, maintenant }: { readonly date: Date; readonly maintenant: Date }) {
  const f = useFormatteurs();
  const memeAnnee = date.getFullYear() === maintenant.getFullYear();
  const brut = f.date(date, { dateStyle: undefined, month: 'long', ...(memeAnnee ? {} : { year: 'numeric' }) });
  const libelle = brut.charAt(0).toLocaleUpperCase(f.locale) + brut.slice(1);
  return (
    <li className="my-2 flex items-center gap-3 text-xs text-muted-foreground" role="separator" data-slot="separateur-de-mois">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      {libelle}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </li>
  );
}
