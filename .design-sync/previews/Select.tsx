import { Label, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from 'takussan';

const transactions = [
  { value: 'rent', label: 'Louer' },
  { value: 'sale', label: 'Acheter' },
  { value: 'short', label: 'Courte durée' },
];

export function Open() {
  return (
    <div className="grid max-w-xs gap-2">
      <Label>Transaction</Label>
      <Select defaultValue="rent" items={transactions} defaultOpen>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {transactions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const quartiers = [
  { value: 'mermoz', label: 'Mermoz' },
  { value: 'almadies', label: 'Almadies' },
  { value: 'plateau', label: 'Plateau' },
  { value: 'pikine', label: 'Pikine' },
];

export function ClosedSmall() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select defaultValue="almadies" items={quartiers}>
        <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Dakar</SelectLabel>
            {quartiers.slice(0, 3).map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Banlieue</SelectLabel>
            <SelectItem value="pikine">Pikine</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select defaultValue="mermoz" items={quartiers}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {quartiers.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
