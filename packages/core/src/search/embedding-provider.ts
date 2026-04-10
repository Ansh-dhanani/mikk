import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Common interface for embedding providers
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
}

/**
 * Gemini-backed embedding provider
 */
export class GeminiEmbedder implements EmbeddingProvider {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private readonly MODEL_NAME = 'gemini-embedding-001';
  private readonly DIMENSIONS = 3072;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.MODEL_NAME });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.model.embedContent(text);
    return result.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await this.model.batchEmbedContents({
      requests: texts.map((t) => ({ content: { role: 'user', parts: [{ text: t }] } })),
    });
    return result.embeddings.map((e: any) => e.values);
  }

  getDimensions(): number {
    return this.DIMENSIONS;
  }
}

/**
 * Factory to create the best available provider
 */
export async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    return new GeminiEmbedder(apiKey);
  }
  
  throw new Error('No embedding provider configured. Please set GEMINI_API_KEY.');
}
