import { Button, Icons } from 'takussan';

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Publier un bien</Button>
      <Button variant="secondary">Enregistrer le brouillon</Button>
      <Button variant="outline">Voir la carte</Button>
      <Button variant="ghost">Annuler</Button>
      <Button variant="destructive">Suspendre</Button>
      <Button variant="link">Tout voir</Button>
    </div>
  );
}

export function SizesWithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg"><Icons.Search />Rechercher</Button>
      <Button><Icons.Plus />Ajouter un bien</Button>
      <Button size="sm" variant="outline"><Icons.MapPin />Voir sur la carte</Button>
      <Button size="xs" variant="secondary">Filtrer</Button>
      <Button size="icon" variant="outline" aria-label="Plus d’actions"><Icons.MoreHorizontal /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="Paramètres"><Icons.Settings /></Button>
    </div>
  );
}

export function States() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Indisponible</Button>
      <Button disabled><Icons.Loader2 className="animate-spin" />Publication…</Button>
      <Button variant="outline" disabled>Voir la carte</Button>
    </div>
  );
}
