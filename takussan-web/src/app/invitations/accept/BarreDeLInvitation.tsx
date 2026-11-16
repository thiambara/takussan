'use client';

import { useState, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, MessageCircle, Phone } from 'lucide-react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useAuth } from '@/context/AuthContext';
import { initialesDe, nomCompletDe } from '@/lib/identite';
import { telephonePublie } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * TCK-2941 — ce que la barre de la page d'invitation porte à droite, à la place de « Retour au site »
 * (maquette `app-entree-invitation`, approche a) : « Aide » au téléphone et « Besoin d'aide ? » au bureau, qui
 * offrent d'appeler l'agence ou de lui écrire sur WhatsApp ; connecté (e3), le compte — ses initiales au
 * téléphone, son nom et ses initiales au bureau.
 *
 * ⚠ **La seule aide est le téléphone PUBLIC de l'agence** (aperçu, ADR-0094 § 1) : le site n'a aucune page d'aide
 * ni de contact (relevé du 2026-11-15), rien n'en est inventé. Sans téléphone public, `aideDeLAgence` rend
 * `null` et la barre garde « Retour au site ».
 *
 * ⚠ **Jamais le jeton dans un lien sortant** : `tel:` et `wa.me` ne portent que le numéro de l'agence et un texte
 * fixe — ni l'URL de la page, ni le jeton. `wa.me` s'ouvre en `noopener noreferrer` (le `Referrer-Policy:
 * no-referrer` de la page vaut déjà, ADR-0094 § 3).
 */

const DECLENCHEUR =
  'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';

const GESTE_DE_LA_FEUILLE =
  'flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 text-[0.9375rem] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** Les deux liens de l'aide : `tel:` en E.164 quand la saisie de l'agence s'y ramène, `wa.me` sur ses seuls chiffres. */
export function liensDAide(telephone: string, message: string): { readonly appel: string; readonly whatsapp: string } {
  const numero = telephonePublie(telephone);
  return {
    appel: `tel:${numero}`,
    whatsapp: `https://wa.me/${numero.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`,
  };
}

function AideAuTelephone({ agence, appel, whatsapp }: { readonly agence: string; readonly appel: string; readonly whatsapp: string }) {
  const t = useTranslations('invitationAccept.aide');
  const [ouverte, setOuverte] = useState(false);
  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={setOuverte}
      titre={t('titre')}
      declencheur={
        <button type="button" className={DECLENCHEUR}>
          {t('court')}
        </button>
      }
    >
      <p className="text-sm text-muted-foreground text-pretty">{t('texte', { agence })}</p>
      <div className="mt-4 flex flex-col gap-2.5">
        <a href={appel} className={GESTE_DE_LA_FEUILLE}>
          <Phone className="size-4 flex-none text-primary" aria-hidden="true" />
          {t('appeler', { agence })}
        </a>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={GESTE_DE_LA_FEUILLE}>
          <MessageCircle className="size-4 flex-none text-primary" aria-hidden="true" />
          {t('whatsapp', { agence })}
        </a>
      </div>
    </FeuilleDuBas>
  );
}

/** L'ancre que le menu rend pour chaque ligne (`render`) : base-ui lui passe son contenu et ses gestionnaires. */
function Ancre({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}

function AideAuBureau({ agence, appel, whatsapp }: { readonly agence: string; readonly appel: string; readonly whatsapp: string }) {
  const t = useTranslations('invitationAccept.aide');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={DECLENCHEUR}>
        {t('long')}
        <ChevronDown className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64">
        <DropdownMenuItem render={<Ancre href={appel} />} className="gap-2.5">
          <Phone className="size-4 flex-none text-primary" aria-hidden="true" />
          {t('appeler', { agence })}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Ancre href={whatsapp} target="_blank" rel="noopener noreferrer" />} className="gap-2.5">
          <MessageCircle className="size-4 flex-none text-primary" aria-hidden="true" />
          {t('whatsapp', { agence })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * « Aide » (téléphone) et « Besoin d'aide ? » (bureau), pour la barre de la coque (`DeclarerEntree aDroite`), ou
 * `null` sans téléphone public — la barre garde alors « Retour au site ».
 */
export function useAideDeLAgence(agence: { readonly nom: string; readonly telephone: string | null } | null) {
  const t = useTranslations('invitationAccept.aide');
  if (!agence?.telephone) return null;
  const { appel, whatsapp } = liensDAide(agence.telephone, t('messageWhatsApp', { agence: agence.nom }));
  return {
    telephone: <AideAuTelephone agence={agence.nom} appel={appel} whatsapp={whatsapp} />,
    bureau: <AideAuBureau agence={agence.nom} appel={appel} whatsapp={whatsapp} />,
  };
}

/** Les initiales du compte, en pastille de 32 px (maquette e3). */
function Pastille({ initiales, className }: { readonly initiales: string | null; readonly className?: string }) {
  return (
    <span aria-hidden="true" className={cn('inline-flex size-8 flex-none items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent', className)}>
      {initiales || '·'}
    </span>
  );
}

/**
 * Connecté (e3) : le compte à droite de la barre — ses initiales au téléphone (le nom en `sr-only`), son nom et
 * ses initiales au bureau. Tant que la session n'est pas relue (`user` encore nul), la place est gardée, vide :
 * ni « Aide » ni « Retour au site » ne clignotent avant elle.
 */
export function useCompteDeLaBarre() {
  const t = useTranslations('invitationAccept.connecte');
  const { user } = useAuth();
  if (!user) {
    const place = <span aria-hidden="true" className="inline-block size-8" />;
    return { telephone: place, bureau: place };
  }
  const nom = nomCompletDe(user) || user.email || '';
  const initiales = initialesDe(user);
  return {
    telephone: (
      <span data-compte-de-la-barre="" className="inline-flex items-center pr-1">
        <Pastille initiales={initiales} />
        <span className="sr-only">{t('barre', { nom })}</span>
      </span>
    ),
    bureau: (
      <span data-compte-de-la-barre="" className="inline-flex items-center gap-3 text-sm text-muted-foreground">
        <span className="max-w-[16rem] truncate">{nom}</span>
        <Pastille initiales={initiales} />
      </span>
    ),
  };
}
