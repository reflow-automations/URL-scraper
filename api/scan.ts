import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isPost = req.method === 'POST';
  const body = isPost ? req.body : req.query;

  const targetUrl = body.url as string;
  const blacklistParam = body.blacklist as string;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const blacklist = blacklistParam ? blacklistParam.split(',').map(w => w.trim().toLowerCase()).filter(Boolean) : [];

  const queue: string[] = body.queue || [targetUrl];
  const visited = new Set<string>(body.visited || []);
  const foundUrls = new Set<string>(body.foundUrls || [targetUrl]);

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const startTime = Date.now();
  const TIMEOUT_LIMIT = 8000; // 8 seconds before chunking

  try {
    const baseUrl = new URL(targetUrl);
    const origin = baseUrl.origin;

    const MAX_PAGES = 1500; 

    if (visited.size === 0) {
      res.write(`data: ${JSON.stringify({ type: 'start', message: `Start met scannen van ${origin}` })}\n\n`);
    }

    while (queue.length > 0 && visited.size < MAX_PAGES) {
      if (Date.now() - startTime > TIMEOUT_LIMIT) {
        res.write(`data: ${JSON.stringify({ 
          type: 'continue', 
          queue, 
          visited: Array.from(visited), 
          foundUrls: Array.from(foundUrls) 
        })}\n\n`);
        return res.end();
      }

      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;

      visited.add(currentUrl);
      res.write(`data: ${JSON.stringify({ type: 'progress', current: currentUrl, count: visited.size })}\n\n`);

      try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(currentUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; URLScannerBot/1.0)' },
          signal: controller.signal
        });
        clearTimeout(fetchTimeout);
        
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
            resolvedUrl.hash = '';
            const cleanUrl = resolvedUrl.toString();

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
}
