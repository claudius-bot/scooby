import { readFile, appendFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export class JsonlStore<T> {
  private dirEnsured = false;

  constructor(private filePath: string) {}

  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    this.dirEnsured = true;
  }

  async append(entry: T): Promise<void> {
    await this.ensureDir();
    await appendFile(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  async rewrite(entries: T[]): Promise<void> {
    await this.ensureDir();
    const lines = entries.map((entry) => JSON.stringify(entry)).join('\n');
    await writeFile(this.filePath, lines.length > 0 ? lines + '\n' : '', 'utf-8');
  }

  async *read(): AsyncGenerator<T> {
    let stream: ReturnType<typeof createReadStream>;
    try {
      stream = createReadStream(this.filePath, { encoding: 'utf-8' });
    } catch {
      return;
    }

    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        yield JSON.parse(trimmed) as T;
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  async readAll(): Promise<T[]> {
    const entries: T[] = [];
    for await (const entry of this.read()) entries.push(entry);
    return entries;
  }

  async readLast(n: number): Promise<T[]> {
    const all = await this.readAll();
    return all.slice(-n);
  }

  async compact(filter?: (entry: T) => boolean): Promise<number> {
    const all = await this.readAll();
    const kept = filter ? all.filter(filter) : all;

    await this.ensureDir();
    const lines = kept.map((entry) => JSON.stringify(entry)).join('\n');
    await writeFile(this.filePath, lines.length > 0 ? lines + '\n' : '', 'utf-8');

    return kept.length;
  }

  async lineCount(): Promise<number> {
    let count = 0;

    let stream: ReturnType<typeof createReadStream>;
    try {
      stream = createReadStream(this.filePath, { encoding: 'utf-8' });
    } catch {
      return 0;
    }

    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        if (line.trim().length > 0) {
          count++;
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw err;
    }

    return count;
  }
}
