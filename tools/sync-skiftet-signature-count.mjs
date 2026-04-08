import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const petitionUrl = process.env.SKIFTET_PETITION_URL || 'https://www.mittskifte.org/petitions/rattvisa-malmo-inte-en-krona-till-manniskorattsbrott';
const outputPath = path.resolve(process.env.SIGNATURE_OUTPUT_PATH || 'assets/data/signature-count.json');

function extractNumber(html, attributeName) {
  const pattern = new RegExp(`<cmpr-progressbar[^>]*${attributeName}="(\\d+)"`, 'i');
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Could not find ${attributeName} in petition page`);
  }

  return Number.parseInt(match[1], 10);
}

function extractProgressNumber(html, fieldName) {
  const encodedPattern = new RegExp(`${fieldName}&quot;:(\\d+)`, 'i');
  const plainPattern = new RegExp(`"${fieldName}":(\\d+)`, 'i');
  const match = html.match(encodedPattern) || html.match(plainPattern);
  if (!match) {
    throw new Error(`Could not find ${fieldName} in petition page`);
  }

  return Number.parseInt(match[1], 10);
}

function extractCountAndGoal(html) {
  try {
    return {
      count: extractNumber(html, 'currentvalue'),
      goal: extractNumber(html, 'maxvalue')
    };
  } catch {
    return {
      count: extractProgressNumber(html, 'currentSignaturesCount'),
      goal: extractProgressNumber(html, 'currentSignaturesGoal')
    };
  }
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
const { count, goal } = extractCountAndGoal(html);
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