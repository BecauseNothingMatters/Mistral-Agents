import { chatCompletion } from "./mistralClient.js";
import { specsForAgent, runTool } from "./tools.js";
import { updateAgent, updateTask, pushFeed, pushOutput, getAgentById, addChatMessage, REPEAT_INTERVALS } from "./state.js";

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
        
        // Calculate next run time if this is a repeating task
        const repeatInterval = task.repeatInterval || "none";
        const intervalMs = REPEAT_INTERVALS[repeatInterval] || 0;
        const nextRunAt = intervalMs > 0 ? Date.now() + intervalMs : null;
        
        updateTask(task.id, { status: "done", nextRunAt });
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

/**
 * Runs a single chat message through an agent without creating a task.
 * Used for direct conversation with agents via the chat interface.
 * 
 * @param {object} agent - The agent to chat with
 * @param {string} userMessage - The user's message
 * @param {object[]} chatHistory - Previous chat messages (optional)
 * @returns {Promise<{ok: boolean, response: string, error?: string}>}
 */
export async function runChatWithAgent(agent, userMessage, chatHistory = []) {
  const tools = specsForAgent(agent.allowedTools);

  // Build messages array with system prompt and chat history
  const messages = [
    { role: "system", content: agent.systemPrompt },
    ...chatHistory,
    { role: "user", content: userMessage },
  ];

  // Update agent state to indicate it's thinking
  updateAgent(agent.id, { state: "running", task: `Chat: ${userMessage.slice(0, 50)}` });

  try {
    const response = await chatCompletion({ model: agent.model, messages, tools });
    const choice = response.choices?.[0];
    const message = choice?.message;
    const usage = response.usage?.total_tokens ?? 0;

    if (!message) throw new Error("Mistral response had no message");

    // Update token count
    updateAgent(agent.id, { tokens: agent.tokens + usage });

    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // Model gave a final answer - no tool calls
      updateAgent(agent.id, { state: "idle", task: null });
      
      // Add to chat history
      addChatMessage(agent.id, "user", userMessage);
      addChatMessage(agent.id, "assistant", message.content);
      
      return { ok: true, response: message.content };
    }

    // Model wants to call tools - execute them
    updateAgent(agent.id, { state: "tool_call" });

    for (const call of toolCalls) {
      const name = call.function?.name;
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }

      const result = await runTool(name, args);

      // Add tool result to messages for model to use
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: JSON.stringify(result),
      });

      // Also add to chat history for user visibility
      addChatMessage(agent.id, "tool", `Called ${name} with ${JSON.stringify(args).slice(0, 100)}...`);
      addChatMessage(agent.id, "tool", `Result: ${JSON.stringify(result).slice(0, 200)}...`);
    }

    // After tools, get the model to reason about the results and give final answer
    // Make a second call with the tool results
    const finalResponse = await chatCompletion({ model: agent.model, messages, tools });
    const finalChoice = finalResponse.choices?.[0];
    const finalMessage = finalChoice?.message;
    
    if (!finalMessage) throw new Error("Mistral response had no final message");
    
    const finalUsage = finalResponse.usage?.total_tokens ?? 0;
    updateAgent(agent.id, { tokens: agent.tokens + finalUsage });
    
    // Check again for tool calls (recursive)
    const finalToolCalls = finalMessage.tool_calls;
    
    if (finalToolCalls && finalToolCalls.length > 0) {
      // Too many tool rounds - return what we have
      updateAgent(agent.id, { state: "idle", task: null });
      addChatMessage(agent.id, "assistant", `I need to call more tools but hit the limit. Partial response: ${finalMessage.content || ""}`);
      return { ok: true, response: finalMessage.content || "", hasMoreTools: true };
    }

    // Final answer
    updateAgent(agent.id, { state: "idle", task: null });
    addChatMessage(agent.id, "assistant", finalMessage.content);
    
    return { ok: true, response: finalMessage.content };
    
  } catch (err) {
    updateAgent(agent.id, { state: "error", task: null });
    addChatMessage(agent.id, "assistant", `Error: ${err.message}`);
    return { ok: false, response: null, error: err.message };
  }
}
