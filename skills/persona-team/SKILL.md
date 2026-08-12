---
name: persona-team
description: Use canonical persona-team agents through pi-subagents for bounded role work with independent review and attestation requirements.
---

# Persona Team

Use the canonical `persona-team.<slug>` agent through `pi-subagents` for bounded role work. The package's `persona_team` tool can list or diagnose package readiness. For a persona task:

1. Select exactly one canonical package agent.
2. Delegate through the normal `subagent` tool; do not start a second launcher.
3. The child must call `persona_contract` to activate every method before substantive tools.
4. Require a host-authored `pi.persona-attestation/v1` artifact and ordinary acceptance before accepting work.
5. Keep writer and reviewer identities independent.

Optional context-mode and jCodeMunch are preferred when installed and relevant. Their absence or failure permits bounded native fallback with degraded evidence. Persona Markdown files are independent canonical sources; do not introduce a shared method corpus or `skillPath` library.
