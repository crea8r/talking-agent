import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import {
  DEFAULT_MODE,
  DEFAULT_MANUAL_MODE,
  DEFAULT_PROFILE,
  DEFAULT_PROJECT_TURN_RANGE,
  ensureDir,
  mergeSettings,
  normalizeSettings,
  normalizeString,
  pickTimestamp,
  readJson,
  safeFileExtension,
  safeSegment,
  writeJson,
} from './lib/common.mjs';
import { createHeuristicAgentSelfEngine } from './lib/heuristic-engine.mjs';

function createWorkspacePaths(rootDir, appId, scopeKey = '') {
  const appRoot = path.join(rootDir, safeSegment(appId, 'app'));
  const workspaceRoot = path.join(appRoot, 'workspaces', safeSegment(scopeKey));
  return {
    appRoot,
    settingsPath: path.join(appRoot, 'settings.json'),
    workspaceRoot,
    journalPath: path.join(workspaceRoot, 'journal.json'),
    projectPath: path.join(workspaceRoot, 'project.json'),
    artifactsDir: path.join(workspaceRoot, 'artifacts'),
    poemsDir: path.join(workspaceRoot, 'poems'),
  };
}

function resolveArtifactDirectory(paths, artifact = {}) {
  return artifact.type === 'poem'
    ? paths.poemsDir
    : path.join(paths.artifactsDir, safeSegment(artifact.type, 'artifact'));
}

function createArtifactFileName(artifact = {}, now = () => new Date()) {
  const slugBase =
    artifact.slug ||
    artifact.title ||
    (artifact.type === 'poem' && Number.isFinite(Number(artifact.poemIndex))
      ? `poem-${Math.max(1, Math.round(Number(artifact.poemIndex)))}`
      : artifact.type || 'artifact');
  const suffix = Number.isFinite(Number(artifact.poemIndex))
    ? `-${Math.max(1, Math.round(Number(artifact.poemIndex)))}`
    : '';
  return `${pickTimestamp(now).slice(0, 10)}-${safeSegment(slugBase, 'artifact')}${suffix}.${safeFileExtension(artifact.extension, 'txt')}`;
}

async function persistCompletedArtifacts({
  journal,
  paths,
  artifacts = [],
  now = () => new Date(),
} = {}) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return journal;
  }

  const completedAt = pickTimestamp(now);
  const persistedArtifacts = [];
  for (const artifact of artifacts) {
    const content = normalizeString(artifact?.content);
    if (!content) {
      continue;
    }

    const artifactDir = resolveArtifactDirectory(paths, artifact);
    const artifactPath = path.join(artifactDir, createArtifactFileName(artifact, now));
    await ensureDir(artifactDir);
    await writeFile(artifactPath, content, 'utf8');

    persistedArtifacts.push({
      type: normalizeString(artifact.type) || 'artifact',
      artifactPath,
      completedAt: artifact.completedAt || completedAt,
      ...(Number.isFinite(Number(artifact.poemIndex))
        ? { poemIndex: Math.max(1, Math.round(Number(artifact.poemIndex))) }
        : {}),
      ...(normalizeString(artifact.slug) ? { slug: normalizeString(artifact.slug) } : {}),
    });
  }

  if (persistedArtifacts.length === 0) {
    return journal;
  }

  return {
    ...journal,
    updatedAt: completedAt,
    completedArtifacts: [
      ...persistedArtifacts,
      ...(Array.isArray(journal.completedArtifacts) ? journal.completedArtifacts : []),
    ],
  };
}

function validateEngine(engine) {
  if (!engine || typeof engine !== 'object') {
    throw new Error('createAgentSelf requires an engine object.');
  }
  if (typeof engine.hydrateState !== 'function') {
    throw new Error('Agent self engine must implement hydrateState().');
  }
  if (typeof engine.prepareReserve !== 'function') {
    throw new Error('Agent self engine must implement prepareReserve().');
  }
  if (typeof engine.completeTurn !== 'function') {
    throw new Error('Agent self engine must implement completeTurn().');
  }
  return engine;
}

