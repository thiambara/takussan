import { Button, PanneauDroit } from 'takussan';

export function MemberRecord() {
  return (
    <PanneauDroit
      defaultOpen
      titre="Fiche du membre"
      declencheur={<Button variant="outline">Ouvrir la fiche</Button>}
      pied={
        <>
          <Button variant="outline">Suspendre l’accès</Button>
          <Button>Déclarer une absence</Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
        <dt className="text-encre-douce">Rôle</dt>
        <dd>Agent</dd>
        <dt className="text-encre-douce">Téléphone</dt>
        <dd>77 123 45 67</dd>
        <dt className="text-encre-douce">Biens suivis</dt>
        <dd>12</dd>
      </dl>
    </PanneauDroit>
  );
}
