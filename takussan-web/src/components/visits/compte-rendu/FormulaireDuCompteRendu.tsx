'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Check, CircleHelp, Lock, Mic, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';

import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useDictee } from '@/hooks/useDictee';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ajouterALaNote, dureeDictee } from '@/lib/dictee';
import { codeDuRefus } from '@/lib/reservations/saisie-de-demande';
import { useCreateVisitReport, useUpdateVisitReport, type ReponseDuCompteRendu } from '@/lib/queries/visits';
import { OBJECTIONS, VERDICTS, type CompteRendu, type Objection, type Verdict } from '@/lib/visites/compte-rendu';
import { cn } from '@/lib/utils';

/** La borne de la note (`StorePropertyVisitReportRequest` : `note` ≤ 2000). */
const NOTE_MAX = 2000;

/** Les refus `{code}` du compte rendu (`VisitReportService`, `abort_code_*` : sans sac `errors`). */
const CODES_CONNUS = new Set(['visit.report_exists', 'visit.report_not_closable', 'visit.report_missing']);

const ICONE_DU_VERDICT: Record<Verdict, LucideIcon> = {
  interested: ThumbsUp,
  thinking: CircleHelp,
  not_interested: ThumbsDown,
};

export interface FormulaireDuCompteRenduProps {
  readonly visitId: number;
  /** Le compte rendu déjà écrit : « Modifier » (`PATCH`, les champs gardés) ; absent, `POST`. */
  readonly existant?: CompteRendu | null;
  /**
   * `telephone` — l'étape plein écran : grosses touches (92 px), pastilles de 44 px, le bouton
   * « Enregistrer » collé en bas ; `colonne` — la carte de la colonne droite du détail (dès `xl`),
   * touches de 80 px, pastilles de 36 px, « Enregistrer » à côté de « Interne à l'agence ».
   */
  readonly densite: 'telephone' | 'colonne';
  /** Le prénom de la fiche, pour la mention « rejoint la fiche de … ». `null` : visiteur sans fiche. */
  readonly prenom: string | null;
  /** Ce qui précède la question (la carte du bien, au téléphone). */
  readonly entete?: React.ReactNode;
  readonly onEnregistre: (reponse: ReponseDuCompteRendu) => void;
  /** Le verdict touché, avant l'enregistrement (l'aperçu de « Et maintenant ? », au bureau). */
  readonly onVerdict?: (verdict: Verdict) => void;
}

/**
 * TCK-2581 (ADR-0101) — « Comment s'est passée la visite ? » en trois touches : le verdict (requis),
 * « Ce qui a pesé » (facultatif, liste fermée), une note. Maquette `app-fil-commercial`, écran 4
 * (`CompteRenduMobile`, et la carte « Compte rendu » de `VisiteTermineeBureau`).
 *
 * Le corps envoyé est exactement celui de `StorePropertyVisitReportRequest` ; les trois refus
 * `{code}` (409) se disent en tête, en texte du front.
 */
