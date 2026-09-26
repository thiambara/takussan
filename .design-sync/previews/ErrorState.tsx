import { ErrorState, Icons } from 'takussan';

export function WithRetry() {
  return (
    <ErrorState
      message="Impossible de charger vos baux. La connexion a été interrompue."
      onRetry={() => {}}
      retryLabel="Réessayer"
    />
  );
}

export function MessageOnly() {
  return (
    <ErrorState
      icon={<Icons.TriangleAlert className="size-4" />}
      message="Cette annonce n’est plus disponible : le propriétaire l’a retirée."
    />
  );
}
