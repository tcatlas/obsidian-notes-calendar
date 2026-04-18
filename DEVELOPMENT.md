## Development Setup

1. Clone this repository.
2. Install dependencies:

```bash
npm install
```

3. Plugin TypeScript source lives under `src/`.

4. Build in watch mode during development:

```bash
npm run dev
```

5. Copy or symlink this plugin folder into your vault at:

```text
<your-vault>/.obsidian/plugins/notes-calendar/
```

6. In Obsidian, open `Settings -> Community plugins`, enable community plugins if needed, then enable `Notes Calendar`.

## Build Commands

Lint the TypeScript source:

```bash
npm run lint
```

Development watch build:

```bash
npm run dev
```

Single build:

```bash
npm run esbuild
```

Production build:

```bash
npm run production
```

The build outputs `main.js`, which Obsidian loads together with `manifest.json` and `styles.css`.