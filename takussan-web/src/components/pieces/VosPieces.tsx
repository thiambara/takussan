'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronRight, FileText, Hash, IdCard, Info, Landmark, Paperclip, ShieldCheck, UserRound } from 'lucide-react';

import { PageHeader, StatusBadge } from '@/components/console';
import { EmptyState, ErrorState } from '@/components/feedback';
import { KYC_MIME_ACCEPT } from '@/components/kyc/kyc-mime-accept';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import { messageCorpsErreurBff, messageErreurApi } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { jourRelatif } from '@/lib/maintenance/mes-demandes';
import {
  aDonner,
  compteDesPieces,
  envoisAFaire,
  motDEtat,
  nineaCompact,
  nineaValide,
  pieceConnue,
  profilDesPieces,
  type CodeDePiece,
  type EtatDePiece,
  type FichierDePiece,
  type PieceDuProfil,
  type PiecePreparee,
} from '@/lib/pieces/pieces';
import { CLE_DEMARRAGE } from '@/lib/queries/demarrage-espace';
import { CLE_PIECES, EchecDEnvoi, enregistrerLeNinea, envoyerLaPiece, useMesPieces } from '@/lib/queries/pieces';
import { cn } from '@/lib/utils';

/** La taille maximale qu'accepte l'envoi (`AcceptedUploads::kyc(8192)`), comme `KycUploader`. */
const TAILLE_MAX = 8 * 1024 * 1024;

const ICONES: Readonly<Record<CodeDePiece, ComponentType<{ className?: string; strokeWidth?: number }>>> = {
  cni: IdCard,
  rib: Landmark,
  ninea: Hash,
  license: IdCard,
  photo: UserRound,
  insurance: ShieldCheck,
};

const ID_DU_FORMULAIRE = 'vos-pieces';

/** « Remplacer », « Reprendre » : le lien d'une ligne de fichier, à la hauteur de son texte (maquette). */
const LIEN_DE_LIGNE =
  'flex-none rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring';

/**
 * TCK-2614 — « Vos pièces » : le bailleur, l'agent ou le prestataire envoie ses pièces une à une depuis « Démarrer »,
 * en photographiant la pièce ou en choisissant un fichier, et voit à chaque instant ce qui manque, ce qui est parti et
 * ce qui est vérifié (maquette `app-entree-assistants` a-3, en vouvoiement).
 *
 *  · Les pièces, leur état et le fichier envoyé viennent de `GET /api/me/pieces` (PROFIL ACTIF) ; aucune pièce
 *    n'empêche d'utiliser l'espace (« Vous pouvez utiliser votre espace en attendant », sourcé : aucune route ne refuse).
 *  · Choisir ou photographier ne fait que PRÉPARER la pièce sur cet appareil (aperçu, « Reprendre ») ; « Envoyer mes
 *    pièces » envoie ce qui est prêt, l'une après l'autre, puis le NINEA tapé — et rien d'autre : aucune soumission
 *    (`kyc/submit`), qui cocherait l'étape du bailleur sans ses pièces (décision 7a). L'étape de « Démarrer » se coche
 *    d'elle-même quand l'API la rend faite.
 *  · Le NINEA se tape (espaces tolérés, forme jugée avant tout envoi : mal formé, rien ne part) ; le joindre en fichier
 *    reste possible par « Joindre le fichier ». Il ne se relit que masqué (`number_masked`).
 *  · Téléphone et tablette : une carte par pièce, « Prendre une photo » (appareil arrière) et « Choisir un fichier » de
 *    même poids, le geste principal collé en bas. Bureau (dès `lg`) : un tableau pièce · état · action, et une zone de
 *    dépôt (décision 8a).
 */
