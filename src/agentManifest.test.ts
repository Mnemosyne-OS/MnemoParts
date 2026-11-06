/**
 * Parts' agent actions (doc 149): the manifest's declaration passes the HOST's own check,
 * every declared action has its handler (a declared action without one would be offered to
 * agents and fail), and the limit it declares is the one the handler enforces.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest, agentGuideFromManifest } from '../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { FILTER_MAX, NOTE_MAX, PARTS_LIMIT, VIEWS } from './partsAgent';

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'partsAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlers = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("Parts' agent actions", () => {
  it("pass the host's check of the manifest", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('every declared action has its handler, and no handler is undeclared', () => {
    expect(handlers.length).toBeGreaterThan(5);
    expect([...handlers].sort()).toEqual(declared().map((a) => a.id).sort());
  });

  it('nothing spends credits, and only models and parts are reads', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
    expect(declared().filter((a) => a.effect === 'read').map((a) => a.id).sort()).toEqual(['models', 'parts']);
  });

  it("the limits it declares are the ones the handlers enforce", () => {
    const parts = declared().find((a) => a.id === 'parts')!;
    expect(parts.params.limit).toMatchObject({ minimum: PARTS_LIMIT.min, maximum: PARTS_LIMIT.max });
    const note = declared().find((a) => a.id === 'notePart')!;
    expect(note.params.note).toMatchObject({ maxLength: NOTE_MAX });
    expect(declared().find((a) => a.id === 'filterParts')!.params.text).toMatchObject({ maxLength: FILTER_MAX });
    expect(declared().find((a) => a.id === 'showView')!.params.view).toMatchObject({ enum: [...VIEWS] });
  });

  it('carries a guide the host accepts, which tells an agent to name things as the person says them', () => {
    expect(agentGuideFromManifest(manifest)).toMatch(/the way the person says it/);
  });
});
