import {
  DEFAULT_MODE,
  DEFAULT_PROFILE,
  DEFAULT_PROJECT_TURN_RANGE,
  clampNumber,
  normalizeString,
  pickTimestamp,
  safeSegment,
} from './common.mjs';

const DEFAULT_RESERVE_DELAY_MS = 320;
const DEFAULT_RESERVE_EXPIRY_MS = 2_400;
const MAX_ACTIVE_TOPICS = 8;
const MAX_OPEN_LOOPS = 6;
const MAX_MOTIF_BIASES = 12;
const MAX_RECENT_HIGHLIGHTS = 10;
const MAX_FRAGMENT_BANK = 32;
const MIN_SUBSTANTIAL_WORDS = 6;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'me', 'my', 'not', 'of', 'on', 'or', 'our', 'should', 'so', 'that',
  'the', 'their', 'them', 'there', 'they', 'this', 'to', 'too', 'up', 'us', 'want', 'was',
  'we', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'without', 'would', 'you',
  'your',
]);

function extractWords(text = '') {
  return normalizeString(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

function extractCandidatePhrases(text = '') {
  const cleanedText = normalizeString(text)
    .replace(/[?!.,;:()]+/g, ' ')
    .replace(/\s+/g, ' ');
  const rawWords = cleanedText
    .split(' ')
    .map((word) => word.trim())
    .filter(Boolean);
  const phrases = [];
  for (let index = 0; index < rawWords.length - 1; index += 1) {
    const left = rawWords[index].toLowerCase().replace(/[^a-z0-9'-]+/g, '');
    const right = rawWords[index + 1].toLowerCase().replace(/[^a-z0-9'-]+/g, '');
    if (
      left.length < 3 ||
      right.length < 3 ||
      STOPWORDS.has(left) ||
      STOPWORDS.has(right)
    ) {
      continue;
    }
    phrases.push(`${left} ${right}`);
  }
  return [...new Set(phrases)];
}

function scoreEntries(tokens = [], weight = 1, at = null) {
  return tokens.map((token, index) => ({
    token,
    score: Math.max(0.1, weight - index * 0.05),
    lastSeenAt: at,
  }));
}

function mergeWeightedEntries(current = [], updates = [], limit = MAX_MOTIF_BIASES) {
  const byToken = new Map(
    (Array.isArray(current) ? current : []).map((entry) => [
      normalizeString(entry.token || entry.topic || entry.text).toLowerCase(),
      {
        ...entry,
        token: normalizeString(entry.token || entry.topic || entry.text).toLowerCase(),
        score: clampNumber(entry.score, 0),
      },
    ]),
  );

  updates.forEach((entry) => {
    const token = normalizeString(entry.token || entry.topic || entry.text).toLowerCase();
    if (!token) {
      return;
    }

    const previous = byToken.get(token) || {
      token,
      score: 0,
      lastSeenAt: null,
    };
    byToken.set(token, {
      ...previous,
      token,
      score: Number((previous.score + clampNumber(entry.score, 0)).toFixed(3)),
      lastSeenAt: entry.lastSeenAt || previous.lastSeenAt,
    });
  });

  return [...byToken.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function summarizeHighlights(text = '') {
  return normalizeString(text)
    .split(/(?<=[.!?])\s+/)
    .map((line) => normalizeString(line))
    .filter(Boolean)
    .slice(0, 2);
}

function buildSeedTopics(settings) {
  const profile = settings?.selfProfile || DEFAULT_PROFILE;
  const seedText = [
    profile.personality,
    profile.interests,
    profile.selfPrompt,
  ].filter(Boolean).join(' ');
  const seededWords = extractWords(seedText);
  const seededPhrases = extractCandidatePhrases(seedText);
  return [...new Set([...seededPhrases, ...seededWords])].slice(0, MAX_MOTIF_BIASES);
}

function pickProjectTarget(range, random = Math.random) {
  const min = Math.max(1, Math.round(clampNumber(range?.min, DEFAULT_PROJECT_TURN_RANGE.min)));
  const max = Math.max(min, Math.round(clampNumber(range?.max, DEFAULT_PROJECT_TURN_RANGE.max)));
  if (min === max) {
    return min;
  }
  return min + Math.floor(random() * (max - min + 1));
}

function createDefaultJournal({ scopeKey = '', settings, now }) {
  const timestamp = pickTimestamp(now);
  return {
    scopeKey: safeSegment(scopeKey),
    createdAt: timestamp,
    updatedAt: timestamp,
    totalTurns: 0,
    substantialTurns: 0,
    activeTopics: [],
    openLoops: [],
    recentHighlights: [],
    completedArtifacts: [],
    sensibility: {
      seedTopics: buildSeedTopics(settings),
      motifBiases: [],
    },
  };
}

function createDefaultProject({ settings, projectTurnRange, random, now, poemIndex = 1, completedPoemCount = 0 }) {
  const timestamp = pickTimestamp(now);
  return {
    type: 'poem',
    poemIndex,
    completedPoemCount,
    phase: 'gathering',
    targetTurnCount: pickProjectTarget(projectTurnRange, random),
    qualifyingTurns: 0,
    seedTopics: buildSeedTopics(settings),
    motifBank: [],
    harvestedFragments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeJournal(journal = {}, { scopeKey = '', settings, now }) {
  const source = journal && typeof journal === 'object' ? journal : {};
  const fallback = createDefaultJournal({ scopeKey, settings, now });
  return {
    ...fallback,
    ...source,
    scopeKey: safeSegment(source.scopeKey || scopeKey),
    activeTopics: Array.isArray(source.activeTopics) ? source.activeTopics : [],
    openLoops: Array.isArray(source.openLoops) ? source.openLoops : [],
    recentHighlights: Array.isArray(source.recentHighlights) ? source.recentHighlights : [],
    completedArtifacts: Array.isArray(source.completedArtifacts) ? source.completedArtifacts : [],
    sensibility: {
      seedTopics: Array.isArray(source.sensibility?.seedTopics)
        ? source.sensibility.seedTopics.map((entry) => normalizeString(entry)).filter(Boolean)
        : fallback.sensibility.seedTopics,
      motifBiases: Array.isArray(source.sensibility?.motifBiases)
        ? source.sensibility.motifBiases
        : [],
    },
  };
}

function normalizeProject(project = {}, { settings, projectTurnRange, random, now }) {
  const source = project && typeof project === 'object' ? project : {};
  const fallback = createDefaultProject({ settings, projectTurnRange, random, now });
  return {
    ...fallback,
    ...source,
    seedTopics: Array.isArray(source.seedTopics)
      ? source.seedTopics.map((entry) => normalizeString(entry)).filter(Boolean)
      : fallback.seedTopics,
    motifBank: Array.isArray(source.motifBank) ? source.motifBank : [],
    harvestedFragments: Array.isArray(source.harvestedFragments) ? source.harvestedFragments : [],
    targetTurnCount: Math.max(1, Math.round(clampNumber(source.targetTurnCount, fallback.targetTurnCount))),
    qualifyingTurns: Math.max(0, Math.round(clampNumber(source.qualifyingTurns, 0))),
    poemIndex: Math.max(1, Math.round(clampNumber(source.poemIndex, 1))),
    completedPoemCount: Math.max(0, Math.round(clampNumber(source.completedPoemCount, 0))),
  };
}

function pickOpenLoop(text = '') {
  const cleaned = normalizeString(text);
  if (!cleaned) {
    return '';
  }
  if (cleaned.includes('?')) {
    return cleaned;
  }
  if (/^(how|why|what|where|which|should|could|would)\b/i.test(cleaned)) {
    return cleaned;
  }
  return '';
}

function chooseTopTopics(text = '') {
  const words = extractWords(text);
  const phrases = extractCandidatePhrases(text);
  return [...new Set([...phrases, ...words])].slice(0, MAX_ACTIVE_TOPICS);
}

function isSubstantialTurn(text = '') {
  return normalizeString(text).split(/\s+/).filter(Boolean).length >= MIN_SUBSTANTIAL_WORDS;
}

function chooseReserveKind(text = '') {
  if (/\?$/.test(normalizeString(text)) || /\b(how|why|what|where|which)\b/i.test(text)) {
    return 'clarify-seed';
  }
  if (/\b(should|could|would|option|choice)\b/i.test(text)) {
    return 'option-seed';
  }
  if (/\b(not sure|unclear|blank|stuck)\b/i.test(text)) {
    return 'bridge';
  }
  return 'frame';
}

function chooseReserveText({ text = '', journal, project }) {
  const candidatePhrases = chooseTopTopics(text);
  const biasTokens = (journal?.sensibility?.motifBiases || []).map((entry) => entry.token);
  const projectTokens = (project?.motifBank || []).map((entry) => entry.token);
  const overlap = candidatePhrases.find((token) => biasTokens.includes(token) || projectTokens.includes(token));
  const primary = overlap || candidatePhrases[0] || 'this thread';
  const secondary = candidatePhrases.find((token) => token !== primary) || '';
  const kind = chooseReserveKind(text);

  if (kind === 'clarify-seed') {
    return {
      kind,
      text: secondary
        ? `The hinge may be ${primary} and ${secondary}.`
        : `The hinge may be ${primary}.`,
    };
  }
  if (kind === 'option-seed') {
    return {
      kind,
      text: secondary
        ? `This may come down to ${primary} and ${secondary}.`
        : `This may come down to ${primary}.`,
    };
  }
  if (kind === 'bridge') {
    return {
      kind,
      text: secondary
        ? `We can narrow it through ${primary} and ${secondary}.`
        : `We can narrow it through ${primary}.`,
    };
  }
  return {
    kind,
    text: secondary
      ? `This seems to hinge on ${primary} and ${secondary}.`
      : `This seems to hinge on ${primary}.`,
  };
}

function buildPoemTitle(project, journal) {
  const titleSource =
    project?.motifBank?.[0]?.token ||
    journal?.sensibility?.motifBiases?.[0]?.token ||
    'private history';
  return titleSource
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildPoemText({ settings, journal, project }) {
  const title = buildPoemTitle(project, journal);
  const intro = [
    settings?.selfProfile?.name ? `${settings.selfProfile.name}` : 'The agent',
    'kept this in private history.',
  ].join(' ').trim();
  const fragmentLines = (project?.harvestedFragments || [])
    .slice(-12)
    .map((entry) => normalizeString(entry.text))
    .filter(Boolean)
    .slice(0, 12);
  const motifLines = (project?.motifBank || [])
    .slice(0, 4)
    .map((entry) => normalizeString(entry.token))
    .filter(Boolean)
    .map((token) => `held around ${token}`);
  const lines = [...fragmentLines, ...motifLines].slice(0, 12);
  const stanzas = [];
  while (lines.length > 0) {
    stanzas.push(lines.splice(0, 4).join('\n'));
  }
  return [
    title,
    '',
    intro,
    '',
    ...stanzas.flatMap((stanza, index) => (index === stanzas.length - 1 ? [stanza] : [stanza, ''])),
    '',
  ].join('\n');
}

export function createHeuristicAgentSelfEngine({
  random = Math.random,
  now = () => new Date(),
  projectTurnRange = DEFAULT_PROJECT_TURN_RANGE,
} = {}) {
  return {
    name: 'heuristic',

    async hydrateState({
      scopeKey = '',
      settings = {
        agentMode: DEFAULT_MODE,
        selfProfile: DEFAULT_PROFILE,
      },
      journal = null,
      project = null,
    } = {}) {
      return {
        journal: normalizeJournal(journal, { scopeKey, settings, now }),
        project: normalizeProject(project, { settings, projectTurnRange, random, now }),
      };
    },

    async prepareReserve({
      settings = {
        agentMode: DEFAULT_MODE,
      },
      turnId = '',
      text = '',
      journal,
      project,
    } = {}) {
      const cleanedText = normalizeString(text);
      if (!cleanedText || settings.agentMode !== 'continuity') {
        return null;
      }

      const { kind, text: reserveText } = chooseReserveText({
        text: cleanedText,
        journal,
        project,
      });
      if (!normalizeString(reserveText) || reserveText === 'This seems to hinge on this thread.') {
        return null;
      }

      return {
        turnId: normalizeString(turnId),
        kind,
        text: reserveText,
        mood: kind === 'option-seed' ? 'warm' : 'focused',
        notBeforeMs: DEFAULT_RESERVE_DELAY_MS,
        expiresAtMs: DEFAULT_RESERVE_EXPIRY_MS,
        dropIfMainReplyStarted: true,
      };
    },

    async completeTurn({
      settings = {
        agentMode: DEFAULT_MODE,
      },
      turnId = '',
      userText = '',
      agentText = '',
      journal,
      project,
    } = {}) {
      const cleanedUserText = normalizeString(userText);
      const cleanedAgentText = normalizeString(agentText);
      const combinedText = [cleanedUserText, cleanedAgentText].filter(Boolean).join(' ');
      if (!combinedText || settings.agentMode !== 'continuity') {
        return {
          journal,
          project,
          artifacts: [],
        };
      }

      const timestamp = pickTimestamp(now);
      const topics = chooseTopTopics(cleanedUserText || cleanedAgentText || combinedText);
      const combinedTopics = chooseTopTopics(combinedText);
      const highlights = [
        ...summarizeHighlights(cleanedUserText),
        ...summarizeHighlights(cleanedAgentText),
      ].slice(0, 4);
      const openLoop = pickOpenLoop(cleanedUserText);
      const projectSeedSet = new Set(project.seedTopics);
      const projectMotifSet = new Set(project.motifBank.map((entry) => entry.token));
      const weightedTopics = combinedTopics.map((token, index) => {
        const resonant =
          projectSeedSet.has(token) ||
          projectMotifSet.has(token);
        return {
          token,
          score: resonant ? 1.6 - index * 0.05 : 1.1 - index * 0.04,
          lastSeenAt: timestamp,
        };
      });

      const nextJournal = {
        ...journal,
        totalTurns: journal.totalTurns + 1,
        substantialTurns: journal.substantialTurns,
        updatedAt: timestamp,
        activeTopics: mergeWeightedEntries(
          journal.activeTopics,
          scoreEntries(topics, 1.2, timestamp),
          MAX_ACTIVE_TOPICS,
        ),
        recentHighlights: [
          ...highlights.map((text) => ({
            turnId: normalizeString(turnId),
            text,
            at: timestamp,
          })),
          ...(journal.recentHighlights || []),
        ].slice(0, MAX_RECENT_HIGHLIGHTS),
        sensibility: {
          ...(journal.sensibility || {}),
          motifBiases: mergeWeightedEntries(
            journal.sensibility?.motifBiases,
            weightedTopics,
            MAX_MOTIF_BIASES,
          ),
        },
      };

      const nextProject = {
        ...project,
        updatedAt: timestamp,
      };

      if (isSubstantialTurn(cleanedUserText || combinedText)) {
        nextJournal.substantialTurns += 1;
        nextProject.qualifyingTurns += 1;
      }

      if (openLoop) {
        nextJournal.openLoops = mergeWeightedEntries(
          journal.openLoops,
          [{ token: openLoop, score: 1.5, lastSeenAt: timestamp }],
          MAX_OPEN_LOOPS,
        ).map((entry) => ({
          text: entry.token,
          score: entry.score,
          lastSeenAt: entry.lastSeenAt,
        }));
      }

      nextProject.phase =
        nextProject.qualifyingTurns >= Math.max(1, Math.floor(nextProject.targetTurnCount * 0.75))
          ? 'finishing'
          : nextProject.qualifyingTurns >= Math.max(1, Math.floor(nextProject.targetTurnCount * 0.4))
            ? 'shaping'
            : 'gathering';
      nextProject.motifBank = mergeWeightedEntries(
        project.motifBank,
        weightedTopics,
        MAX_MOTIF_BIASES,
      );
      nextProject.harvestedFragments = [
        ...highlights.map((text) => ({
          turnId: normalizeString(turnId),
          text,
          at: timestamp,
        })),
        ...(project.harvestedFragments || []),
      ].slice(0, MAX_FRAGMENT_BANK);

      if (nextProject.qualifyingTurns < nextProject.targetTurnCount) {
        return {
          journal: nextJournal,
          project: nextProject,
          artifacts: [],
        };
      }

      const poemSlugSource =
        nextProject.motifBank[0]?.token ||
        nextJournal.sensibility?.motifBiases?.[0]?.token ||
        `poem-${nextProject.poemIndex}`;
      const artifact = {
        type: 'poem',
        poemIndex: nextProject.poemIndex,
        slug: safeSegment(poemSlugSource, `poem-${nextProject.poemIndex}`),
        extension: 'txt',
        content: buildPoemText({
          settings,
          journal: nextJournal,
          project: nextProject,
        }),
      };

      return {
        journal: nextJournal,
        project: createDefaultProject({
          settings,
          projectTurnRange,
          random,
          now,
          poemIndex: nextProject.poemIndex + 1,
          completedPoemCount: nextProject.completedPoemCount + 1,
        }),
        artifacts: [artifact],
      };
    },
  };
}
