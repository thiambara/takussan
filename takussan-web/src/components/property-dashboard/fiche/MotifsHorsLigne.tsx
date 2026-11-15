import { cn } from '@/lib/utils';

interface MotifsHorsLigneProps {
  /** Les phrases des motifs (`phrasesDesMotifs`), dans l'ordre de l'API ; rien n'est rendu sans motif. */
  readonly phrases: readonly string[];
  readonly className?: string;
}

/**
 * TCK-2678 (ADR-0097 § 5) — sous la pastille « Hors ligne » de la fiche, pourquoi : une phrase par
 * motif, du plus prioritaire au moins (« Privé — rendez-le public pour le mettre en ligne. »). Les
 * motifs sont ceux que l'API a jugés (`offline_reasons`), jamais recomposés ici.
 */
export function MotifsHorsLigne({ phrases, className }: MotifsHorsLigneProps) {
  if (phrases.length === 0) return null;
  return (
    // Des `span` à rôle de liste : la description de `PageHeader` est un `<p>`, où un `<ul>` est invalide.
    <span role="list" data-slot="motifs-hors-ligne" className={cn('block space-y-0.5 text-ui text-muted-foreground', className)}>
      {phrases.map((phrase) => (
        <span role="listitem" key={phrase} className="block">
          {phrase}
        </span>
      ))}
    </span>
  );
}
