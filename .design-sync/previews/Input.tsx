import { Input, Label } from 'takussan';

export function WithLabel() {
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="quartier">Quartier</Label>
      <Input id="quartier" placeholder="Mermoz, Almadies…" />
    </div>
  );
}

export function Invalid() {
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="loyer">Loyer mensuel (F CFA)</Label>
      <Input id="loyer" inputMode="numeric" defaultValue="45 0000" aria-invalid aria-describedby="loyer-err" />
      <p id="loyer-err" className="text-sm text-destructive">Saisissez un montant en chiffres, par exemple 450 000.</p>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="ref">Référence du bien</Label>
      <Input id="ref" defaultValue="TK-2026-0412" disabled />
    </div>
  );
}
