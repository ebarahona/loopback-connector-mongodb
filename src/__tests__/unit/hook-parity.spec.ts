import {readFileSync} from 'node:fs';
import {describe, it, expect} from 'vitest';
import {parse} from 'yaml';

const TASK_RE = /^#\s*task:\s*(\S+)/;

function lefthookTasks(hook: 'pre-commit' | 'commit-msg'): Set<string> {
  const doc = parse(readFileSync('lefthook.yml', 'utf8')) as Record<
    string,
    {commands?: Record<string, unknown>}
  >;
  return new Set(Object.keys(doc[hook]?.commands ?? {}));
}

function scriptTasks(path: string): Set<string> {
  const tasks = new Set<string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = TASK_RE.exec(line);
    if (m) tasks.add(m[1]);
  }
  return tasks;
}

describe('hook parity', () => {
  it('pre-commit tasks match between lefthook.yml and .githooks/pre-commit', () => {
    const lh = [...lefthookTasks('pre-commit')].sort();
    const sh = [...scriptTasks('.githooks/pre-commit')].sort();
    expect(sh).toEqual(lh);
  });

  it('commit-msg tasks match between lefthook.yml and .githooks/commit-msg', () => {
    const lh = [...lefthookTasks('commit-msg')].sort();
    const sh = [...scriptTasks('.githooks/commit-msg')].sort();
    expect(sh).toEqual(lh);
  });
});
