import { Checkbox } from 'takussan';

export function SelectionRows() {
  return (
    <div className="max-w-sm divide-y divide-border rounded-xl border border-border bg-card">
      <label className="flex min-h-12 items-center gap-3 px-4 text-corps">
        <Checkbox indeterminate />
        Tout sélectionner
      </label>
      <label className="flex min-h-12 items-center gap-3 px-4 text-corps">
        <Checkbox defaultChecked />
        Moussa Diop
      </label>
      <label className="flex min-h-12 items-center gap-3 px-4 text-corps">
        <Checkbox />
        Awa Ndiaye
      </label>
      <label className="flex min-h-12 items-center gap-3 px-4 text-corps text-muted-foreground">
        <Checkbox disabled />
        Compte désactivé
      </label>
    </div>
  );
}
