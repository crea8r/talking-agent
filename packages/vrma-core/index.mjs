const JSON_CHUNK_TYPE = 'JSON';
const BIN_CHUNK_TYPE = 'BIN\0';
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const TYPE_COMPONENTS = new Map([
  ['SCALAR', 1],
  ['VEC3', 3],
  ['VEC4', 4],
]);

const HUMAN_BONE_ORDER = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  'leftEye',
  'rightEye',
  'jaw',
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
];

function toByteArray(source) {
  if (source instanceof Uint8Array) {
    return source;
  }

  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }

  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }

  throw new TypeError('VRMA source must be a Uint8Array, ArrayBuffer, or ArrayBuffer view.');
}

function createDataView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function allocateBytes(length, fillByte = 0x00) {
  const bytes = new Uint8Array(length);
  if (fillByte !== 0x00) {
    bytes.fill(fillByte);
  }
  return bytes;
}

function concatBytes(parts) {
  const byteLength = parts.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  parts.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });

  return bytes;
}

function encodeText(value) {
  return textEncoder.encode(value);
}

function decodeText(bytes) {
  return textDecoder.decode(bytes);
}

function writeUint32LE(bytes, offset, value) {
  createDataView(bytes).setUint32(offset, value, true);
}

function readUint32LE(bytes, offset) {
  return createDataView(bytes).getUint32(offset, true);
}

function writeFloat32LE(bytes, offset, value) {
  createDataView(bytes).setFloat32(offset, value, true);
}

function readFloat32LE(bytes, offset) {
  return createDataView(bytes).getFloat32(offset, true);
}

function writeText(bytes, offset, value) {
  bytes.set(encodeText(value), offset);
}

function padBuffer(buffer, fillByte = 0x00) {
  const remainder = buffer.length % 4;
  if (remainder === 0) {
    return buffer;
  }

  return concatBytes([buffer, allocateBytes(4 - remainder, fillByte)]);
}

function cloneTrack(track) {
  return {
    interpolation: track.interpolation,
    times: [...track.times],
    values: [...track.values],
    valueType: track.valueType,
  };
}

function cloneTracksMap(trackMap) {
  return new Map(Array.from(trackMap.entries(), ([key, track]) => [key, cloneTrack(track)]));
}

function getAccessorComponents(accessor) {
  const components = TYPE_COMPONENTS.get(accessor.type);
  if (!components) {
    throw new Error(`Unsupported accessor type ${accessor.type}.`);
  }

  if (accessor.componentType !== 5126) {
    throw new Error(`Unsupported accessor component type ${accessor.componentType}.`);
  }

  return components;
}

function readFloatArrayFromAccessor(json, binChunk, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`Missing accessor ${accessorIndex}.`);
  }

  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    throw new Error(`Missing bufferView ${accessor.bufferView}.`);
  }

  const components = getAccessorComponents(accessor);
  const itemSize = components * 4;
  const count = accessor.count;
  const sourceOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = bufferView.byteStride || itemSize;
  const values = new Array(count * components);

  for (let index = 0; index < count; index += 1) {
    const itemOffset = sourceOffset + (index * stride);
    for (let componentIndex = 0; componentIndex < components; componentIndex += 1) {
      values[(index * components) + componentIndex] = readFloat32LE(
        binChunk,
        itemOffset + (componentIndex * 4),
      );
    }
  }

  return {
    accessor,
    components,
    values,
  };
}

function parseGlbChunks(source) {
  const buffer = toByteArray(source);
  const magic = decodeText(buffer.subarray(0, 4));

  if (magic !== 'glTF') {
    throw new Error('VRMA source must be a binary glTF (GLB) file.');
  }

  let offset = GLB_HEADER_BYTES;
  const chunks = [];

  while (offset < buffer.length) {
    const chunkLength = readUint32LE(buffer, offset);
    const chunkType = decodeText(buffer.subarray(offset + 4, offset + 8));
    const chunkStart = offset + GLB_CHUNK_HEADER_BYTES;
    const chunkEnd = chunkStart + chunkLength;

    chunks.push({
      type: chunkType,
      length: chunkLength,
      data: buffer.subarray(chunkStart, chunkEnd),
    });

    offset = chunkEnd;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK_TYPE);
  if (!jsonChunk) {
    throw new Error('GLB source is missing its JSON chunk.');
  }

  const json = JSON.parse(decodeText(jsonChunk.data));
  const binChunk = chunks.find((chunk) => chunk.type === BIN_CHUNK_TYPE)?.data || allocateBytes(0);

  return {
    magic,
    version: readUint32LE(buffer, 4),
    totalLength: readUint32LE(buffer, 8),
    source: buffer,
    json,
    chunks,
    binChunk,
  };
}

