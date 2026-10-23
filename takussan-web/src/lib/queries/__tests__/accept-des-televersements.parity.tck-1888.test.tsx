import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_MIME_ACCEPT } from '../documents';
import { KYC_MIME_ACCEPT, KycUploader } from '@/components/kyc/KycUploader';
import { withIntl } from '@/test/intl';

/**
 * Garde de PARITÉ front ↔ back sur les types de fichier proposés à l'écran (P194.04, TCK-1888).
 *
 * `DOCUMENT_MIME_ACCEPT` se disait alignée sur une règle `['required', 'file', 'max:10240']`
 * remplacée depuis par `AcceptedUploads::document()` (TCK-601), et n'offrait ni HEIC ni HEIF ;
 * le KYC proposait `image/*`, si bien qu'un GIF ou un AVIF choisi à l'écran rendait 422.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que `finfo` lise bien ces types dans un fichier réel (c'est
 * `DocumentUploadMimeTest` et `KycUploadMimeTest`, côté API, TCK-1884), ni les autres sélecteurs
 * de fichiers du front, qui ne passent pas par `AcceptedUploads`.
 */
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const SOURCE = join(ROOT, 'takussan-api', 'app', 'Support', 'Uploads', 'AcceptedUploads.php');

/**
 * Lu par `finfo` dans certains CSV, jamais annoncé par un navigateur pour un `.csv` : l'API
 * l'accepte, l'attribut `accept` n'a pas à le proposer.
 */
const SANS_EQUIVALENT_NAVIGATEUR = ['application/csv'];

function constante(nom: string): string[] {
  const php = readFileSync(SOURCE, 'utf8');
  const bloc = php.match(new RegExp(`const ${nom}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  expect(bloc, `${nom} introuvable dans ${SOURCE}`).not.toBeNull();
  const types = [...bloc![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  expect(types.length, `aucun type extrait de ${nom} — la garde n'aurait rien vérifié`).toBeGreaterThan(0);
  return types;
}

const liste = (accept: string) => accept.split(',').sort();

describe('parité accept du front ↔ App\\Support\\Uploads\\AcceptedUploads', () => {
  it('les documents proposent exactement ce que DOCUMENT_MIMETYPES accepte', () => {
    const attendu = constante('DOCUMENT_MIMETYPES').filter((t) => !SANS_EQUIVALENT_NAVIGATEUR.includes(t));
    expect(liste(DOCUMENT_MIME_ACCEPT)).toEqual(attendu.sort());
  });

  it('le KYC propose exactement ce que KYC_MIMETYPES accepte, sans joker', () => {
    expect(liste(KYC_MIME_ACCEPT)).toEqual(constante('KYC_MIMETYPES').sort());
    expect(KYC_MIME_ACCEPT).not.toContain('*');
  });

  it('l’input du KYC porte cette liste', () => {
    render(withIntl(
      <KycUploader profileId={1} kind="cni" endpoint="agent-profiles" i18nNamespace="agents.onboarding.kyc" />,
    ));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe(KYC_MIME_ACCEPT);
  });
});
