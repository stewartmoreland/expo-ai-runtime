---
id: skills
title: Skills
sidebar_position: 8
---

# Skills

:::info[Unreleased]
Skills ship in the next minor release of `@stewmore/expo-ai-core`. They are not in 0.8.0.
:::

A **skill** is a reusable block of instructions you write as a `SKILL.md` file, using the
open Agent Skills layout (one folder per skill, YAML frontmatter, then a markdown body).
You keep domain guidance ("how to plan a debt payoff", "our support tone") in version
control next to the app, rather than in long instruction strings.

Skills are parsed and linted **at build time** into a JSON manifest that the app bundles.
The runtime reads no files on the device. At request time, `mode: 'instructions'` skills
are always in the instructions, and `mode: 'prompt'` skills are loaded only when the model
asks for one (see [On-demand activation](#on-demand-activation)).

## SKILL.md format

```txt
skills/
  debt-avalanche/
    SKILL.md
  support-tone/
    SKILL.md
```

```md
---
name: debt-avalanche
description: Plan debt payoff by highest APR first; use when the user asks how to pay down multiple debts
version: 3
mode: prompt
allowsDeactivation: false
requiredTools: [list_debts, simulate_payoff]
providers: [apple-foundation-models, cloud]
maxTokens: 600
---

# Debt avalanche

1. List every debt with its APR and minimum payment.
2. ...
```

| Key                  | Type                         | Default    | Meaning                                                                                                    |
| -------------------- | ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `name`               | string (**required**)        | —          | Kebab-case id. Must equal the folder name.                                                                 |
| `description`        | string (**required**)        | —          | What the skill does and **when** to use it. Injected above the body.                                       |
| `version`            | integer                      | `1`        | Your own revision number for the skill.                                                                    |
| `mode`               | `'prompt' \| 'instructions'` | `'prompt'` | `instructions` is always on. `prompt` loads on demand (see [On-demand activation](#on-demand-activation)). |
| `allowsDeactivation` | boolean                      | `true`     | Recorded in the manifest. Not enforced yet.                                                                |
| `requiredTools`      | string list                  | `[]`       | Tools the skill expects. Recorded in the manifest. Not validated yet.                                      |
| `providers`          | provider list                | all        | Limits the skill to these providers. An empty list is an error; to allow all, omit the key.                |
| `maxTokens`          | integer                      | none       | Token budget for the body. The linter enforces it.                                                         |

The parser supports a subset of YAML: `key: value`, inline lists `[a, b]`, `- item`
lists, quoted strings, and `#` comments. It does not support block scalars (`|`, `>`).
It ignores unknown keys such as `license` and nested maps such as `metadata`, so files
written for other Agent Skills tools still parse.

## Build the manifest

The core package includes the `expo-ai-skills` CLI:

```bash
npx expo-ai-skills build ./skills --out src/skills.manifest.json
```

- The CLI reads each `<dir>/<name>/SKILL.md`. It ignores folders that have no `SKILL.md`.
- It prints each problem as `path: error|warning: message`. If there are errors, it
  writes no manifest and exits with code `1`.
- `--out` defaults to `skills.manifest.json` in the current directory.
- The manifest has the form `{ version, skills }`. `version` is a content hash, so it
  changes only when a skill changes. Skills are sorted by name.

Run the CLI as a prebuild or CI step so the manifest stays in sync with the source files.

### Lint rules

| Rule                                                       | Level   |
| ---------------------------------------------------------- | ------- |
| `name` is 1–64 characters of `a-z`, `0-9`, `-`             | error   |
| `name` equals its folder name                              | error   |
| `description` is present and at most 1024 characters       | error   |
| Body is not empty                                          | error   |
| Body is within `maxTokens`, when set (estimate: chars / 4) | error   |
| No duplicate skill names                                   | error   |
| `description` says _when_ to use the skill                 | warning |

You can also call the same functions in code. `parseSkill(markdown)` returns an
`ExpoAISkill`, or throws `ExpoAIError` with code `INVALID_PROMPT`.
`lintSkill(skill)` returns a list of `{ level, message }`.
`buildSkillManifest(skills)` returns the manifest.

## Use skills at runtime

Import the manifest and pass its `skills` to any generate call, or to `createSession`.
A JSON import widens literal types (for example, `mode` becomes `string`), so cast the
import to `ExpoAISkillManifest`:

```ts
import { ExpoAI, type ExpoAISkillManifest } from '@stewmore/expo-ai-core';
import manifestJson from './skills.manifest.json';

const { skills } = manifestJson as ExpoAISkillManifest;

const result = await ExpoAI.generate({
  prompt: 'I have three credit cards. Which do I pay first?',
  skills,
});

result.skills; // ['debt-avalanche'] when the model loaded it
```

- `generate`, `stream`, `generateObject`, `generateObjectWithMeta`, and `streamObject`
  all accept `skills`.
- **Provider filter.** The runtime applies a skill only when the serving provider is in
  its `providers` list, or when the skill has no `providers` key. If a fallback changes
  the provider, the runtime selects the skills again for the new provider.
- An `instructions` skill is added after your `instructions` as `## Skill: <name>`,
  followed by the description and the body.
- **`result.skills`** lists the `instructions` skills that were applied, then the `prompt`
  skills the model loaded for this response. The field is omitted when there are none.

### On-demand activation

A `prompt` skill starts as one line in a catalog (its name and description). Its body is
added only when the model asks for it, so unused skills cost a few tokens instead of their
whole body. How the model asks depends on the provider:

| Provider                                     | How a skill is loaded                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Foundation Models, Apple PCC (iOS 26+) | Native. The session gets an `activate_skill` Foundation Models `Tool`. The model calls it, and the skill body comes back as the tool output, in the transcript. Guided generation limits the call to the offered skill names. |
| Android Gemini Nano, cloud, other adapters   | Emulated by the runtime. The instructions carry the catalog and ask for a reply of only `{"activate_skill":"<name>"}`. The runtime then generates again with the skill loaded and returns that answer.                        |

In emulated mode:

- **One-shot calls** run again with the skill in the instructions.
- **Sessions** send a follow-up turn that carries the skill body. The request and the
  activation stay in the transcript, so later turns keep the skill.
- **Streaming** holds back a reply that starts with `{` or a code fence until it ends,
  because it may be an activation. Other replies stream as they arrive.
- A response can load up to 3 skills. A reply that asks for an unknown skill, or for one
  already loaded, is returned as the answer.
- `usage` adds up every call made for the response. A count that one call did not report
  is left out.

Structured output (`generateObject`, `generateObjectWithMeta`, `streamObject`) can't use
a reply for activation, so those calls add every applicable skill to the instructions, in
either mode.

### Sessions

```ts
const session = await ExpoAI.createSession({
  instructions: 'You are a careful budgeting assistant.',
  skills,
});
```

A session plans its skills once, against the provider that it binds to. `instructions`
skills (and, in emulated mode, the catalog) go into the session instructions. On Apple,
`prompt` skills become the session's `activate_skill` tool. A skill that the model loads
stays in the transcript for the rest of the session. Each result reports the
`instructions` skills plus the skills loaded during that response. One-shot fallbacks that
a session makes (for example, a structured-output call on an adapter without ephemeral
generation) also use the session instructions.

Skills add to the prompt. On-device models have small context windows (Apple Foundation
Models has 4096 tokens below iOS 27), so set `maxTokens`, prefer `prompt` mode for large
skills, and use `providers` to keep them away from small models.

## Not yet

- **Turning skills off.** `allowsDeactivation` is recorded in the manifest, but a loaded
  skill stays loaded for the session.
- **Foundation Models `Skills` API (iOS 27).** Apple's `Skills(activations:)` from
  `foundation-models-utilities` needs iOS 27 and ships only as a Swift package. The
  native seam is ready for it. It is planned for when Dynamic Profiles land, where it
  adds instructions-mode deactivation.
- **`requiredTools` validation.** Checking that the tools a skill names are registered.
  This waits for the [tools and agent-loop phase](../reference/roadmap.md#phases).
- **Signed remote manifests.** Downloading manifests at runtime with signature checks.
  Today, manifests are bundled at build time, and `version` is a change id, not a
  signature.
