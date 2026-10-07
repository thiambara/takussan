'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Download, FileText, Link2Off, Loader2, Lock, SearchX } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
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
 */
export function ShareReception({ token }: ShareReceptionProps) {
  const t = useTranslations('shareReception');
  const format = useFormatter();
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

  // L'encre atténuée porte son fond (celui de la page, ou du panneau `bg-card` qui l'entoure) :
  // sans lui, la garde de contraste de la surface publique la compte comme encre inverse non
  // mesurée (`surface-publique.contraste.test.ts`).
  if (etat.kind === 'loading') {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm bg-background text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('loading')}
      </p>
    );
  }

  if (etat.kind === 'gone') {
    return (
      <EmptyState
        data-testid="share-gone"
        icon={<Link2Off className="size-8" aria-hidden="true" />}
        title={t('goneTitle')}
        description={t('goneDescription')}
      />
    );
  }

  if (etat.kind === 'notFound') {
    return (
      <EmptyState
        data-testid="share-not-found"
        icon={<SearchX className="size-8" aria-hidden="true" />}
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
      />
    );
  }

  if (etat.kind === 'error') {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => {
          setEtat({ kind: 'loading' });
          setTentative((n) => n + 1);
        }}
        retryLabel={t('retry')}
      />
    );
  }

  if (etat.kind === 'password') {
    return (
      <form
        onSubmit={ouvrir}
        className="mx-auto max-w-sm space-y-4 rounded-xl border border-border bg-card p-6"
        data-testid="share-password-form"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-muted p-3 text-accent">
            <Lock className="size-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base font-semibold text-foreground">{t('passwordTitle')}</h2>
        </div>
        <p className="bg-card text-sm text-muted-foreground">{t('passwordHint')}</p>
        <div className="space-y-2">
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
          {etat.wrong ? (
            <p id="share-password-error" className="text-sm text-destructive" role="alert">
              {t('wrongPassword')}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={envoi || !motDePasse}>
          {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('submit')}
        </Button>
      </form>
    );
  }

  const { doc } = etat;
  const restants =
    doc.max_downloads === null ? null : Math.max(0, doc.max_downloads - doc.downloads_count);

  return (
    <div
      className="mx-auto max-w-md space-y-5 rounded-xl border border-border bg-card p-6"
      data-testid="share-document"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-muted p-3 text-accent">
          <FileText className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="bg-card text-xs uppercase tracking-wide text-muted-foreground">{t('name')}</p>
          <h2 className="font-display text-base font-semibold break-words text-foreground">
            {doc.document.name}
          </h2>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm">
        {doc.document.size !== null ? (
          <div className="flex justify-between gap-4">
            <dt className="bg-card text-muted-foreground">{t('size')}</dt>
            <dd className="tabular-nums text-foreground">
              {format.number(doc.document.size / 1024 / 1024, {
                style: 'unit',
                unit: 'megabyte',
                maximumFractionDigits: 2,
              })}
            </dd>
          </div>
        ) : null}
        {doc.expires_at ? (
          <p className="bg-card text-muted-foreground">
            {t('expiresAt', {
              date: format.dateTime(new Date(doc.expires_at), { dateStyle: 'medium', timeStyle: 'short' }),
            })}
          </p>
        ) : null}
        {restants !== null ? (
          <p className="bg-card text-muted-foreground">{t('downloadsLeft', { count: restants })}</p>
        ) : null}
      </dl>
      {erreurTelechargement ? (
        <p className="text-sm text-destructive" role="alert">
          {t('downloadError')}
        </p>
      ) : null}
      <Button className="w-full" onClick={() => void telecharger(doc)} disabled={telechargement}>
        {telechargement ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
        {telechargement ? t('downloading') : t('download')}
      </Button>
    </div>
  );
}
