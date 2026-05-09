import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { exportAdminReport } from '../super-admin';

function mockFetch(response: Response) {
  const spy = vi.fn(async (): Promise<Response> => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportAdminReport', () => {
  it('downloads file responses instead of parsing them as JSON', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node);
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      remove,
      set href(value: string) {
        expect(value).toBe('blob:report');
      },
      set download(value: string) {
        expect(value).toBe('takussan-growth-20260509.csv');
      },
    } as unknown as HTMLAnchorElement);

    const fetchSpy = mockFetch(new Response('bucket,count\n2026-05,1\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="takussan-growth-20260509.csv"',
      },
    }));

    await expect(exportAdminReport('growth', { metric: 'agencies', period: '12m' })).resolves.toEqual({
      status: 'downloaded',
      filename: 'takussan-growth-20260509.csv',
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/super-admin/reports/growth/export?');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('format=csv');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toHaveProperty('size', 23);
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });

  it('keeps async JSON export statuses readable', async () => {
    mockFetch(Response.json({ data: { export_id: 7, status: 'queued' } }, { status: 202 }));

    await expect(exportAdminReport('funnel', { period: '30d' })).resolves.toEqual({
      status: 'queued',
      data: { data: { export_id: 7, status: 'queued' } },
    });
  });

  it('throws ApiError for JSON error responses', async () => {
    mockFetch(Response.json({ message: 'Forbidden.' }, { status: 403 }));

    await expect(exportAdminReport('growth', { metric: 'agencies' })).rejects.toBeInstanceOf(ApiError);
  });
});
