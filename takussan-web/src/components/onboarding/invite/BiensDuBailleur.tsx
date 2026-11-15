'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Building2, ChevronRight, CircleDashed, Clock, Hash, IdCard, Landmark, Loader2, Plus, type LucideIcon } from 'lucide-react';

import { BOUTON_D_ENTREE, BoutonCollant } from '@/components/auth/BoutonCollant';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { getOwnerPropertiesAction } from '@/app/actions/owner-onboarding';
import type { Locale } from '@/i18n/config';
import { formatCurrency } from '@/lib/format';
import type { InterlocuteurDuBailleur, OwnerPropertyEntry } from '@/lib/owner-onboarding';
import { aDonner, type PieceDuProfil } from '@/lib/pieces/pieces';
import { cn } from '@/lib/utils';

import { CarteDeLInterlocuteur } from './CarteDeLInterlocuteur';
import { NumeroVerifie, TitreDInvite } from './pieces';

/**
 * TCK-2613 — l'écran 2 du bailleur invité : « Vos biens chez {agence} » (maquette `app-entree-assistants`,
 * approche a, « Bailleur : tes biens »). La raison de venir d'abord ; les pièces ne bloquent rien : elles sont
 * rappelées (le reste à envoyer, lu de `GET /api/me/pieces`) et attendent dans l'espace, sous « Démarrer ».
 *
 * ⚠ **Chaque sortie finalise d'abord.** Le profil est encore `draft` : « Voir tous mes biens », une ligne,
 * « Proposer un bien » et « Aller à mon espace » passent tous par `onAller(href)`, qui appelle la fin de
 * l'onboarding (`POST /api/owner/onboard/complete`, le profil actif) avant de naviguer — sans quoi `/app` ne
 * saurait pas encore qui arrive.
 */
interface BiensDuBailleurProps {
  readonly ownerProfileId: number;
  readonly agence: string | null;
  readonly telephone: string | null;
  /** Les pièces du profil (`GET /api/me/pieces`) ; `null` si la lecture a échoué — aucun rappel alors. */
  readonly pieces: readonly PieceDuProfil[] | null;
  /** TCK-2838 — l'interlocuteur à l'agence, au-dessus d'« À faire pour être payé » dès `xl` ; `null` : aucune carte. */
  readonly interlocuteur?: InterlocuteurDuBailleur | null;
  readonly onAller: (href: string) => void;
  /** La fin de l'onboarding est en vol : les gestes attendent. */
  readonly enCours: boolean;
}

type Ton = 'succes' | 'info' | 'attention' | 'neutre';

const TON_DE_L_ETAT: Readonly<Record<string, Ton>> = {
  rented: 'succes',
  available: 'info',
  published: 'info',
  under_maintenance: 'attention',
  unavailable: 'attention',
  pending: 'attention',
  pending_review: 'attention',
};

const ETATS_CONNUS = new Set([
  'available',
  'rented',
  'sold',
  'pending',
  'draft',
  'under_maintenance',
  'unavailable',
  'archived',
  'published',
  'pending_review',
  'rejected',
]);

const ICONES_DE_PIECE: Readonly<Record<string, LucideIcon>> = { rib: Landmark, cni: IdCard, ninea: Hash };
/** L'ordre de la maquette : le RIB d'abord (sans lui, rien n'est reversé). */
const ORDRE_DES_PIECES = ['rib', 'cni', 'ninea'] as const;

function Statut({ ton, children }: { readonly ton: Ton; readonly children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full px-2 text-xs font-medium',
        ton === 'neutre' && 'bg-muted text-foreground',
        ton === 'succes' && 'bg-success/15 text-success',
        ton === 'attention' && 'bg-warning/20 text-foreground',
        ton === 'info' && 'bg-accent/15 text-accent',
      )}
    >
      {children}
    </span>
  );
}

