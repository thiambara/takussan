import { BarreDAction, Button } from 'takussan';

export function OneAction() {
  return (
    <div className="flex h-56 max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="min-h-0 flex-1 p-4 text-sm text-muted-foreground">Contenu de la page de détail.</div>
      <BarreDAction>
        <Button>Enregistrer le bail</Button>
      </BarreDAction>
    </div>
  );
}

export function TwoActions() {
  return (
    <div className="flex h-56 max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="min-h-0 flex-1 p-4 text-sm text-muted-foreground">Demande de visite de Moussa Diop.</div>
      <BarreDAction zoneSure>
        <Button variant="outline">Refuser</Button>
        <Button>Accepter</Button>
      </BarreDAction>
    </div>
  );
}