function decodeJsonChunk(source) {
  return parseGlbChunks(source).json;
}

function getHumanoidNodeMaps(extension) {
  const nodeToBone = new Map();
  const boneToNode = new Map();

  Object.entries(extension?.humanoid?.humanBones || {}).forEach(([boneName, definition]) => {
    nodeToBone.set(definition.node, boneName);
    boneToNode.set(boneName, definition.node);
  });

  return {
    nodeToBone,
    boneToNode,
  };
}

function getExpressionNodeMap(extension) {
  const expressionNodeMap = new Map();
  const expressions = extension?.expressions || {};

  Object.entries(expressions.preset || {}).forEach(([expressionName, definition]) => {
    expressionNodeMap.set(definition.node, {
      type: 'preset',
      name: expressionName,
    });
  });

  Object.entries(expressions.custom || {}).forEach(([expressionName, definition]) => {
    expressionNodeMap.set(definition.node, {
      type: 'custom',
      name: expressionName,
    });
  });

  return expressionNodeMap;
}

function createTrack({ input, output, interpolation, valueType }) {
  return {
    interpolation: interpolation || 'LINEAR',
    times: input.values,
    values: output.values,
    valueType,
  };
}

function createEditableClip(json, extension, binChunk) {
  const animation = json.animations?.[0];
  if (!animation) {
    throw new Error('VRMA file must contain exactly one animation clip.');
  }

  const { nodeToBone } = getHumanoidNodeMaps(extension);
  const expressionNodeMap = getExpressionNodeMap(extension);
  const lookAtNode = extension?.lookAt?.node ?? null;
  const rotationTracks = new Map();
  const translationTracks = new Map();
  const preservedChannels = [];
  let duration = 0;

  animation.channels.forEach((channel) => {
    const sampler = animation.samplers[channel.sampler];
    const input = readFloatArrayFromAccessor(json, binChunk, sampler.input);
    const output = readFloatArrayFromAccessor(json, binChunk, sampler.output);
    const boneName = nodeToBone.get(channel.target.node);

    if (input.values.length > 0) {
      duration = Math.max(duration, input.values[input.values.length - 1]);
    }

    if (boneName) {
      if (channel.target.path === 'rotation') {
        rotationTracks.set(
          boneName,
          createTrack({
            input,
            output,
            interpolation: sampler.interpolation,
            valueType: 'rotation',
          }),
        );
        return;
      }

      if (boneName === 'hips' && channel.target.path === 'translation') {
        translationTracks.set(
          boneName,
          createTrack({
            input,
            output,
            interpolation: sampler.interpolation,
            valueType: 'translation',
          }),
        );
        return;
      }
    }

    const expressionInfo = expressionNodeMap.get(channel.target.node);
    if (expressionInfo && channel.target.path === 'translation') {
      preservedChannels.push({
        kind: 'expression',
        node: channel.target.node,
        expressionType: expressionInfo.type,
        expressionName: expressionInfo.name,
        track: {
          interpolation: sampler.interpolation || 'LINEAR',
          times: input.values,
          values: output.values.filter((_, index) => index % 3 === 0),
          valueType: 'expression',
        },
      });
      return;
    }

    if (lookAtNode !== null && channel.target.node === lookAtNode && channel.target.path === 'rotation') {
      preservedChannels.push({
        kind: 'lookAt',
        node: channel.target.node,
        track: createTrack({
          input,
          output,
          interpolation: sampler.interpolation,
          valueType: 'rotation',
        }),
      });
      return;
    }

    preservedChannels.push({
      kind: 'unknown',
      node: channel.target.node,
      path: channel.target.path,
      track: createTrack({
        input,
        output,
        interpolation: sampler.interpolation,
        valueType: output.accessor.type,
      }),
    });
  });

  return {
    name: animation.name || 'Clip',
    duration,
    rotationTracks,
    translationTracks,
    preservedChannels,
  };
}

function createNodeEntries(humanoidSkeleton) {
  const orderedBones = HUMAN_BONE_ORDER.filter((boneName) => humanoidSkeleton[boneName]);
  const fallbackBones = Object.keys(humanoidSkeleton).filter((boneName) => !orderedBones.includes(boneName));
  const boneNames = [...orderedBones, ...fallbackBones];
  const boneIndexMap = new Map(boneNames.map((boneName, index) => [boneName, index]));
  const nodes = boneNames.map((boneName) => {
    const definition = humanoidSkeleton[boneName];
    return {
      name: definition.name || boneName,
      translation: definition.translation || [0, 0, 0],
      children: (definition.children || [])
        .map((childName) => boneIndexMap.get(childName))
        .filter((value) => Number.isInteger(value)),
    };
  });

  const childIndices = new Set(nodes.flatMap((node) => node.children || []));
  const rootNodes = nodes
    .map((_, index) => index)
    .filter((index) => !childIndices.has(index));

  const humanBones = Object.fromEntries(
    boneNames.map((boneName) => [boneName, { node: boneIndexMap.get(boneName) }]),
  );

  return {
    nodes,
    humanBones,
    rootNodes,
  };
}

