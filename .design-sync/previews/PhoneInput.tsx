import { useState } from 'react';
import { Label, PhoneInput } from 'takussan';

export function Senegal() {
  const [value, setValue] = useState('+221780143710');
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="tel">Téléphone</Label>
      <PhoneInput id="tel" value={value} onValueChange={setValue} />
    </div>
  );
}

export function Empty() {
  const [value, setValue] = useState('');
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="tel-vide">Numéro Wave ou Orange Money</Label>
      <PhoneInput id="tel-vide" value={value} onValueChange={setValue} />
    </div>
  );
}

export function International() {
  const [value, setValue] = useState('+33612345678');
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="tel-intl">Téléphone (depuis l’étranger)</Label>
      <PhoneInput id="tel-intl" value={value} onValueChange={setValue} />
    </div>
  );
}
