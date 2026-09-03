import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { embedText, summarizeChunk } from '../../../lib/gemini';

function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateValue) {
  const d = new Date(dateValue);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const query = (body.query || '').trim();
  if (!query) {
    return NextResponse.json({ error: 'Please enter something to search for.' }, { status: 400 });
  }

  try {
    const queryEmbedding = await embedText(query);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    // Cosine distance: smaller = more similar. Limit to top 3 matches.
    // Kept small on purpose: the free-tier chat model allows only a handful
    // of requests per minute, and each match needs one summarization call.
    const matches = await sql`
      SELECT call_date, call_title, start_seconds, speaker, text,
             embedding <-> ${vectorLiteral}::vector AS distance
      FROM call_chunks
      ORDER BY distance ASC
      LIMIT 3
    `;

    if (matches.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Summarize one at a time (not in parallel) to stay comfortably under
    // the free tier's requests-per-minute limit for the chat model.
        const results = await Promise.all(
      matches.map(async (match) => {
        const summary = await summarizeChunk(match.text, query);
        return {
          date: formatDate(match.call_date),
          title: match.call_title,
          timestamp: formatTimestamp(match.start_seconds),
          speaker: match.speaker,
          summary,
        };
      })
    );
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json(
      { error: 'Something went wrong while searching. Please try again.' },
      { status: 500 }
    );
  }
}
