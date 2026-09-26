import { Label, Textarea } from 'takussan';

export function Description() {
  return (
    <div className="grid max-w-md gap-2">
      <Label htmlFor="desc">Description du bien</Label>
      <Textarea
        id="desc"
        defaultValue="Appartement lumineux au 2e étage, deux chambres, cuisine équipée, à cinq minutes de la corniche."
      />
    </div>
  );
}

export function Invalid() {
  return (
    <div className="grid max-w-md gap-2">
      <Label htmlFor="msg">Message au propriétaire</Label>
      <Textarea id="msg" aria-invalid placeholder="Présentez-vous en quelques mots" />
      <p className="text-sm text-destructive">Écrivez au moins une phrase pour que le propriétaire puisse vous répondre.</p>
    </div>
  );
}
