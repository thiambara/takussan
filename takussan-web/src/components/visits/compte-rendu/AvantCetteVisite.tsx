'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, CalendarClock, CalendarX, Inbox, Mail, MessageSquare, PhoneOutgoing, type LucideIcon } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

/** Les faits d'avant la visite : la demande (note `lead_message`), les gestes de contact, les jalons de visite. */
const TYPES_DE_L_AVANT = ['note', 'contact', 'visit'] as const;

/** Une seule page, assez large pour qu'un client actif ne perde pas ses faits d'avant la visite (plafond API : 100). */
const ENTREES_LUES = 50;

/**
 * Les faits ANTÉRIEURS à la visite, dans l'ordre du fil (l'API trie). La borne : le début prévu de la
 * visite. Une note n'en est que si c'est la demande reçue (`lead_message`) — le compte rendu, les
 * notes de l'agent n'y ont pas leur place.
 */
export function faitsAvantLaVisite(entrees: readonly EntreeDuFil[], visite: Pick<PropertyVisit, 'scheduled_at'>): EntreeDuFil[] {
  const borne = visite.scheduled_at ? new Date(visite.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
  return entrees.filter((e) => {
    if (!(new Date(e.at).getTime() < borne)) return false;
    if (e.type === 'note') return e.kind === 'lead_message';
    return e.type === 'contact' || e.type === 'visit';
  });
}

const CANAUX: Record<string, LucideIcon | typeof IconeWhatsApp> = { call: PhoneOutgoing, whatsapp: IconeWhatsApp, email: Mail, sms: MessageSquare };

const TONS = {
  neutre: 'bg-muted text-encre-douce',
  primaire: 'bg-secondary text-primary-deep',
  whatsapp: 'bg-success text-success-foreground',
} as const;

/**
 * TCK-2880 — « Avant cette visite » (maquette `app-fil-commercial` a-4/a-5, `FilAvantVisite`) : au
 * bureau, sous le visiteur, ce qui s'est passé avant — la demande reçue et son message, la réponse,
 * la visite demandée puis confirmée — datés. Une requête (`/timeline`, `filter[type]`) ; rien n'est
 * rendu tant qu'aucun fait antérieur n'est lu.
 */
export function AvantCetteVisite({ clientId, visite }: { readonly clientId: number; readonly visite: PropertyVisit }) {
  const t = useTranslations('compteRendu.avant');
  const tFil = useTranslations('crm.fiche.fil');
  const f = useFormatteurs();
  const lecture = useApiQuery<PaginatedResponse<EntreeDuFil>>(
    ['customer-timeline', clientId, 'avant-la-visite', visite.id],
    cheminApi`/api/customers/${clientId}/timeline`,
    { params: { filter: { type: [...TYPES_DE_L_AVANT] }, per_page: ENTREES_LUES } },
  );
  const faits = faitsAvantLaVisite(lecture.data?.data ?? [], visite);
  if (faits.length === 0) return null;

  const date = (at: string) => tFil('quand', { jour: f.jourMois(at), heure: f.heure(at) });
  const rendezVous = (at: string) => tFil('rendezVous', { jour: jourEnClair(jourADakar(new Date(at)), f.locale), heure: f.heure(at) });

  return (
    <section data-slot="avant-cette-visite" className="rounded-xl border border-border bg-card">
      <div className="flex min-h-12 items-center border-b border-border px-4 py-2">
        <h2 className="min-w-0 flex-1 text-corps font-semibold text-foreground">{t('titre')}</h2>
      </div>
      <ol className="p-4">
        {faits.map((e, i) => {
          const dernier = i === faits.length - 1;
          const cle = `${e.type}-${e.id}-${e.at}`;
          if (e.type === 'note') {
            return (
              <Ligne key={cle} icone={Inbox} titre={tFil('demande')} date={date(e.at)} dernier={dernier}>
                {/* La citation de la boîte des demandes (`CitationDuMessage`), recopiée : l'importer ferait
                    atteindre à la page des visites tout l'espace `contactLeads`. */}
                {e.body ? (
                  <figure className="rounded-xl border-l-3 border-primary/50 bg-secondary/60 px-3.5 py-2.5">
                    <blockquote className="text-sm leading-relaxed whitespace-pre-line text-pretty text-foreground">« {e.body} »</blockquote>
                  </figure>
                ) : null}
              </Ligne>
            );
          }
          if (e.type === 'contact') {
            const canal = e.channel && CANAUX[e.channel] ? e.channel : null;
            const libelle = canal ? tFil(`contact.${e.on === 'lead' ? 'demande' : 'fiche'}.${canal}`) : tFil('contact.inconnu');
            const titre = e.causer?.name ? t('parQui', { geste: libelle, nom: e.causer.name.split(/\s+/)[0] ?? e.causer.name }) : libelle;
            return <Ligne key={cle} icone={canal ? CANAUX[canal] : PhoneOutgoing} ton={canal === 'whatsapp' ? 'whatsapp' : 'neutre'} titre={titre} date={date(e.at)} dernier={dernier} />;
          }
          if (e.type === 'visit') {
            const quand = e.scheduled_at ? rendezVous(e.scheduled_at) : null;
            const titre =
              e.milestone === 'cancelled'
                ? tFil('visite.cancelled')
                : e.milestone === 'confirmed'
                  ? quand ? tFil('visite.confirmed', { quand }) : tFil('visite.confirmedSansHeure')
                  : quand ? tFil('visite.created', { quand }) : tFil('visite.createdSansHeure');
            const icone = e.milestone === 'cancelled' ? CalendarX : e.milestone === 'confirmed' ? CalendarCheck : CalendarClock;
            return <Ligne key={cle} icone={icone} ton={e.milestone === 'confirmed' ? 'primaire' : 'neutre'} titre={titre} date={date(e.at)} dernier={dernier} />;
          }
          return null;
        })}
      </ol>
    </section>
  );
}

/** Une ligne du fil (maquette `LigneFil`) : pastille de 32 px, trait, phrase, date, détail. */
function Ligne({
  icone: Icone,
  ton = 'neutre',
  titre,
  date,
  dernier,
  children,
}: {
  readonly icone: LucideIcon | typeof IconeWhatsApp;
  readonly ton?: keyof typeof TONS;
  readonly titre: string;
  readonly date: string;
  readonly dernier: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <li data-slot="fait-avant-la-visite" className={cn('relative flex gap-3', !dernier && 'pb-4')}>
      {dernier ? null : <span className="absolute top-8 bottom-0 left-[calc(var(--spacing)*3.75)] w-px bg-border" aria-hidden="true" />}
      <span className={cn('relative inline-flex size-8 flex-none items-center justify-center rounded-full', TONS[ton])} aria-hidden="true">
        <Icone className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-corps leading-snug text-foreground">{titre}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{date}</p>
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </li>
  );
}
