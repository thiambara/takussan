import { Avatar, AvatarFallback, Badge, IconeDeLigne, Icons, LigneDeListe, MontantDeLigne } from 'takussan';

export function Rows() {
  return (
    <div className="max-w-sm border-t border-border bg-card">
      <LigneDeListe
        href="#"
        debut={
          <Avatar size="40">
            <AvatarFallback>AN</AvatarFallback>
          </Avatar>
        }
        titre="Awa Ndiaye"
        detail="Appartement F3 · Sacré-Cœur"
        fin={<Badge variant="secondary">Payé</Badge>}
      />
      <LigneDeListe
        href="#"
        debut={
          <IconeDeLigne>
            <Icons.Building2 />
          </IconeDeLigne>
        }
        titre="Quittance d’octobre"
        detail="Envoyée le 4 nov."
        fin={<MontantDeLigne>1 355 000 F</MontantDeLigne>}
      />
      <LigneDeListe href="#" titre="Fuite sous l’évier" detail="Signalée il y a 2 jours" chevron />
    </div>
  );
}
