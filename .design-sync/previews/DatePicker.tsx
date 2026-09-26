import { useState } from 'react';
import { DatePicker, Label } from 'takussan';

export function WithValue() {
  const [value, setValue] = useState('2026-10-15');
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="entree">Date d’entrée</Label>
      <DatePicker id="entree" value={value} onValueChange={setValue} min="2026-09-26" />
    </div>
  );
}

export function Empty() {
  const [value, setValue] = useState('');
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="sortie">Date de sortie</Label>
      <DatePicker id="sortie" value={value} onValueChange={setValue} />
    </div>
  );
}

export function Invalid() {
  const [value, setValue] = useState('2026-09-01');
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="debut">Début du bail</Label>
      <DatePicker id="debut" value={value} onValueChange={setValue} aria-invalid aria-describedby="debut-err" />
      <p id="debut-err" className="text-sm text-destructive">Choisissez une date à partir d’aujourd’hui.</p>
    </div>
  );
}
