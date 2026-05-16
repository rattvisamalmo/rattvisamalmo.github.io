import re
import csv
import json
import subprocess
from pathlib import Path


# ==================================================
# CONFIG
# ==================================================

INPUT_HTML = "index.html"
INPUT_CSV = "translations.csv"
OUTPUT_HTML = "index.updated.html"

TEMP_JS = "temp_translations.js"
TEMP_JSON = "translations_dump.json"

LOG_FILE = "translation_import.log"


# ==================================================
# LOGGING
# ==================================================

def log(message):

    print(message)

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(str(message) + "\n")


Path(LOG_FILE).write_text("", encoding="utf-8")

log("=" * 60)
log("TRANSLATION IMPORT STARTED")
log("=" * 60)


# ==================================================
# LOAD HTML
# ==================================================

html = Path(INPUT_HTML).read_text(encoding="utf-8")

log(f"Loaded HTML: {INPUT_HTML}")
log(f"HTML size: {len(html):,} chars")


# ==================================================
# LOAD CSV
# ==================================================

translations_csv = {}

with open(INPUT_CSV, newline="", encoding="utf-8-sig") as csvfile:

    reader = csv.DictReader(csvfile)

    for row in reader:

        key = row["Key"].strip()

        translations_csv[key] = {
            "en": row.get("English", "").strip(),
            "sv": row.get("Swedish", "").strip(),
        }

log(f"Loaded CSV rows: {len(translations_csv)}")


# ==================================================
# FIND TRANSLATIONS OBJECT
# ==================================================

patterns = [
    r'const\s+translations\s*=\s*\{',
    r'let\s+translations\s*=\s*\{',
    r'var\s+translations\s*=\s*\{',
]

match = None

for pattern in patterns:

    match = re.search(pattern, html)

    if match:
        log(f"Found translations object using pattern: {pattern}")
        break

if not match:
    raise Exception("Could not find translations object")


# ==================================================
# EXTRACT OBJECT
# ==================================================

start = match.end() - 1

brace_count = 0
end = None

for i in range(start, len(html)):

    char = html[i]

    if char == "{":
        brace_count += 1

    elif char == "}":
        brace_count -= 1

        if brace_count == 0:
            end = i + 1
            break

if end is None:
    raise Exception("Could not extract translations object")

translations_js = html[start:end]

log(f"Translations object size: {len(translations_js):,} chars")


# ==================================================
# CREATE TEMP NODE SCRIPT
# ==================================================

node_script = f"""
const fs = require('fs');

const translations = {translations_js};

fs.writeFileSync(
    '{TEMP_JSON}',
    JSON.stringify(translations, null, 2),
    'utf8'
);

console.log('Translations exported');
"""

Path(TEMP_JS).write_text(
    node_script,
    encoding="utf-8"
)

log(f"Created temp JS file: {TEMP_JS}")


# ==================================================
# RUN NODE
# ==================================================

result = subprocess.run(
    ["node", TEMP_JS],
    capture_output=True,
    text=True
)

log("NODE STDOUT:")
log(result.stdout)

if result.stderr:
    log("NODE STDERR:")
    log(result.stderr)

if result.returncode != 0:
    raise Exception("Node execution failed")


# ==================================================
# LOAD PARSED JSON
# ==================================================

translations_obj = json.loads(
    Path(TEMP_JSON).read_text(encoding="utf-8")
)

log("Loaded parsed translations JSON")


# ==================================================
# UPDATE VALUES
# ==================================================

success_count = 0
failure_count = 0


def set_nested_value(obj, path, value):

    parts = path.split(".")

    current = obj

    for part in parts[:-1]:

        if part not in current:
            return False

        current = current[part]

    final_key = parts[-1]

    if final_key not in current:
        return False

    current[final_key] = value

    return True


for key, values in translations_csv.items():

    # ENGLISH
    en_path = f"en.{key}"

    if set_nested_value(translations_obj, en_path, values["en"]):

        success_count += 1
        log(f"[UPDATED EN] {key}")

    else:

        failure_count += 1
        log(f"[FAILED EN] {key}")

    # SWEDISH
    sv_path = f"sv.{key}"

    if set_nested_value(translations_obj, sv_path, values["sv"]):

        success_count += 1
        log(f"[UPDATED SV] {key}")

    else:

        failure_count += 1
        log(f"[FAILED SV] {key}")


# ==================================================
# CONVERT BACK TO JS
# ==================================================

updated_js = json.dumps(
    translations_obj,
    ensure_ascii=False,
    indent=2
)

# Remove quotes from object keys
updated_js = re.sub(
    r'"([A-Za-z0-9_]+)"\s*:',
    r'\1:',
    updated_js
)


# ==================================================
# WRITE UPDATED HTML
# ==================================================

updated_html = (
    html[:start]
    + updated_js
    + html[end:]
)

Path(OUTPUT_HTML).write_text(
    updated_html,
    encoding="utf-8"
)

log(f"\nSaved updated HTML: {OUTPUT_HTML}")
log(f"Successful updates: {success_count}")
log(f"Failed updates: {failure_count}")

log("\nDONE")