import DOMPurify from 'dompurify';

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Lazy-loaded module caches ---
let _hljs: typeof import('highlight.js').default | null = null;
let _hljsPromise: Promise<typeof import('highlight.js').default> | null = null;

let _marked: typeof import('marked') | null = null;
let _markedPromise: Promise<typeof import('marked')> | null = null;
let _markedConfigured = false;

async function getHljs() {
  if (_hljs) return _hljs;
  if (!_hljsPromise) {
    _hljsPromise = (async () => {
      const { default: core } = await import('highlight.js/lib/core');
      // Register commonly used languages
      const [
        javascript, typescript, xml, css, json, bash,
        python, go, rust, java, cpp, sql, yaml, markdown,
        diff, shell, plaintext,
      ] = await Promise.all([
        import('highlight.js/lib/languages/javascript'),
        import('highlight.js/lib/languages/typescript'),
        import('highlight.js/lib/languages/xml'),
        import('highlight.js/lib/languages/css'),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/bash'),
        import('highlight.js/lib/languages/python'),
        import('highlight.js/lib/languages/go'),
        import('highlight.js/lib/languages/rust'),
        import('highlight.js/lib/languages/java'),
        import('highlight.js/lib/languages/cpp'),
        import('highlight.js/lib/languages/sql'),
        import('highlight.js/lib/languages/yaml'),
        import('highlight.js/lib/languages/markdown'),
        import('highlight.js/lib/languages/diff'),
        import('highlight.js/lib/languages/shell'),
        import('highlight.js/lib/languages/plaintext'),
      ]);
      core.registerLanguage('javascript', javascript.default);
      core.registerLanguage('js', javascript.default);
      core.registerLanguage('typescript', typescript.default);
      core.registerLanguage('ts', typescript.default);
      core.registerLanguage('xml', xml.default);
      core.registerLanguage('html', xml.default);
      core.registerLanguage('css', css.default);
      core.registerLanguage('json', json.default);
      core.registerLanguage('bash', bash.default);
      core.registerLanguage('python', python.default);
      core.registerLanguage('py', python.default);
      core.registerLanguage('go', go.default);
      core.registerLanguage('rust', rust.default);
      core.registerLanguage('rs', rust.default);
      core.registerLanguage('java', java.default);
      core.registerLanguage('cpp', cpp.default);
      core.registerLanguage('c', cpp.default);
      core.registerLanguage('sql', sql.default);
      core.registerLanguage('yaml', yaml.default);
      core.registerLanguage('yml', yaml.default);
      core.registerLanguage('markdown', markdown.default);
      core.registerLanguage('md', markdown.default);
      core.registerLanguage('diff', diff.default);
      core.registerLanguage('shell', shell.default);
      core.registerLanguage('sh', shell.default);
      core.registerLanguage('plaintext', plaintext.default);
      core.registerLanguage('text', plaintext.default);
      _hljs = core as typeof import('highlight.js').default;
      return _hljs;
    })();
  }
  return _hljsPromise;
}

async function getMarked() {
  if (_marked && _markedConfigured) return _marked;
  if (!_markedPromise) {
    _markedPromise = (async () => {
      const [markedMod, hljs] = await Promise.all([import('marked'), getHljs()]);
      _marked = markedMod;

      const renderer = new markedMod.Renderer();
      renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
        const safeLang = (lang || '').trim();
        let highlighted = '';
        try {
          if (safeLang && hljs.getLanguage(safeLang)) {
            highlighted = hljs.highlight(text, { language: safeLang }).value;
          } else {
            highlighted = hljs.highlightAuto(text).value;
          }
        } catch {
          highlighted = escapeHtml(text);
        }
        const langClass = safeLang ? `language-${safeLang}` : '';
        return `<pre class="md-code"><code class="hljs ${langClass}">${highlighted}</code></pre>`;
      };

      markedMod.marked.setOptions({ gfm: true, breaks: true, renderer });
      _markedConfigured = true;
      return markedMod;
    })();
  }
  return _markedPromise;
}

// --- Synchronous fallbacks (return plain text until libs load) ---

/**
 * Synchronous highlight — returns escaped text before hljs is loaded,
 * then real highlighting once cached.
 */
export function highlightCode(text: string, lang?: string): string {
  if (!text) return '';
  if (!_hljs) {
    void getHljs();
    return escapeHtml(text);
  }
  try {
    if (lang && _hljs.getLanguage(lang)) {
      return _hljs.highlight(text, { language: lang }).value;
    }
    return _hljs.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

/**
 * Synchronous markdown→HTML — returns sanitized-but-unhighlighted HTML
 * before marked/hljs are loaded, then full rendering once cached.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  if (!_marked || !_markedConfigured) {
    void getMarked();
    return DOMPurify.sanitize(escapeHtml(markdown), { USE_PROFILES: { html: true } });
  }
  const raw = _marked.marked.parse(markdown);
  if (typeof raw !== 'string') return '';
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

/**
 * Async version — ensures libs are loaded before rendering.
 */
export async function markdownToHtmlAsync(markdown: string): Promise<string> {
  if (!markdown) return '';
  const markedMod = await getMarked();
  const raw = markedMod.marked.parse(markdown);
  if (typeof raw !== 'string') return '';
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

/**
 * Async highlight — ensures hljs is loaded before highlighting.
 */
export async function highlightCodeAsync(text: string, lang?: string): Promise<string> {
  if (!text) return '';
  const hljs = await getHljs();
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(text, { language: lang }).value;
    }
    return hljs.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

/**
 * Preload both libs. Call once at app startup or on idle.
 */
export async function preloadMarkdownLibs(): Promise<void> {
  await getMarked();
}
