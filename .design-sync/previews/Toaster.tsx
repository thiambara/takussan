import { useEffect } from 'react';
import { ActionDuToast, Icons, Toaster, useToast } from 'takussan';

function Raise() {
  const toast = useToast();
  useEffect(() => {
    toast.add({
      title: 'Demande traitée.',
      type: 'success',
      timeout: 0,
      data: {
        action: (
          <ActionDuToast>
            <Icons.Undo2 />
            Annuler
          </ActionDuToast>
        ),
      },
    });
    toast.add({ title: 'Échec de l’envoi', description: 'Vérifiez votre connexion.', type: 'error', timeout: 0 });
  }, []);
  return null;
}

// `TakussanProvider` monte déjà `ToastProvider` : un seul `Toaster` suffit.
export function SuccessWithUndoAndError() {
  return (
    <>
      <Raise />
      <Toaster />
    </>
  );
}
