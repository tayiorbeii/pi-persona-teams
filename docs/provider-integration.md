# Provider integration

context-mode and jCodeMunch are optional external boundaries. The child checks visible runtime tool names and environment signals, records availability, and uses the specific adapters under `extensions/internal/providers/` when a host transport is supplied.

- context-mode is preferred for large documents, command output, content search, and web/document context.
- jCodeMunch is preferred for repository structure, symbols, outlines, references, importers, and impact.
- Native Pi tools remain the bounded fallback after absence, startup failure, unsupported input, or one provider call failure.

A logical routing fingerprint can be redirected to a preferred provider once. After a provider failure, fallback is granted once and is never redirected back into the failed provider. Provider status is carried into the ledger and attestation.