export function VosPieces() {
  const t = useTranslations('pieces');
  const tRacine = useTranslations();
  const { token, activeProfileId } = useAuth();
  const { data: profils } = useMyProfiles();
  const profil = profilDesPieces(activeProfileId ?? profils?.meta.active_profile_id ?? null);
  const client = useQueryClient();
  const lue = useMesPieces();

  const [preparees, setPreparees] = useState<Record<string, PiecePreparee | undefined>>({});
  const [remplacer, setRemplacer] = useState<ReadonlySet<string>>(new Set());
  const [joindreNinea, setJoindreNinea] = useState(false);
  const [ninea, setNinea] = useState('');
  const [erreurNinea, setErreurNinea] = useState<string | null>(null);
  const [erreursParPiece, setErreursParPiece] = useState<Record<string, string | undefined>>({});
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [bilan, setBilan] = useState<{ readonly envoyees: number } | null>(null);
  const [rien, setRien] = useState(false);
  // L'aperçu d'une photo préparée : une URL `blob:` créée au CHOIX (un événement, pas un effet), rendue au navigateur
  // quand la pièce est reprise, remplacée ou envoyée, et au démontage de l'écran.
  const [apercus, setApercus] = useState<Record<string, string | undefined>>({});
  const apercusVivants = useRef(new Set<string>());
  useEffect(() => {
    const vivants = apercusVivants.current;
    return () => {
      for (const u of vivants) URL.revokeObjectURL(u);
      vivants.clear();
    };
  }, []);
  const poserLApercu = (code: string, fichier: File | undefined) => {
    const avant = apercus[code];
    if (avant) {
      URL.revokeObjectURL(avant);
      apercusVivants.current.delete(avant);
    }
    const url =
      fichier && fichier.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(fichier) : undefined;
    if (url) apercusVivants.current.add(url);
    setApercus((a) => ({ ...a, [code]: url }));
  };

  const pieces = (lue.data?.data ?? []).filter(pieceConnue);
  const { envoyees, requises } = compteDesPieces(pieces);

  const preparer = (code: string, prepare: PiecePreparee | undefined) => {
    poserLApercu(code, prepare && 'fichier' in prepare ? prepare.fichier : undefined);
    setPreparees((avant) => ({ ...avant, [code]: prepare }));
    setErreursParPiece((avant) => ({ ...avant, [code]: undefined }));
    setRien(false);
  };

  const choisir = (code: string, fichier: File | undefined) => {
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX) {
      setErreursParPiece((avant) => ({ ...avant, [code]: t('erreurs.tropLourd') }));
      return;
    }
    preparer(code, { fichier });
  };

  const envoyer = async () => {
    if (envoiEnCours || !profil) return;
    const saisie = ninea.trim();
    // Un NINEA mal formé arrête TOUT : rien ne part, le message se lit sous le champ.
    if (saisie !== '' && !nineaValide(saisie)) {
      setErreurNinea(t('ninea.malForme'));
      return;
    }
    setErreurNinea(null);
    const aEnvoyer = envoisAFaire(pieces, {
      ...preparees,
      ninea: saisie !== '' && profil.type === 'owner' ? { numero: nineaCompact(saisie) } : preparees.ninea,
    });
    if (aEnvoyer.length === 0) {
      setRien(true);
      return;
    }
    setRien(false);
    setEnvoiEnCours(true);
    let reussies = 0;
    const erreurs: Record<string, string | undefined> = {};
    const restantes: Record<string, PiecePreparee | undefined> = { ...preparees };
    for (const { code, prepare } of aEnvoyer) {
      try {
        if ('fichier' in prepare) {
          await envoyerLaPiece(profil, code, prepare.fichier);
        } else if (token) {
          await enregistrerLeNinea(token, profil.id, prepare.numero);
          setNinea('');
        }
        reussies += 1;
        restantes[code] = undefined;
        poserLApercu(code, undefined);
      } catch (e) {
        const message =
          e instanceof EchecDEnvoi
            ? messageCorpsErreurBff(e.corps, tRacine, t('erreurs.envoi'))
            : messageErreurApi(e, tRacine, t('erreurs.envoi'));
        if (code === 'ninea' && !('fichier' in prepare)) setErreurNinea(message);
        else erreurs[code] = message;
      }
    }
    setPreparees(restantes);
    setErreursParPiece(erreurs);
    setRemplacer(new Set());
    setJoindreNinea(false);
    setBilan({ envoyees: reussies });
    setEnvoiEnCours(false);
    await Promise.all([
      client.invalidateQueries({ queryKey: [...CLE_PIECES] }),
      client.invalidateQueries({ queryKey: [...CLE_DEMARRAGE] }),
    ]);
  };

  const restent = pieces.filter((p) => p.required && aDonner(p)).map((p) => t(`noms.${p.code}`));

  // L'action principale : dans l'en-tête dès `md` (taille de la console), collée en bas au téléphone (48 px, la barre).
  const bouton = (taille: 'default' | 'xl') => (
    <Button type="submit" form={ID_DU_FORMULAIRE} size={taille} disabled={envoiEnCours || lue.isPending || pieces.length === 0} className="max-md:w-full">
      {envoiEnCours ? t('envoi.enCours') : t('envoyer')}
    </Button>
  );

  const ligne = (p: PieceDuProfil & { readonly code: CodeDePiece }, disposition: 'carte' | 'tableau') => (
    <LigneDePiece
      key={p.code}
      piece={p}
      disposition={disposition}
      prepare={preparees[p.code]}
      apercu={apercus[p.code]}
      erreur={erreursParPiece[p.code]}
      enRemplacement={remplacer.has(p.code)}
      onRemplacer={() => setRemplacer((avant) => new Set(avant).add(p.code))}
      onChoisir={(fichier) => choisir(p.code, fichier)}
      onReprendre={() => preparer(p.code, undefined)}
      ninea={
        p.kind === 'file_and_number'
          ? {
              valeur: ninea,
              erreur: erreurNinea,
              joindre: joindreNinea,
              onSaisir: (v) => {
                setNinea(v);
                setErreurNinea(null);
                setRien(false);
              },
              onJoindre: () => {
                setJoindreNinea(true);
                setNinea('');
                setErreurNinea(null);
              },
            }
          : undefined
      }
    />
  );

  return (
    <PagePleineLargeur>
      <DeclarerEnTete
        titre={t('titre')}
        formulaire
        droite={
          pieces.length > 0 ? (
            <span className="pr-4 text-sm tabular-nums text-muted-foreground" data-slot="compte-des-pieces">
              {t('compte', { envoyees, requises })}
            </span>
          ) : undefined
        }
      />
      <form
        id={ID_DU_FORMULAIRE}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer();
        }}
        className="max-md:px-4 max-md:pb-8 max-md:pt-4"
        data-slot="vos-pieces"
      >
        <div className="max-md:hidden">
          <PageHeader
            title={t('titre')}
            description={t('enAttendant')}
            fil={{ label: tRacine('console.pageHeader.breadcrumb'), etapes: [{ label: t('fil') }, { label: t('titre') }] }}
            actions={bouton('default')}
          />
        </div>

        {/* Au téléphone, la ligne d'information de la maquette ; au bureau, elle est le sous-titre. */}
        <p className="flex items-start gap-2.5 rounded-2xl bg-muted/70 p-3.5 text-ui leading-snug md:hidden">
          <Info className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold">{t('enAttendant')}</span>
        </p>

        <Annonces bilan={bilan} restent={restent} rien={rien} />

        {lue.isPending ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : lue.isError ? (
          <ErrorState className="mt-4" message={t('erreurs.lecture')} onRetry={() => void lue.refetch()} retryLabel={t('reessayer')} />
        ) : pieces.length === 0 || !profil ? (
          <EmptyState className="mt-4" title={t('aucune')} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:pt-6 xl:grid-cols-[1fr_20rem]">
            <div>
              <div className="mt-4 space-y-3 lg:hidden">{pieces.map((p) => ligne(p, 'carte'))}</div>
              <div className="overflow-hidden rounded-xl border border-border bg-card max-lg:hidden" role="table" aria-label={t('titre')}>
                <div role="row" className="grid grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1.4fr)] gap-4 border-b border-border px-5 py-2.5 text-xs font-medium text-muted-foreground">
                  <span role="columnheader">{t('colonnes.piece')}</span>
                  <span role="columnheader">{t('colonnes.etat')}</span>
                  <span role="columnheader">{t('colonnes.action')}</span>
                </div>
                {pieces.map((p) => ligne(p, 'tableau'))}
              </div>
              <Legende className="mt-5 justify-center lg:hidden" />
            </div>
            <aside className="max-lg:hidden">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">{t('legende')}</p>
                <Legende className="mt-2.5" />
              </div>
            </aside>
          </div>
        )}
      </form>
      <BarreDAction taille="action">{bouton('xl')}</BarreDAction>
    </PagePleineLargeur>
  );
}

