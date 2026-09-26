import { Input, Label } from 'takussan';

export function WithField() {
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="email">Adresse e-mail</Label>
      <Input id="email" type="email" placeholder="awa.diop@exemple.sn" />
    </div>
  );
}

export function WithCheckbox() {
  return (
    <div className="flex items-center gap-3">
      <input id="meuble" type="checkbox" defaultChecked className="size-4 accent-primary" />
      <Label htmlFor="meuble">Afficher uniquement les biens meublés</Label>
    </div>
  );
}
