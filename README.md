# Two Worlds Agent Lab

A testing and scoring page for the CIS-305 Agents studio (Mercyhurst, Fall 2026).
Students build a Langflow agent with three tools: a retrieval tool for each of two invented books,
plus a calculator. Then they ask it the 47 test questions and score each one twice: whether the
**answer** is right, and whether the agent took the right **route** (the tools it called).

It's a static site, so GitHub Pages serves it as is. Students' work is saved in their own browser
(localStorage); nothing is sent anywhere.

- `index.html`: three tabs. **Set up** has the book downloads, chunk settings, tools and maps.
  **Test & score** has the questions; the key for each question stays hidden until the student has
  recorded the trace. **Summary** has group scores, the studio rubric, the consistency check, the
  trope check, and export as CSV, copied text or print.
- `questions.js`: **generated**. Do not edit it by hand.
- `books/`, `maps/`: **copied** by the build from the notes folder.
- `tools/build.py`: the build script.

## Where the content lives

The source of truth is the answer key in the notes folder:
`../AI App Development Notes/realm-book/test-questions.md`. To change a question, edit that file and rebuild:

    python3 tools/build.py

The build also copies `mereholt.txt`, `drift.txt` and the two map pages from the notes folder.
Route rules (which tool sets count as a correct route) and the special marking rules for some
questions are in `tools/build.py`. The build refuses to run if they fall out of sync with the key.

## A note on the answers

The key is hidden in the page until a student records a trace, but it's in `questions.js` for anyone
who looks. This only guards against honest mistakes, which is fine for a completion-graded studio.
