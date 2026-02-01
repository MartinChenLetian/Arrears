import { promises as fs } from 'node:fs';
import path from 'node:path';

const publicDir = path.resolve(process.cwd(), 'public');
const outputFile = path.join(publicDir, 'xlsx-index.json');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return fullPath;
    })
  );
  return files.flat();
}

function toPublicPath(filePath) {
  const rel = path.relative(publicDir, filePath);
  return `/${rel.split(path.sep).join('/')}`;
}

async function generate() {
  try {
    await fs.access(publicDir);
  } catch {
    console.error('public directory not found.');
    process.exit(1);
  }

  const allFiles = await walk(publicDir);
  const xlsxFiles = [];

  for (const file of allFiles) {
    if (!file.toLowerCase().endsWith('.xlsx')) continue;
    const stat = await fs.stat(file);
    xlsxFiles.push({
      file: toPublicPath(file),
      mtimeMs: stat.mtimeMs,
    });
  }

  xlsxFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

  const payload = {
    generatedAt: new Date().toISOString(),
    files: xlsxFiles,
  };

  await fs.writeFile(outputFile, JSON.stringify(payload, null, 2));
  console.log(`xlsx-index.json updated with ${xlsxFiles.length} file(s).`);
}

generate();
