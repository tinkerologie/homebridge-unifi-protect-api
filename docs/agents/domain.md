# Domain Docs

This file tells the engineering skills how to use the domain documentation of this repo when they examine the codebase.

## Read these files first

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root, if it exists. It refers to one `GLOSSARY.md` for each context. Read each `GLOSSARY.md` that is related to the topic.
- **`docs/adr/`**: Read the ADRs that are related to the area of your work. In a multi-context repo, also examine `src/<context>/docs/adr/` for the decisions of each context.

If one of these files does not exist, **continue and do not report it**. Do not tell the user that the file is missing. Do not recommend that the user creates it first. The `/domain-modeling` skill creates these files when a term or a decision is resolved. The `/grill-with-docs` and `/improve-codebase-architecture` skills start `/domain-modeling`.

## File structure

Single-context repo (most repos):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (`GLOSSARY-MAP.md` is at the root):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the words in the glossary

When your output names a domain concept, use the term that `GLOSSARY.md` defines. This applies to an issue title, a refactor proposal, a hypothesis, and a test name. Do not use a synonym that the glossary tells you to avoid.

If the concept is not in the glossary, there are two possible causes. You possibly use words that the project does not use. In this case, think again. Or the glossary has a real gap. In this case, record the gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an ADR, say so clearly. Do not ignore the ADR without a statement:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
