'use client';

import { useState } from 'react';

export default function Page() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
      } else {
        setResults(data.results);
      }
    } catch {
      setError('Could not reach the search service. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="header">
        <p className="header-eyebrow">Firestarter Funnels</p>
        <h1>Tech Call <span style={{fontFamily: '"Great Vibes", cursive'}}>Library</span></h1>
        <p>Search past tech calls by keyword to find the exact call and moment where a topic was discussed.</p>
      </div>

      <form className="search-form" onSubmit={handleSubmit}>
        <input
          className="search-input"
          type="text"
          placeholder="e.g. domain renewal, email setup, membership..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="search-button" type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {loading && <p className="status">Looking through past calls...</p>}
      {error && <p className="error">{error}</p>}

      {results && results.length === 0 && (
        <div className="empty-state">No matches found. Try a different keyword.</div>
      )}

      {results && results.length > 0 && (
        <div className="results">
          {results.map((r, i) => (
            <article className="result-card" key={i}>
              <div className="result-meta">
                <span className="result-date">{r.title ? r.title : r.date}</span>
                <span className="result-timestamp">{r.timestamp}</span>
                {r.speaker && <span className="result-speaker">{r.speaker}</span>}
              </div>
              <p className="result-summary">{r.summary}</p>
            </article>
          ))}
        </div>
      )}

      <div className="footer-note">
        Firestarter Funnels · Tech Call Library · Internal use only
      </div>
    </main>
  );
}