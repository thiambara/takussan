'use client';

import { useId, useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck, Copy, Link2, Minus, Plus } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { ErrorState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import {
  DUREES_DE_PARTAGE,
  DUREE_PAR_DEFAUT,
  PLAFOND_PAR_DEFAUT,
  buildShareUrl,
  demandeDePartage,
  erreurDePartage,
  expireBientotAvecLHeure,
  lienWhatsApp,
  plafondSuivant,
  regleDExpiration,
  type DureeDePartage,
  type ErreurDePartage,
  type PlafondDeTelechargements,
} from '@/lib/documents/partage';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useCreateShareLink, useRevokeShareLink, useShareLinks } from '@/lib/queries/documents';
import { cn } from '@/lib/utils';
import type { Document, DocumentShareLink } from '@/types/document';

import { Carte, TitreDeBloc } from './blocs';

/**
 * TCK-2656 (lot 3) — partager un document par lien, depuis sa fiche.
 *
 * Maquette : `FormulairePartage`, `LienCree` et `BlocLiens` (`app-documents-a.tsx`). Au téléphone, une
 * feuille du bas (« Partager par lien », puis le nom du document) ; au bureau, une carte flottante de
 * 400 px sous « Partager ».
 *
 * Rien ne se perd de `DocumentShareDialog` : durée (les quatre de toujours, dont 1 heure), plafond de
 * téléchargements (« Sans limite » compris), mot de passe, liens actifs avec leurs usages, révocation.
 * Ce qui change : les liens actifs sont ceux que l'API rend (`GET …/share-links`), plus seulement ceux
 * de la session ; « Lien copié » ne se dit que si le presse-papiers a accepté le lien — sinon « Lien
 * créé » et « Copier le lien » ; le message WhatsApp porte le lien, jamais le mot de passe.
 */

export interface SuiviDesLiens {
  /** Les liens créés depuis l'ouverture de la fiche : affichés avant que la liste ne se relise. */
  readonly crees: readonly DocumentShareLink[];
  /** Les liens révoqués depuis l'ouverture de la fiche : retirés sans attendre la relecture. */
  readonly revoques: readonly number[];
  readonly surCree: (lien: DocumentShareLink) => void;
  readonly surRevoque: (id: number) => void;
}

export function useSuiviDesLiens(): SuiviDesLiens {
  const [crees, setCrees] = useState<readonly DocumentShareLink[]>([]);
  const [revoques, setRevoques] = useState<readonly number[]>([]);
  return {
    crees,
    revoques,
    surCree: (lien) => setCrees((avant) => [lien, ...avant.filter((l) => l.id !== lien.id)]),
    surRevoque: (id) => setRevoques((avant) => (avant.includes(id) ? avant : [...avant, id])),
  };
}

/* ───────────────────────────── Révoquer ───────────────────────────── */

function useRevoquer(documentId: number, surRevoque: (id: number) => void) {
  const revocation = useRevokeShareLink();
  const messageErreur = useMessageErreurApi();
  const t = useTranslations('documents.share');
  const [enCours, setEnCours] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function revoquer(id: number): Promise<boolean> {
    setErreur(null);
    setEnCours(id);
    try {
      await revocation.mutateAsync({ document_id: documentId, link_id: id });
      surRevoque(id);
      return true;
    } catch (e) {
      setErreur(e instanceof ApiError ? messageErreur(e, t('revoke_error')) : t('revoke_error'));
      return false;
    } finally {
      setEnCours(null);
    }
  }

  return { revoquer, enCours, erreur };
}

/* ───────────────────────────── Liens actifs ───────────────────────────── */

function useLibelleDExpiration() {
  const t = useTranslations('documents.fiche.liens');
  const f = useFormatteurs();
  return (expiresAt: string | null) => {
    const regle = regleDExpiration(expiresAt);
    switch (regle.cle) {
      case 'sansExpiration':
        return t('sansExpiration');
      case 'aujourdhui':
        return t('expireAujourdhui', { heure: f.heure(regle.instant) });
      case 'dans':
        return t('expireDans', { n: regle.jours });
      case 'le':
        return t('expireLe', { date: f.jourMois(regle.instant) });
    }
  };
}

