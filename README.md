# AI Office

A local web app that shows every Project in `C:\Projects\personal` as a Room and every Claude Code Thread as a Character at a desk. Start, watch, steer, approve and stop Threads from the side panel. Spec: [docs/spec.md](docs/spec.md).

## Run

```sh
npm install
npm run dev     # http://localhost:4310, with hot reload
npm start       # production build on the same port
npm test
```

Office data lives in `%USERPROFILE%\.ai-office` (set `AI_OFFICE_HOME` to use another folder). Edit `office.json` there to change `projectsRoot` or `maxRunning`.

## Chrome on older GPUs

Chrome blocklists some older GPUs (e.g. the Radeon HD 7470) and falls back to software WebGL, which makes the scene crawl. Start Chrome with:

```sh
chrome.exe --ignore-gpu-blocklist
```

Check `chrome://gpu`: WebGL should say "Hardware accelerated".
