import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from 'takussan';

export function Metric() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Loyers encaissés</CardTitle>
        <CardDescription>Septembre, tous biens confondus</CardDescription>
        <CardAction><Badge variant="secondary">12 baux</Badge></CardAction>
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">4 250 000 F CFA</p>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">Mis à jour ce matin</CardFooter>
    </Card>
  );
}

export function SmallWithActions() {
  return (
    <Card size="sm" className="max-w-sm">
      <CardHeader>
        <CardTitle>Visite à confirmer</CardTitle>
        <CardDescription>Appartement F3 · Mermoz · samedi 10:30</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button size="sm">Confirmer la visite</Button>
        <Button size="sm" variant="outline">Proposer un créneau</Button>
      </CardContent>
    </Card>
  );
}
