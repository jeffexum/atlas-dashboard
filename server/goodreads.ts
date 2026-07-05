// server/goodreads.ts — Kindle reading tracking via Goodreads RSS shelf feeds.
// The Kindle auto-updates Goodreads shelves; we poll the public RSS feeds
// (no API key needed) and populate the Reading tab.

import { getState, setState } from './state.js';
import type { Book } from './state.js';

const GOODREADS_USER_ID = process.env.GOODREADS_USER_ID || '';

export function isGoodreadsConfigured(): boolean {
  return !!GOODREADS_USER_ID;
}

function field(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : '';
}

interface FeedBook { title: string; author: string; bookId: string }

async function fetchShelf(shelf: string): Promise<FeedBook[]> {
  const res = await fetch(`https://www.goodreads.com/review/list_rss/${GOODREADS_USER_ID}?shelf=${shelf}`, {
    headers: { 'User-Agent': 'Atlas personal dashboard' },
  });
  if (!res.ok) throw new Error(`Goodreads RSS (${shelf}) returned ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map((item) => ({
    title: field(item, 'title'),
    author: field(item, 'author_name'),
    bookId: field(item, 'book_id'),
  })).filter((b) => b.title);
}

const GRADIENTS = [
  'linear-gradient(135deg, oklch(0.55 0.12 250), oklch(0.4 0.14 280))',
  'linear-gradient(135deg, oklch(0.55 0.13 160), oklch(0.4 0.12 200))',
  'linear-gradient(135deg, oklch(0.6 0.13 60), oklch(0.45 0.14 30))',
  'linear-gradient(135deg, oklch(0.5 0.1 320), oklch(0.38 0.12 350))',
];

export async function syncGoodreads(): Promise<void> {
  if (!isGoodreadsConfigured()) throw new Error('GOODREADS_USER_ID not configured');

  const [reading, toRead] = await Promise.all([
    fetchShelf('currently-reading'),
    fetchShelf('to-read'),
  ]);

  const prior = getState().books;
  const byGrId = new Map(prior.map((b) => [b.id, b]));

  const mapBook = (b: FeedBook, status: Book['status'], i: number): Book => {
    const id = `gr-${b.bookId}`;
    const existing = byGrId.get(id);
    return {
      id,
      title: b.title,
      author: b.author,
      // Progress % isn't in the RSS feed — preserve anything set manually in Atlas
      pct: existing?.pct ?? 0,
      chapter: existing?.chapter ?? '',
      status,
      gradient: existing?.gradient || GRADIENTS[i % GRADIENTS.length],
    };
  };

  const books: Book[] = [
    ...reading.map((b, i) => mapBook(b, 'reading', i)),
    ...toRead.map((b, i) => mapBook(b, 'queue', i + reading.length)),
  ];

  // Keep manually-added books that didn't come from Goodreads
  const manual = prior.filter((b) => !b.id.startsWith('gr-'));
  setState({ books: [...manual, ...books] });
  console.log(`[syncGoodreads] ${reading.length} reading, ${toRead.length} queued`);
}
