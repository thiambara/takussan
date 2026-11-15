'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, UserRound, Wrench, type LucideIcon } from 'lucide-react';

/**
 * TCK-2613 (AC5) — le panneau voisin de l'écran 1 au bureau large (maquette `app-entree-assistants` a, « Ton
 * numéro, étape commune », bureau) : « {agence} vous attend · Juste après votre code », puis ce que l'écran 2
 * montrera. AVANT le code, il ne montre rien que l'invité n'ait déjà vu (décision de team-lead, 2026-11-14) : le nom de
 * l'agence (écrit par l'écran du numéro), le rôle, et pour le prestataire le titre de l'intervention jointe — la page
 * d'invitation le lui montrait déjà (`awaiting.maintenance_request.title`, `PublicInvitationPreviewResource`). Les
 * pièces à envoyer de la maquette n'y sont pas : rien ne les lui montrait avant le code ; l'écran 2 les rappelle.
 * Les lignes ne présupposent rien : un bailleur sans bien, un agent sans prospect les lisent sans démenti à l'écran 2.
 * La maquette y écrit aussi le nombre de biens et le dernier loyer : les lire avant le code serait une lecture
 * de plus pour un panneau d'attente — l'écran 2 les montre.
 */
export type RoleDInvite = 'bailleur' | 'agent' | 'prestataire';

const ICONES: Readonly<Record<RoleDInvite, LucideIcon>> = { bailleur: Building2, agent: UserRound, prestataire: Wrench };

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join('');
}

export function CeQuiVousAttend({
  qui,
  agence,
  intervention = null,
}: {
  readonly qui: RoleDInvite;
  readonly agence: string | null;
  /** Le titre de l'intervention jointe à l'invitation (prestataire) ; `null` sinon. */
  readonly intervention?: string | null;
}) {
  const t = useTranslations('onboarding.invite.attente');
  const id = useId();
  const Icone = ICONES[qui];

  const lignes: readonly { readonly icone: LucideIcon; readonly titre: string; readonly texte: string }[] = [
    qui === 'prestataire'
      ? intervention
        ? { icone: Icone, titre: t('prestataire.titre'), texte: intervention }
        : { icone: Icone, titre: t('prestataire.titreSans'), texte: t('prestataire.texteSans') }
      : { icone: Icone, titre: t(`${qui}.titre`), texte: t(`${qui}.texte`) },
  ];

  return (
    <aside aria-labelledby={`${id}-titre`} className="rounded-3xl bg-secondary/60 p-7">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex size-11 flex-none items-center justify-center rounded-[0.625rem] bg-accent font-display text-sm font-semibold text-accent-foreground">
          {agence ? initiales(agence) : <Building2 className="size-5" strokeWidth={1.5} />}
        </span>
        <div className="min-w-0 leading-tight">
          <p id={`${id}-titre`} className="text-corps font-semibold">
            {agence ? t('titre', { agence }) : t('titreSans')}
          </p>
          <p className="text-ui text-muted-foreground">{t('sousTitre')}</p>
        </div>
      </div>
      <ul className="mt-6 space-y-4">
        {lignes.map((l) => (
          <li key={l.titre} className="flex items-start gap-3">
            <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-card text-primary-deep">
              <l.icone className="size-icone" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="leading-snug">
              <span className="block text-corps font-semibold">{l.titre}</span>
              <span className="block text-sm text-muted-foreground">{l.texte}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