export function createAgentSelf({
  rootDir,
  appId = 'app',
  random = Math.random,
  now = () => new Date(),
  projectTurnRange = DEFAULT_PROJECT_TURN_RANGE,
  engine = createHeuristicAgentSelfEngine({
    random,
    now,
    projectTurnRange,
  }),
} = {}) {
  if (!rootDir) {
    throw new Error('createAgentSelf requires a rootDir.');
  }

  const activeEngine = validateEngine(engine);

  async function getSettings() {
    const { settingsPath } = createWorkspacePaths(rootDir, appId);
    const saved = await readJson(settingsPath, null);
    return normalizeSettings(saved || {
      agentMode: DEFAULT_MODE,
      manualMode: DEFAULT_MANUAL_MODE,
      selfProfile: DEFAULT_PROFILE,
    });
  }

  async function updateSettings(patch = {}) {
    const current = await getSettings();
    const next = mergeSettings(current, patch);
    const { settingsPath } = createWorkspacePaths(rootDir, appId);
    await writeJson(settingsPath, next);
    return next;
  }

  async function loadWorkspaceState({ scopeKey = '' } = {}) {
    const settings = await getSettings();
    const paths = createWorkspacePaths(rootDir, appId, scopeKey);
    const rawJournal = await readJson(paths.journalPath, null);
    const rawProject = await readJson(paths.projectPath, null);
    const hydratedState = await activeEngine.hydrateState({
      scopeKey,
      settings,
      journal: rawJournal,
      project: rawProject,
    });
    return {
      settings,
      paths,
      journal: hydratedState?.journal || rawJournal || {},
      project: hydratedState?.project || rawProject || {},
    };
  }

  async function persistWorkspaceState({ paths, journal, project }) {
    await writeJson(paths.journalPath, journal);
    await writeJson(paths.projectPath, project);
  }

  async function getWorkspaceState({ scopeKey = '' } = {}) {
    const { journal, project } = await loadWorkspaceState({ scopeKey });
    return {
      journal,
      project,
      completedArtifacts: Array.isArray(journal.completedArtifacts)
        ? journal.completedArtifacts
        : [],
    };
  }

  async function prepareReserve({
    scopeKey = '',
    turnId = '',
    text = '',
  } = {}) {
    const cleanedText = normalizeString(text);
    if (!cleanedText) {
      return null;
    }

    const state = await loadWorkspaceState({ scopeKey });
    return activeEngine.prepareReserve({
      ...state,
      scopeKey,
      turnId: normalizeString(turnId),
      text: cleanedText,
    });
  }

  async function completeTurn({
    scopeKey = '',
    turnId = '',
    userText = '',
    agentText = '',
  } = {}) {
    const cleanedUserText = normalizeString(userText);
    const cleanedAgentText = normalizeString(agentText);
    const combinedText = [cleanedUserText, cleanedAgentText].filter(Boolean).join(' ');

    const state = await loadWorkspaceState({ scopeKey });
    if (!combinedText) {
      return {
        journal: state.journal,
        project: state.project,
        completedArtifacts: Array.isArray(state.journal.completedArtifacts)
          ? state.journal.completedArtifacts
          : [],
      };
    }

    const engineResult = await activeEngine.completeTurn({
      ...state,
      scopeKey,
      turnId: normalizeString(turnId),
      userText: cleanedUserText,
      agentText: cleanedAgentText,
    });
    const nextProject = engineResult?.project || state.project;
    const persistedJournal = await persistCompletedArtifacts({
      journal: engineResult?.journal || state.journal,
      paths: state.paths,
      artifacts: engineResult?.artifacts || engineResult?.completedArtifacts || [],
      now,
    });

    await persistWorkspaceState({
      paths: state.paths,
      journal: persistedJournal,
      project: nextProject,
    });

    return {
      journal: persistedJournal,
      project: nextProject,
      completedArtifacts: Array.isArray(persistedJournal.completedArtifacts)
        ? persistedJournal.completedArtifacts
        : [],
    };
  }

  return {
    getSettings,
    updateSettings,
    prepareReserve,
    completeTurn,
    getWorkspaceState,
    engine: activeEngine,
  };
}

export { createHeuristicAgentSelfEngine } from './lib/heuristic-engine.mjs';
