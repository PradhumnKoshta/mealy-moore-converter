# Mealy ↔ Moore Converter

An interactive automata-theory learning app. Enter a Mealy machine with a transition table or draw it on a canvas, then inspect the converted Moore machine as a transition table and state diagram.

## Current features

- Table and diagram views edit the same machine.
- Mealy transitions are labeled `input / output`; Moore transitions are labeled with the input and each state has its own output.
- Input alphabets, states, the start state, and transitions are editable.
- Validation checks the deterministic, complete transition table before conversion.
- Conversion steps and the generated Moore table and graph are displayed together.
- Export the input and converted machines as JSON.
- The app runs client-side; it does not require a backend or user account.

## Technology

- React and JavaScript
- Vite
- React Flow (`@xyflow/react`)
- Lucide icons

## Interface palette

- Charcoal Grey: `#2A2A2A`
- Moonlit Silver: `#C0C0C0`
- Signal Red: `#E10600`

## Run locally

Prerequisites: Node.js and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create the static production bundle, run:

```bash
npm run build
```

## GitHub Pages

The included GitHub Actions workflow builds and deploys the app to GitHub Pages when changes are pushed to `main`. The configured Pages base path uses the repository name `mealy-moore-converter`; change `base` in `vite.config.js` if you rename the repository. Enable **Settings → Pages → Build and deployment → GitHub Actions** in the repository.

## Conversion convention

For each Mealy transition `q --a/o--> r`, the generated Moore machine transitions on `a` to the Moore state for `(r, o)`. The initial Moore state is marked with output `–` to indicate that no output has been produced before the first input symbol. Moore and Mealy output sequences therefore differ by this initial marker.

## Current limitation

The app supports both Mealy-to-Moore and Moore-to-Mealy conversion. It expects a deterministic, complete machine: every state must have exactly one transition for each input symbol. Persistence of user-created machines is not included yet.
