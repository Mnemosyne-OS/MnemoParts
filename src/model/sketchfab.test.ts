import { describe, expect, it } from 'vitest';
import { formatBytes, parsePage, pickThumb, safeNext, searchUrl } from './sketchfab';

const result = (over: Record<string, unknown> = {}) => ({
  uid: 'u1', name: 'Gearbox', viewerUrl: 'https://sketchfab.com/3d-models/gearbox-u1',
  license: { label: 'CC Attribution' },
  user: { displayName: 'Ana', username: 'ana', profileUrl: 'https://sketchfab.com/ana' },
  faceCount: 649366, archives: { glb: { size: 20425132 } },
  thumbnails: { images: [{ url: 'https://media.sketchfab.com/a-1920.jpg', width: 1920 }, { url: 'https://media.sketchfab.com/a-256.jpg', width: 256 }, { url: 'https://media.sketchfab.com/a-720.jpg', width: 720 }] },
  ...over,
});

describe('searchUrl', () => {
  it('asks for downloadable models only, with what was typed', () => {
    const u = new URL(searchUrl('  gear box '));
    expect(u.origin).toBe('https://api.sketchfab.com');
    expect(u.searchParams.get('downloadable')).toBe('true');
    expect(u.searchParams.get('type')).toBe('models');
    expect(u.searchParams.get('q')).toBe('gear box');
  });
});

describe('safeNext', () => {
  it('follows a next page only on the Sketchfab search API', () => {
    expect(safeNext('https://api.sketchfab.com/v3/search?cursor=2&q=x')).toBe('https://api.sketchfab.com/v3/search?cursor=2&q=x');
    expect(safeNext('https://evil.example/v3/search?cursor=2')).toBeNull();
    expect(safeNext('https://api.sketchfab.com/v3/me')).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext('not a url')).toBeNull();
  });
});

describe('pickThumb', () => {
  it('takes the smallest image wide enough, or the largest there is', () => {
    expect(pickThumb(result().thumbnails.images)).toBe('https://media.sketchfab.com/a-720.jpg');
    expect(pickThumb([{ url: 'https://m/a.jpg', width: 64 }])).toBe('https://m/a.jpg');
    expect(pickThumb([{ url: 'http://insecure/a.jpg', width: 800 }])).toBeUndefined();
    expect(pickThumb('nope')).toBeUndefined();
  });
});

describe('parsePage', () => {
  it('reads name, author, licence, page, size and faces', () => {
    const page = parsePage({ results: [result()], next: 'https://api.sketchfab.com/v3/search?cursor=2' });
    expect(page.models).toEqual([{
      uid: 'u1', name: 'Gearbox', licence: 'CC Attribution', pageUrl: 'https://sketchfab.com/3d-models/gearbox-u1',
      author: 'Ana', authorUrl: 'https://sketchfab.com/ana', thumb: 'https://media.sketchfab.com/a-720.jpg',
      faces: 649366, glbBytes: 20425132,
    }]);
    expect(page.next).toBe('https://api.sketchfab.com/v3/search?cursor=2');
  });

  it('leaves out a result with no licence, or a page outside Sketchfab', () => {
    const page = parsePage({ results: [result({ license: null }), result({ uid: 'u2', viewerUrl: 'https://elsewhere.example/x' }), result({ uid: 'u3' })] });
    expect(page.models.map(m => m.uid)).toEqual(['u3']);
  });

  it('keeps a result whose size or faces are unknown, without inventing them', () => {
    const [m] = parsePage({ results: [result({ faceCount: undefined, archives: {} })] }).models;
    expect(m).not.toHaveProperty('faces');
    expect(m).not.toHaveProperty('glbBytes');
  });

  it('answers an empty page for anything unreadable', () => {
    expect(parsePage(null)).toEqual({ models: [], next: null });
  });
});

describe('formatBytes', () => {
  it('writes megabytes in the reader\'s number format', () => {
    expect(formatBytes(20425132, 'en')).toBe('19 MB');
    expect(formatBytes(5 * 1024 * 1024 + 300_000, 'fr')).toBe('5,3 MB');
  });
});
