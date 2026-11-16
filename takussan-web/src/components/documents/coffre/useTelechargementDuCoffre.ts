'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useTelechargementApi, type EchecTelechargement } from '@/hooks/useTelechargementApi';
import { ApiError, apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { origineApi } from '@/lib/config-publique';
import type { EntreeVue } from '@/lib/documents/coffre';

/**
 * TCK-2898 — « Télécharger » en fin de ligne du coffre, pour un document GÉNÉRÉ comme pour une pièce
 * TÉLÉVERSÉE (maquette `app-documents` a, e0), sans ouvrir la fiche.
 *
 * - un généré : son endpoint (`download_path`), en PDF ;
 * - une pièce : le coffre ne sert que sa fiche (`download_path` = `GET /api/documents/{id}`). Le fichier
 *   qui fait foi est l'URL signée `file_url` de cette fiche (30 min, TCK-539), lue AU MOMENT du geste —
 *   jamais gardée —, puis OUVERTE dans un onglet, comme « Télécharger » de la fiche. Pas de `fetch` en
 *   blob : sur un disque distant, `media/{id}/file` redirige vers une URL présignée du seau (R2), dont
 *   le CORS n'est pas celui de l'API. L'onglet s'ouvre AU CLIC (avant la lecture de la fiche), sinon le
 *   bloqueur de fenêtres le refuserait après l'attente ; il est refermé si la pièce n'a pas de fichier.
 */
interface FicheDuFichier {
  readonly data: { readonly file_url: string | null };
}

function categorie(erreur: unknown): EchecTelechargement {
  if (!(erreur instanceof ApiError)) return 'echec';
  if (erreur.status === 401 || erreur.status === 403) return 'interdit';
  if (erreur.status === 404 || erreur.status === 409 || erreur.status === 422) return 'indisponible';
  return 'echec';
}

export function useTelechargementDuCoffre() {
  const { token } = useAuth();
  const locale = useLocale();
  const base = useTelechargementApi();
  const [lecture, setLecture] = useState(false);
  const [echecDeLaFiche, setEchecDeLaFiche] = useState<EchecTelechargement | null>(null);

  async function telecharger(vue: EntreeVue, nom: string): Promise<boolean> {
    setEchecDeLaFiche(null);
    if (vue.geste.geste === 'telecharger') return base.telecharger(vue.geste.chemin, `${nom}.pdf`);
    const id = vue.entree.kind === 'uploaded' ? vue.entree.document_id : null;
    if (id === null) return false;
    setLecture(true);
    const onglet = window.open('', '_blank');
    try {
      const fiche = await apiRequest<FicheDuFichier>(cheminApi`/api/documents/${id}`, { token: token ?? undefined, locale });
      const url = fiche.data.file_url;
      if (!url) {
        onglet?.close();
        setEchecDeLaFiche('indisponible');
        return false;
      }
      // L'URL signée est absolue (`URL::to`) ; relative, elle vise l'origine de l'API.
      const lien = new URL(url, origineApi()).toString();
      if (onglet) {
        onglet.opener = null;
        onglet.location.href = lien;
      } else {
        window.open(lien, '_blank', 'noopener');
      }
      return true;
    } catch (erreur) {
      onglet?.close();
      setEchecDeLaFiche(categorie(erreur));
      return false;
    } finally {
      setLecture(false);
    }
  }

  return { telecharger, enCours: base.enCours || lecture, echec: echecDeLaFiche ?? base.echec };
}
