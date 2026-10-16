// Undo / redo for the plan editor.
// Every edit is a small data record that knows how to apply itself in both directions through the API.
// Records refer to items by a private handle, not by server id: a point that is deleted and restored gets
// a new id, and SQLite may hand the old id to a different new point, so the history keeps handle → id
// itself and forgets an id as soon as its item is deleted.

export type ApiFn = <T = unknown>(method: string, url: string, body?: unknown) => Promise<T>;
export type Kind = 'p' | 'l' | 'floor' | 'fixture'; // placement (point) / line / floor / fixture
export type Ent = 'p' | 'l';
type Fields = Record<string, unknown>;

/** An edit as the editor describes it, using current server ids. */
export type Edit = Single | { t: 'batch'; edits: Single[]; label: string }; // batch: one undo step for many items

export type Single =
  /** create a point/line from `snap` (undo deletes it) */
  | { t: 'create'; e: Ent; floor: number; snap: Fields; label: string }
  /** delete a point/line; `snap` must hold everything needed to restore it (undo recreates it) */
  | { t: 'delete'; e: Ent; id: number; floor: number; snap: Fields; label: string }
  /** change fields on a point, line, floor or fixture */
  | { t: 'patch'; e: Kind; id: number; before: Fields; after: Fields; label: string; merge?: string }
  /** wire tool: put a point/line on circuit `to` (appended to its wiring order) or take it off (null) */
  | { t: 'assign'; e: Ent; id: number; project: number; before: Fields; to: number | null; label: string };

type One = Single & { h: number }; // h: private handle of the item the edit is about
type Rec = (One | { t: 'batch'; parts: One[]; label: string }) & { at: number };

const LIMIT = 100;
const MERGE_MS = 2000; // slider drags within this window become one step

const itemUrl = (e: Kind, id: number) =>
  e === 'p' ? `/api/placements/${id}` : e === 'l' ? `/api/lines/${id}` : e === 'floor' ? `/api/floors/${id}` : `/api/fixtures/${id}`;

/** Fields needed to recreate a deleted point exactly where it was, including its place in the wiring. */
export const snapPlacement = (p: { fixture_id: number; x: number; y: number; rot: number; circuit_id: number | null; circuit_order: number }): Fields => ({
  fixture_id: p.fixture_id, x: p.x, y: p.y, rot: p.rot, circuit_id: p.circuit_id, circuit_order: p.circuit_order,
});
export const snapLine = (l: { fixture_id: number; pts: [number, number][]; heads: number; head_fixture_id: number | null; circuit_id: number | null; circuit_order: number }): Fields => ({
  fixture_id: l.fixture_id, pts: l.pts, heads: l.heads, head_fixture_id: l.head_fixture_id, circuit_id: l.circuit_id, circuit_order: l.circuit_order,
});

export class History {
  private past: Rec[] = [];
  private future: Rec[] = [];
  private idOf = new Map<number, number>(); // handle → current server id
  private handleOf = new Map<string, number>(); // `${kind}:${id}` of a live item → handle
  private nextHandle = 1;
  private queue: Promise<unknown> = Promise.resolve(); // edits, undos and redos run one at a time, in order

  constructor(private api: ApiFn, private now: () => number = Date.now) {}

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoLabel() { return this.past[this.past.length - 1]?.label ?? ''; }
  get redoLabel() { return this.future[this.future.length - 1]?.label ?? ''; }

