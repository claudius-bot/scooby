import { z } from 'zod';
import type { ScoobyToolDefinition } from '../types.js';

// Browser tool uses playwright - lazy import to avoid loading if not used
export const browserTool: ScoobyToolDefinition = {
  name: 'browser',
  description: 'Control a headless browser. Actions: navigate, click, type, screenshot, content.',
  inputSchema: z.object({
    action: z.enum(['navigate', 'click', 'type', 'screenshot', 'content']).describe('Browser action to perform'),
    url: z.string().optional().describe('URL to navigate to (for navigate action)'),
    selector: z.string().optional().describe('CSS selector for click/type actions'),
    text: z.string().optional().describe('Text to type (for type action)'),
  }),
  modelGroup: 'slow',
  async execute(input, _ctx) {
    try {
      const { chromium } = await import('playwright');
      // Use a singleton browser pattern
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      switch (input.action) {
        case 'navigate':
          if (!input.url) return 'Error: url required for navigate action';
          await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          return `Navigated to ${input.url}. Title: ${await page.title()}`;
        case 'click':
          if (!input.selector) return 'Error: selector required for click action';
          await page.click(input.selector, { timeout: 5000 });
          return `Clicked: ${input.selector}`;
        case 'type':
          if (!input.selector || !input.text) return 'Error: selector and text required for type action';
          await page.fill(input.selector, input.text, { timeout: 5000 });
          return `Typed in: ${input.selector}`;
        case 'screenshot':
          const buf = await page.screenshot({ fullPage: true });
          return `Screenshot taken (${buf.length} bytes)`;
        case 'content':
          const content = await page.content();
          // Trim to reasonable size
          return content.slice(0, 50000);
        default:
          return `Unknown action: ${input.action}`;
      }
    } catch (err: any) {
      return `Browser error: ${err.message}`;
    }
  },
};