/** Ce que l'envoi a fait, et ce qui reste : un envoi partiel est permis et le dit. */
function Annonces({ bilan, restent, rien }: { readonly bilan: { readonly envoyees: number } | null; readonly restent: readonly string[]; readonly rien: boolean }) {
  const t = useTranslations('pieces.envoi');
  return (
    <div role="status" aria-live="polite" data-slot="bilan-de-l-envoi" className="empty:hidden mt-4 space-y-1 text-ui">
      {rien ? <p className="text-muted-foreground">{t('rien')}</p> : null}
      {bilan && bilan.envoyees > 0 ? (
        <p>
          <span className="font-semibold">{t('fait', { n: bilan.envoyees })}</span>{' '}
          {restent.length > 0 ? t('reste', { pieces: restent.join(', ') }) : t('tout')}
        </p>
      ) : null}
    </div>
  );
}

/** À fournir › Envoyée › Vérifiée — les trois états d'une pièce. */
function Legende({ className }: { readonly className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)} data-slot="legende-des-etats">
      <PastilleDePiece etat="missing" />
      <ChevronRight className="size-3.5" aria-hidden="true" />
      <PastilleDePiece etat="sent" />
      <ChevronRight className="size-3.5" aria-hidden="true" />
      <PastilleDePiece etat="verified" />
    </div>
  );
}

