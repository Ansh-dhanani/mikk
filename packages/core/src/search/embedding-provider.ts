import * as path from 'node:path';

/**
 * Common interface for embedding providers
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  isAvailable(): Promise<boolean>;
}

const VOCABULARY = [
  'function', 'class', 'method', 'async', 'await', 'return', 'const', 'let', 'var',
  'import', 'export', 'from', 'type', 'interface', 'extends', 'implements',
  'constructor', 'prototype', 'static', 'private', 'public', 'protected',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'throw', 'error', 'exception',
  'parse', 'format', 'validate', 'create', 'update', 'delete', 'remove',
  'get', 'set', 'find', 'search', 'filter', 'map', 'reduce', 'transform',
  'init', 'setup', 'config', 'options', 'settings', 'defaults',
  'data', 'object', 'array', 'string', 'number', 'boolean', 'null', 'undefined',
  'request', 'response', 'http', 'https', 'api', 'endpoint', 'route',
  'auth', 'token', 'jwt', 'session', 'cookie', 'header',
  'database', 'query', 'sql', 'transaction', 'connection', 'pool',
  'file', 'path', 'directory', 'read', 'write', 'stream', 'buffer',
  'event', 'listener', 'handler', 'callback', 'promise', 'observer',
  'log', 'debug', 'info', 'warn', 'error', 'trace',
  'test', 'mock', 'stub', 'assert', 'expect',
  'cache', 'store', 'memory', 'session', 'local',
  'user', 'account', 'profile', 'permission', 'role',
  'create', 'register', 'login', 'logout', 'verify',
  'send', 'receive', 'push', 'pull', 'fetch', 'upload', 'download',
  'process', 'worker', 'thread', 'task', 'job', 'queue',
  'client', 'server', 'service', 'endpoint', 'middleware',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
    .filter(t => !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has'].includes(t));
}

function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  const max = Math.max(...tf.values(), 1);
  for (const [key, value] of tf) {
    tf.set(key, value / max);
  }
  return tf;
}

/**
 * Fast vocabulary-based embeddings for when ML models aren't available.
 * Uses TF-IDF with a programming-focused vocabulary.
 */
export class VocabularyEmbedder implements EmbeddingProvider {
  readonly dimensions: number;
  private vocabMap: Map<string, number>;
  private defaultIDF: number;

  constructor(vocab: string[] = VOCABULARY, dimensions = 128) {
    this.dimensions = dimensions;
    this.vocabMap = new Map();
    
    for (let i = 0; i < Math.min(vocab.length, dimensions); i++) {
      this.vocabMap.set(vocab[i], i);
    }
    
    this.defaultIDF = Math.log(vocab.length + 1) + 1;
  }

  async embed(text: string): Promise<number[]> {
    const tokens = tokenize(text);
    const tf = computeTF(tokens);
    
    const vector = new Array(this.dimensions).fill(0);
    const magnitude = Math.sqrt(tokens.length || 1);
    
    for (const [token, tfScore] of tf) {
      const idx = this.vocabMap.get(token);
      if (idx !== undefined && idx < this.dimensions) {
        vector[idx] = tfScore * this.defaultIDF / magnitude;
      }
    }
    
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map(v => v / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Local embeddings using ONNX runtime (via @xenova/transformers)
 */
export class LocalONNXEmbedder implements EmbeddingProvider {
  private pipeline: unknown = null;
  readonly dimensions = 384;
  
  readonly MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

  async isAvailable(): Promise<boolean> {
    try {
      await import('@xenova/transformers');
      return true;
    } catch {
      return false;
    }
  }

  private async ensurePipeline() {
    if (this.pipeline) return;
    const { pipeline } = await import('@xenova/transformers');
    this.pipeline = await pipeline('feature-extraction', this.MODEL_NAME);
  }

  async embed(text: string): Promise<number[]> {
    await this.ensurePipeline();
    const p = this.pipeline as (texts: string[], options: unknown) => Promise<Array<{ data: Float32Array }>>;
    const output = await p([text], { pooling: 'mean', normalize: true });
    return Array.from(output[0].data);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.ensurePipeline();
    const p = this.pipeline as (texts: string[], options: unknown) => Promise<Array<{ data: Float32Array }>>;
    const output = await p(texts, { pooling: 'mean', normalize: true });
    return output.map(o => Array.from(o.data));
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

const GEMINI_MODEL_NAME = 'gemini-embedding-001';
const GEMINI_DIMENSIONS = 3072;

/**
 * Gemini-backed embedding provider
 */
export class GeminiEmbedder implements EmbeddingProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any;
  readonly dimensions = GEMINI_DIMENSIONS;

  constructor(apiKey: string) {
    this.initialize(apiKey);
  }

  private initialize(apiKey: string) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.model.embedContent(text);
    return result.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await this.model.batchEmbedContents({
      requests: texts.map((t) => ({ content: { role: 'user', parts: [{ text: t }] } })),
    });
    return result.embeddings.map((e: { values: number[] }) => e.values);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GEMINI_API_KEY;
  }
}

let cachedProvider: EmbeddingProvider | null = null;
let providerInitPromise: Promise<EmbeddingProvider> | null = null;

/**
 * Factory to create the best available provider.
 * Caches the provider for subsequent calls.
 */
export async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (cachedProvider) {
    return cachedProvider;
  }
  
  if (providerInitPromise) {
    return providerInitPromise;
  }
  
  providerInitPromise = (async () => {
    const localONNX = new LocalONNXEmbedder();
    
    if (await localONNX.isAvailable()) {
      cachedProvider = localONNX;
      return localONNX;
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        cachedProvider = new GeminiEmbedder(apiKey);
        return cachedProvider;
      } catch {
        // Fall through to vocabulary embedder
      }
    }
    
    cachedProvider = new VocabularyEmbedder();
    return cachedProvider;
  })();
  
  return providerInitPromise;
}

/**
 * Get the cached provider synchronously (may be null if not yet initialized)
 */
export function getCachedProvider(): EmbeddingProvider | null {
  return cachedProvider;
}

/**
 * Clear the cached provider
 */
export function clearProviderCache(): void {
  cachedProvider = null;
  providerInitPromise = null;
}
