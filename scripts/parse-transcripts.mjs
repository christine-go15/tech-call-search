// Run with: npm run load-transcripts
//
// What this does, in order:
// 1. Reads scripts/calls.json — a list of {file, date, title} you maintain by hand
// 2. For each call, reads the transcript file from /transcripts — supports
//    both Zoom's .vtt format and the "Speaker N" .docx transcript format
// 3. Splits the transcript into ~75-second chunks (roughly one "topic" each)
// 4. Sends each chunk to Gemini to get an embedding vector, pacing requests
//    so we stay comfortably under the free-tier rate limit
// 5. Inserts each chunk + its vector into your Neon database
//
// Safe to re-run: if you accidentally run it twice on the same call, you'll
// get duplicate rows. Use scripts/calls.json to track which calls you've
// already loaded, and only add new ones each week.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { neon } from '@neondatabase/serverless';
import { GoogleGenAI } from '@google/genai';

const DATABASE_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768; // must match schema.sql's VECTOR(768) column

if (!DATABASE_URL) throw new Error('Missing DATABASE_URL in .env.local');
if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY in .env.local');

const sql = neon(DATABASE_URL);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- Rate-limit pacing ------------------------------------------------
// Gemini's free tier caps requests-per-minute (varies by model, commonly
// 10-15 RPM for the interactive/chat models; embeddings are far more
// generous but we still pace conservatively so this never trips a 429).
// 4.5 seconds between requests keeps us under 15/minute with margin.
const DELAY_BETWEEN_REQUESTS_MS = 4500;
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedWithRetry(text, attempt = 1) {
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    return result.embeddings[0].values;
  } catch (err) {
    if (attempt > MAX_RETRIES) throw err;
    const backoffMs = DELAY_BETWEEN_REQUESTS_MS * attempt * 2;
    console.warn(
      `  Embedding request failed (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${Math.round(
        backoffMs / 1000
      )}s... (${err.message})`
    );
    await sleep(backoffMs);
    return embedWithRetry(text, attempt + 1);
  }
}

// --- VTT parsing --------------------------------------------------------

function timeToSeconds(timestamp) {
  // Handles both HH:MM:SS.mmm and MM:SS.mmm
  const parts = timestamp.trim().split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  const [m, s] = parts;
  return m * 60 + s;
}

function parseVTT(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const cues = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].includes('-->')) {
      const [startStr, endStr] = lines[i].split('-->').map((s) => s.trim().split(' ')[0]);
      const start = timeToSeconds(startStr);
      const end = timeToSeconds(endStr);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join(' ').trim();
      if (text) cues.push({ start, end, text });
    }
    i++;
  }

  return cues;
}

// Zoom transcripts often prefix cue text with "Speaker Name: ...".
// This pulls that out when present; returns null if it doesn't look like one.
function extractSpeaker(text) {
  const match = text.match(/^([A-Z][a-zA-Z.'-]*(?: [A-Z][a-zA-Z.'-]*){0,2}):\s/);
  return match ? match[1] : null;
}

// --- "Speaker N" .docx transcript parsing --------------------------------
// This is the format Zoom produces when it exports a call's transcript as a
// Word document: repeating groups of a plain timestamp line (e.g. "0:00:39"),
// a "(Speaker N)" label line, then one or more lines of spoken text.
// Zoom uses "Speaker N" instead of a real name whenever it isn't confident
// matching that voice to a named participant, so speaker labels here will
// often be generic (e.g. "Speaker 1") rather than an actual name.

const TIMESTAMP_LINE = /^(\d{1,2}:\d{2}:\d{2})$/;
const SPEAKER_LINE = /^\((.+)\)$/;

async function extractDocxLines(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSpeakerDocxLines(lines) {
  const cues = [];
  let i = 0;

  while (i < lines.length) {
    const timestampMatch = lines[i].match(TIMESTAMP_LINE);
    if (timestampMatch) {
      const start = timeToSeconds(timestampMatch[1]);
      i++;

      let speaker = null;
      const speakerMatch = i < lines.length ? lines[i].match(SPEAKER_LINE) : null;
      if (speakerMatch) {
        speaker = speakerMatch[1];
        i++;
      }

      const textLines = [];
      while (i < lines.length && !TIMESTAMP_LINE.test(lines[i])) {
        textLines.push(lines[i]);
        i++;
      }

      const text = textLines.join(' ').trim();
      if (text) cues.push({ start, end: start, text, speaker });
    } else {
      i++;
    }
  }

  return cues;
}

// Groups consecutive cues into ~windowSeconds-long chunks.
function chunkCues(cues, windowSeconds = 75) {
  const chunks = [];
  let current = null;

  for (const cue of cues) {
    if (!current) {
      current = { start: cue.start, end: cue.end, texts: [cue.text], speaker: cue.speaker || null };
      continue;
    }
    if (cue.start - current.start > windowSeconds) {
      chunks.push(current);
      current = { start: cue.start, end: cue.end, texts: [cue.text], speaker: cue.speaker || null };
    } else {
      current.end = cue.end;
      current.texts.push(cue.text);
      // Keep the first speaker seen in the chunk (good enough for attribution).
    }
  }
  if (current) chunks.push(current);

  return chunks.map((c) => {
    const text = c.texts.join(' ');
    const speaker = c.speaker || extractSpeaker(c.texts[0]);
    return { start: c.start, end: c.end, text, speaker };
  });
}

// --- Main -----------------------------------------------------------

async function loadManifest() {
  const manifestPath = path.join(process.cwd(), 'scripts', 'calls.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  return JSON.parse(raw);
}

async function processCall(call) {
  console.log(`\nProcessing: ${call.title || call.file} (${call.date})`);

  const filePath = path.join(process.cwd(), 'transcripts', call.file);
  const extension = path.extname(call.file).toLowerCase();

  let cues;
  if (extension === '.docx') {
    const lines = await extractDocxLines(filePath);
    cues = parseSpeakerDocxLines(lines);
  } else if (extension === '.txt') {
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    cues = parseSpeakerDocxLines(lines);
  } else if (extension === '.vtt') {
    const raw = await fs.readFile(filePath, 'utf-8');
    cues = parseVTT(raw);
  } else {
    throw new Error(`Unsupported file type "${extension}". Use a .vtt, .docx, or .txt transcript.`);
  }

  const chunks = chunkCues(cues);
  console.log(`  Found ${cues.length} cues -> grouped into ${chunks.length} chunks`);

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    process.stdout.write(`  Embedding chunk ${idx + 1}/${chunks.length}...`);

    const embedding = await embedWithRetry(chunk.text);
    const vectorLiteral = `[${embedding.join(',')}]`;

    await sql`
      INSERT INTO call_chunks (call_date, call_title, start_seconds, end_seconds, speaker, text, embedding)
      VALUES (${call.date}, ${call.title || null}, ${chunk.start}, ${chunk.end}, ${chunk.speaker}, ${chunk.text}, ${vectorLiteral}::vector)
    `;

    process.stdout.write(' done\n');
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }
}

async function main() {
  const calls = await loadManifest();
  console.log(`Loaded manifest with ${calls.length} call(s) to process.`);

  for (const call of calls) {
    try {
      await processCall(call);
    } catch (err) {
      console.error(`  Failed to process ${call.file}:`, err.message);
      console.error('  Skipping to next call. Fix the issue and re-run for this one later.');
    }
  }

  console.log('\nAll done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
