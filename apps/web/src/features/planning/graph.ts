// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dependency graph of a Plan Version (PID-00082 S03, H9, TASK-DEPENDENCY-001): layers by dependency depth, cycle
// detection in the browser, and the edges a Draft added compared with the version it is based on.
// An edge `a → b` means “b depends on a” (a is a prerequisite of b), as the reference screens write it.

export interface GraphTask {
  taskId?: string;
  dependsOn?: readonly string[];
}

export interface Edge {
  from: string;
  to: string;
}

export const edgeKey = (edge: Edge): string => `${edge.from}->${edge.to}`;

export function edgesOf(tasks: readonly GraphTask[]): Edge[] {
  const ids = new Set(tasks.map((t) => t.taskId).filter(Boolean) as string[]);
  const edges: Edge[] = [];
  for (const task of tasks) {
    if (!task.taskId) continue;
    for (const from of task.dependsOn ?? []) if (ids.has(from)) edges.push({ from, to: task.taskId });
  }
  return edges;
}

/**
 * Cycles of the graph, each as the task ids along the cycle in edge direction (`[a, b, c]` = a → b → c → a), one
 * per strongly connected component (Tarjan), starting from the first task in plan order.
 */
export function findCycles(tasks: readonly GraphTask[]): string[][] {
  const order = tasks.map((t) => t.taskId).filter(Boolean) as string[];
  const next = new Map<string, string[]>(order.map((id) => [id, []]));
  for (const edge of edgesOf(tasks)) next.get(edge.from)!.push(edge.to);

  let index = 0;
  const indexOf = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (v: string) => {
    indexOf.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of next.get(v) ?? []) {
      if (!indexOf.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indexOf.get(w)!));
      }
    }
    if (low.get(v) === indexOf.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  };
  for (const v of order) if (!indexOf.has(v)) visit(v);

  const cycles: string[][] = [];
  for (const component of components) {
    const members = new Set(component);
    const selfLoop = component.length === 1 && (next.get(component[0]!) ?? []).includes(component[0]!);
    if (component.length < 2 && !selfLoop) continue;
    const start = order.find((id) => members.has(id))!;
    // Walk inside the component back to the start: a BFS gives the shortest cycle through `start`.
    const previous = new Map<string, string>();
    const queue = [start];
    let closing: string | undefined;
    while (queue.length && !closing) {
      const v = queue.shift()!;
      for (const w of next.get(v) ?? []) {
        if (!members.has(w)) continue;
        if (w === start) {
          closing = v;
          break;
        }
        if (!previous.has(w)) {
          previous.set(w, v);
          queue.push(w);
        }
      }
    }
    const path: string[] = [];
    for (let v: string | undefined = closing; v && v !== start; v = previous.get(v)) path.unshift(v);
    cycles.push([start, ...path]);
  }
  return cycles;
}

/** Edges along a cycle `[a, b, c]`: a → b, b → c, c → a. */
export function cycleEdges(cycle: readonly string[]): Edge[] {
  return cycle.map((from, i) => ({ from, to: cycle[(i + 1) % cycle.length]! }));
}

/** Edges of `tasks` that `base` does not have: the dependencies a Draft added. */
export function addedEdges(tasks: readonly GraphTask[], base: readonly GraphTask[]): Edge[] {
  const known = new Set(edgesOf(base).map(edgeKey));
  return edgesOf(tasks).filter((edge) => !known.has(edgeKey(edge)));
}

/**
 * Edges that close a cycle when the graph is walked depth first in plan order (back edges). Without them the graph
 * has no cycle; in the reference Draft that is the dependency just added (T-3.1 → T-2.3).
 */
export function backEdges(tasks: readonly GraphTask[]): Set<string> {
  const order = tasks.map((t) => t.taskId).filter(Boolean) as string[];
  const next = new Map<string, string[]>(order.map((id) => [id, []]));
  for (const edge of edgesOf(tasks)) next.get(edge.from)!.push(edge.to);
  const state = new Map<string, 'visiting' | 'done'>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 'visiting');
    for (const to of next.get(id) ?? []) {
      const seen = state.get(to);
      if (seen === 'visiting') back.add(edgeKey({ from: id, to }));
      else if (!seen) visit(to);
    }
    state.set(id, 'done');
  };
  for (const id of order) if (!state.has(id)) visit(id);
  return back;
}

/**
 * Layer of each task = length of the longest dependency chain before it (roots are layer 0). Back edges are left
 * out, so a Draft with a cycle is drawn in dependency order with one edge going back.
 */
export function layersOf(tasks: readonly GraphTask[]): Map<string, number> {
  const ignored = backEdges(tasks);
  const deps = new Map<string, string[]>();
  for (const edge of edgesOf(tasks)) {
    if (ignored.has(edgeKey(edge))) continue;
    deps.set(edge.to, [...(deps.get(edge.to) ?? []), edge.from]);
  }
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...(deps.get(id) ?? []).map(depth)) + 1;
    visiting.delete(id);
    layer.set(id, d);
    return d;
  };
  for (const task of tasks) if (task.taskId) depth(task.taskId);
  return layer;
}
