import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('pose studio bridge does not export a repo-side mcp client helper', async () => {
  const packageJsonPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'package.json',
  );
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  assert.equal(packageJson.exports['./mcp-client'], undefined);
});
