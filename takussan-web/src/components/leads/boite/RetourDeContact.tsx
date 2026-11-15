'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Phone } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ageDeLaDemande, prenomDuDemandeur } from '@/lib/demandes/boite';
import { type CanalDeContact, type ContactLead, useEnregistrerContact, useHandleLead } from '@/lib/queries/contact-leads';
import { cn } from '@/lib/utils';

import { useTexteDeLAge } from './pieces';

/** Un geste de contact touché : la demande, le canal, l'instant. */
export interface ContactEnCours {
  readonly lead: ContactLead;
  readonly canal: CanalDeContact;
  readonly le: number;
}

/**
 * TCK-2584 (décision 3b) — après WhatsApp ou Appeler, la boîte demande au retour si l'agent a
 * répondu. Le geste est d'abord ENREGISTRÉ (`POST …/contacts`, TCK-2583), sans retenir le lien qui
 * s'ouvre ; puis, quand l'onglet redevient visible (`visibilitychange`), la barre « Vous avez
 * répondu à … ? » paraît. L'état vit au niveau de la boîte : la ligne touchée peut être relue,
 * changer de vue ou disparaître de la page pendant que l'agent est dans WhatsApp.
 *
 * Un e-mail est enregistré, sans barre : on ne revient pas d'un client de messagerie comme d'un appel.
 */
export function useRetourDeContact() {
  const enregistrer = useEnregistrerContact();
  const [enCours, setEnCours] = useState<ContactEnCours | null>(null);
  const [retour, setRetour] = useState<ContactEnCours | null>(null);

  useEffect(() => {
    if (!enCours) return;
    const surVisibilite = () => {
      if (document.visibilityState !== 'visible') return;
      setRetour(enCours);
      setEnCours(null);
    };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => document.removeEventListener('visibilitychange', surVisibilite);
  }, [enCours]);

  const signaler = (lead: ContactLead, canal: CanalDeContact) => {
    // Le lien s'ouvre de lui-même : l'enregistrement part à côté, un échec ne retient rien.
    enregistrer.mutate({ id: lead.id, channel: canal }, { onError: () => undefined });
    if (canal === 'email' || lead.handled_at) return;
    setRetour(null);
    setEnCours({ lead, canal, le: Date.now() });
  };

  return { signaler, retour, fermer: () => setRetour(null) };
}

/**
 * La barre du retour. Téléphone (`app-demandes` a-2) : la question, puis « Oui, c'est traité » et
 * « Pas encore » à 1,4 / 1. Bureau (a-2, panneau de droite) : une ligne, l'âge du geste, les deux
 * boutons à droite. « Oui » marque la demande traitée ; « Pas encore » la laisse dans « À traiter ».
 */
export function BarreDeRetour({
  retour,
  regime,
  maintenant,
  onFermer,
}: {
  readonly retour: ContactEnCours;
  readonly regime: 'telephone' | 'bureau';
  readonly maintenant: Date;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('contactLeads');
  const texteDAge = useTexteDeLAge();
  const toast = useToast();
  const handle = useHandleLead();
  const prenom = prenomDuDemandeur(retour.lead.name) ?? t('anonymous');
  const Icone = retour.canal === 'whatsapp' ? IconeWhatsApp : Phone;
  const ilYA = texteDAge(ageDeLaDemande(new Date(retour.le).toISOString(), maintenant));

  async function oui() {
    try {
      await handle.mutateAsync({ id: retour.lead.id });
      toast.add({ title: t('toasts.handledShort'), type: 'success' });
      onFermer();
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  const question = t('return.question', { name: prenom });
  // Téléphone : les boutons des gestes de la ligne (44 px, 15 px semi-gras, rayon 14, `gap-2`).
  const auPouce = regime === 'telephone' ? 'w-full gap-2 rounded-xl text-corps font-semibold' : undefined;
  const boutonOui = (
    <Button variant="sombre" onClick={() => void oui()} disabled={handle.isPending} className={cn(auPouce, 'border-0')}>
      <Check className={regime === 'telephone' ? 'size-icone' : 'size-4'} strokeWidth={1.75} aria-hidden="true" />
      {t('return.yes')}
    </Button>
  );
  const boutonNon = (
    <Button variant="outline" onClick={onFermer} className={auPouce}>
      {t('return.notYet')}
    </Button>
  );

  if (regime === 'telephone') {
    return (
      <div data-slot="barre-de-retour" role="region" aria-label={question} className="w-full">
        <p className="flex items-center gap-2 text-corps font-semibold">
          <Icone className={cn('size-icone', retour.canal === 'whatsapp' ? 'text-success' : 'text-muted-foreground')} />
          {question}
        </p>
        <div className="mt-2.5 grid grid-cols-[1.4fr_1fr] gap-2">
          {boutonOui}
          {boutonNon}
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="barre-de-retour"
      role="region"
      aria-label={question}
      className="flex flex-none items-center gap-3 border-t border-border bg-card px-6 py-3 shadow-barre-collante"
    >
      <Icone className={cn('size-5', retour.canal === 'whatsapp' ? 'text-success' : 'text-muted-foreground')} />
      <p className="min-w-0 flex-1 text-corps font-semibold">
        {question}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {retour.canal === 'whatsapp' ? t('return.whatsapp', { age: ilYA }) : t('return.call', { age: ilYA })}
        </span>
      </p>
      {boutonNon}
      {boutonOui}
    </div>
  );
}
