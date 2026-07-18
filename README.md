# Mistral Agents

A dashboard for managing Mistral AI agents with full tool integrations. Built with React frontend and Express backend.

## Project Structure

```
.
├── files/
│   ├── mistral-fleet-backend/    # Express.js backend server
│   │   ├── src/                  # Backend source code
│   │   │   ├── agentRunner.js
│   │   │   ├── mistralClient.js
│   │   │   ├── routes.js
│   │   │   ├── state.js
│   │   │   └── tools.js
│   │   ├── workspace/           
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── README.md
│   │   ├── server.js
│   │   └── .env.example
│   │
│   └── mistral-fleet-frontend/   # React frontend
│       ├── src/
│       │   └── App.jsx           
│       │   └── main.jsx          
│       ├── package.json
│       ├── package-lock.json
│       ├── README.md
│       ├── vite.config.js
│       └── index.html
└── README.md                     # This file
└── LICENCE                       # Licence file
```

## Features

### Agent Management
- Create, view, and delete AI agents
- Configure Mistral models (tiny, small, medium, large)
- Assign custom system prompts
- Enable/disable tools per agent

### Task Management
- Create and manage tasks
- Assign tasks to idle agents
- Real-time task status updates
- Task queue with todo/in_progress/done states

### Live Feed
- Real-time event streaming
- Track agent state changes
- View tool call execution
- Monitor task progress

### Output Tracking
- View completed task outputs
- Filter by agent
- Persistent output history

## Available Models
- `mistral-tiny-latest` - Mistral Tiny
- `mistral-small-latest` - Mistral Small
- `mistral-medium-latest` - Mistral Medium
- `mistral-large-latest` - Mistral Large

## Integrated Tools

### Mistral Official Tools (via API)
- **websearch** - Web search using Tavily API (1000 free/month)
- **mistral_ocr** - OCR for PDFs and images using Mistral OCR API
- **voxtral_transcribe** - Audio transcription using Mistral Voxtral API
- **code_interpreter** - Execute Python/JS code
- **document_library** - Search local documents

### Custom Tools
- **calculator** - Arithmetic evaluation
- **read_file** - Read local files
- **image_generation** - Generate images via Hugging Face

### Additional Tools (stubs)
- workflow_execute
- send_email
- query_db

## Quick Start

### Prerequisites
- Node.js >= 18
- npm or yarn
- Mistral AI API key (required)
- Tavily API key (required for websearch)
- Hugging Face token (optional, for image generation)

### Setup

1. **Clone and navigate**
   ```bash
   cd fleet-control/files
   ```

2. **Setup backend**
   ```bash
   cd mistral-fleet-backend
   npm install
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Setup frontend**
   ```bash
   cd ../mistral-fleet-frontend
   npm install
   ```

4. **Add API keys to backend .env**
   ```
   MISTRAL_API_KEY=your_mistral_key
   TAVILY_API_KEY=your_tavily_key
   HUGGING_FACE_TOKEN=your_hf_token  # optional
   PORT=8787
   ```

### Running

1. **Start backend**
   ```bash
   cd mistral-fleet-backend
   npm run dev
   ```

2. **Start frontend** (in another terminal)
   ```bash
   cd ../mistral-fleet-frontend
   npm run dev
   ```

3. **Open in browser**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8787

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create a new agent |
| DELETE | `/api/agents/:id` | Delete an agent |
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create a new task |
| POST | `/api/tasks/:id/assign` | Assign task to agent |
| GET | `/api/feed?since=:id` | Get live feed events |
| GET | `/api/models` | Get available Mistral models |
| GET | `/api/tool-names` | Get available tools |
| GET | `/api/outputs` | Get task outputs |
| GET | `/health` | Health check |

## Configuration

### Environment Variables (Backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `MISTRAL_API_KEY` | ✅ Yes | Mistral AI API key |
| `TAVILY_API_KEY` | ✅ Yes | Tavily search API key |
| `HUGGING_FACE_TOKEN` | ❌ No | Hugging Face token (optional) |
| `PORT` | ❌ No | Backend port (default: 8787) |
| `MISTRAL_API_BASE` | ❌ No | Custom Mistral API base URL |

### Workspace

The backend creates a `workspace/` directory where:
- Agents can read files via the `read_file` tool
- Documents can be stored in `workspace/documents/` for the `document_library` tool

## Security Notes

- All state is stored in-memory (not persistent across restarts)
- No authentication on API endpoints (do not deploy publicly)
- File reading is restricted to the workspace directory
- Code execution has safety restrictions

## Tool Implementation Details

### websearch (Tavily)
- Free tier: 1000 searches/month
- Get API key: https://tavily.com/
- Returns structured results with title, URL, content

### mistral_ocr (Mistral OCR API)
- Endpoint: `https://api.mistral.ai/v1/ocr`
- Model: `mistral-ocr-latest`
- Processes PDFs and images via URL
- Uses `MISTRAL_API_KEY`

### voxtral_transcribe (Mistral Audio API)
- Endpoint: `https://api.mistral.ai/v1/audio/transcriptions`
- Model: `voxtral-mini-latest`
- Transcribes audio files via URL
- Uses `MISTRAL_API_KEY`

### image_generation (Hugging Face)
- Model: Stability AI SDXL
- Endpoint: `https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0`
- Returns base64-encoded PNG
- Uses optional `HUGGING_FACE_TOKEN`

### read_file (Node.js fs)
- Reads from `workspace/` directory
- Supports text files (txt, md, json, etc.)
- Security: prevents directory traversal

### code_interpreter
- Supports Python and JavaScript
- Safety: blocks dangerous patterns
- Python: uses child process with timeout
- JavaScript: uses restricted eval

### document_library
- Searches `workspace/documents/`
- Indexes .txt, .md, .json files
- Simple text search implementation

## Known Limitations

1. **In-memory storage** - Restarting the server clears all data
2. **Rate limits** - External APIs have rate limits
3. **No auth** - Backend API has no authentication
4. **Tool limits** - MAX_TOOL_ROUNDS capped at 5 per task

## License

MIT License - Feel free to use and modify.

## Links

- [Mistral AI](https://mistral.ai/)
- [Mistral API Docs](https://docs.mistral.ai/)
- [Tavily](https://tavily.com/)
- [Hugging Face](https://huggingface.co/)
