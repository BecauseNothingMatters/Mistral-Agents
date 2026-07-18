# Mistral Agents Backend

Small Express service that drives real Mistral agents (via function calling)
and exposes state for the Mistral Agents frontend to poll.

## Setup

```bash
npm install
cp .env.example .env   # add your MISTRAL_API_KEY
npm run dev            # starts on http://localhost:8787
```

## Endpoints

| Method | Path                        | Description                                      |
|--------|-----------------------------|---------------------------------------------------|
| GET    | `/api/agents`               | Current state of every agent                      |
| GET    | `/api/tasks`                | All tasks (todo / in_progress / done)              |
| POST   | `/api/tasks`                | `{ title }` → create a new todo task               |
| POST   | `/api/tasks/:id/assign`     | `{ agentId }` → kicks off the agent on that task    |
| GET    | `/api/feed?since=<eventId>` | Live feed events, optionally only new ones          |

The frontend should poll `/api/agents`, `/api/tasks`, and `/api/feed` every
1–2s. `POST /api/tasks/:id/assign` returns immediately (202) — the actual
Mistral call + tool loop runs in the background and progress shows up via
the polled endpoints.

## Wiring it to the frontend

In the frontend, replace the simulation `useEffect` with a
polling loop, and replace `assignTask` with a `fetch` call:

```js
useEffect(() => {
  const poll = async () => {
    const [a, t, f] = await Promise.all([
      fetch(`${API_BASE}/api/agents`).then(r => r.json()),
      fetch(`${API_BASE}/api/tasks`).then(r => r.json()),
      fetch(`${API_BASE}/api/feed`).then(r => r.json()),
    ]);
    setAgents(a.agents);
    setTasks(t.tasks.map(t => ({ ...t, agent: t.agentId })));
    setFeed(f.feed);
  };
  const interval = setInterval(poll, 1500);
  poll();
  return () => clearInterval(interval);
}, []);

const assignTask = async (taskId, agentId) => {
  await fetch(`${API_BASE}/api/tasks/${taskId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });
};
```

Note the frontend's `Pulse` sparkline currently reads `agent.pulse`, which
only existed in the simulation. Simplest fix: derive a rolling pulse client-
side each time tokens change (e.g. push `agent.tokens - prevTokens` into a
small ring buffer per agent) rather than expecting the backend to send it.

## Model / tool config

- Edit `src/state.js` → `AGENT_DEFS` to change which Mistral model, system
  prompt, and tool allow-list each agent uses.
- Edit `src/tools.js` to replace the stub tools (`read_file`,
  `send_email`, `query_db`) with real implementations. The official Mistral
  connector tools (`websearch`, `code_interpreter`, `image_generation`,
  `document_library`) and MCP tools (`mistral_ocr`, `voxtral_transcribe`,
  `workflow_execute`) are also available. `calculator` is already a real
  (sandboxed) evaluator.

## Known limits (fine for a hackathon, flag if asked)

- State is in-memory only — restarting the server clears everything.
- No auth on the API — don't deploy this publicly as-is.
- `MAX_TOOL_ROUNDS` in `agentRunner.js` caps a task at 5 tool round-trips
  before it's marked `blocked`, to avoid runaway loops/costs.
