import { chatCompletion } from "./mistralClient.js";
import { specsForAgent, runTool } from "./tools.js";
import { updateAgent, updateTask, pushFeed, pushOutput, getAgentById } from "./state.js";

const MAX_TOOL_ROUNDS = 5;

/**
 * Runs a task to completion on a given agent, driving it through the
 * Mistral function-calling loop and updating shared state + the live feed
 * at every step. Intended to be fired-and-forgotten from a route handler;
 * the frontend observes progress by polling GET /api/agents and /api/feed.
 */
export async function runTaskOnAgent(agent, task) {
  const tools = specsForAgent(agent.allowedTools);

  const messages = [
    { role: "system", content: agent.systemPrompt },
    { role: "user", content: task.title },
  ];

  updateAgent(agent.id, { state: "running", task: task.title, messages });
  pushFeed(agent.name, "running", `picked up "${task.title}"`);

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (getAgentById(agent.id)?.dead) {
        // Agent was killed mid-task — stop touching shared state, the task
        // has already been returned to todo by removeAgent().
        return { ok: false, reason: "agent_killed" };
      }

      const response = await chatCompletion({ model: agent.model, messages, tools });
      const choice = response.choices?.[0];
      const message = choice?.message;
      const usage = response.usage?.total_tokens ?? 0;

      if (!message) throw new Error("Mistral response had no message");

      const currentAgent = updateAgent(agent.id, { tokens: agent.tokens + usage });
      messages.push(message);

      const toolCalls = message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // Model gave a final answer — task complete
        pushFeed(agent.name, "done", `finished "${task.title}"`);
        pushOutput({
          agentId: agent.id,
          agentName: agent.name,
          taskId: task.id,
          taskTitle: task.title,
          output: message.content,
        });
        updateTask(task.id, { status: "done" });
        updateAgent(agent.id, {
          state: "idle",
          task: null,
          completed: currentAgent.completed + 1,
          messages: [],
        });
        return { ok: true, finalAnswer: message.content };
      }

      // Model wants to call one or more tools
      updateAgent(agent.id, { state: "tool_call" });

      for (const call of toolCalls) {
        const name = call.function?.name;
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }

        pushFeed(agent.name, "tool_call", `→ calling ${name}(${summarizeArgs(args)})`);
        const result = await runTool(name, args);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify(result),
        });
      }

      pushFeed(agent.name, "running", "tool returned, reasoning over result");
      updateAgent(agent.id, { state: "running" });
    }

    // Exceeded MAX_TOOL_ROUNDS without a final answer
    pushFeed(agent.name, "blocked", `stopped after ${MAX_TOOL_ROUNDS} tool rounds without finishing`);
    updateTask(task.id, { status: "todo", agentId: null });
    updateAgent(agent.id, { state: "blocked" });
    return { ok: false, reason: "max_rounds_exceeded" };
  } catch (err) {
    pushFeed(agent.name, "blocked", `error: ${err.message}`);
    updateTask(task.id, { status: "todo", agentId: null });
    updateAgent(agent.id, { state: "error", task: null, messages: [] });
    return { ok: false, reason: err.message };
  }
}

function summarizeArgs(args) {
  const s = JSON.stringify(args);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}