export function PastilleDePiece({ etat }: { readonly etat: EtatDePiece }) {
  const t = useTranslations('pieces.etats');
  const mot = motDEtat(etat);
  switch (mot) {
    case 'verifiee':
      return <StatusBadge tone="success" label={t(mot)} icon={<Check className="size-3" strokeWidth={2.5} aria-hidden="true" />} />;
    case 'envoyee':
      return <StatusBadge tone="info" label={t(mot)} />;
    case 'aRefaire':
      return <StatusBadge tone="danger" label={t(mot)} />;
    default:
      return <StatusBadge tone="neutral" label={t(mot)} />;
  }
}

interface SaisieDuNinea {
  readonly valeur: string;
  readonly erreur: string | null;
  readonly joindre: boolean;
  readonly onSaisir: (v: string) => void;
  readonly onJoindre: () => void;
}

interface LigneDePieceProps {
  readonly piece: PieceDuProfil & { readonly code: CodeDePiece };
  readonly disposition: 'carte' | 'tableau';
  readonly prepare: PiecePreparee | undefined;
  readonly apercu: string | undefined;
  readonly erreur: string | undefined;
  readonly enRemplacement: boolean;
  readonly onRemplacer: () => void;
  readonly onChoisir: (fichier: File | undefined) => void;
  readonly onReprendre: () => void;
  readonly ninea?: SaisieDuNinea;
}

