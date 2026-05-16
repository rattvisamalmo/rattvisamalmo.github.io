import re
import csv
from pathlib import Path
from bs4 import BeautifulSoup

INPUT_FILE = "index.html"
OUTPUT_FILE = "translations.csv"
LOG_FILE = "translation_extraction.log"

DEFAULT_REVIEWER = ""
DEFAULT_NOTES = ""


# ==================================================
# LOGGING
# ==================================================

def log(message):
    print(message)

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(str(message) + "\n")


# Reset log file
Path(LOG_FILE).write_text("", encoding="utf-8")

log("=" * 60)
log("TRANSLATION EXTRACTION STARTED")
log("=" * 60)


# ==================================================
# LOAD HTML
# ==================================================

html = Path(INPUT_FILE).read_text(encoding="utf-8")

log(f"Loaded HTML file: {INPUT_FILE}")
log(f"HTML size: {len(html):,} characters")

soup = BeautifulSoup(html, "lxml")

scripts = soup.find_all("script")

script_text = "\n".join(
    script.get_text(separator="\n")
    for script in scripts
)

log(f"Found {len(scripts)} script tags")
log(f"Combined JS size: {len(script_text):,} characters")


# ==================================================
# EXTRACT LANGUAGE BLOCK
# ==================================================

def extract_language_block(js_text, lang_code):

    log(f"\nSearching for language block: {lang_code}")

    patterns = [
        rf'{lang_code}\s*:\s*\{{',
        rf'"{lang_code}"\s*:\s*\{{',
        rf"'{lang_code}'\s*:\s*\{{",
    ]

    match_start = None

    for pattern in patterns:

        m = re.search(pattern, js_text)

        if m:
            match_start = m.end() - 1
            log(f"Found language block using pattern: {pattern}")
            break

    if match_start is None:
        log(f"Could not find language block for: {lang_code}")
        return None

    brace_count = 0
    start = match_start

    for i in range(start, len(js_text)):

        char = js_text[i]

        if char == "{":
            brace_count += 1

        elif char == "}":
            brace_count -= 1

            if brace_count == 0:

                block = js_text[start:i + 1]

                log(
                    f"Extracted {lang_code} block "
                    f"({len(block):,} chars)"
                )

                Path(f"debug_{lang_code}_block.txt").write_text(
                    block,
                    encoding="utf-8"
                )

                return block

    log(f"Failed to extract balanced block for: {lang_code}")

    return None


# ==================================================
# FLATTEN TRANSLATION OBJECT
# ==================================================

def flatten_translations(block_text, prefix=""):

    results = {}

    i = 0
    length = len(block_text)

    while i < length:

        # Find key
        key_match = re.search(
            r'["\']?([A-Za-z0-9_.-]+)["\']?\s*:',
            block_text[i:]
        )

        if not key_match:
            break

        key = key_match.group(1)

        key_start = i + key_match.start()
        value_start = i + key_match.end()

        full_key = f"{prefix}.{key}" if prefix else key

        # Skip whitespace
        while value_start < length and block_text[value_start].isspace():
            value_start += 1

        # Nested object
        if value_start < length and block_text[value_start] == "{":

            nested = extract_balanced_object(
                block_text[value_start:]
            )

            if nested:

                nested_results = flatten_translations(
                    nested[1:-1],
                    full_key
                )

                results.update(nested_results)

                i = value_start + len(nested)
                continue

        # String value
        elif value_start < length and block_text[value_start] in ['"', "'"]:

            quote = block_text[value_start]

            j = value_start + 1
            escaped = False

            while j < length:

                char = block_text[j]

                if escaped:
                    escaped = False

                elif char == "\\":
                    escaped = True

                elif char == quote:
                    break

                j += 1

            value = block_text[value_start + 1:j]

            value = value.replace('\\"', '"')
            value = value.replace("\\'", "'")
            value = value.replace("\\n", "\n")

            results[full_key] = value

            i = j + 1
            continue

        i = value_start + 1

    return results

# ==================================================
# EXTRACT BALANCED OBJECT
# ==================================================

def extract_balanced_object(text):

    brace_count = 0

    for i, char in enumerate(text):

        if char == "{":
            brace_count += 1

        elif char == "}":
            brace_count -= 1

            if brace_count == 0:
                return text[:i + 1]

    return None


# ==================================================
# EXTRACT SWEDISH
# ==================================================

sv_block = extract_language_block(script_text, "sv")

sv_lookup = {}

if sv_block:

    log("\nFlattening Swedish translations...")

    sv_lookup = flatten_translations(sv_block)

    log(f"Swedish keys extracted: {len(sv_lookup)}")

    sample = list(sv_lookup.items())[:10]

    for key, value in sample:
        log(f"[SV] {key} -> {value[:80]}")


# ==================================================
# EXTRACT ENGLISH
# ==================================================

en_block = extract_language_block(script_text, "en")

en_lookup = {}

if en_block:

    log("\nFlattening English translations...")

    en_lookup = flatten_translations(en_block)

    log(f"English keys extracted: {len(en_lookup)}")

    sample = list(en_lookup.items())[:10]

    for key, value in sample:
        log(f"[EN] {key} -> {value[:80]}")


# ==================================================
# MERGE TRANSLATIONS
# ==================================================

all_keys = sorted(
    set(sv_lookup.keys()) |
    set(en_lookup.keys())
)

log(f"\nTotal merged keys: {len(all_keys)}")

rows = []

for key in all_keys:

    sv_text = sv_lookup.get(key, "")
    en_text = en_lookup.get(key, "")

    if not sv_text:
        log(f"[MISSING SV] {key}")

    if not en_text:
        log(f"[MISSING EN] {key}")

    rows.append([
        key,
        en_text,
        sv_text,
        DEFAULT_REVIEWER,
        DEFAULT_NOTES,
    ])


# ==================================================
# EXPORT CSV
# ==================================================

log("\nExporting CSV...")

with open(
    OUTPUT_FILE,
    "w",
    newline="",
    encoding="utf-8-sig"
) as csvfile:

    writer = csv.writer(csvfile)

    writer.writerow([
        "Key",
        "English",
        "Swedish",
        "Reviewer",
        "Notes",
    ])

    writer.writerows(rows)

log(f"CSV exported: {OUTPUT_FILE}")
log(f"Rows exported: {len(rows)}")


# ==================================================
# DONE
# ==================================================

log("\nDONE")
log(f"Log file saved to: {LOG_FILE}")