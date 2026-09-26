import { Button, Icons, Popover, PopoverContent, PopoverTrigger } from 'takussan';

export function Filters() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="outline" />}>
        <Icons.Settings />Filtres
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="font-display font-semibold">Chambres</p>
            <p className="text-sm text-muted-foreground">Au moins deux chambres, meublé ou non.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">1+</Button>
            <Button size="sm">2+</Button>
            <Button size="sm" variant="outline">3+</Button>
            <Button size="sm" variant="outline">4+</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