/** Une pièce : son nom, à quoi elle sert, son état, et ce qu'on peut en faire. */
function LigneDePiece({ piece, disposition, prepare, apercu, erreur, enRemplacement, onRemplacer, onChoisir, onReprendre, ninea }: LigneDePieceProps) {
  const t = useTranslations('pieces');
  const Icone = ICONES[piece.code];
  // Une pièce facultative encore à fournir le dit au lieu d'un état : « Facultatif » pour LE NINEA (maquette a-3),
  // « Facultative » pour l'assurance.
  const etat =
    !piece.required && piece.state === 'missing' ? (
      <span className="text-xs text-muted-foreground">{t(piece.code === 'ninea' ? 'facultatif' : 'facultative')}</span>
    ) : (
      <PastilleDePiece etat={piece.state} />
    );
  // Décision 2b (porteur, 2026-11-13) — l'API ne rend le NINEA facultatif qu'au bailleur qui n'est pas une société : la
  // condition se dit alors, comme la maquette (« Si vos biens sont en société »).
  const cleDuDetail = piece.code === 'ninea' && !piece.required ? 'details.nineaFacultatif' : `details.${piece.code}`;
  const detail = t.has(cleDuDetail) ? t(cleDuDetail) : null;

  const fichierPrepare = prepare && 'fichier' in prepare ? prepare.fichier : null;
  const gestes = <Gestes disposition={disposition} nom={t(`noms.${piece.code}`)} onChoisir={onChoisir} />;

  let action: ReactNode;
  let enHaut = false;
  if (fichierPrepare) {
    action = <Apercu fichier={fichierPrepare} url={apercu} onReprendre={onReprendre} />;
  } else if (ninea && (aDonner(piece) || enRemplacement) && !ninea.joindre) {
    action = <ChampNinea saisie={ninea} />;
    enHaut = true;
  } else if (aDonner(piece) || enRemplacement) {
    action = gestes;
  } else {
    action = <Envoyee piece={piece} onRemplacer={piece.state === 'verified' ? undefined : onRemplacer} />;
  }

  const enTete = (
    <div className="flex min-w-0 items-start gap-3">
      <Icone className="mt-0.5 size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-tight">
        <h2 className="text-corps font-semibold">{t(`noms.${piece.code}`)}</h2>
        {detail ? <p className="mt-0.5 text-ui text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
  const message = erreur ? (
    <p role="alert" className="mt-1.5 text-ui text-destructive">
      {erreur}
    </p>
  ) : null;

  if (disposition === 'tableau') {
    // Le champ du NINEA est haut (aide, lien) : la ligne s'aligne en haut, l'état au niveau du champ (maquette).
    return (
      <div
        role="row"
        data-slot="piece"
        data-piece={piece.code}
        className={cn(
          'grid grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1.4fr)] gap-4 border-b border-border px-5 py-4 last:border-b-0',
          enHaut ? 'items-start' : 'items-center',
        )}
      >
        <div role="cell">{enTete}</div>
        <div role="cell" className={cn(enHaut && 'pt-2.5')}>
          {etat}
        </div>
        <div role="cell">
          {action}
          {message}
        </div>
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-slot="piece" data-piece={piece.code}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{enTete}</div>
        {etat}
      </div>
      <div className="mt-3.5">
        {action}
        {message}
      </div>
    </section>
  );
}

/**
 * Les gestes d'une pièce à fournir. Au téléphone, deux gestes de même poids : la photographier (`capture="environment"`,
 * l'appareil arrière) ou choisir un fichier. Au bureau, une zone de dépôt — glisser un fichier, ou parcourir.
 */
function Gestes({ disposition, nom, onChoisir }: { readonly disposition: 'carte' | 'tableau'; readonly nom: string; readonly onChoisir: (f: File | undefined) => void }) {
  const t = useTranslations('pieces.gestes');
  const [survol, setSurvol] = useState(false);
  const surChoix = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChoisir(e.target.files?.[0]);
    e.target.value = '';
  };
  const geste = 'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-semibold focus-within:ring-3 focus-within:ring-ring';

  if (disposition === 'tableau') {
    return (
      <div
        data-slot="depot"
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          onChoisir(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex h-13 items-center justify-center gap-1.5 rounded-xl border border-dashed border-foreground/25 text-sm text-muted-foreground',
          survol && 'border-primary bg-secondary/40',
        )}
      >
        {t('deposer')}{' '}
        <label className="cursor-pointer font-medium text-primary underline underline-offset-4 focus-within:ring-3 focus-within:ring-ring">
          {t('parcourir')}
          <input type="file" accept={KYC_MIME_ACCEPT} className="sr-only" aria-label={t('parcourirLa', { piece: nom })} onChange={surChoix} />
        </label>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2" data-slot="gestes">
      <label className={cn(geste, 'bg-secondary text-primary-deep')}>
        <Camera className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('photo')}
        <input
          type="file"
          accept={KYC_MIME_ACCEPT}
          capture="environment"
          className="sr-only"
          aria-label={t('photoDe', { piece: nom })}
          onChange={surChoix}
        />
      </label>
      <label className={cn(geste, 'border border-foreground/20 bg-card')}>
        <Paperclip className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('fichier')}
        <input type="file" accept={KYC_MIME_ACCEPT} className="sr-only" aria-label={t('fichierDe', { piece: nom })} onChange={surChoix} />
      </label>
    </div>
  );
}