function createBaseVrmaJson({ clipName, humanoidSkeleton, expressionPayload = null, lookAtPayload = null }) {
  const { nodes, humanBones, rootNodes } = createNodeEntries(humanoidSkeleton);
  const extension = {
    specVersion: '1.0',
    humanoid: {
      humanBones,
    },
  };

  if (expressionPayload) {
    extension.expressions = structuredClone(expressionPayload);
  }

  if (lookAtPayload) {
    extension.lookAt = structuredClone(lookAtPayload);
  }

  return {
    asset: {
      version: '2.0',
      generator: 'talking-agent vrma-core',
    },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: extension,
    },
    scene: 0,
    scenes: [
      {
        nodes: rootNodes,
      },
    ],
    nodes,
    animations: [
      {
        name: clipName,
        samplers: [],
        channels: [],
      },
    ],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
}

function buildEmptyTrackMap() {
  return new Map();
}

function getDefaultHumanoidSkeleton() {
  return {
    hips: { translation: [0, 1, 0], children: ['head'] },
    head: { translation: [0, 0.5, 0], children: [] },
  };
}

function createTrackBufferWriter() {
  const parts = [];
  const bufferViews = [];
  const accessors = [];
  let byteLength = 0;

  function pushFloatArray(values, { type, min = null, max = null }) {
    const source = allocateBytes(values.length * 4);
    values.forEach((value, index) => {
      writeFloat32LE(source, index * 4, value);
    });

    const bufferView = {
      buffer: 0,
      byteOffset: byteLength,
      byteLength: source.length,
    };
    bufferViews.push(bufferView);
    parts.push(source);
    byteLength += source.length;

    const accessor = {
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: values.length / TYPE_COMPONENTS.get(type),
      type,
    };

    if (min) {
      accessor.min = min;
    }

    if (max) {
      accessor.max = max;
    }

    accessors.push(accessor);
    return accessors.length - 1;
  }

  return {
    pushFloatArray,
    finish() {
      const binBuffer = padBuffer(concatBytes(parts), 0x00);
      return {
        binBuffer,
        bufferViews,
        accessors,
      };
    },
  };
}

function addTrackToAnimation(animation, writer, { node, path, track, type }) {
  const minTime = track.times.length ? [Math.min(...track.times)] : [0];
  const maxTime = track.times.length ? [Math.max(...track.times)] : [0];
  const inputAccessor = writer.pushFloatArray(track.times, {
    type: 'SCALAR',
    min: minTime,
    max: maxTime,
  });

  let outputValues = track.values;
  if (type === 'expression') {
    outputValues = track.values.flatMap((value) => [value, 0, 0]);
  }

  const outputAccessor = writer.pushFloatArray(outputValues, {
    type: path === 'rotation' ? 'VEC4' : 'VEC3',
  });

  animation.samplers.push({
    input: inputAccessor,
    output: outputAccessor,
    interpolation: track.interpolation || 'LINEAR',
  });
  animation.channels.push({
    sampler: animation.samplers.length - 1,
    target: {
      node,
      path,
    },
  });
}

function serializeDocumentJson(document) {
  const baseJson = structuredClone(document.json);
  const extension = structuredClone(document.extension);
  const animation = {
    name: document.clip.name,
    samplers: [],
    channels: [],
  };
  const writer = createTrackBufferWriter();
  const { boneToNode } = getHumanoidNodeMaps(extension);

  baseJson.extensionsUsed = Array.from(new Set([...(baseJson.extensionsUsed || []), 'VRMC_vrm_animation']));
  baseJson.extensions = baseJson.extensions || {};
  if (document.preserved.expressionPayload) {
    extension.expressions = structuredClone(document.preserved.expressionPayload);
  } else {
    delete extension.expressions;
  }

  if (document.preserved.lookAtPayload) {
    extension.lookAt = structuredClone(document.preserved.lookAtPayload);
  } else {
    delete extension.lookAt;
  }

  baseJson.extensions.VRMC_vrm_animation = extension;

  document.clip.rotationTracks.forEach((track, boneName) => {
    const node = boneToNode.get(boneName);
    if (node === undefined) {
      return;
    }

    addTrackToAnimation(animation, writer, {
      node,
      path: 'rotation',
      track,
    });
  });

  document.clip.translationTracks.forEach((track, boneName) => {
    const node = boneToNode.get(boneName);
    if (node === undefined) {
      return;
    }

    addTrackToAnimation(animation, writer, {
      node,
      path: 'translation',
      track,
    });
  });

  document.clip.preservedChannels.forEach((preserved) => {
    if (preserved.kind === 'expression') {
      addTrackToAnimation(animation, writer, {
        node: preserved.node,
        path: 'translation',
        track: preserved.track,
        type: 'expression',
      });
      return;
    }

    if (preserved.kind === 'lookAt') {
      addTrackToAnimation(animation, writer, {
        node: preserved.node,
        path: 'rotation',
        track: preserved.track,
      });
      return;
    }

    addTrackToAnimation(animation, writer, {
      node: preserved.node,
      path: preserved.path,
      track: preserved.track,
    });
  });

  const { binBuffer, bufferViews, accessors } = writer.finish();
  baseJson.animations = [animation];
  baseJson.bufferViews = bufferViews;
  baseJson.accessors = accessors;
  baseJson.buffers = [
    {
      byteLength: binBuffer.length,
    },
  ];

  return {
    json: baseJson,
    binBuffer,
  };
}

