import { GoogleGenAI } from '@google/genai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    'Missing GEMINI_API_KEY. Add it to .env.local (locally) or your Vercel project settings (in production).'
  );
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// "gemini-flash-latest" always points at Google's current free Flash model,
// so this keeps working as Google ships new versions (they've shipped three
// in the last two months alone) without you needing to edit code.
// Override via env vars if you ever want to pin a specific version instead.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const CHAT_MODEL = 'gemini-3.5-flash-lite';

// Must match the VECTOR(768) column defined in schema.sql.
const EMBEDDING_DIMENSIONS = 768;

// Turns a piece of text into a vector of numbers that captures its meaning.
// Used both when loading transcripts and when handling a live search query.
export async function embedText(text) {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  return result.embeddings[0].values; // array of floats, length 768
}

// Given a matched transcript excerpt and the client's search term, produce
export async function summarizeChunk(chunkText, keyword, retries = 3) {
  const prompt = `You are summarizing a short excerpt from an internal team call transcript.
The person searched for: "${keyword}"

Transcript excerpt:
"""
${chunkText}
"""

In ONE sentence, plainly describe what was discussed in this excerpt as it relates to "${keyword}". If a speaker's name is identifiable in the excerpt, name them. Do not add any preamble, just the sentence.`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
      });
      return response.text.trim();
    } catch (err) {
      if (err.status === 503 && i < retries - 1) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}