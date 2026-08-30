import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { litUtilitaireDeCouleur, resoudreCouleur } from '@/test/contraste-wcag';
import { KycUploader, type KycUploaderProps } from '../KycUploader';

/**
 * TCK-385 — la pastille « document fourni » rend le TON du design system, dans les trois
 * assistants d'onboarding.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI CE FICHIER LIT LE CODE SOURCE DES TROIS ASSISTANTS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC3 demande que « les trois assistants rendent la pastille », et prévient qu'un test de
 * PRÉSENCE de composant ne suffit pas. Deux façons de s'y prendre, et une seule tient :
 *
 *   ✗ monter les trois assistants et naviguer jusqu'à l'étape KYC. C'est le chemin le plus long
 *     (chaque assistant demande une dizaine d'actions serveur simulées, un contexte d'auth, un
 *     brouillon), et il ne prouve QU'UN des huit points de montage — celui de l'étape atteinte.
 *   ✓ EXTRAIRE les huit points de montage du code des trois assistants, puis rendre le composant
 *     avec CHACUN des jeux de props réels. C'est ce que fait ce fichier.
 *
 * Le compte (3 + 3 + 2) n'est pas écrit ici : il est DÉRIVÉ de la lecture. Un assistant qui
 * cesserait de monter le composant fait rougir `au moins un montage`, et un assistant neuf entre
 * de lui-même dans la boucle dès qu'il est ajouté à {@link ASSISTANTS}.
 */
// Le fournisseur de toasts de Base UI n'existe pas hors de l'arbre applicatif ; le composant
// appelle `useToast()` au premier rendu. Même court-circuit que `KycUploader.erreurs.test.tsx`.
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const RACINE = join(__dirname, '..', '..', 'onboarding');

const ASSISTANTS = [
  'AgentOnboardingWizard.tsx',
  'OwnerOnboardingWizard.tsx',
  'ServiceProviderOnboardingWizard.tsx',
] as const;

type Montage = {
  assistant: string;
  kind: KycUploaderProps['kind'];
  endpoint?: NonNullable<KycUploaderProps['endpoint']>;
  i18nNamespace?: string;
};

/**
 * Les `<KycUploader …/>` réellement écrits dans un assistant, avec leurs props.
 *
 * ⚠ `endpoint` et `i18nNamespace` sont OPTIONNELS ici, et c'est une mesure et non une prudence :
 * l'assistant prestataire ne les passe NI l'un NI l'autre — il s'appuie sur les valeurs par
 * défaut du composant (`'profiles'` / `serviceProviders.onboarding.kyc`). Les exiger faisait
 * échouer l'extraction sur cet assistant-là, c'est-à-dire sur le seul des trois dont le ticket
 * annonçait un nombre de montages différent.
 */
function montagesDe(assistant: string): Montage[] {
  const source = readFileSync(join(RACINE, assistant), 'utf8');
  const balises = source.matchAll(/<KycUploader\b([\s\S]*?)\/>/g);
  return [...balises].map(([, attributs]) => {
    const prop = (nom: string) => attributs.match(new RegExp(`${nom}="([^"]+)"`))?.[1];
    const kind = prop('kind');
    expect(kind, `${assistant} : \`kind\` absent d'un montage`).toBeDefined();
    return {
      assistant,
      kind: kind as Montage['kind'],
      endpoint: prop('endpoint') as Montage['endpoint'],
      i18nNamespace: prop('i18nNamespace'),
    };
  });
}

const MONTAGES: Montage[] = ASSISTANTS.flatMap(montagesDe);

async function televerseAvecSucces() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ data: { id: 7, file_name: 'cni.png' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'cni.png', { type: 'image/png' }));
}

