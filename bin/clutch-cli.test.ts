import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runCli(args: string[], env?: Record<string, string>): { stdout: string; stderr: string } {
  const cliPath = join(__dirname, 'clutch-cli.ts');
  const stdout = execFileSync('npx', ['tsx', cliPath, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env,
    },
  });

  return { stdout, stderr: '' };
}

describe('clutch-cli --json output', () => {
  it('tasks list --json prints valid JSON', () => {
    const { stdout } = runCli(['tasks', 'list', '--json'], {
      CONVEX_URL: 'http://127.0.0.1:3210',
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('tasks');
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed).toHaveProperty('project');
  });

  it('tasks get <id> --json prints valid JSON', () => {
    const list = runCli(['tasks', 'list', '--limit', '1', '--json'], {
      CONVEX_URL: 'http://127.0.0.1:3210',
    });

    const parsedList = JSON.parse(list.stdout) as { tasks: Array<{ id: string }> };
    expect(parsedList.tasks.length).toBeGreaterThan(0);

    const id = parsedList.tasks[0].id;
    const { stdout } = runCli(['tasks', 'get', id, '--json'], {
      CONVEX_URL: 'http://127.0.0.1:3210',
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('task');
    expect(parsed.task).toHaveProperty('id', id);
  });
});
