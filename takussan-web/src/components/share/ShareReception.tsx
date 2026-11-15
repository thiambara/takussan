'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { CalendarClock, Download, FileText, Loader2, Lock, SearchX } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { BasDeLien } from '@/components/lien-public/BasDeLien';
import { CarteDeLien } from '@/components/lien-public/CarteDeLien';
import { EnTeteDeLien } from '@/components/lien-public/EnTeteDeLien';
import { LienMort } from '@/components/lien-public/LienMort';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import {
  downloadSharedDocument,
  fetchSharedDocument,
  type SharedDocument,
} from '@/lib/queries/share-reception';

type Etat =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly doc: SharedDocument }
  | { readonly kind: 'password'; readonly wrong: boolean }
  | { readonly kind: 'gone' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error' };

/** L'état que nomme une réponse d'erreur de l'API ; `null` pour une erreur sans état propre. */
function etatDeLErreur(err: unknown, motDePasseEnvoye: boolean): Etat | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 401) return { kind: 'password', wrong: motDePasseEnvoye };
  if (err.status === 410) return { kind: 'gone' };
  if (err.status === 404) return { kind: 'notFound' };
  return null;
}

interface ShareReceptionProps {
  readonly token: string;
}

/**
 * TCK-587 §8 (AC15) — la page de réception d'un lien de partage, sur l'origine du front.
 *
 * Avant ce ticket, `DocumentShareDialog` distribuait `${origin}/api/share/{token}` : une URL du
 * FRONT où aucun gestionnaire n'existait. Le destinataire n'avait ni page ni formulaire, et la
 * seule voie d'un lien protégé était d'ajouter `?password=` à la main — dans l'URL, donc dans
 * l'historique, les journaux du proxy et le `Referer`.
 *
 * Le mot de passe ne vit qu'ici, en mémoire : il part dans le CORPS d'un `POST`, pour la lecture
 * comme pour le téléchargement, et jamais dans une URL. Le 401 du `GET` initial est ce qui dit
 * qu'il en faut un.
 *
 * TCK-2514 : « la carte au centre », dans la coque de lien nue ; le téléchargement (ou l'ouverture
 * d'un document protégé) sous le pouce ; un lien mort a ses deux issues.
 */
