import React, { useState, useRef } from 'react';
import { Copy, Check, Search, Loader2, Globe, AlertCircle, Link as LinkIcon, X, Plus, Filter } from 'lucide-react';

export default function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [urls, setUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: '', count: 0 });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [blacklistWords, setBlacklistWords] = useState<string[]>(['vacature']);
  const [newWord, setNewWord] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  const addBlacklistWord = (e: React.FormEvent) => {
    e.preventDefault();
    const word = newWord.trim().toLowerCase();
    if (word && !blacklistWords.includes(word)) {
      setBlacklistWords([...blacklistWords, word]);
    }
    setNewWord('');
  };

  const removeBlacklistWord = (wordToRemove: string) => {
    setBlacklistWords(blacklistWords.filter(w => w !== wordToRemove));
  };

  const startScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    setStatus('scanning');
    setUrls([]);
    setProgress({ current: targetUrl, count: 0 });
    setError('');
    setCopied(false);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const blacklistQuery = blacklistWords.length > 0 ? `&blacklist=${encodeURIComponent(blacklistWords.join(','))}` : '';
    const es = new EventSource(`/api/scan?url=${encodeURIComponent(targetUrl)}${blacklistQuery}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'start') {
        // started
      } else if (data.type === 'progress') {
        setProgress({ current: data.current, count: data.count });
      } else if (data.type === 'found') {
        setUrls((prev) => {
          if (!prev.includes(data.url)) {
            return [...prev, data.url];
          }
          return prev;
        });
      } else if (data.type === 'done') {
        setStatus('done');
        es.close();
      } else if (data.type === 'error') {
        setError(data.message);
        setStatus('error');
        es.close();
      }
    };

    es.onerror = () => {
      setError('Verbinding verbroken of serverfout.');
      setStatus('error');
      es.close();
    };
  };

  const stopScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setStatus('done');
  };

  const copyAll = () => {
    if (urls.length === 0) return;
    navigator.clipboard.writeText(urls.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-zinc-100 rounded-2xl mb-2">
            <Globe className="w-8 h-8 text-zinc-700" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Website URL Scanner</h1>
          <p className="text-zinc-500">
            Voer een website in om alle interne pagina's te verzamelen en te kopiëren.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={startScan} className="relative flex items-center shadow-sm rounded-xl overflow-hidden bg-white border border-zinc-200 focus-within:ring-2 focus-within:ring-zinc-900 focus-within:border-transparent transition-all">
          <div className="pl-4 text-zinc-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://voorbeeld.nl"
            className="w-full py-4 px-3 outline-none text-lg bg-transparent"
            disabled={status === 'scanning'}
            required
          />
          <button
            type="submit"
            disabled={status === 'scanning' || !url}
            className="px-6 py-4 bg-zinc-900 text-white font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'scanning' ? 'Scannen...' : 'Scan Website'}
          </button>
        </form>

        {/* Blacklist Manager */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Filter className="w-4 h-4" />
            Uitsluitingswoorden (Blacklist)
          </div>
          <div className="flex flex-wrap gap-2">
            {blacklistWords.map((word) => (
              <span key={word} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-sm border border-red-100">
                {word}
                <button
                  type="button"
                  onClick={() => removeBlacklistWord(word)}
                  className="hover:bg-red-200 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addBlacklistWord} className="flex items-center gap-2">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="Voeg een woord toe (bijv. vacature, contact)"
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              disabled={status === 'scanning'}
            />
            <button
              type="submit"
              disabled={!newWord.trim() || status === 'scanning'}
              className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Toevoegen
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            URLs die een van deze woorden bevatten, worden genegeerd tijdens de scan.
          </p>
        </div>

        {/* Error State */}
        {status === 'error' && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium">Er is een fout opgetreden</h3>
              <p className="text-sm opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Progress & Results */}
        {(status === 'scanning' || status === 'done' || urls.length > 0) && (
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[500px]">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                {status === 'scanning' ? (
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
                <span className="font-medium text-sm">
                  {urls.length} URL{urls.length !== 1 ? 's' : ''} gevonden
                </span>
                {status === 'scanning' && (
                  <span className="text-xs text-zinc-500 bg-zinc-200/50 px-2 py-1 rounded-md">
                    {progress.count} pagina's doorzocht
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {status === 'scanning' && (
                  <button
                    onClick={stopScan}
                    className="text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={copyAll}
                  disabled={urls.length === 0}
                  className="flex items-center gap-2 text-sm font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Gekopieerd!' : 'Kopieer Alles'}
                </button>
              </div>
            </div>

            {/* Current scanning indicator */}
            {status === 'scanning' && progress.current && (
              <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100 text-xs text-zinc-500 truncate flex items-center gap-2">
                <span className="animate-pulse w-1.5 h-1.5 bg-zinc-400 rounded-full shrink-0" />
                Scannen: {progress.current}
              </div>
            )}

            {/* URL List */}
            <div className="flex-1 overflow-y-auto p-4">
              {urls.length === 0 && status !== 'scanning' ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-3">
                  <LinkIcon className="w-8 h-8 opacity-20" />
                  <p>Geen URLs gevonden</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {urls.map((u, i) => (
                    <li key={i} className="text-sm font-mono text-zinc-600 truncate hover:text-zinc-900 hover:bg-zinc-50 px-2 py-1.5 rounded-md transition-colors">
                      {u}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