function serializeGlb({ json, binBuffer }) {
  const jsonBuffer = padBuffer(encodeText(JSON.stringify(json)), 0x20);
  const paddedBinBuffer = padBuffer(binBuffer, 0x00);
  const totalLength =
    GLB_HEADER_BYTES +
    GLB_CHUNK_HEADER_BYTES +
    jsonBuffer.length +
    GLB_CHUNK_HEADER_BYTES +
    paddedBinBuffer.length;
  const header = allocateBytes(GLB_HEADER_BYTES);
  writeText(header, 0, 'glTF');
  writeUint32LE(header, 4, 2);
  writeUint32LE(header, 8, totalLength);

  const jsonChunkHeader = allocateBytes(GLB_CHUNK_HEADER_BYTES);
  writeUint32LE(jsonChunkHeader, 0, jsonBuffer.length);
  writeText(jsonChunkHeader, 4, JSON_CHUNK_TYPE);

  const binChunkHeader = allocateBytes(GLB_CHUNK_HEADER_BYTES);
  writeUint32LE(binChunkHeader, 0, paddedBinBuffer.length);
  writeText(binChunkHeader, 4, BIN_CHUNK_TYPE);

  return concatBytes([
    header,
    jsonChunkHeader,
    jsonBuffer,
    binChunkHeader,
    paddedBinBuffer,
  ]);
}

export function parseVrmaBinary(source) {
  const parsed = parseGlbChunks(source);
  const extension = parsed.json.extensions?.VRMC_vrm_animation;

  if (!extension?.humanoid?.humanBones) {
    throw new Error('VRMA file is missing VRMC_vrm_animation humanoid data.');
  }

  return {
    magic: parsed.magic,
    version: parsed.version,
    totalLength: parsed.totalLength,
    source: parsed.source,
    json: parsed.json,
    extension,
    binChunk: parsed.binChunk,
  };
}

export function parseVrmaDocument(source) {
  const parsed = parseVrmaBinary(source);
  const clip = createEditableClip(parsed.json, parsed.extension, parsed.binChunk);

  return {
    source: parsed.source,
    json: structuredClone(parsed.json),
    extension: structuredClone(parsed.extension),
    clip: {
      name: clip.name,
      duration: clip.duration,
      rotationTracks: cloneTracksMap(clip.rotationTracks),
      translationTracks: cloneTracksMap(clip.translationTracks),
      preservedChannels: clip.preservedChannels.map((channel) => ({
        ...channel,
        track: cloneTrack(channel.track),
      })),
    },
    preserved: {
      expressionPayload: structuredClone(parsed.extension.expressions || null),
      lookAtPayload: structuredClone(parsed.extension.lookAt || null),
    },
  };
}

export function createEmptyVrmaDocument({ clipName = 'Clip', humanoidSkeleton = null } = {}) {
  const safeSkeleton = humanoidSkeleton || getDefaultHumanoidSkeleton();
  const json = createBaseVrmaJson({
    clipName,
    humanoidSkeleton: safeSkeleton,
  });

  return {
    source: null,
    json,
    extension: structuredClone(json.extensions.VRMC_vrm_animation),
    clip: {
      name: clipName,
      duration: 0,
      rotationTracks: buildEmptyTrackMap(),
      translationTracks: buildEmptyTrackMap(),
      preservedChannels: [],
    },
    preserved: {
      expressionPayload: null,
      lookAtPayload: null,
    },
  };
}

export function serializeVrmaDocument(document) {
  const { json, binBuffer } = serializeDocumentJson(document);
  return serializeGlb({ json, binBuffer });
}

export { createEditableClip, decodeJsonChunk };
