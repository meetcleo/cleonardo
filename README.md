# Cleonardo Design System

Welcome to the Cleonardo Design System repository — a centralized source of truth for our visual language and design tokens (**colour only**, today). This repo provides the foundational building blocks to ensure consistency, scalability, and efficiency across all Cleo platforms.

---

## Design tokens

`packages/tokens/tokens/color/{primitives,semantic}.json` is **the** canonical source of truth for Cleo colour, moved here from `meetcleo/design-tokens` ([COREEXP-321](https://cleo.atlassian.net/browse/COREEXP-321)). See [`packages/tokens/README.md`](./packages/tokens/README.md) for the Figma update runbook and known exceptions.

---

## Repository Structure

This monorepo is organized to separate concerns clearly and support long-term growth and adoption across teams.

```
design-system/
├── packages/
│ ├── tokens/ # Platform-agnostic design tokens — colour is live, others planned
│ ├── photography/ # Photography asset pipeline
│ ├── react/ # Shared React UI component library (planned)
│ ├── icons/ # Unified icon set used across platforms (planned)
│ └── figma-plugins/ # Figma integration — tokens-sync is live, others planned
├── apps/
│ └── storybook/ # Component documentation and live previews (planned)
├── scripts/ # Scripts for building, testing, and deploying the system 
├── .github/ # GitHub workflows — figma-sync is live
├── tsconfig.json # Shared TypeScript configuration
├── package.json # Root-level dependencies and workspace definitions
└── README.md # You’re here.
```

Each directory is self-contained and designed to be versioned, tested, and deployed independently when needed.

---

## Getting Started

Tooling and setup instructions will be added soon. In the meantime, please refer to the structure above to explore each area of the system.

For questions, contributions, or feedback, feel free to open an issue or reach out to the Design System team.

---