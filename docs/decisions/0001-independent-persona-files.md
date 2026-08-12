# ADR 0001: independent persona files

## Decision

Every persona Markdown file is a complete semantic source containing its role contract, authority policy, provider policy, contract block, copied methods, provenance, hashes, and completion requirements.

## Rejected alternatives

A shared role/method corpus, runtime includes, `skillPath` method library, generated agents, a forked pi-subagents runtime, and mandatory context providers were rejected. The duplication is deliberate so each child can receive one exact self-contained file and remain valid without sibling files.
