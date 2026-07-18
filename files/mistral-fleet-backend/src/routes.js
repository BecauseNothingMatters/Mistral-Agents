import { Router } from "express";
import {
  getAgents,
  getAgentById,
  addAgent,
  removeAgent,
  getTasks,
  addTask,
  getTaskById,
  updateTask,
  getFeed,
  getOutputs,
  AVAILABLE_MODELS,
} from "./state.js";
import { runTaskOnAgent } from "./agentRunner.js";
import { ALL_TOOL_NAMES } from "./tools.js";

const router = Router();

// ---- Agents ---------------------------------------------------------------

router.get("/agents", (req, res) => {
  res.json({ agents: getAgents() });
});

router.post("/agents", (req, res) => {
  const { name, model, systemPrompt, tools } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!model || !AVAILABLE_MODELS.some((m) => m.id === model)) {
    return res.status(400).json({ error: "model must be one of the values from GET /api/models" });
  }
  const invalidTools = (tools || []).filter((t) => !ALL_TOOL_NAMES.includes(t));
  if (invalidTools.length) {
    return res.status(400).json({ error: `unknown tool(s): ${invalidTools.join(", ")}` });
  }

  const agent = addAgent({ name: name.trim(), model, systemPrompt, tools });
  res.status(201).json({ agent: { ...agent, systemPrompt: undefined, messages: undefined } });
});

router.delete("/agents/:agentId", (req, res) => {
  const { agentId } = req.params;
  const agent = getAgentById(agentId);
  if (!agent || agent.dead) return res.status(404).json({ error: "agent not found" });

  removeAgent(agentId);
  res.json({ ok: true });
});

// Lookup data for the "create agent" form
router.get("/models", (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

router.get("/tool-names", (req, res) => {
  res.json({ tools: ALL_TOOL_NAMES });
});

// ---- Tasks ------------------------------------------------------------------

router.get("/tasks", (req, res) => {
  res.json({ tasks: getTasks() });
});

router.post("/tasks", (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const task = addTask(title.trim());
  res.status(201).json({ task });
});

router.post("/tasks/:taskId/assign", (req, res) => {
  const { taskId } = req.params;
  const { agentId } = req.body;

  const task = getTaskById(taskId);
  if (!task) return res.status(404).json({ error: "task not found" });
  if (task.status !== "todo") return res.status(409).json({ error: "task is not in todo state" });

  const agent = getAgentById(agentId);
  if (!agent || agent.dead) return res.status(404).json({ error: "agent not found" });
  if (agent.state !== "idle") return res.status(409).json({ error: "agent is not idle" });

  updateTask(taskId, { status: "in_progress", agentId });

  // Fire and forget — the frontend polls /agents and /feed for progress.
  runTaskOnAgent(agent, task).catch((err) => {
    console.error(`Unhandled error running task ${taskId} on agent ${agent.name}:`, err);
  });

  res.status(202).json({ ok: true, task, agentId });
});

// ---- Live feed --------------------------------------------------------------
// Pass ?since=<lastEventId> to only get events after the one you last saw.

router.get("/feed", (req, res) => {
  const { since } = req.query;
  res.json({ feed: getFeed(since) });
});

// ---- Outputs ------------------------------------------------------------
// Each entry is one completed task's final answer. Pass ?agentId=<id> to
// filter to a single agent's history.

router.get("/outputs", (req, res) => {
  const { agentId } = req.query;
  res.json({ outputs: getOutputs(agentId) });
});

export default router;
