# Mistral Agents - Frontend

React-based frontend dashboard for Mistral Agents. Connects to the backend API to manage agents, tasks, and view real-time execution.

## Features

### Dashboard Overview
- **Agent Cards**: View all agents with status indicators
- **Pulse Charts**: Visual representation of agent activity
- **Task Board**: Kanban-style view of tasks (todo, in_progress, done)
- **Live Feed**: Real-time streaming of agent events

### Agent Management
- **Create Agents**: Configure name, model, system prompt, and enabled tools
- **Delete Agents**: Remove agents from the fleet
- **Agent Details**: View model, status, task, tokens used, completion count
- **Status Badges**: Visual state indicators (idle, running, tool_call, blocked, done, error)

### Task Management
- **Create Tasks**: Add new tasks to the queue
- **Assign Tasks**: Assign tasks to idle agents
- **Task Progress**: Watch tasks move through states
- **Output Viewer**: View final answers from completed tasks

### Real-time Updates
- **Live Feed**: Streaming events as they happen
- **Auto-refresh**: Polls backend every 1.5 seconds
- **Event Types**: Agent state changes, tool calls, task completions, errors

## Screenshot

The dashboard features:
- Light theme with Mistral's design language
- Cream-colored panels and cards
- Mistral Orange accent color for active elements
- Inter font for clean, readable typography
- JetBrains Mono for code and technical text

## Project Structure

```
mistral-fleet-frontend/
├── index.html              # Entry HTML file
├── package.json            # Dependencies and scripts
├── vite.config.js         # Vite configuration
└── src/
    └── App.jsx            # Main application component
```

## Tech Stack

- **Framework**: React 18
- **Bundler**: Vite
- **UI**: Tailwind CSS (via CDN)
- **Icons**: Lucide React
- **State**: React hooks (useState, useEffect, useCallback)

## Quick Start

### Prerequisites
- Node.js >= 18
- npm or yarn

### Setup

1. Navigate to frontend directory:
   ```bash
   cd files/mistral-fleet-frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration

Set the backend API base URL via environment variable:

```bash
# In .env file or as environment variable
VITE_API_BASE=http://localhost:8787
```

Default: `http://localhost:8787`

### Running

Development mode with hot reload:
```bash
npm run dev
```

Production build:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

Open in browser: http://localhost:5173

## UI Components

### AgentCard
Displays agent information:
- Agent name and icon (CPU)
- Model name
- Current task
- Status badge with color
- Token usage
- Completion count
- Mini pulse chart (sparkline)

### Column
Represents a task state column:
- Todo, In Progress, Done
- Displays tasks assigned to that state
- Shows task count
- Allows task assignment via dropdown

### CreateAgentPanel
Modal for creating new agents:
- Name input
- Model selector (from backend `/api/models`)
- System prompt textarea
- Tool selection (multi-select from `/api/tool-names`)
- Create button

### Feed
Real-time event stream:
- Agent state changes
- Task assignments
- Tool calls
- Completion events
- Errors

### Header
Top navigation:
- Mistral Agents title
- Connection status indicator
- Active agent count
- Connection indicator with live dot

## Styling

### Design System (Mistral AI)

**Colors:**
- Background: `#ffffff` (canvas)
- Surface: `#fafafa`
- Cream: `#fff8e0` (panels)
- Ink: `#1f1f1f` (text)
- Primary: `#fa520f` (Mistral Orange)
- Slate: `#4a4a4a` (secondary text)
- Stone: `#8a8a8a` (faint text)
- Hairline: `#c7c7c7` (borders)

**Typography:**
- Body: Inter (400, 500, 600, 700 weights)
- Code: JetBrains Mono

**Spacing:**
- Cards: 12px border radius
- Buttons: 8px border radius

### CSS Variables

```css
:root {
  --canvas: #ffffff;
  --surface: #fafafa;
  --cream: #fff8e0;
  --ink: #1f1f1f;
  --primary: #fa520f;
  --hairline-strong: #c7c7c7;
  /* ... and more */
}
```

## Backend Integration

The frontend connects to these backend endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents` | GET | Get all agents |
| `/api/agents` | POST | Create agent |
| `/api/agents/:id` | DELETE | Delete agent |
| `/api/tasks` | GET | Get all tasks |
| `/api/tasks` | POST | Create task |
| `/api/tasks/:id/assign` | POST | Assign task |
| `/api/models` | GET | Get available models |
| `/api/tool-names` | GET | Get available tools |
| `/api/feed?since=:id` | GET | Get feed events |
| `/api/outputs` | GET | Get outputs |

## State Management

The app uses React state hooks:

- **agents**: List of all agents
- **tasks**: List of all tasks
- **feed**: Live feed entries
- **outputs**: Completed task outputs
- **models**: Available Mistral models
- **toolNames**: Available tool names
- **connected**: Backend connection status

## Polling

The frontend polls the backend every 1.5 seconds (configurable via `POLL_MS`):
- Agents
- Tasks
- Feed

This provides near real-time updates without WebSockets.

## Customization

### Changing Colors
Edit the CSS variables in `App.jsx`:
```jsx
const FontImport = () => (
  <style>{`
    .fc-root {
      --canvas: #ffffff;
      --cream: #fff8e0;
      --primary: #fa520f;
      /* ... */
    }
  `}</style>
);
```

### Changing Polling Interval
Edit `POLL_MS` in `App.jsx`:
```jsx
const POLL_MS = 1500; // 1.5 seconds
```

## Known Limitations

1. **Polling**: Uses polling instead of WebSockets (fine for development)
2. **No Auth**: Assumes backend is trusted (no authentication)
3. **In-memory**: Backend state is not persistent

## License

MIT License

## Links

- [Mistral AI](https://mistral.ai/)
- [Vite](https://vitejs.dev/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