export function ShareReception({ token }: ShareReceptionProps) {
  const t = useTranslations('shareReception');
  const tL = useTranslations('lienPublic.document');
  const format = useFormatter();
  const fmt = useFormatteurs();
  const [etat, setEtat] = useState<Etat>({ kind: 'loading' });
  const [motDePasse, setMotDePasse] = useState('');
  const [motDePasseValide, setMotDePasseValide] = useState<string | undefined>(undefined);
  const [envoi, setEnvoi] = useState(false);
  const [telechargement, setTelechargement] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState(false);
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let annule = false;
    fetchSharedDocument(token)
      .then((doc) => {
        if (!annule) setEtat({ kind: 'ready', doc });
      })
      .catch((err: unknown) => {
        if (!annule) setEtat(etatDeLErreur(err, false) ?? { kind: 'error' });
      });
    return () => {
      annule = true;
    };
  }, [token, tentative]);

  const ouvrir = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!motDePasse) return;
      setEnvoi(true);
      try {
        const doc = await fetchSharedDocument(token, motDePasse);
        setMotDePasseValide(motDePasse);
        setEtat({ kind: 'ready', doc });
      } catch (err) {
        setEtat(etatDeLErreur(err, true) ?? { kind: 'error' });
      } finally {
        setEnvoi(false);
      }
    },
    [token, motDePasse],
  );

  const telecharger = useCallback(
    async (doc: SharedDocument) => {
      setTelechargement(true);
      setErreurTelechargement(false);
      try {
        const fichier = await downloadSharedDocument(token, motDePasseValide);
        const url = URL.createObjectURL(fichier);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = doc.document.name;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        // Un lien épuisé ENTRE la lecture et le téléchargement est un état, pas une panne.
        const nomme = etatDeLErreur(err, motDePasseValide !== undefined);
        if (nomme) setEtat(nomme);
        else setErreurTelechargement(true);
      } finally {
        setTelechargement(false);
      }
    },
    [token, motDePasseValide],
  );

  const enTete = (
    <EnTeteDeLien
      mention={
        <>
          <Lock className="size-3.5" aria-hidden="true" />
          {tL('prive')}
        </>
      }
    />
  );

  if (etat.kind === 'loading') {
    return (
      <>
        {enTete}
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      </>
    );
  }

  if (etat.kind === 'gone') {
    return (
      <>
        {enTete}
        <LienMort data-testid="share-gone" titre={t('goneTitle')}>
          {t('goneDescription')}
        </LienMort>
      </>
    );
  }

  if (etat.kind === 'notFound') {
    return (
      <>
        {enTete}
        <LienMort data-testid="share-not-found" icone={<SearchX />} titre={t('notFoundTitle')}>
          {t('notFoundDescription')}
        </LienMort>
      </>
    );
  }

  if (etat.kind === 'error') {
    return (
      <>
        {enTete}
        <div className="px-5 py-10">
          <ErrorState
            message={t('error')}
            onRetry={() => {
              setEtat({ kind: 'loading' });
              setTentative((n) => n + 1);
            }}
            retryLabel={t('retry')}
          />
        </div>
      </>
    );
  }

  if (etat.kind === 'password') {
    return (
      <>
        {enTete}
        <CarteDeLien data-testid="share-password-form" ton="alerte" icone={<Lock />} titre={t('passwordTitle')}>
          {t('passwordHint')}
        </CarteDeLien>
        <form id="share-password-form" onSubmit={ouvrir} className="mx-auto w-full max-w-88 space-y-3 px-5 pb-8 pt-6">
          {etat.wrong ? <ErrorState id="share-password-error" message={t('wrongPassword')} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="share-password">{t('passwordLabel')}</Label>
            <Input
              id="share-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              aria-invalid={etat.wrong || undefined}
              aria-describedby={etat.wrong ? 'share-password-error' : undefined}
            />
          </div>
        </form>
        <BasDeLien>
          <Button
            type="submit"
            form="share-password-form"
            size="lg"
            className="h-12 w-full text-[0.9375rem] font-semibold"
            disabled={envoi || !motDePasse}
          >
            {envoi ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('submit')}
          </Button>
        </BasDeLien>
      </>
    );
  }

  const { doc } = etat;
  const restants =
    doc.max_downloads === null ? null : Math.max(0, doc.max_downloads - doc.downloads_count);
  // Le format se lit au nom du fichier (« Bail.pdf » → « PDF ») : `document.type` est la catégorie
  // du document dans l'espace de l'agence, pas son format.
  const extension = /\.([a-z0-9]{1,5})$/i.exec(doc.document.name)?.[1]?.toUpperCase() ?? null;
  const taille =
    doc.document.size !== null
      ? fmt.nombre(doc.document.size / 1024 / 1024, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })
      : null;

  return (
    <>
      {enTete}
      <section className="px-4 pb-8 pt-8 lg:px-6 lg:pt-6" data-testid="share-document">
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">{t('title')}</h1>
        <div className="mt-5 flex items-start gap-3.5 rounded-2xl border border-border bg-card p-4">
          <span className="inline-flex size-12 flex-none items-center justify-center rounded-xl bg-secondary text-primary-deep" aria-hidden="true">
            <FileText className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="sr-only">{t('name')}</p>
            <p className="font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{doc.document.name}</p>
            {extension || taille ? (
              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                {extension}
                {extension && taille ? ' · ' : null}
                {taille ? (
                  <>
                    <span className="sr-only">{t('size')} </span>
                    {taille}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        {doc.expires_at || restants !== null ? (
          <ul className="mt-3 space-y-2 px-1 text-[0.9375rem] text-foreground">
            {doc.expires_at ? (
              <li className="flex items-center gap-2.5">
                <CalendarClock className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                {t('expiresAt', {
                  date: format.dateTime(new Date(doc.expires_at), { dateStyle: 'medium', timeStyle: 'short' }),
                })}
              </li>
            ) : null}
            {restants !== null ? (
              <li className="flex items-center gap-2.5 tabular-nums">
                <Download className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                {t('downloadsLeft', { count: restants })}
              </li>
            ) : null}
          </ul>
        ) : null}
        {restants !== null ? <p className="mt-6 text-[0.8125rem] leading-relaxed text-muted-foreground">{tL('compte')}</p> : null}
      </section>
      <BasDeLien>
        {erreurTelechargement ? <ErrorState message={t('downloadError')} /> : null}
        <Button
          size="lg"
          className="h-12 w-full text-[0.9375rem] font-semibold"
          onClick={() => void telecharger(doc)}
          disabled={telechargement}
        >
          {telechargement ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          {telechargement ? t('downloading') : t('download')}
        </Button>
      </BasDeLien>
    </>
  );
}