  /** Performs a new edit and records it. Returns the new server id for 'create', else null. */
  do(edit: Edit): Promise<number | null> {
    return this.enqueue(async () => {
      const one = (s: Single): One => ({ ...s, h: s.t === 'create' ? this.nextHandle++ : this.handle(s.e, s.id) });
      const rec: Rec = edit.t === 'batch' ? { t: 'batch', label: edit.label, parts: edit.edits.map(one), at: this.now() } : { ...one(edit), at: this.now() };
      if (rec.t === 'batch' && !rec.parts.length) return null;
      const created = await this.apply(rec, 'redo');
      this.record(rec);
      return created;
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Undoes the last edit and returns it (null if none). If the server refuses, the step is dropped. */
  undo(): Promise<Edit | null> {
    return this.step('undo');
  }

  redo(): Promise<Edit | null> {
    return this.step('redo');
  }

  /** Forget everything (e.g. after a floor and all its points were deleted outside the history). */
  clear() {
    this.past = [];
    this.future = [];
    this.idOf.clear();
    this.handleOf.clear();
  }

  private step(dir: 'undo' | 'redo'): Promise<Edit | null> {
    return this.enqueue(async () => {
      // pick the stacks when the step runs: edits queued before it may have replaced them
      const [from, to] = dir === 'undo' ? [this.past, this.future] : [this.future, this.past];
      if (!from.length) return null;
      const rec = from.pop()!; // if the server refuses, the step stays dropped
      await this.apply(rec, dir);
      to.push({ ...rec, at: 0 }); // a step that moved between stacks is never merged into
      return rec.t === 'batch' ? { t: 'batch', label: rec.label, edits: rec.parts } : rec;
    });
  }

  private handle(e: Kind, id: number): number {
    const k = `${e}:${id}`;
    let h = this.handleOf.get(k);
    if (h == null) {
      h = this.nextHandle++;
      this.handleOf.set(k, h);
      this.idOf.set(h, id);
    }
    return h;
  }

  private bind(e: Kind, h: number, id: number) {
    this.idOf.set(h, id);
    this.handleOf.set(`${e}:${id}`, h);
  }

  private record(rec: Rec) {
    const top = this.past[this.past.length - 1];
    if (rec.t === 'patch' && rec.merge && top?.t === 'patch' && top.merge === rec.merge && top.h === rec.h && rec.at - top.at < MERGE_MS) {
      top.after = { ...top.after, ...rec.after };
      top.at = rec.at;
    } else {
      this.past.push(rec);
      if (this.past.length > LIMIT) this.past.shift();
    }
    this.future = [];
  }

  /**
   * Runs one record in a direction. Returns the new server id when a single item was (re)created.
   * A batch runs its parts in order (reverse order for undo); if one part fails, the parts already
   * done are put back so the plan is never left half-changed, and the error is passed on.
   */
  private async apply(rec: Rec, dir: 'undo' | 'redo'): Promise<number | null> {
    if (rec.t !== 'batch') return this.applyOne(rec, dir);
    const parts = dir === 'redo' ? rec.parts : [...rec.parts].reverse();
    const done: One[] = [];
    try {
      for (const p of parts) {
        await this.applyOne(p, dir);
        done.push(p);
      }
    } catch (e) {
      const back = dir === 'redo' ? 'undo' : 'redo';
      for (const p of done.reverse()) await this.applyOne(p, back).catch(() => undefined);
      throw e;
    }
    return null;
  }

  private async applyOne(rec: One, dir: 'undo' | 'redo'): Promise<number | null> {
    if (rec.t === 'create' || rec.t === 'delete') {
      const remove = (rec.t === 'create') === (dir === 'undo');
      if (remove) {
        const id = this.idOf.get(rec.h)!;
        await this.api('DELETE', itemUrl(rec.e, id));
        this.handleOf.delete(`${rec.e}:${id}`); // the id may be reused for another item now
        return null;
      }
      const r = await this.api<{ id: number }>('POST', `/api/floors/${rec.floor}/${rec.e === 'p' ? 'placements' : 'lines'}`, rec.snap);
      this.bind(rec.e, rec.h, r.id);
      return r.id;
    }
    const id = this.idOf.get(rec.h)!;
    if (rec.t === 'patch') {
      await this.api('PATCH', itemUrl(rec.e, id), dir === 'undo' ? rec.before : rec.after);
    } else if (dir === 'undo') {
      await this.api('PATCH', itemUrl(rec.e, id), rec.before);
    } else {
      await this.api('POST', `/api/projects/${rec.project}/assign-circuit`, { circuit_id: rec.to, placement_ids: rec.e === 'p' ? [id] : [], line_ids: rec.e === 'l' ? [id] : [] });
    }
    return null;
  }
}

/** One history per project, kept while the app is open (survives switching tabs). */
const perProject = new Map<number, History>();
export function historyFor(pid: number, api: ApiFn): History {
  let h = perProject.get(pid);
  if (!h) perProject.set(pid, (h = new History(api)));
  return h;
}
