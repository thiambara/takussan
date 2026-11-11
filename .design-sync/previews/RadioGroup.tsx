import { Radio, RadioGroup } from 'takussan';

export function RentPeriod() {
  return (
    <RadioGroup defaultValue="mois" aria-label="Périodicité du loyer" className="max-w-sm">
      <label className="flex min-h-11 items-center gap-3 text-corps">
        <Radio value="mois" />
        Mensuel
      </label>
      <label className="flex min-h-11 items-center gap-3 text-corps">
        <Radio value="trimestre" />
        Trimestriel
      </label>
      <label className="flex min-h-11 items-center gap-3 text-corps">
        <Radio value="an" />
        Annuel
      </label>
    </RadioGroup>
  );
}
