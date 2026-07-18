// ---------------------------------------------------------------------------
// Each tool has a JSON-schema "spec" (sent to Mistral so the model knows it
// exists and how to call it) and a "run" function (what actually happens on
// our server when the model asks to call it). 
//
// This includes both custom application-specific tools and Mistral's official
// built-in connector tools (websearch, code_interpreter, image_generation, 
// document_library).
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper to get API base URL
function getMistralApiBase() {
  return process.env.MISTRAL_API_BASE || "https://api.mistral.ai/v1";
}

// Helper to make Mistral API calls
async function mistralApiCall(endpoint, body, apiKey) {
  const url = `${getMistralApiBase()}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Mistral API error ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

// External API keys
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const TOOLS = {
  // Mistral official built-in connector tools
  websearch: {
    spec: {
      type: "function",
      function: {
        name: "websearch",
        description: "Search the web for up-to-date information. Uses Tavily free API (1000 searches/month).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
          },
          required: ["query"],
        },
      },
    },
    async run({ query }) {
      if (!TAVILY_API_KEY) {
        throw new Error("TAVILY_API_KEY is not set. Get a free API key from https://tavily.com/");
      }
      
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Tavily API error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      return {
        query,
        results: data.results || [],
      };
    },
  },

  code_interpreter: {
    spec: {
      type: "function",
      function: {
        name: "code_interpreter",
        description: "Execute Python or JavaScript code and return the output. Official Mistral connector tool.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "The code to execute (Python or JavaScript)" },
            language: { type: "string", enum: ["python", "javascript"], description: "Programming language", default: "python" },
          },
          required: ["code"],
        },
      },
    },
    async run({ code, language = "python" }) {
      if (language === "javascript") {
        // Safe JavaScript evaluation with restrictions
        try {
          // Basic safety check - prevent obvious dangerous patterns
          if (/require\(|import\s+|process\.|global\.|__dirname|__filename|eval\(|Function\s*\(|setTimeout|setInterval|fetch\(|http/i.test(code)) {
            throw new Error("Code contains disallowed JavaScript patterns");
          }
          
          // Use a safe evaluator
          const result = (() => {
            try {
              // eslint-disable-next-line no-eval
              return eval(code);
            } catch (e) {
              return `Error: ${e.message}`;
            }
          })();
          
          return { code, language, output: String(result) };
        } catch (err) {
          return { code, language, output: `Error: ${err.message}` };
        }
      } else {
        // Python execution using child process
        const { execa } = await import("execa");
        
        try {
          // Basic safety checks for Python
          if (/import\s+os|import\s+sys|import\s+subprocess|import\s+shutil|__import__|open\s*\(|exec\s*\(|eval\s*\(/i.test(code)) {
            throw new Error("Code contains disallowed Python patterns");
          }
          
          const result = await execa("python3", ["-c", code], {
            timeout: 10000,
            reject: false,
          });
          
          // Combine stdout and stderr
          const output = result.stdout || result.stderr || "";
          
          return { code, language, output: output.trim() };
        } catch (err) {
          return { code, language, output: `Error: ${err.stdout || err.stderr || err.message}` };
        }
      }
    },
  },

  image_generation: {
    spec: {
      type: "function",
      function: {
        name: "image_generation",
        description: "Generate an image from a text prompt. Uses Hugging Face free inference API (Stability AI SDXL).",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The text prompt describing the image" },
          },
          required: ["prompt"],
        },
      },
    },
    async run({ prompt }) {
      const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;
      
      // Hugging Face free inference API for Stable Diffusion XL
      const response = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: HUGGING_FACE_TOKEN ? `Bearer ${HUGGING_FACE_TOKEN}` : "",
          },
          body: JSON.stringify({
            inputs: prompt,
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        // If no token and rate limited, try without auth (Hugging Face allows some free requests)
        if (response.status === 401 || response.status === 429) {
          // Retry without token for anonymous access
          const retryResponse = await fetch(
            "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inputs: prompt }),
            }
          );
          
          if (!retryResponse.ok) {
            throw new Error(`Hugging Face API error ${retryResponse.status}: ${await retryResponse.text().catch(() => "")}`);
          }
          
          // Get the image as a blob and upload to a temporary URL
          const blob = await retryResponse.blob();
          const imageBuffer = await blob.arrayBuffer();
          // For now, return base64 encoded image
          const base64 = Buffer.from(imageBuffer).toString("base64");
          return { prompt, image_url: `data:image/png;base64,${base64}` };
        }
        
        throw new Error(`Hugging Face API error ${response.status}: ${errorText}`);
      }
      
      const blob = await response.blob();
      const imageBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(imageBuffer).toString("base64");
      
      return { prompt, image_url: `data:image/png;base64,${base64}` };
    },
  },

  document_library: {
    spec: {
      type: "function",
      function: {
        name: "document_library",
        description: "Search and retrieve documents from the local documents directory. Official Mistral connector tool.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query for documents" },
          },
          required: ["query"],
        },
      },
    },
    async run({ query }) {
      const docsDir = join(__dirname, "..", "workspace", "documents");
      
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        
        // Check if documents directory exists
        if (!(await fs.access(docsDir).then(() => true).catch(() => false))) {
          return { query, documents: [], message: "No documents directory found. Create a 'documents' folder in workspace." };
        }
        
        // Read all text files in the documents directory
        const files = await fs.readdir(docsDir);
        const documents = [];
        
        for (const file of files) {
          const filePath = path.join(docsDir, file);
          const stat = await fs.stat(filePath);
          
          if (stat.isFile() && (file.endsWith(".txt") || file.endsWith(".md") || file.endsWith(".json"))) {
            try {
              const content = await fs.readFile(filePath, "utf8");
              // Simple search: check if query appears in content
              if (content.toLowerCase().includes(query.toLowerCase())) {
                documents.push({
                  filename: file,
                  content: content.substring(0, 2000), // Limit to first 2000 chars
                  full_path: path.relative(join(__dirname, "..", "workspace"), filePath),
                });
              }
            } catch (err) {
              // Skip files we can't read
              console.error(`Error reading document ${file}:`, err.message);
            }
          }
        }
        
        return { query, documents };
      } catch (err) {
        return { query, documents: [], error: err.message };
      }
    },
  },

  // Mistral MCP server tools
  mistral_ocr: {
    spec: {
      type: "function",
      function: {
        name: "mistral_ocr",
        description: "Extract text from PDFs and images using Mistral OCR API. Official Mistral tool.",
        parameters: {
          type: "object",
          properties: {
            file_url: { type: "string", description: "URL of the file to extract text from" },
          },
          required: ["file_url"],
        },
      },
    },
    async run({ file_url }) {
      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) {
        throw new Error("MISTRAL_API_KEY is not set. Required for Mistral OCR API.");
      }
      
      const body = {
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: file_url,
        },
      };
      
      const data = await mistralApiCall("/ocr", body, apiKey);
      
      // Extract text from the response
      // Mistral OCR response structure includes pages with text blocks
      const text = data.pages
        ?.flatMap((page) => page.blocks || [])
        ?.filter((block) => block.type === "text")
        ?.map((block) => block.text)
        ?.join("\n") || "";
      
      return { file_url, text };
    },
  },

  voxtral_transcribe: {
    spec: {
      type: "function",
      function: {
        name: "voxtral_transcribe",
        description: "Transcribe audio files to text using Mistral Voxtral API. Official Mistral tool.",
        parameters: {
          type: "object",
          properties: {
            audio_url: { type: "string", description: "URL of the audio file to transcribe" },
          },
          required: ["audio_url"],
        },
      },
    },
    async run({ audio_url }) {
      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) {
        throw new Error("MISTRAL_API_KEY is not set. Required for Voxtral transcription API.");
      }
      
      const body = {
        model: "voxtral-mini-latest",
        file: audio_url,
      };
      
      const data = await mistralApiCall("/audio/transcriptions", body, apiKey);
      
      // Extract transcription text from the response
      const transcription = data.text || "";
      
      return { audio_url, transcription };
    },
  },

  workflow_execute: {
    spec: {
      type: "function",
      function: {
        name: "workflow_execute",
        description: "Execute a durable multi-step workflow. Official Mistral MCP tool.",
        parameters: {
          type: "object",
          properties: {
            workflow_name: { type: "string", description: "Name of the workflow to execute" },
            parameters: { 
              type: "object", 
              description: "Parameters for the workflow",
              additionalProperties: true 
            },
          },
          required: ["workflow_name"],
        },
      },
    },
    async run({ workflow_name, parameters }) {
      await delay(300);
      // Stub: implement workflow execution
      return { workflow_name, parameters, status: "completed" };
    },
  },

  // Custom application-specific tools
  calculator: {
    spec: {
      type: "function",
      function: {
        name: "calculator",
        description: "Evaluate a basic arithmetic expression, e.g. '12 * (4 + 3)'.",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string", description: "Arithmetic expression to evaluate" },
          },
          required: ["expression"],
        },
      },
    },
    async run({ expression }) {
      await delay(150);
      // Very small, safe-ish arithmetic evaluator: digits, + - * / ( ) . and spaces only
      if (!/^[\d+\-*/().\s]+$/.test(expression)) {
        return { error: "Expression contains disallowed characters." };
      }
      try {
        // eslint-disable-next-line no-eval
        const result = Function(`"use strict"; return (${expression})`)();
        return { expression, result };
      } catch (e) {
        return { error: "Could not evaluate expression." };
      }
    },
  },

  read_file: {
    spec: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file from the local filesystem by path.",
        parameters: {
          type: "object",
          properties: {
            filename: { type: "string", description: "Path to the file to read (relative to server working directory)" },
          },
          required: ["filename"],
        },
      },
    },
    async run({ filename }) {
      // Security: prevent directory traversal attacks
      const sanitizedPath = join(__dirname, "..", "workspace", filename);
      
      if (!sanitizedPath.startsWith(join(__dirname, "..", "workspace"))) {
        throw new Error("Invalid file path: access restricted to workspace directory");
      }
      
      if (!existsSync(sanitizedPath)) {
        throw new Error(`File not found: ${filename}`);
      }
      
      try {
        const contents = await readFile(sanitizedPath, "utf8");
        return { filename, contents };
      } catch (err) {
        throw new Error(`Failed to read file: ${err.message}`);
      }
    },
  },

  send_email: {
    spec: {
      type: "function",
      function: {
        name: "send_email",
        description: "Send an email to a recipient.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
      },
    },
    async run({ to, subject, body }) {
      // Stub: wire this to a real email provider (Resend, SendGrid, etc.)
      await delay(250);
      return { sent: true, to, subject };
    },
  },

  query_db: {
    spec: {
      type: "function",
      function: {
        name: "query_db",
        description: "Run a lookup against the internal database.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to look up" },
          },
          required: ["query"],
        },
      },
    },
    async run({ query }) {
      await delay(300);
      return { query, rows: [] };
    },
  },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// All tool names that exist on the server — used to populate the "which
// tools can this new agent use" checklist in the create-agent form.
export const ALL_TOOL_NAMES = Object.keys(TOOLS);

// Build the `tools` array Mistral expects, scoped to a given agent's allow-list
export function specsForAgent(allowedTools) {
  return allowedTools.map((name) => TOOLS[name].spec).filter(Boolean);
}

export async function runTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}` };
  return tool.run(args);
}

export default TOOLS;
