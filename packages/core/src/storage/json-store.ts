import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class JsonStore<T> {
  constructor(private filePath: string) {}

  async read(): Promise<T | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf-8');
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (parseErr: unknown) {
      throw new Error(
        `Failed to parse JSON at ${this.filePath}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        { cause: parseErr },
      );
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