function Vignette({ src, className }: { readonly src: string | null | undefined; readonly className?: string }) {
  return (
    <span className={cn('flex-none overflow-hidden bg-muted', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- vignette de l'API, déjà au format `preview`
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <Building2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

const CIBLE = 'rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
const LIEN = cn('inline-flex min-h-11 items-center text-sm font-medium underline decoration-1 underline-offset-4 disabled:opacity-50', CIBLE);

export function BiensDuBailleur({ ownerProfileId, agence, telephone, pieces, interlocuteur = null, onAller, enCours }: BiensDuBailleurProps) {
  const t = useTranslations('onboarding.invite.bailleur');
  const locale = useLocale() as Locale;
  const decalage = useDecalageDuClavier();
  const [biens, setBiens] = useState<{ readonly liste: readonly OwnerPropertyEntry[]; readonly total: number } | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const res = await getOwnerPropertiesAction(ownerProfileId);
      if (annule) return;
      if (!res.ok) {
        setErreur(true);
        setBiens({ liste: [], total: 0 });
        return;
      }
      setBiens({ liste: res.data.data, total: res.data.meta?.total ?? res.data.data.length });
    })();
    return () => {
      annule = true;
    };
  }, [ownerProfileId]);

  const etat = (bien: OwnerPropertyEntry) => (bien.status && ETATS_CONNUS.has(bien.status) ? t(`etats.${bien.status}`) : null);
  const ton = (bien: OwnerPropertyEntry): Ton => (bien.status ? (TON_DE_L_ETAT[bien.status] ?? 'neutre') : 'neutre');
  const titreDuBien = (bien: OwnerPropertyEntry) =>
    [bien.title ?? `#${bien.id}`, bien.location?.quarter ?? bien.location?.city].filter(Boolean).join(' · ');
  const loyer = (bien: OwnerPropertyEntry) => {
    const prix = typeof bien.price === 'string' ? Number(bien.price) : bien.price;
    if (bien.contract_type !== 'rent' || prix === null || prix === undefined || !Number.isFinite(prix)) return null;
    const montant = formatCurrency(prix, locale);
    return bien.rent_period === 'monthly' ? t('parMois', { montant }) : montant;
  };

  const aEnvoyer = (pieces ?? [])
    .filter((p) => p.required && aDonner(p) && (ORDRE_DES_PIECES as readonly string[]).includes(p.code))
    .sort((a, b) => ORDRE_DES_PIECES.indexOf(a.code as never) - ORDRE_DES_PIECES.indexOf(b.code as never));
  // Le panneau du bureau montre toutes les pièces à donner, facultatives comprises (le NINEA d'un particulier).
  const aDonnerAuBureau = (pieces ?? [])
    .filter((p) => aDonner(p) && (ORDRE_DES_PIECES as readonly string[]).includes(p.code))
    .sort((a, b) => ORDRE_DES_PIECES.indexOf(a.code as never) - ORDRE_DES_PIECES.indexOf(b.code as never));
  const noms = aEnvoyer.map((p) => t(`pieces.${p.code as 'rib' | 'cni' | 'ninea'}.court`));
  const liste = noms.length > 1 ? t('et', { debut: noms.slice(0, -1).join(', '), fin: noms[noms.length - 1] }) : (noms[0] ?? '');

  const vide = biens !== null && biens.liste.length === 0;
  const fort = (m: ReactNode) => <span className="font-semibold text-foreground">{m}</span>;

  return (
    <div className="grid grid-cols-1 gap-14 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <NumeroVerifie telephone={telephone} />
        <TitreDInvite className="mt-4 lg:mt-5">{agence ? t('titre', { agence }) : t('titreSans')}</TitreDInvite>

        {biens === null ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t('chargement')}
          </p>
        ) : vide ? (
          <div className="mt-5 rounded-xl bg-card p-4 text-center lg:flex lg:items-center lg:gap-4 lg:text-left" data-testid="bailleur-sans-bien">
            <span className="mx-auto inline-flex size-12 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground lg:mx-0">
              <Building2 className="size-6" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div className="mt-3 min-w-0 flex-1 lg:mt-0">
              <p className="text-base font-semibold lg:text-[0.9375rem]">{t('vide.titre')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{agence ? t('vide.texte', { agence }) : t('vide.texteSans')}</p>
              {erreur ? <p className="mt-2 text-sm text-destructive">{t('erreur')}</p> : null}
            </div>
            <Button
              type="button"
              disabled={enCours}
              onClick={() => onAller('/app/properties/new')}
              className="mt-4 h-11 w-full rounded-full px-5 text-sm font-semibold lg:mt-0 lg:w-auto lg:flex-none"
            >
              {t('vide.action')}
            </Button>
            <p className="lg:hidden">
              <button type="button" disabled={enCours} onClick={() => onAller('/app')} className={cn(LIEN, 'text-muted-foreground')}>
                {t('allerAMonEspace')}
              </button>
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground lg:mt-3 lg:text-base">{t('texte', { compte: biens.total })}</p>

            {/* Téléphone : une ligne par bien, vignette de 72 px. */}
            <ul className="mt-3 divide-y divide-border border-y border-border lg:hidden">
              {biens.liste.map((bien) => (
                <li key={bien.id} data-testid={`owner-property-${bien.id}`}>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => onAller(`/app/properties/${bien.id}`)}
                    aria-label={t('ouvrir', { titre: titreDuBien(bien) })}
                    className={cn('flex w-full items-center gap-3 py-3.5 text-left', CIBLE)}
                  >
                    <Vignette src={bien.main_photo_url} className="size-[4.5rem] rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold">{titreDuBien(bien)}</span>
                      <span className="mt-1 flex items-center gap-2 text-sm">
                        {etat(bien) ? <Statut ton={ton(bien)}>{etat(bien)}</Statut> : null}
                        {loyer(bien) ? <span className="truncate tabular-nums text-foreground">{loyer(bien)}</span> : null}
                      </span>
                    </span>
                    <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Bureau : un tableau à trois colonnes — le bien, l'état, le loyer. */}
            <div className="mt-7 hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_11rem] gap-3 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span>{t('colonnes.bien')}</span>
                <span>{t('colonnes.etat')}</span>
                <span>{t('colonnes.loyer')}</span>
              </div>
              {biens.liste.map((bien) => (
                <button
                  key={bien.id}
                  type="button"
                  disabled={enCours}
                  onClick={() => onAller(`/app/properties/${bien.id}`)}
                  aria-label={t('ouvrir', { titre: titreDuBien(bien) })}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1fr)_6.5rem_11rem] items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/40',
                    CIBLE,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Vignette src={bien.main_photo_url} className="h-14 w-[4.75rem] rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] font-semibold">{bien.title ?? `#${bien.id}`}</span>
                      {bien.location?.quarter || bien.location?.city ? (
                        <span className="block truncate text-[0.8125rem] text-muted-foreground">{bien.location?.quarter ?? bien.location?.city}</span>
                      ) : null}
                    </span>
                  </span>
                  <span>{etat(bien) ? <Statut ton={ton(bien)}>{etat(bien)}</Statut> : null}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">{loyer(bien) ?? t('horsLocation')}</span>
                    <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>

            <p className="flex justify-end lg:mt-1">
              <button type="button" disabled={enCours} onClick={() => onAller('/app/properties')} className={cn(LIEN, 'text-primary')}>
                {t('voirTous')}
              </button>
            </p>

            <div className="mt-1 rounded-2xl border border-dashed border-foreground/25 p-4 lg:mt-2 lg:flex lg:items-center lg:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold">{t('proposer.titre')}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{agence ? t('proposer.texte', { agence }) : t('proposer.texteSans')}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={enCours}
                onClick={() => onAller('/app/properties/new')}
                className="mt-3 h-11 rounded-full border-foreground/20 bg-card px-5 text-sm font-semibold lg:mt-0 lg:flex-none"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('proposer.action')}
              </Button>
            </div>

            {aEnvoyer.length > 0 ? (
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/70 p-3.5 lg:hidden" data-testid="rappel-des-pieces">
                <span className="mt-0.5 inline-flex size-8 flex-none items-center justify-center rounded-full bg-card text-muted-foreground">
                  <CircleDashed className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-foreground">
                  {t.rich('rappel', { compte: aEnvoyer.length, liste, fort })}
                </p>
              </div>
            ) : null}

            <BoutonCollant decalage={decalage} className="lg:mt-8">
              <div className="lg:flex lg:items-center lg:gap-4">
                <Button type="button" disabled={enCours} onClick={() => onAller('/app')} className={cn(BOUTON_D_ENTREE, 'lg:w-auto')}>
                  {enCours ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {t('ouverture')}
                    </>
                  ) : (
                    <>
                      {t('allerAMonEspace')}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
                {aEnvoyer.length > 0 ? <p className="hidden text-sm text-muted-foreground lg:block">{t('piecesAttendent')}</p> : null}
              </div>
            </BoutonCollant>
          </>
        )}
      </div>

      {aDonnerAuBureau.length > 0 || interlocuteur ? (
        <aside className="hidden space-y-4 pt-13 xl:block">
          {/* TCK-2838 — au bureau seulement : au téléphone, rien de neuf (ticket). */}
          {interlocuteur ? <CarteDeLInterlocuteur interlocuteur={interlocuteur} agence={agence} /> : null}
          {aDonnerAuBureau.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5" data-testid="a-faire-pour-etre-paye">
            <p className="text-[0.9375rem] font-semibold">{t('aFaire.titre')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{agence ? t('aFaire.texte', { agence }) : t('aFaire.texteSans')}</p>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {aDonnerAuBureau.map((piece) => {
                const code = piece.code as 'rib' | 'cni' | 'ninea';
                const Icone = ICONES_DE_PIECE[code];
                return (
                  <li key={code} className="flex items-center gap-3 py-3">
                    <Icone className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-sm font-medium">{t(`pieces.${code}.nom`)}</span>
                      <span className="block text-[0.8125rem] text-muted-foreground">{t(`pieces.${code}.detail`)}</span>
                    </span>
                    <button type="button" disabled={enCours} onClick={() => onAller('/app/pieces')} className={cn(LIEN, 'min-h-0 text-primary')}>
                      {piece.kind === 'file_and_number' && code === 'ninea' ? t('aFaire.saisir') : t('aFaire.ajouter')}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-[0.8125rem] text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
              {t('aFaire.delai')}
            </p>
          </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
