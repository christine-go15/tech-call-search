import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL. Add it to .env.local (locally) or your Vercel project settings (in production).'
  );
}

// `sql` is a tagged-template function: sql`SELECT * FROM table WHERE id = ${id}`
// It's the recommended Neon driver for serverless environments like Vercel
// because it talks to Neon over HTTP instead of holding a raw TCP connection open.
export const sql = neon(process.env.DATABASE_URL);
