import { useState } from 'react';
import { Calendar } from 'takussan';

export function SingleDate() {
  const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 9, 15));
  return (
    <Calendar
      mode="single"
      selected={selected}
      onSelect={setSelected}
      defaultMonth={new Date(2026, 9, 1)}
      className="rounded-xl bg-card ring-1 ring-foreground/10"
    />
  );
}

export function WithUnavailableDays() {
  return (
    <Calendar
      mode="single"
      defaultMonth={new Date(2026, 10, 1)}
      disabled={[{ dayOfWeek: [0] }, new Date(2026, 10, 11), new Date(2026, 10, 12)]}
      className="rounded-xl bg-card ring-1 ring-foreground/10"
    />
  );
}
