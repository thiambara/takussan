import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'takussan';

export function DestructiveConfirmation() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger render={<Button variant="destructive" />}>Suspendre l’annonce</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspendre cette annonce ?</DialogTitle>
          <DialogDescription>
            Elle disparaît des résultats de recherche jusqu’à sa réactivation. Les visites déjà
            planifiées sont conservées.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button variant="destructive">Suspendre l’annonce</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
