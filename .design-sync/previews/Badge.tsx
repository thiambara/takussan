import { Badge } from 'takussan';

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>À louer</Badge>
      <Badge variant="secondary">Neuf</Badge>
      <Badge variant="outline">Meublé</Badge>
      <Badge variant="destructive">Suspendu</Badge>
      <Badge variant="ghost">Brouillon</Badge>
      <Badge variant="link">Voir le bail</Badge>
    </div>
  );
}

const tone = 'h-auto gap-1 border-transparent py-0.5';

export function StatusTones() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={`${tone} bg-success/10 text-success`}>Actif</Badge>
      <Badge variant="outline" className={`${tone} bg-warning/12 text-warning`}>En attente</Badge>
      <Badge variant="outline" className={`${tone} bg-destructive/10 text-destructive`}>Impayé</Badge>
      <Badge variant="outline" className={`${tone} bg-info/10 text-info`}>Loué</Badge>
      <Badge variant="outline" className={`${tone} bg-muted text-muted-foreground`}>Archivé</Badge>
    </div>
  );
}
