import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Agent registry — edit this to add/remove agents or change which Mistral
// model + system prompt each one runs. "tools" lists which tool names (see
// tools.js) this agent is allowed to call.
// ---------------------------------------------------------------------------
// Models selectable when creating a new agent from the UI. Edit this list to
// match whatever's current on console.mistral.ai.
export const AVAILABLE_MODELS = [
  { id: "mistral-tiny-latest", label: "Mistral Tiny" },
  { id: "mistral-small-latest", label: "Mistral Small" },
  { id: "mistral-medium-latest", label: "Mistral Medium" },
  { id: "mistral-large-latest", label: "Mistral Large" },
];

// Starter agent definitions used to seed the fleet on boot. Empty by default —
// create agents from the UI (or add entries here if you want some agents
// pre-loaded every time the server starts).
const AGENT_DEFS = [];

function makeAgent(def) {
  return {
    id: randomUUID(),
    name: def.name,
    model: def.model,
    systemPrompt: def.systemPrompt,
    allowedTools: def.tools,
    state: "idle", // idle | running | tool_call | blocked | done | error
    task: null, // title of the task currently assigned, if any
    completed: 0,
    tokens: 0,
    messages: [], // running chat history for the current task
    dead: false, // soft-deleted agents stay in memory so an in-flight loop
                 // doesn't crash, but are filtered out of everything the
                 // frontend sees and can no longer be assigned new work
  };
}

const state = {
  agents: AGENT_DEFS.map(makeAgent),
  tasks: [],
  feed: [], // { id, time, agent, kind, text }
  outputs: [], // { id, time, agentId, agentName, taskId, taskTitle, output }
};

export function getAgents() {
  // Strip internal fields (messages, systemPrompt) before sending to the frontend.
  // Dead (killed) agents are hidden here but kept internally — see makeAgent().
  return state.agents
    .filter((a) => !a.dead)
    .map(({ id, name, model, state: s, task, completed, tokens, allowedTools }) => ({
      id,
      name,
      model,
      state: s,
      task,
      completed,
      tokens,
      allowedTools,
    }));
}

export function getAgentById(id) {
  return state.agents.find((a) => a.id === id);
}

export function addAgent({ name, model, systemPrompt, tools }) {
  const agent = makeAgent({
    name,
    model,
    systemPrompt: systemPrompt || `You are ${name}, a helpful agent.`,
    tools: Array.isArray(tools) ? tools : [],
  });
  state.agents.push(agent);
  pushFeed(agent.name, "idle", "agent created");
  return agent;
}

export function removeAgent(id) {
  const agent = getAgentById(id);
  if (!agent || agent.dead) return null;

  // If this agent was mid-task, hand the task back to the todo lane so it
  // isn't silently lost.
  if (agent.task) {
    const activeTask = state.tasks.find((t) => t.agentId === id && t.status === "in_progress");
    if (activeTask) {
      updateTask(activeTask.id, { status: "todo", agentId: null });
      pushFeed(agent.name, "blocked", `killed mid-task — "${activeTask.title}" returned to todo`);
    }
  }

  agent.dead = true;
  agent.state = "idle";
  agent.task = null;
  pushFeed(agent.name, "blocked", "agent killed");
  return agent;
}

export function getTasks() {
  return state.tasks;
}

export function addTask(title) {
  const task = { id: randomUUID(), title, status: "todo", agentId: null };
  state.tasks.push(task);
  return task;
}

export function getTaskById(id) {
  return state.tasks.find((t) => t.id === id);
}

export function updateTask(id, patch) {
  const task = getTaskById(id);
  if (!task) return null;
  Object.assign(task, patch);
  return task;
}

export function updateAgent(id, patch) {
  const agent = getAgentById(id);
  if (!agent) return null;
  Object.assign(agent, patch);
  return agent;
}

export function getFeed(sinceId) {
  if (!sinceId) return state.feed.slice(-60);
  const idx = state.feed.findIndex((f) => f.id === sinceId);
  return idx === -1 ? state.feed.slice(-60) : state.feed.slice(idx + 1);
}

export function pushFeed(agentName, kind, text) {
  const entry = {
    id: randomUUID(),
    time: new Date().toLocaleTimeString([], { hour12: false }),
    agent: agentName,
    kind,
    text,
  };
  state.feed.push(entry);
  if (state.feed.length > 500) state.feed.shift();
  return entry;
}

export function pushOutput({ agentId, agentName, taskId, taskTitle, output }) {
  const entry = {
    id: randomUUID(),
    time: new Date().toLocaleTimeString([], { hour12: false }),
    agentId,
    agentName,
    taskId,
    taskTitle,
    output,
  };
  state.outputs.push(entry);
  if (state.outputs.length > 200) state.outputs.shift();
  return entry;
}

export function getOutputs(agentId) {
  const all = state.outputs;
  return agentId ? all.filter((o) => o.agentId === agentId) : all.slice(-100);
}

export default state;
