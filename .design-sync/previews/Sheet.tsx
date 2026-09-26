import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from 'takussan';

const quartiers = [
  { value: 'tous', label: 'Tous les quartiers' },
  { value: 'mermoz', label: 'Mermoz' },
  { value: 'almadies', label: 'Almadies' },
];

export function FiltersRight() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger render={<Button variant="outline" />}>Affiner la recherche</SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Affiner la recherche</SheetTitle>
          <SheetDescription>Les filtres s’appliquent dès que vous les choisissez.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label>Quartier</Label>
            <Select defaultValue="tous" items={quartiers}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {quartiers.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <Button>Voir 128 biens</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
