'use client';

import { useState, useTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { replacePropertyContactsAction } from '@/app/actions/property-contacts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';

import { ContactsSurPlace, type ContactSurPlace } from './ContactsSurPlace';
import { CONTACTS_DU_BIEN_QUERY_KEY, lireContactsDuBien } from './contacts-du-bien';

type Retour = { ok: boolean; message: string };

/**
 * TCK-633 (lot C, vérification adverse) — les contacts sur place d'une annonce EXISTANTE.
 *
 * L'assistant ne les pose qu'à la création ; ici, on lit ceux du bien (`GET …/contacts`), on en
 * ajoute, on les corrige ou on les retire avec le même éditeur ({@link ContactsSurPlace}, trois au
 * plus), puis on remplace la liste d'un bloc (`PUT …/contacts`). Rien ne part avant le clic
 * « Enregistrer » : une saisie en cours ne réécrit pas l'annonce à chaque frappe.
 */
export function ContactsSurPlaceDuBien({ propertyId }: { readonly propertyId: number }) {
  const t = useTranslations('property.contacts');
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = CONTACTS_DU_BIEN_QUERY_KEY.list(propertyId);
  const [brouillon, setBrouillon] = useState<ContactSurPlace[] | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();

  const query = useQuery<ContactSurPlace[], ApiError>({
    queryKey,
    queryFn: () => lireContactsDuBien(token ?? '', propertyId),
    enabled: !!token,
    retry: false,
  });

  // Un refus de lecture (le bien n'est pas de ceux que l'appelant modifie) ne s'affiche pas : la
  // page elle-même l'aurait déjà refusé. Toute AUTRE erreur (500, coupure) se dit, avec une
  // reprise : se taire laissait croire que l'annonce n'avait aucun contact sur place.
  if (query.isError) {
    const statut = query.error instanceof ApiError ? query.error.status : null;
    if (statut === 403 || statut === 404) return null;
    return (
      <section className="mt-6 flex flex-wrap items-center gap-3" data-testid="contacts-du-bien-erreur">
        <p role="alert" className="text-sm text-destructive">
          {t('loadFailed')}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {t('retry')}
        </Button>
      </section>
    );
  }
  if (query.data === undefined) return <Skeleton className="h-24 w-full" data-testid="contacts-du-bien-chargement" />;

  const valeur = brouillon ?? query.data;

  const enregistrer = () => {
    setRetour(null);
    const envoyes = valeur;
    demarrer(async () => {
      const r = await replacePropertyContactsAction(propertyId, envoyes);
      if (!r.ok) {
        setRetour({ ok: false, message: r.message });
        return;
      }
      queryClient.setQueryData(queryKey, envoyes);
      setBrouillon(null);
      setRetour({ ok: true, message: t('saved') });
    });
  };

  return (
    <section className="mt-6 space-y-3" data-testid="contacts-du-bien">
      <ContactsSurPlace
        valeur={valeur}
        onChange={(v) => {
          setRetour(null);
          setBrouillon(v);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={enregistrer} disabled={enCours || brouillon === null}>
          {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {t('save')}
        </Button>
        {retour ? (
          <p role={retour.ok ? 'status' : 'alert'} className={'text-xs ' + (retour.ok ? 'text-success' : 'text-destructive')}>
            {retour.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
