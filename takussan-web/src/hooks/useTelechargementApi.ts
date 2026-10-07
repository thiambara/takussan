'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';

/**
 * TCK-593 (Partie 1) — LE mécanisme de téléchargement d'un document protégé de l'API.
 *
 * Les liens `<a href="/api/…/pdf">` du contrat de bail et du reçu d'acompte étaient RELATIFS : ils
 * frappaient l'origine Next, qui n'a pas ces routes (404), et même dirigés vers l'API ils
 * n'auraient porté aucun jeton — la session est un `Bearer` Sanctum, pas un cookie de l'API.
 *
 * D'où la forme d'`InventoryPdfButton` (TCK-076), généralisée : `fetch` vers l'ORIGINE DE L'API
 * avec le `Bearer`, lecture en blob, puis un `<a download>` éphémère. Le nom du fichier est fourni
 * par l'appelant : l'API n'expose aucun en-tête (`cors.exposed_headers = []`), le
 * `Content-Disposition` est donc illisible depuis le navigateur.
 *
 * L'échec est rendu comme une CATÉGORIE, jamais comme la prose du serveur : un 403 ou un 422 doit
 * se lire dans la langue de l'utilisateur, et c'est le composant qui la traduit.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

export type EchecTelechargement = 'interdit' | 'indisponible' | 'echec';

function categorie(status: number): EchecTelechargement {
  if (status === 401 || status === 403) return 'interdit';
  if (status === 404 || status === 409 || status === 422) return 'indisponible';
  return 'echec';
}

export function useTelechargementApi() {
  const { token } = useAuth();
  const locale = useLocale();
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<EchecTelechargement | null>(null);

  /**
   * @param chemin chemin de l'API, `/api` COMPRIS (`/api/leases/12/contract/pdf`)
   * @param nomFichier nom proposé au navigateur — l'en-tête du serveur n'est pas lisible
   */
  async function telecharger(chemin: string, nomFichier: string): Promise<boolean> {
    setEnCours(true);
    setEchec(null);
    try {
      const response = await fetch(`${API_URL}${chemin}`, {
        headers: {
          Accept: 'application/pdf',
          'Accept-Language': locale,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        setEchec(categorie(response.status));
        return false;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = objectUrl;
      lien.download = nomFichier;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(objectUrl);
      return true;
    } catch {
      setEchec('echec');
      return false;
    } finally {
      setEnCours(false);
    }
  }

  return { telecharger, enCours, echec };
}
