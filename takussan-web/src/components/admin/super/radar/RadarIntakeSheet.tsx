'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CopyCheck, Loader2, X } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { postRadarListings, radarKeys } from '@/lib/queries/radar';
import {
  RADAR_SOURCE_SITES,
  type RadarIntakePayload,
  type RadarIntakeResponse,
  type RadarIntakeRow,
  type RadarSourceSite,
} from '@/types/radar';
import { ERREURS_SAISIE_RADAR } from './codes-radar';

type Onglet = 'urls' | 'text' | 'captures';

/** Les types que l'API lit dans le contenu (`config('radar.captures.mimes')`). */
export const CAPTURES_ACCEPT = 'image/jpeg,image/png,image/webp';

interface DernierEnvoi {
  readonly rows: readonly RadarIntakeRow[];
  /** Les URL envoyées, dans l'ordre : l'API rend une ligne par URL, dans le même ordre. */
  readonly urls?: readonly string[];
}

interface RadarIntakeSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function lignesNonVides(valeur: string): string[] {
  return valeur.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
}

function codeDe(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return undefined;
  const code = (erreur.data as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * TCK-2386 (ADR-0077) — la saisie rapide du Radar : URL (une par ligne), texte collé, ou captures
 * d'écran. On colle, on enregistre : le champ se vide, le panneau reste ouvert pour la suivante,
 * et le retour dit, ligne par ligne, « créée » ou « déjà saisie » (même empreinte, aucun nouveau
 * passage). Un refus 422 se lit par son code.
 *
 * Les listes du tableau de bord sont invalidées après chaque envoi réussi.
 */
export function RadarIntakeSheet({ open, onOpenChange }: RadarIntakeSheetProps) {
  const t = useTranslations('superAdmin.pages.radar');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();

  const [onglet, setOnglet] = useState<Onglet>('urls');
  const [urls, setUrls] = useState('');
  const [texte, setTexte] = useState('');
  const [captures, setCaptures] = useState<File[]>([]);
  // Une nouvelle clé remonte le champ fichier : c'est la seule façon de le vider.
  const [cleCaptures, setCleCaptures] = useState(0);
  const [site, setSite] = useState<RadarSourceSite>('other');
  const [dernier, setDernier] = useState<DernierEnvoi | null>(null);

  const mutation = useMutation<RadarIntakeResponse, ApiError, RadarIntakePayload>({
    mutationFn: postRadarListings,
    onSuccess: (reponse, payload) => {
      setDernier({ rows: reponse.data, urls: payload.kind === 'urls' ? payload.urls : undefined });
      if (payload.kind === 'urls') setUrls('');
      if (payload.kind === 'text') setTexte('');
      if (payload.kind === 'captures') {
        setCaptures([]);
        setCleCaptures((c) => c + 1);
      }
      void queryClient.invalidateQueries({ queryKey: radarKeys.all });
    },
  });

  const messageEchec = (erreur: ApiError): string => {
    const code = codeDe(erreur);
    if (code && ERREURS_SAISIE_RADAR[code]) return t(`intake.errors.${ERREURS_SAISIE_RADAR[code]}`);
    const validation = erreur.validationErrors;
    if (validation) {
      const messages = Object.values(validation).flat().filter(Boolean);
      if (messages.length > 0) return messages.join(' ');
    }
    return messageErreur(erreur, t('intake.failed'));
  };

  const lignes = lignesNonVides(urls);
  const pret = onglet === 'urls' ? lignes.length > 0 : onglet === 'text' ? texte.trim() !== '' : captures.length > 0;

  const envoyer = (event: FormEvent) => {
    event.preventDefault();
    if (!pret || mutation.isPending) return;
    setDernier(null);
    if (onglet === 'urls') mutation.mutate({ kind: 'urls', urls: lignes });
    else if (onglet === 'text') mutation.mutate({ kind: 'text', text: texte, sourceSite: site });
    else mutation.mutate({ kind: 'captures', files: captures, sourceSite: site });
  };

  const siteOptions = RADAR_SOURCE_SITES.map((s) => ({ value: s, label: t(`sites.${s}`) }));
  const choixDuSite = (
    <div className="space-y-1.5">
      <Label id="radar-intake-site-label">{t('intake.sourceSiteLabel')}</Label>
      <Select value={site} onValueChange={(next) => { if (next) setSite(next as RadarSourceSite); }} items={siteOptions}>
        <SelectTrigger className="h-10 w-full" aria-labelledby="radar-intake-site-label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {siteOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md border-l border-border sm:max-w-lg" data-testid="radar-intake-sheet">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <SheetHeader className="min-w-0">
            <SheetTitle className="font-display text-lg tracking-tight">{t('intake.title')}</SheetTitle>
            <SheetDescription>{t('intake.description')}</SheetDescription>
          </SheetHeader>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label={t('intake.close')}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <form onSubmit={envoyer} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <Tabs value={onglet} onValueChange={(v) => { setOnglet(v as Onglet); mutation.reset(); }}>
              <TabsList>
                <TabsTrigger value="urls">{t('intake.tabs.urls')}</TabsTrigger>
                <TabsTrigger value="text">{t('intake.tabs.text')}</TabsTrigger>
                <TabsTrigger value="captures">{t('intake.tabs.captures')}</TabsTrigger>
              </TabsList>

              <TabsContent value="urls" className="space-y-1.5 pt-3">
                <Label htmlFor="radar-intake-urls">{t('intake.urlsLabel')}</Label>
                <Textarea
                  id="radar-intake-urls"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  rows={6}
                  className="min-h-32 font-mono text-sm"
                  aria-describedby="radar-intake-urls-hint"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p id="radar-intake-urls-hint" className="text-xs text-muted-foreground">{t('intake.urlsHint')}</p>
              </TabsContent>

              <TabsContent value="text" className="space-y-4 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="radar-intake-text">{t('intake.textLabel')}</Label>
                  <Textarea
                    id="radar-intake-text"
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    rows={8}
                    className="min-h-40"
                    aria-describedby="radar-intake-text-hint"
                  />
                  <p id="radar-intake-text-hint" className="text-xs text-muted-foreground">{t('intake.textHint')}</p>
                </div>
                {choixDuSite}
              </TabsContent>

              <TabsContent value="captures" className="space-y-4 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="radar-intake-captures">{t('intake.capturesLabel')}</Label>
                  <Input
                    key={cleCaptures}
                    id="radar-intake-captures"
                    type="file"
                    multiple
                    accept={CAPTURES_ACCEPT}
                    className="h-10 py-1.5"
                    aria-describedby="radar-intake-captures-hint"
                    onChange={(e) => setCaptures(Array.from(e.target.files ?? []))}
                  />
                  <p id="radar-intake-captures-hint" className="text-xs text-muted-foreground">
                    {t('intake.capturesHint')} {t('intake.capturesSelected', { count: captures.length })}
                  </p>
                </div>
                {choixDuSite}
              </TabsContent>
            </Tabs>

            {mutation.isError ? <ErrorState message={messageEchec(mutation.error)} /> : null}

            {dernier ? (
              <section role="status" aria-label={t('intake.resultsTitle')} className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
                <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t('intake.resultsTitle')}</h3>
                <ul className="space-y-1.5 text-sm">
                  {dernier.rows.map((row, index) => (
                    <li key={`${row.id}-${index}`} className="flex items-start gap-2">
                      {row.existing
                        ? <CopyCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className="text-foreground">
                          {row.existing ? t('intake.existing', { id: row.id }) : t('intake.created', { id: row.id })}
                        </span>
                        {dernier.urls?.[index] ? (
                          <span className="block truncate text-xs text-muted-foreground">{dernier.urls[index]}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border p-4">
            <Button type="submit" disabled={!pret || mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {mutation.isPending ? t('intake.submitting') : t('intake.submit')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
