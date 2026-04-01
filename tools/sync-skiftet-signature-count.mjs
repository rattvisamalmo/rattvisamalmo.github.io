import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const petitionUrl = process.env.SKIFTET_PETITION_URL || 'https://kampanj.skiftet.org/bojkotta-eurovision/kampanj/signera/';
const outputPath = path.resolve(process.env.SIGNATURE_OUTPUT_PATH || 'assets/data/signature-count.json');

function extractNumber(html, attributeName) {
  const pattern = new RegExp(`<cmpr-progressbar[^>]*${attributeName}="(\\d+)"`, 'i');
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Could not find ${attributeName} in petition page`);
  }

  return Number.parseInt(match[1], 10);
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

const response = await fetch(petitionUrl, {
  headers: {
    'user-agent': 'RM Signature Sync/1.0',
    accept: 'text/html,application/xhtml+xml'
  }
});

if (!response.ok) {
  throw new Error(`Failed to fetch petition page: HTTP ${response.status}`);
}

const html = await response.text();
const count = extractNumber(html, 'currentvalue');
const goal = extractNumber(html, 'maxvalue');
const title = extractTitle(html);

const payload = {
  source: petitionUrl,
  title,
  count,
  goal,
  fetched_at: new Date().toISOString()
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`Synced ${count} / ${goal} from ${petitionUrl}`);