/** La pastille : le seul nœud portant `data-tone`, posé par `StatusBadge` et par lui seul. */
function pastille(conteneur: HTMLElement): HTMLElement | null {
  return conteneur.querySelector('[data-tone]');
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('TCK-385 — la pastille « fourni » des assistants d\'onboarding', () => {
  it('les trois assistants montent bien le téléverseur — compte DÉRIVÉ de leur source', () => {
    for (const assistant of ASSISTANTS) {
      expect(montagesDe(assistant).length, `${assistant} ne monte plus KycUploader`)
        .toBeGreaterThan(0);
    }
    // Le total sert de garde-fou contre une extraction qui rendrait zéro sans le dire.
    expect(MONTAGES.length).toBeGreaterThanOrEqual(ASSISTANTS.length);
  });

  it.each(MONTAGES)(
    'rend le TON `success` du design system — $assistant / $kind',
    async ({ kind, endpoint, i18nNamespace }) => {
      const { container } = render(withIntl(
        <KycUploader profileId={1} kind={kind} endpoint={endpoint} i18nNamespace={i18nNamespace} />,
      ));

      expect(pastille(container), 'la pastille ne doit pas exister avant le téléversement').toBeNull();
      await televerseAvecSucces();

      const badge = await waitFor(() => {
        const n = pastille(container);
        expect(n).not.toBeNull();
        return n as HTMLElement;
      });

      // ⚠ L'assertion porte sur le TON, pas sur la présence du nœud : c'est `StatusBadge` qui
      // décide la couleur, et `data-tone` est ce qui le prouve. La pastille faite main que ce
      // ticket remplace n'en portait aucun.
      expect(badge.getAttribute('data-tone')).toBe('success');

      // …et sur les CLASSES rendues : c'est ce second volet qui rougit si la pastille faite main
      // revient sous un habit qui porterait quand même `data-tone`.
      //
      // ⚠ IL NE NOMME PLUS LE JETON, ET C'EST UNE CORRECTION (TCK-450, 2026-08-29). Il écrivait
      // `toMatch(/\bbg-accent\//)` — c'est-à-dire qu'il RECOPIAIT ici la décision de couleur du
      // ton `success`, alors que `StatusBadge` est « le seul endroit du dépôt où la couleur d'un
      // statut est décidée ». Le jour où ce ton a cessé d'emprunter l'accent de MARQUE pour
      // prendre `--success`, ce fichier est devenu rouge sur un changement JUSTE : huit échecs
      // dans un composant qui n'avait pas bougé. *Un test d'appelant qui recopie la table du
      // fournisseur ne garde pas le fournisseur, il interdit de le corriger.*
      //
      // Ce qui reste ici est la propriété que cet appelant peut légitimement affirmer : la
      // pastille porte un aplat ET une encre du VOCABULAIRE du design system — des jetons de
      // `globals.css`, résolubles, jamais une famille de l'échelle Tailwind. QUEL jeton, et à
      // quel contraste, est gardé une fois pour toutes par
      // `console/__tests__/StatusBadge.contraste-tck-450.test.tsx`.
      const utilitaires = Array.from(badge.classList);
      const aplat = utilitaires
        .map((c) => litUtilitaireDeCouleur(c, 'bg'))
        .find((u) => u !== null && u.variante === '');
      const encre = utilitaires
        .map((c) => litUtilitaireDeCouleur(c, 'text'))
        .find((u) => u !== null && u.variante === '');

      expect(aplat, 'la pastille doit porter un aplat inconditionnel').not.toBeUndefined();
      expect(encre, 'la pastille doit porter une encre inconditionnelle').not.toBeUndefined();
      // `resoudreCouleur` LÈVE sur un jeton absent de `globals.css` : un `bg-emerald-100` neuf
      // fait donc rougir AVEC SON NOM, au lieu d'être admis en silence.
      expect(() => resoudreCouleur(aplat!.jeton)).not.toThrow();
      expect(() => resoudreCouleur(encre!.jeton)).not.toThrow();
      expect(badge.className).not.toMatch(/-(emerald|green)-[0-9]{2,3}\b/);
    },
  );

  it("aucun nœud du composant ne porte une famille verte de l'échelle Tailwind", async () => {
    const { container } = render(withIntl(
      <KycUploader profileId={1} kind="cni" endpoint="agent-profiles" i18nNamespace="agents.onboarding.kyc" />,
    ));
    await televerseAvecSucces();
    await screen.findByText('cni.png');

    const classes = [...container.querySelectorAll('*')]
      .map((n) => n.getAttribute('class') ?? '')
      .join(' ');
    expect(classes).not.toMatch(/-(emerald|green)-[0-9]{2,3}\b/);
  });
});
