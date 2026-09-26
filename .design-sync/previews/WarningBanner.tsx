import { Icons, WarningBanner } from 'takussan';

export function LeaseEnding() {
  return (
    <WarningBanner icon={<Icons.TriangleAlert className="size-4" />}>
      Ce bail arrive à échéance dans 30 jours. Proposez un renouvellement au locataire.
    </WarningBanner>
  );
}

export function AfterAction() {
  return (
    <WarningBanner role="alert" icon={<Icons.Info className="size-4" />}>
      Photos enregistrées, mais deux sont floues : l’annonce sera moins visible.
    </WarningBanner>
  );
}
