'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Link2 } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { DELAI_D_ARMEMENT, useArmement } from './armement';
import { useLectureDImpaye } from './lecture';
import type { useRelanceDUnImpaye } from './useRelanceDUnImpaye';

type Relance = ReturnType<typeof useRelanceDUnImpaye>;

/**
 * TCK-2660 — le cœur de la relance, commun à la feuille du téléphone et au panneau du bureau : le
 * message prérempli (modifiable), le lien de paiement de l'échéance à copier, la dernière relance.
 * Aucun choix SMS / e-mail (décision 13 (a) : WhatsApp seul, depuis le téléphone de l'agence).
 */
export function ComposerLaRelance({ row, relance }: { readonly row: PaymentHistoryRow; readonly relance: Relance }) {
  const t = useTranslations('admin.finances.impayes.relancer');
  const tLecture = useTranslations('admin.finances.impayes');
  const f = useFormatteurs();
  const l = useLectureDImpaye();
  const [edition, setEdition] = useState(false);
  const idDuMessage = useId();
  const derniere = row.last_reminder;

  return (
    <div data-slot="composer-la-relance">
      <div className="flex items-center justify-between">
        <p id={idDuMessage} className="text-sm font-medium">
          {t('message')}
        </p>
        {relance.messagePret && !edition ? (
          <button
            type="button"
            onClick={() => setEdition(true)}
            className="inline-flex h-11 items-center rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring lg:h-8"
          >
            {t('modifier')}
          </button>
        ) : null}
      </div>
      {relance.sansLien ? (
        // TCK-2778 — la pénalité ne se paie pas en ligne : dit en clair, la relance part sans lien.
        <p
          role={relance.sansLienParLApi ? 'alert' : undefined}
          data-slot="penalite-sans-lien"
          className="mt-2 rounded-xl bg-warning/10 px-3.5 py-3 text-sm text-foreground"
        >
          {t('penaliteSansLien')}
        </p>
      ) : null}
      {relance.etatDuLien === 'refuse' ? (
        <p role="alert" className="mt-2 rounded-xl bg-warning/10 px-3.5 py-3 text-sm text-foreground">
          {t('lienRefuse')}
        </p>
      ) : relance.etatDuLien === 'echec' ? (
        <div role="alert" className="mt-2 flex items-center gap-3 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{t('lienEchec')}</span>
          <Button type="button" variant="outline" size="sm" onClick={relance.relireLeLien}>
            {t('reessayer')}
          </Button>
        </div>
      ) : !relance.messagePret ? (
        <Skeleton className="mt-2 h-28 rounded-2xl" aria-hidden="true" data-testid="relance-message-chargement" />
      ) : edition ? (
        <Textarea
          aria-labelledby={idDuMessage}
          value={relance.message}
          onChange={(e) => relance.modifierLeMessage(e.target.value)}
          rows={6}
          className="mt-2 text-corps leading-relaxed"
        />
      ) : (
        <p
          data-slot="apercu-du-message"
          className="mt-2 whitespace-pre-line rounded-2xl rounded-tl-md bg-success/10 px-3.5 py-3 text-corps leading-relaxed text-foreground"
        >
          {relance.message}
        </p>
      )}

      {relance.etatDuLien === 'refuse' || relance.sansLien ? null : (
        <>
          <p className="mt-4 mb-1.5 text-sm font-medium">{relance.penalite ? t('lienPenalite') : t('lien')}</p>
          <LienDePaiement url={relance.url} creer={relance.creerLeLien} enCours={relance.etatDuLien === 'chargement'} />
        </>
      )}

      <p className="mt-4 text-ui leading-snug text-muted-foreground">
        {derniere
          ? derniere.source === 'automatic'
            ? t('derniereAutomatique', { date: f.jourMois(derniere.at) })
            : t('derniere', { date: f.jourMois(derniere.at), canal: l.canal(derniere) ?? '', nom: derniere.by?.name ?? tLecture('agence') })
          : t('jamais')}{' '}
        {t('seraNotee')}
      </p>
      {relance.noterEnEchec ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {t('noteEchec')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Le lien de paiement de l'échéance, à copier. Décision 1 du porteur (2026-11-12) : tant qu'il n'est
 * pas créé, la ligne le DIT (« créé à l'envoi ») ; « Copier » est un geste d'envoi, il le crée puis le
 * copie. Sans `creer` (lecture seule), rien ne se crée.
 */
export function LienDePaiement({
  url,
  creer,
  enCours = false,
}: {
  readonly url: string | null;
  readonly creer?: () => Promise<string | null>;
  readonly enCours?: boolean;
}) {
  const t = useTranslations('admin.finances.impayes.relancer');
  const [copie, setCopie] = useState(false);
  const [creation, setCreation] = useState(false);
  const copier = async () => {
    if (creation || enCours) return;
    setCreation(true);
    const adresse = url ?? (creer ? await creer() : null);
    setCreation(false);
    if (adresse) await navigator.clipboard?.writeText(adresse).then(() => setCopie(true), () => undefined);
  };
  const affiche = url ? url.replace(/^https?:\/\//, '') : null;
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-card pr-1.5 pl-3 text-sm">
      <Link2 className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      {affiche ? (
        <span className="min-w-0 flex-1 truncate tabular-nums" data-slot="lien-de-paiement">
          {affiche}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground" data-slot="lien-a-creer">
          {t('lienACreer')}
        </span>
      )}
      {url || creer ? (
        <button
          type="button"
          onClick={() => void copier()}
          aria-disabled={creation || enCours ? true : undefined}
          className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md bg-muted px-2.5 text-ui font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring aria-disabled:opacity-60"
        >
          <Copy className="size-3.5" aria-hidden="true" />
          <span aria-live="polite">{copie ? t('copie') : t('copier')}</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * « Ouvrir WhatsApp ». Décision 1 du porteur (2026-11-12) : le lien de paiement se crée AU CLIC, pas
 * avant. Le bouton ouvre un onglet vide dans le geste, crée le lien, glisse son URL dans le message,
 * envoie l'onglet vers `wa.me` et NOTE la relance. Un 409 (l'échéance ne se paie plus en ligne), ou un
 * échec, referme l'onglet et ne note rien.
 *
 * Un navigateur qui bloque l'onglet malgré tout (`window.open` rend `null`) reçoit une ANCRE `wa.me`
 * prête : « Touchez encore pour ouvrir WhatsApp ». Le lien existe déjà, le second appui ne recrée
 * rien ; c'est lui qui note la relance.
 *
 * Désactivé, il dit pourquoi (`aria-describedby`) : ni numéro, ni message, ou lien refusé.
 */
export function OuvrirWhatsApp({
  relance,
  raisonId,
  onOuvert,
  armee = false,
  className,
}: {
  readonly relance: Relance;
  /** L'identifiant de la phrase qui dit pourquoi le bouton est désactivé, si elle est rendue ailleurs. */
  readonly raisonId?: string;
  /** Reçoit la note de la relance : `true` prise, `false` refusée (TCK-2682, récapitulatif de la file). */
  readonly onOuvert?: (note: Promise<boolean>) => void;
  /**
   * TCK-2682 — la file guidée : un clic qui arrive avant que le geste soit ARMÉ (`armement.ts`) n'ouvre
   * rien et ne note rien. C'est le second clic d'un double-clic sur le geste précédent.
   */
  readonly armee?: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('admin.finances.impayes.gestes');
  const pret = relance.pretAEnvoyer && relance.etatDuLien !== 'refuse';
  const premature = useArmement(pret ? 'prete' : null);
  const [envoi, setEnvoi] = useState<'repos' | 'enCours' | 'aRetoucher'>('repos');
  // Le second clic d'un double-clic arrive pendant la création du lien, ou juste après l'ouverture
  // quand le lien revient vite : il ne crée, n'ouvre ni ne note rien. Un état React ne suffit pas à le
  // dire avant le rendu suivant ; les références, si.
  const enVol = useRef(false);
  const ouvertA = useRef<number | null>(null);
  // Le bouton a pu quitter l'écran pendant la création du lien (« Passer », « Arrêter », la feuille
  // refermée) : l'envoi s'arrête là, sans ouvrir WhatsApp ni noter une relance que l'agent a abandonnée.
  const monte = useRef(false);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  const classes = cn(
    buttonVariants({ size: 'xl' }),
    'gap-2 border-transparent bg-success font-semibold text-success-foreground hover:bg-success/90',
    className,
  );
  const noter = () => {
    const note = relance.noterLaRelance('whatsapp');
    onOuvert?.(note);
  };

  /**
   * L'envoi. L'onglet s'ouvre VIDE et tout de suite, dans le geste même : un navigateur qui bloque une
   * fenêtre ouverte après une attente (Safari iOS) la laisse passer ici. Puis le lien se crée ; l'onglet
   * part alors vers `wa.me`, ou se referme sur un refus. Sans `noopener` dans l'appel, qui ferait rendre
   * `null` : l'`opener` est coupé à la main. Si l'onglet est bloqué malgré tout, une ancre prête prend la
   * place du bouton. **Non mesuré au navigateur réel (Safari iOS)** : éprouvé en test seulement.
   */
  const envoyer = async () => {
    if (enVol.current || (armee && premature())) return;
    if (ouvertA.current !== null && Date.now() - ouvertA.current < DELAI_D_ARMEMENT) return;
    enVol.current = true;
    const onglet = window.open('', '_blank');
    if (onglet) onglet.opener = null;
    setEnvoi('enCours');
    const pretAPartir = await relance.envoyer().finally(() => {
      enVol.current = false;
    });
    if (!monte.current || !pretAPartir) {
      onglet?.close();
      if (monte.current) setEnvoi('repos');
      return;
    }
    if (onglet === null) {
      setEnvoi('aRetoucher');
      return;
    }
    onglet.location.href = pretAPartir.hrefWhatsApp;
    ouvertA.current = Date.now();
    setEnvoi('repos');
    noter();
  };

  // Le navigateur a bloqué l'onglet : l'ancre prête, que le second appui suit dans son propre geste.
  if (envoi === 'aRetoucher' && relance.hrefWhatsApp) {
    return (
      <a
        href={relance.hrefWhatsApp}
        target="_blank"
        rel="noopener noreferrer"
        data-slot="ouvrir-whatsapp"
        onClick={() => {
          setEnvoi('repos');
          noter();
        }}
        className={classes}
      >
        <IconeWhatsApp className="size-5" />
        {t('retoucherWhatsApp')}
      </a>
    );
  }

  return (
    <Button
      type="button"
      size="xl"
      disabled={!pret}
      aria-disabled={envoi === 'enCours' ? true : undefined}
      aria-describedby={pret ? undefined : raisonId}
      data-slot="ouvrir-whatsapp"
      onClick={() => void envoyer()}
      className={classes}
    >
      <IconeWhatsApp className="size-5" />
      {t('ouvrirWhatsApp')}
    </Button>
  );
}
