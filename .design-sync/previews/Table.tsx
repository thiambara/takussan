import { Badge, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from 'takussan';

const tone = 'h-auto border-transparent py-0.5';
const rows = [
  { bien: 'Villa Almadies', locataire: 'Fatou Ndiaye', loyer: '1 200 000 F CFA', statut: <Badge variant="outline" className={`${tone} bg-success/10 text-success`}>Payé</Badge> },
  { bien: 'F3 Mermoz', locataire: 'Ibrahima Sarr', loyer: '450 000 F CFA', statut: <Badge variant="outline" className={`${tone} bg-warning/12 text-warning`}>En retard</Badge> },
  { bien: 'Studio Plateau', locataire: '—', loyer: '180 000 F CFA', statut: <Badge variant="outline" className={`${tone} bg-muted text-muted-foreground`}>Vacant</Badge> },
];

export function Leases() {
  return (
    <Table>
      <TableCaption>Baux en cours · septembre 2026</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Bien</TableHead>
          <TableHead>Locataire</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">Loyer / mois</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.bien}>
            <TableCell className="font-medium">{r.bien}</TableCell>
            <TableCell>{r.locataire}</TableCell>
            <TableCell>{r.statut}</TableCell>
            <TableCell className="text-right tabular-nums">{r.loyer}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total attendu</TableCell>
          <TableCell className="text-right tabular-nums">1 830 000 F CFA</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
