import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class JsonStore<T> {
  constructor(private filePath: string) {}

  async read(): Promise<T | null> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async write(data: T): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tmpFile = join(dir, `.tmp-${randomUUID()}.json`);
    await writeFile(tmpFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');

    await rename(tmpFile, this.filePath);
  }

  async update(fn: (current: T | null) => T): Promise<T> {
    const current = await this.read();
    const updated = fn(current);
    await this.write(updated);
    return updated;
  }
}
