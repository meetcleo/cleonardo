# Cleonardo Design System

Welcome to the Cleonardo Design System repository — a centralized source of truth for our visual language and design tokens. This repo provides the foundational building blocks to ensure consistency, scalability, and efficiency across all Cleo platforms.

---

## Repository Structure

This monorepo is organized to separate concerns clearly and support long-term growth and adoption across teams.

```
design-system/
├── packages/
│ ├── tokens/ # Platform-agnostic design tokens (e.g., color, spacing, typography)
│ ├── react/ # Shared React UI component library (tbc)
│ ├── icons/ # Unified icon set used across platforms (tbc)
│ └── figma-plugins/ # Figma integration utilities and plugin-related code (optional)
├── apps/
│ └── storybook/ # Component documentation and live previews (tbc)
├── scripts/ # Scripts for building, testing, and deploying the system 
├── .github/ # GitHub workflows and contribution automation
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