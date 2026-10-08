import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LibraryView } from './LibraryView';
import { translate, type Key } from './i18n/strings';
import type { LibraryEntry } from './model/library';

const t = (k: Key, v?: Record<string, string | number>) => translate('en', k, v);
const entry = (over: Partial<LibraryEntry>): LibraryEntry => ({
  key: 'k', name: 'n', path: '/m/n.stp', bytes: 1, parts: 1, named: 1, layers: 1, firstOpenedAt: 1, openedAt: 1, opens: 1, ...over,
});
const now = Date.now();
const entries = [
  entry({ key: 'a', name: 'alpha.stp', path: '/m/alpha.stp', parts: 7, openedAt: now - 1000 }),
  entry({ key: 'b', name: 'buggy.glb', path: undefined, parts: 236, openedAt: now - 60_000 }),
];

function names() {
  return screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent);
}

describe('LibraryView', () => {
  it('lists the most recently opened first, and sorts by the column clicked', () => {
    render(<LibraryView entries={entries} written={{ b: 4 }} lang="en" t={t} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(names()).toEqual(['alpha.stp', 'buggy.glb']);
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    expect(names()).toEqual(['buggy.glb', 'alpha.stp']);
    fireEvent.click(screen.getByRole('button', { name: /Parts/ }));
    expect(names()).toEqual(['alpha.stp', 'buggy.glb']);
  });

  it('opens a row on click, and removing a row does not open it', () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    render(<LibraryView entries={entries} written={{}} lang="en" t={t} onOpen={onOpen} onRemove={onRemove} />);
    fireEvent.click(screen.getByText('alpha.stp'));
    expect(onOpen).toHaveBeenCalledWith(entries[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from the library' })[0]);
    expect(onRemove).toHaveBeenCalledWith('a');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('says how to reopen a dropped file, and filters by name', () => {
    render(<LibraryView entries={entries} written={{}} lang="en" t={t} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Dropped file')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by name or folder'), { target: { value: 'bug' } });
    expect(names()).toEqual(['buggy.glb']);
    fireEvent.change(screen.getByPlaceholderText('Search by name or folder'), { target: { value: 'zzz' } });
    expect(screen.getByText('No model matches.')).toBeInTheDocument();
  });

  it('says what the empty library is for', () => {
    render(<LibraryView entries={[]} written={{}} lang="en" t={t} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Every model you open appears here.')).toBeInTheDocument();
  });
});
