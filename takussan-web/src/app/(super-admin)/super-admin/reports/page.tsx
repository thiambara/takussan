import { ReportingShell } from '@/components/reporting/ReportingShell';

export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Reporting plateforme</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Croissance, MRR/ARR, cohortes de rétention agences et funnel de conversion. Lecture seule super-admin.
        </p>
      </header>
      <ReportingShell />
    </div>
  );
}
