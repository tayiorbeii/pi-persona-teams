# Authoring personas

A persona file is canonical. Copy approved method bodies into the file, convert source frontmatter into `pi-persona-method:v1` metadata, and compute the SHA-256 digest of the exact body between its body tags.

Required sections and the machine-readable contract are defined in `plans/02-INDEPENDENT-AGENT-FILE-SPEC.md`. Do not add `skillPath`, runtime method imports, shared role files, or a generated output directory. A maintenance helper may update one selected file at a time, but it must not regenerate a persona set from a corpus.

Use `bun run verify:personas path/to/file.md` while authoring. The file must validate when copied into a fixture package without any other persona file.
