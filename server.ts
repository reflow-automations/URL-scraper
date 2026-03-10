import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';

const app = express();
const PORT = 3000;

app.get('/api/scan', async (req, res) => {
  const targetUrl = req.query.url as string;
  const blacklistParam = req.query.blacklist as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }
  const blacklist = blacklistParam ? blacklistParam.split(',').map(w => w.trim().toLowerCase()).filter(Boolean) : [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const baseUrl = new URL(targetUrl);
    const origin = baseUrl.origin;

    const visited = new Set<string>();
    const queue = [targetUrl];
    const foundUrls = new Set<string>([targetUrl]);

    const MAX_PAGES = 150; // Limit to prevent infinite crawling

    res.write(`data: ${JSON.stringify({ type: 'start', message: `Start met scannen van ${origin}` })}\n\n`);

    while (queue.length > 0 && visited.size < MAX_PAGES) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;

      visited.add(currentUrl);
      res.write(`data: ${JSON.stringify({ type: 'progress', current: currentUrl, count: visited.size })}\n\n`);

      try {
        const response = await fetch(currentUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; URLScannerBot/1.0)' }
        });
        
        if (!response.ok) continue;

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) continue;

        const html = await response.text();
        const $ = cheerio.load(html);

        $('a').each((_, element) => {
          const href = $(element).attr('href');
          if (!href) return;

          try {
            const resolvedUrl = new URL(href, currentUrl);
            // Remove hash to avoid duplicates like /page#section1 and /page#section2
            resolvedUrl.hash = '';
            const cleanUrl = resolvedUrl.toString();

            // Only crawl same origin, avoid duplicate URLs, and skip common non-HTML files
            const lowerCleanUrl = cleanUrl.toLowerCase();
            const isBlacklisted = blacklist.some(word => lowerCleanUrl.includes(word));

            if (
              resolvedUrl.origin === origin && 
              !foundUrls.has(cleanUrl) && 
              !cleanUrl.match(/\.(pdf|jpg|jpeg|png|gif|svg|css|js|ico|woff|woff2|ttf|eot|mp3|mp4|zip|rar)$/i) &&
              !isBlacklisted
            ) {
              foundUrls.add(cleanUrl);
              queue.push(cleanUrl);
              res.write(`data: ${JSON.stringify({ type: 'found', url: cleanUrl })}\n\n`);
            }
          } catch (e) {
            // Invalid URL, ignore
          }
        });
      } catch (e) {
        console.error(`Error fetching ${currentUrl}:`, e);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', urls: Array.from(foundUrls) })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Onbekende fout' })}\n\n`);
    res.end();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
