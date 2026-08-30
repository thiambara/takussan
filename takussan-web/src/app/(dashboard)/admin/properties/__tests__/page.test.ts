import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/admin/properties page', () => {
  it('reuses the admin property list instead of redirecting to super-admin', async () => {
    const source = await readFile(resolve(__dirname, '../page.tsx'), 'utf8');

    expect(source).toContain("from '../../app/properties/(liste)/page'");
    expect(source).not.toContain("redirect('/super-admin/properties')");
  });
});