export function LiensDePartage({
  document,
  suivi,
  className,
}: {
  readonly document: Pick<Document, 'id'>;
  readonly suivi: SuiviDesLiens;
  readonly className?: string;
}) {
  const t = useTranslations('documents.fiche.liens');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const libelleDExpiration = useLibelleDExpiration();
  const requete = useShareLinks(document.id);
  const { revoquer, enCours, erreur } = useRevoquer(document.id, suivi.surRevoque);

  const lus = requete.data?.data ?? [];
  const nouveaux = new Set(suivi.crees.map((l) => l.id));
  const liens = [...suivi.crees, ...lus.filter((l) => !nouveaux.has(l.id))].filter((l) => !suivi.revoques.includes(l.id));

  return (
    <section className={className} aria-labelledby="liens-du-document">
      <TitreDeBloc id="liens-du-document">{requete.isSuccess ? t('titre', { n: liens.length }) : t('titreSeul')}</TitreDeBloc>
      {erreur ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
      <Carte className="mt-2 overflow-hidden">
        {requete.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <span className="sr-only">{tCommon('status.loading')}</span>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
        ) : requete.isError ? (
          <div className="p-4">
            <ErrorState message={t('erreur')} onRetry={() => void requete.refetch()} retryLabel={tCommon('actions.retry')} />
          </div>
        ) : liens.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('vide')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {liens.map((lien) => {
              const nouveau = nouveaux.has(lien.id);
              const cree = lien.created_at ? f.jourMois(lien.created_at) : null;
              return (
                <li key={lien.id} data-testid="lien-actif" className={cn('flex items-center gap-3 px-4 py-3', nouveau && 'bg-success/10')}>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-corps font-medium">{nouveau ? t('creeALInstant') : cree ? t('creeLe', { date: cree }) : t('cree')}</span>
                    <span className="mt-0.5 block text-ui text-muted-foreground">
                      {libelleDExpiration(lien.expires_at)}
                      {lien.has_password ? t('avecMotDePasse') : null}
                    </span>
                    <span className="block text-ui text-muted-foreground tabular-nums">
                      {lien.max_downloads === null
                        ? t('usageSansLimite', { n: lien.downloads_count })
                        : t('usage', { n: lien.downloads_count, max: lien.max_downloads })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoquer(lien.id)}
                    disabled={enCours === lien.id}
                    aria-label={cree ? t('revoquerAria', { date: cree }) : undefined}
                    className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-destructive disabled:opacity-60"
                  >
                    {enCours === lien.id ? t('revocation') : t('revoquer')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </section>
  );
}

/* ───────────────────────────── Le formulaire ───────────────────────────── */

interface LienObtenu {
  readonly lien: DocumentShareLink;
  /** `navigator.clipboard.writeText` a accepté le lien. */
  readonly copie: boolean;
}

function FormulaireDePartage({
  id,
  document,
  onObtenu,
  onEnvoi,
}: {
  readonly id: string;
  readonly document: Pick<Document, 'id'>;
  readonly onObtenu: (obtenu: LienObtenu) => void;
  readonly onEnvoi: (enCours: boolean) => void;
}) {
  const t = useTranslations('documents.fiche.partage');
  const tShare = useTranslations('documents.share');
  const tTtl = useTranslations('documents.share.ttl');
  const messageErreur = useMessageErreurApi();
  const creation = useCreateShareLink();
  const [duree, setDuree] = useState<DureeDePartage>(DUREE_PAR_DEFAUT);
  const [plafond, setPlafond] = useState<PlafondDeTelechargements>(PLAFOND_PAR_DEFAUT);
  const [protege, setProtege] = useState(false);
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurMotDePasse, setErreurMotDePasse] = useState<ErreurDePartage>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const base = useId();

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    const refus = erreurDePartage(protege, motDePasse);
    setErreurMotDePasse(refus);
    if (refus) return;
    setErreur(null);
    onEnvoi(true);
    try {
      const reponse = await creation.mutateAsync({ document_id: document.id, ...demandeDePartage({ duree, plafond, protege, motDePasse }) });
      const lien = reponse.data;
      let copie = false;
      try {
        await navigator.clipboard.writeText(buildShareUrl(lien.token));
        copie = true;
      } catch {
        // Le presse-papiers refuse (contexte non sûr, geste trop ancien) : « Lien créé », et le bouton « Copier ».
      }
      onObtenu({ lien, copie });
    } catch (err) {
      setErreur(err instanceof ApiError ? messageErreur(err, tShare('create_error')) : tShare('create_error'));
    } finally {
      onEnvoi(false);
    }
  }

  return (
    <form id={id} onSubmit={(e) => void creer(e)} noValidate className="space-y-5">
      {erreur ? (
        <p role="alert" className="text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
      <div>
        <p id={`${base}-duree`} className="mb-1.5 text-sm font-medium">
          {t('expireDans')}
        </p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby={`${base}-duree`}>
          {DUREES_DE_PARTAGE.map((d) => {
            const coche = d.valeur === duree;
            return (
              <button
                key={d.valeur}
                type="button"
                role="radio"
                aria-checked={coche}
                onClick={() => setDuree(d.valeur)}
                className={cn(
                  'inline-flex h-11 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  coche ? 'border-primary bg-secondary text-primary-deep' : 'border-border bg-card hover:bg-muted',
                )}
              >
                {tTtl(d.valeur)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 leading-tight">
          <span id={`${base}-plafond`} className="block text-sm font-medium">
            {t('plafond')}
          </span>
          <span className="mt-0.5 block text-ui text-muted-foreground">{t('plafondAide')}</span>
        </span>
        <span className="flex flex-none items-center gap-1" role="group" aria-labelledby={`${base}-plafond`}>
          <Button type="button" variant="outline" size="icon" aria-label={t('moins')} disabled={plafond === null} onClick={() => setPlafond((p) => plafondSuivant(p, -1))}>
            <Minus aria-hidden="true" />
          </Button>
          <output aria-live="polite" className="min-w-9 text-center text-lg font-semibold tabular-nums" data-testid="plafond">
            {plafond === null ? t('sansLimite') : plafond}
          </output>
          <Button type="button" variant="outline" size="icon" aria-label={t('plus')} onClick={() => setPlafond((p) => plafondSuivant(p, 1))}>
            <Plus aria-hidden="true" />
          </Button>
        </span>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <Label htmlFor={`${base}-proteger`} className="min-w-0 flex-1 text-sm font-medium">
            {t('proteger')}
          </Label>
          <Switch
            id={`${base}-proteger`}
            checked={protege}
            onCheckedChange={(v) => {
              setProtege(v);
              setErreurMotDePasse(null);
            }}
          />
        </div>
        {protege ? (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor={`${base}-mdp`}>{t('motDePasse')}</Label>
            <Input
              id={`${base}-mdp`}
              type="password"
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => {
                setMotDePasse(e.target.value);
                setErreurMotDePasse(null);
              }}
              aria-invalid={erreurMotDePasse !== null}
              aria-describedby={`${base}-mdp-aide`}
            />
            {erreurMotDePasse ? (
              <p role="alert" className="text-ui text-destructive">
                {t(erreurMotDePasse)}
              </p>
            ) : null}
            <p id={`${base}-mdp-aide`} className="text-xs text-muted-foreground text-pretty">
              {t('motDePasseAide')}
            </p>
          </div>
        ) : null}
      </div>
    </form>
  );
}

/* ───────────────────────────── Le lien obtenu ───────────────────────────── */

function LienCree({
  document,
  obtenu,
  onRevoque,
}: {
  readonly document: Pick<Document, 'id' | 'name'>;
  readonly obtenu: LienObtenu;
  readonly onRevoque: () => void;
}) {
  const t = useTranslations('documents.fiche.lienCree');
  const f = useFormatteurs();
  const { lien } = obtenu;
  const url = buildShareUrl(lien.token);
  const [copie, setCopie] = useState(obtenu.copie);
  const [copieRatee, setCopieRatee] = useState(false);
  const { revoquer, enCours, erreur } = useRevoquer(document.id, () => undefined);

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setCopieRatee(false);
    } catch {
      setCopieRatee(true);
    }
  }

  const morceaux = [
    lien.expires_at
      ? t('valable', {
          date: expireBientotAvecLHeure(lien.expires_at)
            ? f.dateTime(lien.expires_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : f.date(lien.expires_at, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
        })
      : t('sansExpiration'),
    lien.max_downloads === null ? t('sansLimite') : t('plafond', { n: lien.max_downloads }),
    ...(lien.has_password ? [t('protege')] : []),
  ];

  return (
    <div>
      <p role="status" className={cn('flex items-center gap-2 text-corps font-semibold', copie ? 'text-success' : 'text-foreground')}>
        <CircleCheck className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {copie ? t('copie') : t('cree')}
      </p>
      <div className="relative mt-3">
        <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <Input readOnly value={url} aria-label={t('url')} onFocus={(e) => e.currentTarget.select()} className="truncate bg-muted pr-12 pl-9 font-mono text-ui" />
        <button
          type="button"
          onClick={() => void copier()}
          aria-label={t('copier')}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {copieRatee ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {t('copieImpossible')}
        </p>
      ) : null}
      <p className="mt-2 text-ui leading-snug text-muted-foreground">{t('details', { details: morceaux.join(' · ') })}</p>
      <a
        href={lienWhatsApp(t('messageWhatsApp', { nom: document.name, lien: url }))}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: 'default' }), 'mt-4 w-full bg-success text-success-foreground hover:bg-success/90')}
      >
        <IconeWhatsApp className="size-icone" />
        {t('whatsApp')}
      </a>
      {erreur ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() =>
          void revoquer(lien.id).then((ok) => {
            if (ok) onRevoque();
          })
        }
        disabled={enCours !== null}
        className="mt-2 flex h-11 w-full items-center justify-center text-sm font-medium text-destructive disabled:opacity-60"
      >
        {enCours !== null ? t('revocation') : t('revoquer')}
      </button>
    </div>
  );
}

/* ───────────────────────────── Le conteneur ───────────────────────────── */

export function PartagerParLien({
  open,
  onOpenChange,
  document,
  suivi,
  bureau,
  declencheur,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly document: Pick<Document, 'id' | 'name'>;
  readonly suivi: SuiviDesLiens;
  /** Dès `md` : la carte flottante sous `declencheur` ; sinon, la feuille du bas. */
  readonly bureau: boolean;
  /** Le bouton « Partager » de l'en-tête du bureau, ancre de la carte flottante (bureau seulement). */
  readonly declencheur?: ReactElement;
}) {
  const t = useTranslations('documents.fiche.partage');
  const tCommon = useTranslations('common');
  const formulaire = useId();
  const [obtenu, setObtenu] = useState<LienObtenu | null>(null);
  const [envoi, setEnvoi] = useState(false);

  function changer(suivant: boolean) {
    if (!suivant) setObtenu(null);
    onOpenChange(suivant);
  }

  function surObtenu(o: LienObtenu) {
    setObtenu(o);
    suivi.surCree(o.lien);
  }

  function surRevoque() {
    if (obtenu) suivi.surRevoque(obtenu.lien.id);
    changer(false);
  }

  const contenu = obtenu ? (
    <LienCree document={document} obtenu={obtenu} onRevoque={surRevoque} />
  ) : (
    <FormulaireDePartage id={formulaire} document={document} onObtenu={surObtenu} onEnvoi={setEnvoi} />
  );

  const creer = (
    <Button type="submit" form={formulaire} disabled={envoi} size={bureau ? 'default' : 'xl'} className="max-md:w-full">
      {envoi ? t('creation') : t('creer')}
    </Button>
  );

  if (bureau && declencheur) {
    return (
      <Popover open={open} onOpenChange={changer}>
        <PopoverTrigger render={declencheur} />
        <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="w-[calc(var(--spacing)*111)] rounded-2xl p-5" aria-label={obtenu ? document.name : t('titre')}>
          {obtenu ? null : <p className="mb-4 text-titre-court font-semibold">{t('titre')}</p>}
          {contenu}
          {obtenu ? null : (
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => changer(false)}>
                {tCommon('actions.cancel')}
              </Button>
              {creer}
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <FeuilleDuBas open={open} onOpenChange={changer} titre={obtenu ? document.name : t('titre')} pied={obtenu ? undefined : creer}>
      {contenu}
    </FeuilleDuBas>
  );
}
