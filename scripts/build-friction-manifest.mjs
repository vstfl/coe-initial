import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const frictionRoot = path.join(projectRoot, 'friction_pairs');
const outputPath = path.join(projectRoot, 'src', 'lib', 'friction-manifest.json');

async function directoryExists(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walkFiles(dir, handler) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, handler);
    } else if (entry.isFile()) {
      await handler(fullPath, entry.name);
    }
  }
}

function extractVideoId(filename) {
  const match = filename.match(/(GX\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

async function buildManifest() {
  const counts = new Map();

  await walkFiles(frictionRoot, (fullPath, filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return;
    }

    const videoId = extractVideoId(filename);
    if (!videoId) {
      return;
    }

    counts.set(videoId, (counts.get(videoId) ?? 0) + 1);
  });

  const sortedEntries = [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(Object.fromEntries(sortedEntries), null, 2) + '\n', 'utf8');

  console.log(
    `Friction manifest written with ${sortedEntries.length} trip${sortedEntries.length === 1 ? '' : 's'} to ${path.relative(projectRoot, outputPath)}`
  );
}

async function main() {
  if (!(await directoryExists(frictionRoot))) {
    console.warn(
      'friction_pairs directory not found; skipping friction manifest update and leaving the existing file untouched.'
    );
    return;
  }

  await buildManifest();
}

main().catch((error) => {
  console.error('Failed to build friction manifest:', error);
  process.exitCode = 1;
});
