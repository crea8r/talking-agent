import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const appsDir = path.join(repoRoot, 'apps');
const packagesDir = path.join(repoRoot, 'packages');
const stagedOnly = process.argv.includes('--staged');
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const moduleSpecifierPattern =
  /\bfrom\s*["']([^"'`\r\n]+)["']|\bimport\s*["']([^"'`\r\n]+)["']|\bimport\s*\(\s*["']([^"'`\r\n]+)["']\s*\)|\brequire\s*\(\s*["']([^"'`\r\n]+)["']\s*\)/g;

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `git ${args.join(' ')} failed with code ${result.status}.`);
  }

  return result.stdout;
}

function listWorkspaceAppPackageNames() {
  const names = [];

  for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageJsonPath = path.join(appsDir, entry.name, 'package.json');

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (typeof packageJson.name === 'string' && packageJson.name.trim()) {
        names.push(packageJson.name.trim());
      }
    } catch (error) {
      throw new Error(`Unable to read ${path.relative(repoRoot, packageJsonPath)}: ${error.message}`);
    }
  }

  return new Set(names);
}

function listFilesRecursively(rootDir) {
  const files = [];

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const absolutePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath));
      continue;
    }

    files.push(path.relative(repoRoot, absolutePath));
  }

  return files;
}

function isRelevantPackageFile(relativePath) {
  if (!relativePath.startsWith('packages/')) {
    return false;
  }

  if (path.basename(relativePath) === 'package.json') {
    return true;
  }

  return sourceExtensions.has(path.extname(relativePath));
}

function listCandidateFiles() {
  if (stagedOnly) {
    const output = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '--', 'packages']);
    return output
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
      .filter(isRelevantPackageFile);
  }

  if (!statSync(packagesDir).isDirectory()) {
    return [];
  }

  return listFilesRecursively(packagesDir).filter(isRelevantPackageFile);
}

function readCandidateFile(relativePath) {
  if (!stagedOnly) {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  }

  return runGit(['show', `:${relativePath}`]);
}

function getLineNumber(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
}

function describeSpecifierViolation(specifier, appPackageNames) {
  const normalized = specifier.replaceAll('\\', '/');

  if (/(^|\/)apps(\/|$)/.test(normalized)) {
    return `imports from app path "${specifier}"`;
  }

  for (const appPackageName of appPackageNames) {
    if (normalized === appPackageName || normalized.startsWith(`${appPackageName}/`)) {
      return `imports from app package "${specifier}"`;
    }
  }

  return null;
}

function findImportViolations(relativePath, text, appPackageNames) {
  const violations = [];

  for (const match of text.matchAll(moduleSpecifierPattern)) {
    const specifier = match[1] || match[2] || match[3] || match[4];
    const reason = describeSpecifierViolation(specifier, appPackageNames);

    if (!reason) {
      continue;
    }

    violations.push({
      relativePath,
      line: getLineNumber(text, match.index),
      message: `packages/ code ${reason}. Move shared code into packages/ instead.`,
    });
  }

  return violations;
}

function findDependencyViolations(relativePath, text, appPackageNames) {
  const violations = [];
  let packageJson;

  try {
    packageJson = JSON.parse(text);
  } catch (error) {
    violations.push({
      relativePath,
      line: 1,
      message: `has invalid JSON (${error.message}).`,
    });
    return violations;
  }

  for (const field of dependencyFields) {
    const dependencies = packageJson[field];
    if (!dependencies || typeof dependencies !== 'object') {
      continue;
    }

    for (const dependencyName of Object.keys(dependencies)) {
      if (!appPackageNames.has(dependencyName)) {
        continue;
      }

      const propertyIndex = text.indexOf(`"${dependencyName}"`);
      violations.push({
        relativePath,
        line: propertyIndex === -1 ? 1 : getLineNumber(text, propertyIndex),
        message: `declares app package "${dependencyName}" in ${field}. Packages must not depend on apps.`,
      });
    }
  }

  return violations;
}

function main() {
  const appPackageNames = listWorkspaceAppPackageNames();
  const candidateFiles = listCandidateFiles();
  const violations = [];

  for (const relativePath of candidateFiles) {
    const text = readCandidateFile(relativePath);

    if (path.basename(relativePath) === 'package.json') {
      violations.push(...findDependencyViolations(relativePath, text, appPackageNames));
      continue;
    }

    violations.push(...findImportViolations(relativePath, text, appPackageNames));
  }

  if (!violations.length) {
    return;
  }

  console.error('Package boundary check failed.');
  console.error('packages/ must not import or depend on apps/.');

  for (const violation of violations) {
    console.error(`${violation.relativePath}:${violation.line} ${violation.message}`);
  }

  process.exit(1);
}

main();
