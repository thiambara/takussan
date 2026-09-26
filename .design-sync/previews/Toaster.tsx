import { useEffect } from 'react';
import { Toaster, useToast } from 'takussan';

function Raise() {
  const toast = useToast();
  useEffect(() => {
    toast.add({ title: 'Annonce publiée', description: 'Elle est visible dans les résultats de recherche.', type: 'success', timeout: 0 });
    toast.add({ title: 'Brouillon enregistré', type: 'info', timeout: 0 });
  }, []);
  return null;
}

// `TakussanProvider` monte déjà `ToastProvider` : un seul `Toaster` suffit.
export function SuccessAndInfo() {
  return (
    <>
      <Raise />
      <Toaster />
    </>
  );
}
