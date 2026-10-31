import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
for (const f of readdirSync('dist').filter((f) => f.endsWith('.js'))) {
  const buf = readFileSync(`dist/${f}`);
  console.log(f.padEnd(16), String(buf.length).padStart(6), 'B min', String(gzipSync(buf).length).padStart(6), 'B gzip');
}