export function FormulaireDuCompteRendu({ visitId, existant, densite, prenom, entete, onEnregistre, onVerdict }: FormulaireDuCompteRenduProps) {
  const t = useTranslations('compteRendu');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const creer = useCreateVisitReport(visitId);
  const modifier = useUpdateVisitReport(visitId);
  const id = useId();
  const [verdict, setVerdict] = useState<Verdict | null>(existant?.outcome ?? null);
  const [objections, setObjections] = useState<readonly Objection[]>(existant?.objections ?? []);
  const [note, setNote] = useState(existant?.note ?? '');
  const [verdictManquant, setVerdictManquant] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enCours = creer.isPending || modifier.isPending;
  const telephone = densite === 'telephone';

  function basculer(o: Objection) {
    setObjections((avant) => (avant.includes(o) ? avant.filter((x) => x !== o) : OBJECTIONS.filter((x) => x === o || avant.includes(x))));
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!verdict) {
      setVerdictManquant(true);
      return;
    }
    const corps = { outcome: verdict, objections, note: note.trim() ? note.trim() : null };
    try {
      const reponse = existant ? await modifier.mutateAsync(corps) : await creer.mutateAsync(corps);
      toast.add({ title: t('succes'), type: 'success' });
      onEnregistre(reponse);
    } catch (err) {
      const code = codeDuRefus(err);
      setErreur(code && CODES_CONNUS.has(code) ? t(`codes.${code}`) : messageErreur(err));
    }
  }

  const Titre = telephone ? 'h1' : 'h3';

  return (
    <form id={`${id}-formulaire`} onSubmit={(e) => void enregistrer(e)} noValidate className={cn(telephone ? 'space-y-5 px-4' : 'space-y-4')}>
      {entete}

      <div>
        <Titre
          id={`${id}-question`}
          className={cn(
            // Au bureau, la carte « Compte rendu » porte déjà la question (maquette a-4) : nommée, pas affichée.
            telephone ? 'mb-3 font-display text-xl font-semibold tracking-titre' : 'sr-only',
            'text-foreground',
          )}
        >
          {t('question')}
        </Titre>
        <RadioGroupPrimitive
          aria-labelledby={`${id}-question`}
          aria-describedby={verdictManquant && !verdict ? `${id}-verdict-erreur` : undefined}
          value={verdict ?? ''}
          onValueChange={(v) => {
            setVerdict(v as Verdict);
            setVerdictManquant(false);
            onVerdict?.(v as Verdict);
          }}
          className="grid grid-cols-3 gap-2"
        >
          {VERDICTS.map((v) => {
            const Icone = ICONE_DU_VERDICT[v];
            const actif = verdict === v;
            return (
              <RadioPrimitive.Root
                key={v}
                value={v}
                data-slot="verdict"
                className={cn(
                  'relative flex flex-col items-center justify-center gap-2 rounded-2xl border text-center text-sm font-semibold leading-tight outline-none transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring',
                  telephone ? 'h-23' : 'h-20',
                  actif ? 'border-success bg-success/10 text-success ring-1 ring-success' : 'border-border bg-card text-foreground hover:bg-muted/50',
                )}
              >
                <Icone className={cn('size-6 flex-none', !actif && 'text-muted-foreground')} strokeWidth={1.75} aria-hidden />
                {t(`verdicts.${v}`)}
                {actif ? (
                  <span aria-hidden className="absolute right-2 top-2 inline-flex size-4 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="size-3" strokeWidth={2} />
                  </span>
                ) : null}
              </RadioPrimitive.Root>
            );
          })}
        </RadioGroupPrimitive>
        {verdictManquant && !verdict ? (
          <p id={`${id}-verdict-erreur`} role="alert" className="mt-1.5 text-xs text-destructive">
            {t('verdictRequis')}
          </p>
        ) : null}
      </div>

      <div>
        <p id={`${id}-objections`} className={cn('mb-2 font-semibold text-foreground', telephone ? 'text-corps' : 'text-sm')}>
          {t('objectionsLibelle')} <span className="font-normal text-muted-foreground">· {t('facultatif')}</span>
        </p>
        <div role="group" aria-labelledby={`${id}-objections`} className="flex flex-wrap gap-2">
          {OBJECTIONS.map((o) => {
            const actif = objections.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={actif}
                onClick={() => basculer(o)}
                data-slot="objection"
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 font-medium outline-none transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring',
                  telephone ? 'h-11 text-corps' : 'h-9 text-sm',
                  actif ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted/50',
                )}
              >
                {actif ? <Check className="size-4" strokeWidth={1.75} aria-hidden /> : null}
                {t(`objections.${o}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-note`} className={cn(telephone ? 'mb-2 block text-corps font-semibold text-foreground' : 'sr-only')}>
          {t('note')}
        </label>
        {/* TCK-2880 — la saisie de la maquette (`NoteDictee`) : le champ et, dessous dans la même boîte,
            « Dicter » et la durée dictée. Sans reconnaissance vocale, la boîte n'a que le champ. */}
        <div
          data-slot="note-dictee"
          className={cn(
            'rounded-xl border border-input p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring',
            telephone ? 'bg-card' : 'bg-background',
          )}
        >
          <Textarea
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder={t('notePlaceholder')}
            className="min-h-20 rounded-none border-0 bg-transparent p-0 focus-visible:ring-0"
          />
          <DicteeDeLaNote onTexte={(texte) => setNote((avant) => ajouterALaNote(avant, texte, NOTE_MAX))} />
        </div>
      </div>

      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      {telephone ? (
        <>
          <p className="flex items-start gap-2 text-ui leading-snug text-muted-foreground">
            <Lock className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden />
            {prenom ? t('interne', { prenom }) : t('interneSansFiche')}
          </p>
          {/* La barre d'action collante de la coque (TCK-2689), en portail : hors du `<form>` dans le
              DOM, le bouton le nomme. 73 px : l'action `xl` de la maquette gelée (a-4). */}
          <BarreDAction>
            <Button type="submit" form={`${id}-formulaire`} size="xl" className="gap-2 rounded-xl px-3.5 font-semibold" disabled={enCours}>
              {enCours ? t('enregistrement') : t('enregistrer')}
            </Button>
          </BarreDAction>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden />
            {t('interneCourt')}
          </p>
          <Button type="submit" disabled={enCours}>
            {enCours ? t('enregistrement') : t('enregistrer')}
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * TCK-2880 — « Dicter » sous la note (maquette `app-fil-commercial` a-4, `NoteDictee`) : la
 * reconnaissance vocale du navigateur (`useDictee`), le texte reconnu ajouté à la fin de la note.
 * Absent du DOM quand le navigateur n'expose pas l'API.
 */
function DicteeDeLaNote({ onTexte }: { readonly onTexte: (texte: string) => void }) {
  const t = useTranslations('compteRendu.dictee');
  const tErreur = useTranslations('dictee.erreurs');
  const dictee = useDictee(onTexte);
  if (!dictee.disponible) return null;
  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={dictee.basculer}
          aria-pressed={dictee.ecoute}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-ui font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
            dictee.ecoute ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary-deep hover:bg-secondary/80',
          )}
        >
          <Mic className="size-4" strokeWidth={1.75} aria-hidden />
          {dictee.ecoute ? t('arreter') : t('dicter')}
        </button>
        <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
          {dictee.ecoute ? t('ecoute') : dictee.secondes > 0 ? t('duree', { duree: dureeDictee(dictee.secondes) }) : null}
        </span>
      </div>
      {dictee.erreur ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {tErreur(dictee.erreur)}
        </p>
      ) : null}
    </>
  );
}
