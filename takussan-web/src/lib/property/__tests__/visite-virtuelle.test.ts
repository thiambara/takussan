import { describe, expect, it } from 'vitest';
import { integrationDeVisite } from '../visite-virtuelle';

/**
 * TCK-598 (V19, contrainte 13) — ce qui s'intègre dans la fiche, et ce qui n'en a pas le droit.
 * Il n'y a pas de CSP : ces décisions sont la seule barrière côté front.
 */
describe('integrationDeVisite', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'video'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=12', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'video'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'video'],
    ['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789', 'video'],
    ['https://player.vimeo.com/video/123456789', 'https://player.vimeo.com/video/123456789', 'video'],
    ['https://my.matterport.com/show/?m=SxQL3iGyoDo', 'https://my.matterport.com/show/?m=SxQL3iGyoDo', 'visite'],
    ['https://kuula.co/share/collection/7lVmW', 'https://kuula.co/share/collection/7lVmW', 'visite'],
  ])('%s → iframe reconstruite', (url, src, genre) => {
    expect(integrationDeVisite(url)).toEqual({ mode: 'iframe', src, genre });
  });

  it('l’adresse intégrée est RECONSTRUITE : un identifiant piégé ne passe pas dans le `src`', () => {
    const piege = integrationDeVisite('https://www.youtube.com/watch?v=abc"><script>alert(1)</script>');
    expect(piege?.mode).toBe('lien');
    expect(integrationDeVisite('https://my.matterport.com/show/?m=x%22onload')?.mode).toBe('lien');
  });

  it('un hôte inconnu du front devient un LIEN, jamais une iframe', () => {
    expect(integrationDeVisite('https://evil.example/tour')).toEqual({
      mode: 'lien',
      href: 'https://evil.example/tour',
      genre: 'visite',
    });
    // Un suffixe n'est pas l'hôte.
    expect(integrationDeVisite('https://evilyoutube.com/watch?v=dQw4w9WgXcQ')?.mode).toBe('lien');
    expect(integrationDeVisite('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')?.mode).toBe('lien');
  });

  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'pas une url',
    '',
    null,
    undefined,
  ])('%s → rien, ni iframe ni lien', (url) => {
    expect(integrationDeVisite(url)).toBeNull();
  });
});
