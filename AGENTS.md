# Repository Rules

## File Access

- Use `git ls-files` as the sole allowlist for file reads.
- Never read, open, inspect, preview, parse, or otherwise load the content of files not tracked by Git.
- Do not use directory scans, globs, or similar discovery to bypass this restriction.
- If an untracked file is needed, stop and ask the user for explicit permission first.
