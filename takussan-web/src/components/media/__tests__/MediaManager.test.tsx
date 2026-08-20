import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import {
  MediaDropzone,
  MediaManager,
  type MediaItem,
} from '../MediaManager';

/**
 * TCK-071 — MediaManager & MediaDropzone tests.
 *
 * We exercise the three AC not already covered by the server contract:
 *  - multi-file upload populates per-file progress entries
 *  - unsupported MIME shows a per-file error without interrupting the
 *    valid siblings (validation is done in the dropzone for pending
 *    files, and in MediaManager for direct uploads)
 *  - reordering via the native API calls `onReorder(orderedIds)` and
 *    the first id after a move becomes the cover.
 */

function makeFile(name: string, type: string, size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

describe('<MediaDropzone>', () => {
  it('accepts a batch of valid images and emits via onChange', async () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(withIntl(<MediaDropzone files={[]} onChange={onChange} onRemove={onRemove} />));

    const input = screen.getByTestId('media-dropzone-input') as HTMLInputElement;
    const files = [
      makeFile('a.jpg', 'image/jpeg'),
      makeFile('b.png', 'image/png'),
    ];
    await userEvent.upload(input, files);

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as File[];
    expect(emitted).toHaveLength(2);
    expect(emitted.map((f) => f.name)).toEqual(['a.jpg', 'b.png']);
  });

  it('rejects an unsupported MIME with a visible error and does not emit', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(withIntl(<MediaDropzone files={[]} onChange={onChange} onRemove={onRemove} />));

    const input = screen.getByTestId('media-dropzone-input') as HTMLInputElement;
    // Bypass `userEvent.upload`, which filters on the `accept` attribute
    // and would hide the error path from this unit test.
    fireEvent.change(input, {
      target: { files: [makeFile('bad.exe', 'application/octet-stream')] },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/non supporté/i);
  });

  it('rejects a file larger than maxSize', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(withIntl(<MediaDropzone
        files={[]}
        onChange={onChange}
        onRemove={onRemove}
        maxSize={10}
      />),
    );

    const input = screen.getByTestId('media-dropzone-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [makeFile('big.jpg', 'image/jpeg', 100)] },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/dépasse/);
  });
});

describe('<MediaManager>', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const items: MediaItem[] = [
    { id: 1, thumbnail: 't1', order: 1 },
    { id: 2, thumbnail: 't2', order: 2 },
    { id: 3, thumbnail: 't3', order: 3 },
  ];

  it('renders the grid and flags the first tile as cover', () => {
    render(withIntl(<MediaManager
        items={items}
        onUpload={vi.fn()}
        onReorder={vi.fn()}
        onDelete={vi.fn()}
      />),
    );
    const tiles = screen.getAllByTestId('media-tile');
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveAttribute('data-cover', 'true');
    expect(tiles[1]).toHaveAttribute('data-cover', 'false');
  });

  it('reports a per-file error on unsupported MIME without blocking valid uploads', async () => {
    const onUpload = vi
      .fn<(files: File[]) => Promise<MediaItem[]>>()
      .mockResolvedValue([{ id: 99, thumbnail: 'new' }]);

    render(withIntl(<MediaManager
        items={[]}
        onUpload={onUpload}
        onReorder={vi.fn()}
        onDelete={vi.fn()}
      />),
    );

    const input = screen.getByTestId('media-manager-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          makeFile('ok.jpg', 'image/jpeg'),
          makeFile('bad.exe', 'application/octet-stream'),
        ],
      },
    });

    // Both entries rendered, one flagged "error".
    const progressList = await screen.findByTestId('media-manager-progress');
    const entries = within(progressList).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(within(progressList).getByRole('alert')).toHaveTextContent(
      /non supporté/i,
    );

    // Only the valid file was forwarded to onUpload.
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const uploadedBatch = onUpload.mock.calls[0][0] as File[];
    expect(uploadedBatch).toHaveLength(1);
    expect(uploadedBatch[0].name).toBe('ok.jpg');
  });

  it('reorders tiles via native drag-drop and calls onReorder with the new id list', async () => {
    vi.useRealTimers(); // drag/drop test doesn't need fake timers
    const onReorder = vi.fn().mockResolvedValue(undefined);
    render(withIntl(<MediaManager
        items={items}
        onUpload={vi.fn()}
        onReorder={onReorder}
        onDelete={vi.fn()}
      />),
    );

    const tiles = screen.getAllByTestId('media-tile');
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(),
    };

    // Drag tile 3 (id=3) onto tile at index 0 — expect new order [3, 1, 2].
    await act(async () => {
      fireEvent.dragStart(tiles[2], { dataTransfer });
      fireEvent.dragOver(tiles[0], { dataTransfer });
      fireEvent.drop(tiles[0], { dataTransfer });
    });

    await waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1));
    expect(onReorder).toHaveBeenCalledWith([3, 1, 2]);

    // Grid reflects new order with id=3 now the cover.
    const after = screen.getAllByTestId('media-tile');
    expect(after[0]).toHaveAttribute('data-cover', 'true');
  });
});
