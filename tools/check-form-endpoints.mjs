// Health check for the Google Forms behind the volunteer and endorsement forms.
//
// The site submits with mode 'no-cors', so it can't tell when Google rejects a
// submission. This check covers that blind spot without submitting anything: it reads
// `googleFormsConfig` from index.html and loads each form's public page to confirm that
//   - the form is reachable and still accepting responses,
//   - it doesn't require visitors to sign in to Google,
//   - every field ID the site sends still exists, as a short-answer question that
//     isn't marked required (a required question the site leaves empty, or a checkbox
//     question with an unmatched value, makes Google drop the whole submission).
//
// Exits non-zero if any form is unhealthy, which fails the GitHub workflow and
// triggers GitHub's failure notification.

import { readFile, appendFile } from 'node:fs/promises';

const INDEX_PATH = process.env.INDEX_PATH || 'index.html';
const TIMEOUT_MS = 30_000;
const SHORT_ANSWER = 0;
const PARAGRAPH = 1;

async function loadConfig() {
  const html = await readFile(INDEX_PATH, 'utf8');
  const match = html.match(/const googleFormsConfig = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error(`googleFormsConfig not found in ${INDEX_PATH}`);
  return JSON.parse(match[1]);
}

function parseFormData(html) {
  const match = html.match(/FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function checkForm(name, form) {
  const problems = [];
  if (!/^https:\/\/docs\.google\.com\/forms\/.+\/formResponse$/.test(form.actionUrl || '')) {
    return { ok: false, problems: [`actionUrl is not a Google Forms formResponse URL: ${form.actionUrl}`] };
  }

  const viewUrl = form.actionUrl.replace(/\/formResponse$/, '/viewform');
  let response;
  try {
    response = await fetch(viewUrl, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    return { ok: false, problems: [`could not load form: ${error.message}`] };
  }

  const finalUrl = response.url;
  if (/accounts\.google\.com/.test(finalUrl)) {
    return { ok: false, problems: ['form requires Google sign-in (Settings → Responses → turn off sign-in/limit to 1 response)'] };
  }
  if (/closedform/.test(finalUrl)) {
    return { ok: false, problems: ['form is not accepting responses (Responses tab → "Accepting responses" is off)'] };
  }
  if (!response.ok) {
    return { ok: false, problems: [`form page returned HTTP ${response.status}`] };
  }

  const data = parseFormData(await response.text());
  if (!data) {
    return { ok: false, problems: ['form page loaded but its question data could not be read'] };
  }

  const questions = new Map();
  for (const item of data[1]?.[1] || []) {
    for (const input of item[4] || []) {
      questions.set(`entry.${input[0]}`, { title: String(item[1] || '').trim(), type: item[3], required: Boolean(input[2]) });
    }
  }

  for (const [field, entryId] of Object.entries(form.fields)) {
    const question = questions.get(entryId);
    if (!question) {
      problems.push(`"${field}" (${entryId}) no longer exists in the form — was the question deleted or re-created?`);
      continue;
    }
    if (question.type !== SHORT_ANSWER && question.type !== PARAGRAPH) {
      problems.push(`"${field}" ("${question.title}") is no longer a short-answer question`);
    }
    if (question.required) {
      problems.push(`"${field}" ("${question.title}") is marked required — submissions that leave it empty are dropped`);
    }
  }

  const known = new Set(Object.values(form.fields));
  for (const [entryId, question] of questions) {
    if (!known.has(entryId) && question.required) {
      problems.push(`required question "${question.title}" (${entryId}) isn't sent by the site — every submission will be dropped`);
    }
  }

  return { ok: problems.length === 0, problems };
}

const config = await loadConfig();
const results = [];

for (const [name, form] of Object.entries(config)) {
  const result = await checkForm(name, form);
  results.push({ name, ...result });
  console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${name}${result.ok ? ': open, no sign-in, all fields present' : ''}`);
  for (const problem of result.problems) console.log(`     - ${problem}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results
    .map(r => `| ${r.name} | ${r.ok ? '✅ healthy' : '❌ failing'} | ${(r.problems.join('<br>') || 'open, no sign-in, all fields present').replace(/\|/g, '\\|')} |`)
    .join('\n');
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Google Forms health\n\n| Form | Status | Detail |\n|---|---|---|\n${rows}\n`
  );
}

if (results.some(r => !r.ok)) {
  console.error('\nOne or more forms are unhealthy. Website submissions may be lost until this is fixed.');
  process.exit(1);
}
