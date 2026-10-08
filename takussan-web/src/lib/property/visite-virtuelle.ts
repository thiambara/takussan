/**
 * TCK-598 (V19, contrainte 13) — ce que la fiche fait d'une URL de visite virtuelle ou de vidéo.
 *
 * L'API n'accepte que du `https` dont l'hôte figure EXACTEMENT dans sa liste d'autorisation
 * (`config/catalogue.php`, `virtual_tour_hosts`). Ce module est la seconde ligne, et il ne fait
 * confiance à rien de ce qu'il reçoit :
 *
 *   · l'adresse intégrée n'est JAMAIS l'URL reçue : elle est RECONSTRUITE depuis un identifiant
 *     extrait et filtré par motif, sur un hôte écrit ici en dur. Une URL piégée
 *     (`youtube.com/watch?v=x"><script>`, un chemin inattendu) ne passe pas dans un `src` ;
 *   · un hôte inconnu du front — la liste de l'API a pu grandir — devient un LIEN sortant, jamais
 *     une iframe : il n'y a pas de CSP (`next.config.ts`), c'est donc ce module qui décide de ce qui
 *     s'intègre dans la page ;
 *   · tout ce qui n'est pas `https:` ne rend rien du tout, ni iframe ni lien.
 *
 * Module pur : aucun rendu, testable sans DOM.
 */

export type GenreDeVisite = 'video' | 'visite';

export type IntegrationDeVisite =
  | { readonly mode: 'iframe'; readonly src: string; readonly genre: GenreDeVisite }
  | { readonly mode: 'lien'; readonly href: string; readonly genre: GenreDeVisite }
  | null;

const ID_YOUTUBE = /^[A-Za-z0-9_-]{6,20}$/;
const ID_VIMEO = /^\d{4,15}$/;
const ID_MATTERPORT = /^[A-Za-z0-9]{6,20}$/;
const CHEMIN_KUULA = /^\/share\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/;

function youtube(id: string | null | undefined): IntegrationDeVisite {
  return id && ID_YOUTUBE.test(id)
    ? { mode: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}`, genre: 'video' }
    : null;
}

function vimeo(id: string | null | undefined): IntegrationDeVisite {
  return id && ID_VIMEO.test(id)
    ? { mode: 'iframe', src: `https://player.vimeo.com/video/${id}`, genre: 'video' }
    : null;
}

/** L'iframe que l'on sait construire pour un hôte connu, ou `null` si l'URL n'a pas la forme attendue. */
function iframePour(url: URL): IntegrationDeVisite {
  const segments = url.pathname.split('/').filter(Boolean);

  switch (url.hostname) {
    case 'youtube.com':
    case 'www.youtube.com':
      if (url.pathname === '/watch') return youtube(url.searchParams.get('v'));
      if (segments[0] === 'embed' || segments[0] === 'shorts') return youtube(segments[1]);
      return null;
    case 'youtu.be':
      return youtube(segments[0]);
    case 'vimeo.com':
      return vimeo(segments[0]);
    case 'player.vimeo.com':
      return segments[0] === 'video' ? vimeo(segments[1]) : null;
    case 'my.matterport.com': {
      const id = url.searchParams.get('m');
      return url.pathname.startsWith('/show') && id && ID_MATTERPORT.test(id)
        ? { mode: 'iframe', src: `https://my.matterport.com/show/?m=${id}`, genre: 'visite' }
        : null;
    }
    case 'kuula.co':
      return CHEMIN_KUULA.test(url.pathname)
        ? { mode: 'iframe', src: `https://kuula.co${url.pathname}`, genre: 'visite' }
        : null;
    default:
      return null;
  }
}

const HOTES_VIDEO = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com']);

export function integrationDeVisite(brute: string | null | undefined): IntegrationDeVisite {
  if (!brute) return null;

  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return null;
  }

  // Ni `http:`, ni `javascript:`, ni `data:` : rien ne sort, pas même un lien.
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null;

  const iframe = iframePour(url);
  if (iframe) return iframe;

  return {
    mode: 'lien',
    href: url.toString(),
    genre: HOTES_VIDEO.has(url.hostname) ? 'video' : 'visite',
  };
}