/** Le fichier préparé, avant l'envoi : sa vignette (une photo) ou son nom, et « Reprendre ». */
function Apercu({ fichier, url, onReprendre }: { readonly fichier: File; readonly url: string | undefined; readonly onReprendre: () => void }) {
  const t = useTranslations('pieces');
  const tTaille = useTranslations('pieces.taille');
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5" data-slot="apercu">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- un aperçu local (blob:), que `next/image` ne sert pas.
        <img src={url} alt={t('apercu')} className="size-9 flex-none rounded-lg object-cover" />
      ) : (
        <span className="inline-flex size-9 flex-none items-center justify-center rounded-lg bg-card text-muted-foreground">
          <FileText className="size-icone" strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{fichier.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{t('pretAEnvoyer', { taille: tailleLisible(fichier.size, tTaille) })}</span>
      </span>
      <button type="button" className={LIEN_DE_LIGNE} onClick={onReprendre}>
        {t('reprendre')}
      </button>
    </div>
  );
}

function tailleLisible(octets: number, t: (cle: 'ko' | 'mo', valeurs: { n: number }) => string): string {
  return octets >= 1024 * 1024
    ? t('mo', { n: Math.round((octets / (1024 * 1024)) * 10) / 10 })
    : t('ko', { n: Math.max(1, Math.round(octets / 1024)) });
}

/** Une pièce envoyée ou vérifiée : son fichier (nom, taille, envoi) ou, pour le NINEA tapé, sa forme masquée. */
function Envoyee({ piece, onRemplacer }: { readonly piece: PieceDuProfil; readonly onRemplacer?: () => void }) {
  const t = useTranslations('pieces');
  const tTaille = useTranslations('pieces.taille');
  const f = useFormatteurs();
  const fichier: FichierDePiece | null | undefined = piece.file;
  const jourDe = (d: Date) => f.date(d, { dateStyle: undefined, year: 'numeric', month: '2-digit', day: '2-digit' });

  let nom: string;
  let detail: string | null;
  if (fichier) {
    nom = fichier.name;
    const taille = tailleLisible(fichier.size, tTaille);
    detail = fichier.sent_at
      ? t('envoyeeLe', {
          taille,
          jour: jourRelatif(fichier.sent_at, new Date(), jourDe),
          date: f.jourMois(fichier.sent_at),
          heure: f.heure(fichier.sent_at),
        })
      : taille;
  } else if (piece.number_masked) {
    nom = piece.number_masked;
    detail = t('ninea.enregistre');
  } else {
    nom = t('sansDetail');
    detail = null;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5" data-slot="fichier-envoye">
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-lg bg-card text-muted-foreground">
        {piece.number_masked && !fichier ? (
          <Hash className="size-icone" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <FileText className="size-icone" strokeWidth={1.5} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium tabular-nums">{nom}</span>
        {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      {onRemplacer ? (
        <button type="button" className={LIEN_DE_LIGNE} onClick={onRemplacer}>
          {t('remplacer')}
        </button>
      ) : null}
    </div>
  );
}

/** Le NINEA, tapé : un champ texte, la forme en aide, l'erreur dessous ; « Joindre le fichier » en lien discret. */
function ChampNinea({ saisie }: { readonly saisie: SaisieDuNinea }) {
  const t = useTranslations('pieces.ninea');
  const id = useId();
  const aide = `${id}-aide`;
  const erreur = `${id}-erreur`;
  return (
    <div data-slot="champ-ninea">
      <label htmlFor={id} className="sr-only">
        {t('libelle')}
      </label>
      <Input
        id={id}
        value={saisie.valeur}
        onChange={(e) => saisie.onSaisir(e.target.value)}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder={t('exemple')}
        aria-invalid={saisie.erreur ? true : undefined}
        aria-describedby={saisie.erreur ? `${erreur} ${aide}` : aide}
        className="text-corps tabular-nums"
      />
      {saisie.erreur ? (
        <p id={erreur} role="alert" className="mt-1.5 text-ui text-destructive">
          {saisie.erreur}
        </p>
      ) : null}
      <p id={aide} className="mt-1.5 text-ui text-muted-foreground">
        {t('aide')}
      </p>
      <Button type="button" variant="link" className="mt-1 h-auto px-0 text-ui text-muted-foreground" onClick={saisie.onJoindre}>
        {t('joindre')}
      </Button>
    </div>
  );
}
