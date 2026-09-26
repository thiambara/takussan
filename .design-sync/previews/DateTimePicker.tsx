import { useState } from 'react';
import { DateTimePicker, Label } from 'takussan';

export function VisitSlot() {
  const [value, setValue] = useState('2026-10-15T10:30');
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="visite">Créneau de visite</Label>
      <DateTimePicker id="visite" value={value} onValueChange={setValue} />
    </div>
  );
}

export function Empty() {
  const [value, setValue] = useState('');
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="rdv">Rendez-vous de remise des clés</Label>
      <DateTimePicker id="rdv" value={value} onValueChange={setValue} />
    </div>
  );
}
