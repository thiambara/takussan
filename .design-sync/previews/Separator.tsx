import { Separator } from 'takussan';

export function HorizontalAndVertical() {
  return (
    <div className="flex max-w-md flex-col gap-3 text-sm">
      <p className="font-medium">Appartement F4 · Sacré-Cœur</p>
      <Separator />
      <div className="flex h-5 items-center gap-3 text-muted-foreground">
        <span>120 m²</span>
        <Separator orientation="vertical" />
        <span>3 chambres</span>
        <Separator orientation="vertical" />
        <span>Meublé</span>
        <Separator orientation="vertical" />
        <span>Parking</span>
      </div>
    </div>
  );
}
