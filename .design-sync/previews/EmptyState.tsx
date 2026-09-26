import { Button, EmptyState, Icons } from 'takussan';

export function WithAction() {
  return (
    <EmptyState
      icon={<Icons.Home className="size-8" />}
      title="Aucun bien pour l’instant"
      description="Ajoutez votre premier bien : il sera visible dès sa validation."
      action={<Button><Icons.Plus />Ajouter un bien</Button>}
    />
  );
}

export function PublicSearch() {
  return (
    <EmptyState
      icon={<Icons.Search className="size-8" />}
      title="Rien ne correspond encore à ta recherche"
      description="Élargis le quartier ou le budget : de nouveaux biens sont publiés chaque jour à Dakar."
      action={<Button variant="outline">Modifier les filtres</Button>}
    />
  );
}

export function WithoutIcon() {
  return (
    <EmptyState
      title="Aucune visite planifiée"
      description="Les demandes de visite de vos locataires apparaîtront ici."
    />
  );
}
