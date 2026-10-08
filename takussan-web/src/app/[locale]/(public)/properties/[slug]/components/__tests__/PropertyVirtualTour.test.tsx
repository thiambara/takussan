import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { PropertyVirtualTour } from '../PropertyVirtualTour';

/**
 * TCK-598 (V19, AC15) — la vignette de la visite virtuelle : rien ne se charge avant le geste, un
 * hôte que le front ne sait pas intégrer n'est jamais une iframe, et sans URL rien ne s'affiche.
 */
function monter(url: string | null) {
  return render(withIntl(<PropertyVirtualTour url={url} title="Villa des Almadies" />));
}

describe('<PropertyVirtualTour>', () => {
  it('aucune iframe avant le clic ; l’iframe reconstruite après', async () => {
    const { container } = monter('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(container.querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /vidéo du bien/i }));

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation');
    expect(iframe!.getAttribute('title')).toContain('Villa des Almadies');
  });

  it('un hôte inconnu : un lien sortant `noopener noreferrer`, jamais d’iframe — même après clic', async () => {
    const { container } = monter('https://evil.example/tour');

    const lien = screen.getByRole('link', { name: /visite virtuelle/i });
    expect(lien).toHaveAttribute('href', 'https://evil.example/tour');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    expect(lien).toHaveAttribute('target', '_blank');
    await userEvent.click(lien);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('`http:` n’est jamais intégré, ni lié', () => {
    const { container } = monter('http://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(container).toBeEmptyDOMElement();
  });

  it('sans URL, rien', () => {
    const { container } = monter(null);
    expect(container).toBeEmptyDOMElement();
  });
});
