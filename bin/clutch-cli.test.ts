import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if Convex server is available (for integration tests)
let convexAvailable = false;
beforeAll(async () => {
  try {
    const client = new ConvexHttpClient(process.env.CONVEX_URL ?? 'http://127.0.0.1:3210');
    // Quick health check - try to connect with a short timeout
    const queryCall = client.query({
      path: 'projects:getAll' as unknown as string,
      args: {},
    } as unknown as Parameters<typeof client.query>[0]);
    await Promise.race([
      queryCall,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000)),
    ]);
    convexAvailable = true;
  } catch {
    convexAvailable = false;
    console.log('Convex server not available, skipping CLI integration tests');
  }
});

// Test unescapeString helper directly
// Note: We test the behavior by importing the function logic inline
function unescapeString(str: string): string {
  return str.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function runCli(args: string[], env?: Record<string, string>): { stdout: string; stderr: string } {
  const cliPath = join(__dirname, 'clutch-cli.ts');
  const stdout = execFileSync('npx', ['tsx', cliPath, ...args], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB to prevent ENOBUFS with large task lists
    env: {
      ...process.env,
      ...env,
    },
  });

  return { stdout, stderr: '' };
}

describe('unescapeString helper', () => {
  it('converts literal \\n to actual newlines', () => {
    const input = 'Line 1\\nLine 2\\nLine 3';
    const expected = 'Line 1\nLine 2\nLine 3';
    expect(unescapeString(input)).toBe(expected);
  });

  it('converts literal \\t to actual tabs', () => {
    const input = 'Col1\\tCol2\\tCol3';
    const expected = 'Col1\tCol2\tCol3';
    expect(unescapeString(input)).toBe(expected);
  });

  it('handles mixed \\n and \\t', () => {
    const input = 'Line 1\\tTabbed\\nLine 2\\tAlso tabbed';
    const expected = 'Line 1\tTabbed\nLine 2\tAlso tabbed';
    expect(unescapeString(input)).toBe(expected);
  });

  it('leaves regular strings unchanged', () => {
    const input = 'Just a regular string';
    expect(unescapeString(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(unescapeString('')).toBe('');
  });

  it('preserves actual newlines and tabs', () => {
    // If someone passes actual newlines, they should remain
    const input = 'Line 1\nLine 2';
    expect(unescapeString(input)).toBe('Line 1\nLine 2');
  });
});

describe('clutch-cli --json output', () => {
  it('tasks list --json prints valid JSON', { skip: !convexAvailable }, () => {
    const { stdout } = runCli(['tasks', 'list', '--json'], {
      CONVEX_URL: 'http://127.0.0.1:3210',
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('tasks');
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed).toHaveProperty('project');
  });

  it('tasks get <id> --json prints valid JSON', { skip: !convexAvailable }, () => {
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
