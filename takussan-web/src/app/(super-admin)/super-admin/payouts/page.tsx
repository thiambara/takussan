import { AdminPayoutsClient } from '@/components/billing/AdminPayoutsClient';

export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Reversements plateforme</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clôture des périodes, approbation et marquage des virements vers les agences.
        </p>
      </header>
      <AdminPayoutsClient />
    </div>
  );
}
