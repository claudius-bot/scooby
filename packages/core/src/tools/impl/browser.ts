import { z } from 'zod';
import { createRequire } from 'node:module';
import type { ScoobyToolDefinition } from '../types.js';

// Use createRequire so playwright resolves from core's node_modules,
// not from whichever package is running the process (e.g. apps/bot).
const require = createRequire(import.meta.url);

let browser: any = null;
let page: any = null;

async function getPage(): Promise<any> {
  if (page && !page.isClosed()) return page;

  const { chromium } = require('playwright');
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  page = await browser.newPage();
  return page;
}

export const browserTool: ScoobyToolDefinition = {
  name: 'browser',
  description:
    'Control a headless browser. Actions: navigate (go to URL), click (CSS selector), type (fill input), screenshot (capture page), content (get page HTML), close (close browser).',
  inputSchema: z.object({
    action: z
      .enum(['navigate', 'click', 'type', 'screenshot', 'content', 'close'])
      .describe('Browser action to perform'),
    url: z.string().optional().describe('URL to navigate to (for navigate action)'),
    selector: z.string().optional().describe('CSS selector for click/type actions'),
    text: z.string().optional().describe('Text to type (for type action)'),
  }),
  modelGroup: 'slow',
  async execute(input, _ctx) {
    try {
      if (input.action === 'close') {
        if (browser) {
          await browser.close();
          browser = null;
          page = null;
        }
        return 'Browser closed.';
      }

      const p = await getPage();

      switch (input.action) {
        case 'navigate': {
          if (!input.url) return 'Error: url required for navigate action';
          await p.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const title = await p.title();
          const url = p.url();
          return `Navigated to ${url}. Title: "${title}"`;
        }
        case 'click': {
          if (!input.selector) return 'Error: selector required for click action';
          await p.click(input.selector, { timeout: 5000 });
          await p.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          return `Clicked: ${input.selector}. Current URL: ${p.url()}`;
        }
        case 'type': {
          if (!input.selector || !input.text)
            return 'Error: selector and text required for type action';
          await p.fill(input.selector, input.text, { timeout: 5000 });
          return `Typed "${input.text}" into: ${input.selector}`;
        }
        case 'screenshot': {
          const buf = await p.screenshot({ fullPage: true });
          return `Screenshot taken (${buf.length} bytes, base64 length would be ${Math.ceil(buf.length * 1.37)}). Page: ${p.url()}`;
        }
        case 'content': {
          // Extract text content to keep it useful and within size limits
          const text = await p.evaluate('document.body.innerText') as string;
          const trimmed = text.slice(0, 50000);
          return `Page: ${p.url()}\nTitle: ${await p.title()}\n\n${trimmed}${text.length > 50000 ? '\n\n[truncated]' : ''}`;
        }
        default:
          return `Unknown action: ${input.action}`;
      }
    } catch (err: any) {
      return `Browser error: ${err.message}`;
    }
  },
};
