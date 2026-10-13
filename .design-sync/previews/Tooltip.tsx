import { Button, Icons, Tooltip, TooltipContent, TooltipTrigger } from 'takussan';

export function SaveSearch() {
  return (
    <Tooltip defaultOpen>
      <TooltipTrigger render={<Button variant="outline" />}>
        <Icons.Plus />Sauvegarder
      </TooltipTrigger>
      <TooltipContent>
        Gardez ces critères dans votre espace pour relancer la recherche en un clic.
      </TooltipContent>
    </Tooltip>
  );
}
