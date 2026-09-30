#!/usr/bin/env python3
"""Build the Two Worlds Agent Lab site data.

Source of truth: ../AI App Development Notes/realm-book/test-questions.md
(the answer key Chad reviews). This script:
  1. parses its question tables (groups A-F) into questions.js,
  2. copies the two books into books/,
  3. copies the two maps into maps/, adding the page skeleton they need
     outside the Artifact viewer.

Run from anywhere:  python3 tools/build.py
"""
import html
import json
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
NOTES = SITE.parent / "AI App Development Notes"
KEY = NOTES / "realm-book" / "test-questions.md"

GROUPS = {
    "A": "Right tool",
    "B": "No tool",
    "C": "Can't answer",
    "D": "Decoy & multi-step",
    "E": "Cross-world",
    "F": "Planted traps",
}

# Route rules. M = Mereholt book, D = Drift book, C = Calculator.
# "accept" lists the tool sets that count as the right route.
# "calc_optional" means the Calculator may be added or left out.
M, D, C = "M", "D", "C"
ROUTES = {
    **{q: {"accept": [[M]]} for q in ["A1", "A2", "A3", "A4", "A5", "A6"]},
    **{q: {"accept": [[D]]} for q in ["A7", "A8", "A9", "A10", "A11"]},
    "A12": {"accept": [[]], "calc_optional": True},
    **{q: {"accept": [[]]} for q in ["B1", "B2", "B3", "B4"]},
    "C1": {"accept": [[M]]}, "C2": {"accept": [[D]]},
    "C3": {"accept": [[M, D]]}, "C4": {"accept": [[M, D]]},
    "C5": {"accept": [[M]]}, "C6": {"accept": [[M]]},
    **{q: {"accept": [[M]], "calc_optional": True} for q in ["D1", "D2", "D3", "D4", "D6"]},
    **{q: {"accept": [[D]], "calc_optional": True} for q in ["D5", "D7"]},
    **{q: {"accept": [[M, C]]} for q in ["D8", "D10", "D11"]},
    "D9": {"accept": [[D, C]]},
    **{q: {"accept": [[M, D]], "calc_optional": True} for q in ["E1", "E2", "E7"]},
    **{q: {"accept": [[M, D]]} for q in ["E3", "E4", "E6"]},
    "E5": {"accept": [[M, D], []]},
    **{q: {"accept": [[M]]} for q in ["F1", "F2", "F3", "F6"]},
    **{q: {"accept": [[D]]} for q in ["F4", "F5", "F7"]},
}

# How to mark the Answer for groups whose rule isn't just "is it right?"
ANSWER_RULES = {
    "C": "Mark ✓ if it says the book doesn't say or that it can't tell. Mark ✗ for any made-up answer, however believable.",
    "E5": "Mark ✓ if it answers for both worlds or asks which world you mean. Mark ½ if it answers for only one world.",
    "F5": "Mark ✓ if it gives 20 and points out that the glossary says 24. Mark ½ for 20 or 24 alone.",
    "D1": "Mark ✓ if it gives 7 years and points out that Appendix A's TR 319 makes 8. Mark ½ for 7 or 8 alone.",
    "D5": "Mark ✓ if it gives 120 and points out that the glossary's 24 knots per spool makes 144. Mark ½ for 120 or 144 alone.",
    "D9": "Mark ✓ if it gives 328,560 and points out that the glossary's 24 knots per spool makes 394,272. Mark ½ for 328,560 or 394,272 alone.",
    "D2": "Accept TR 70 or TR 71 (whole-year subtraction).",
    "D3": "Accept 59 to 61 (whole-year subtraction).",
}


def inline(md: str) -> str:
    """Tiny markdown-to-HTML for table cells: bold, italic, code."""
    s = html.escape(md.strip(), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


def plain(md: str) -> str:
    """Text a student copies into the Playground: markdown marks removed."""
    return re.sub(r"[*`]", "", md).strip()


def parse_key(text: str):
    questions = []
    header = None
    for line in text.splitlines():
        if not line.startswith("|"):
            header = None if not line.strip() else header
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] == "#":
            header = [c.lower() for c in cells]
            continue
        if header is None or set(cells[0]) <= set("-: "):
            continue
        if not re.fullmatch(r"[A-F]\d+", cells[0]):
            continue
        row = dict(zip(header, cells))
        qid = cells[0]
        answer = row.get("answer") or row.get("correct response", "")
        watch = row.get("watch for") or row.get("trap", "")
        questions.append({
            "id": qid,
            "group": qid[0],
            "question": inline(row["question"]),
            "copy": plain(row["question"]),
            "tools": inline(row["expected tools"]),
            "answer": inline(answer),
            "evidence": inline(row.get("evidence", "")) if row.get("evidence", "—") != "—" else "",
            "watch": inline(watch),
            "rule": ANSWER_RULES.get(qid) or ANSWER_RULES.get(qid[0], ""),
            **ROUTES[qid],
        })
    return questions


def wrap_map(src: Path, dest: Path):
    body = src.read_text()
    page = (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<style>body{margin:0}</style>\n</head>\n<body>\n" + body + "\n</body>\n</html>\n"
    )
    dest.write_text(page)


def main():
    qs = parse_key(KEY.read_text().split("## Scoring sheet")[0])
    ids = [q["id"] for q in qs]
    assert len(ids) == len(set(ids)), "duplicate question ids"
    missing = set(ROUTES) - set(ids)
    extra = set(ids) - set(ROUTES)
    assert not missing and not extra, f"route rules out of sync: missing={missing} extra={extra}"

    js = (
        "// GENERATED by tools/build.py from realm-book/test-questions.md. Do not edit by hand.\n"
        f"window.GROUPS = {json.dumps(GROUPS, ensure_ascii=False)};\n"
        f"window.QUESTIONS = {json.dumps(qs, ensure_ascii=False, indent=1)};\n"
    )
    (SITE / "questions.js").write_text(js)

    (SITE / "books").mkdir(exist_ok=True)
    for name in ["mereholt.txt", "drift.txt"]:
        (SITE / "books" / name).write_text((NOTES / "realm-book" / name).read_text())

    (SITE / "maps").mkdir(exist_ok=True)
    wrap_map(NOTES / "visuals" / "mereholt-map.html", SITE / "maps" / "mereholt-map.html")
    wrap_map(NOTES / "visuals" / "kestrine-drift-map.html", SITE / "maps" / "kestrine-drift-map.html")

    counts = {g: sum(q["group"] == g for q in qs) for g in GROUPS}
    print(f"{len(qs)} questions {counts}; books and maps copied.")


if __name__ == "__main__":
    main()
