# E.L.L.A API Server

**E.L.L.A** (Even Logic Loves Automation) is an AI-powered project automation backend. It orchestrates multi-stage project lifecycles — from intelligent planning and UI/UX design generation to implementation and review — using a real-time WebSocket-driven architecture connected to a frontend client.

Built for speed and modern standards using **Bun**, **Hono**, **MongoDB**, and a multi-provider **LLM service**.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | [Bun](https://bun.sh) |
| **Web Framework** | [Hono](https://hono.dev) |
| **Primary Database** | [MongoDB](https://www.mongodb.com) |
| **Vector Store** | [ChromaDB](https://www.trychroma.com) |
| **Chat Storage** | SQLite (via `ChatDatabase`) |
| **Validation** | [Zod](https://zod.dev) |
| **Language** | TypeScript (Strict) |
| **Key Libraries** | `googleapis`, `google-auth-library`, `cheerio`, `uuid` |

---

## 🏗 Architecture Overview

The server is built around a **Stage Engine** — a finite-state machine that manages a project through a well-defined lifecycle. Each stage has a dedicated handler, and transitions happen automatically via events emitted over WebSockets.

```
Client (Frontend)
      │
      │  WebSocket / REST
      ▼
 ┌─────────────┐
 │  Hono App   │  (index.ts)
 └──────┬──────┘
        │
   ┌────┴──────────────────────────┐
   │         Stage Engine          │  (src/engin/)
   │  PLANNING → IMPLEMENTATION    │
   │  → REVIEW  → TESTING → DONE  │
   └────┬──────────────────────────┘
        │
   ┌────┴───────────────────┐
   │   Infrastructure Layer  │
   │  MongoDB │ ChromaDB     │
   │  SQLite  │ Google Drive │
   │  LLM     │ File System  │
   └────────────────────────┘
```

---

## 📂 Project Structure

```
server/
├── index.ts                  # App entry point (Hono + WebSocket setup)
├── src/
│   ├── engin/                # Stage Engine (core orchestration)
│   │   ├── StageEngine.ts    # FSM: manages stages & context
│   │   ├── handlers/
│   │   │   ├── planHandler/  # Planning stage (Screen 1: PRD analysis)
│   │   │   │   ├── index.ts
│   │   │   │   ├── analysis.ts
│   │   │   │   ├── clarification.ts
│   │   │   │   ├── gapFilling.ts
│   │   │   │   ├── edgeCases.ts
│   │   │   │   ├── artifacts.ts
│   │   │   │   ├── prdGenerator.ts
│   │   │   │   └── stageCache.ts
│   │   │   ├── uiuxHandler/  # Planning stage (Screen 2: UI/UX Design)
│   │   │   │   ├── index.ts
│   │   │   │   ├── mood.ts
│   │   │   │   ├── inspiration.ts
│   │   │   │   ├── designTokens.ts
│   │   │   │   ├── screenGenerator.ts
│   │   │   │   ├── styleGuide.ts
│   │   │   │   ├── componentRefiner.ts
│   │   │   │   ├── prototypeGenerator.ts
│   │   │   │   └── artifacts.ts
│   │   │   ├── ImplementationHandler.ts
│   │   │   ├── ReviewHandler.ts
│   │   │   └── ExecutorHandler.ts
│   │   ├── prompts/          # LLM system prompts
│   │   └── types/            # Stage, Event, Context type definitions
│   │
│   ├── llm/                  # Multi-provider LLM abstraction
│   │   ├── LLMService.ts     # Provider router (env-driven)
│   │   └── providers/
│   │       ├── gemini.ts
│   │       ├── claude.ts
│   │       ├── openrouter.ts
│   │       ├── cloudflare.ts
│   │       └── nvidia/
│   │
│   ├── tools/                # AI Agent tool system
│   │   ├── executor.ts       # Tool dispatcher
│   │   ├── memory.tools.ts   # ChromaDB memory read/write
│   │   ├── file.tools.ts     # Workspace file I/O
│   │   ├── research.tools.ts # Web search & deep research
│   │   └── research/
│   │       ├── WebSearchTool.ts
│   │       └── DeepResearchTool.ts
│   │
│   ├── memory/               # Memory & embedding services
│   │   ├── MemoryService.ts  # Session + ChromaDB memory management
│   │   ├── chroma/           # ChromaDB client
│   │   └── embeddings/       # Embedding provider abstraction
│   │
│   ├── db/
│   │   ├── mongodb/          # MongoDB connection & schema
│   │   ├── chatStorage/      # SQLite-based chat history (ChatDatabase)
│   │   └── drive/            # Google Drive integration
│   │       ├── auth.ts
│   │       ├── createFile.ts
│   │       ├── createFolder.ts
│   │       ├── uploadFile.ts
│   │       └── ...
│   │
│   ├── routes/
│   │   ├── projects.ts       # /api/projects (main router)
│   │   ├── project/
│   │   │   ├── createProject.ts
│   │   │   ├── getProject.ts
│   │   │   ├── getArtifacts.ts
│   │   │   └── getArtifact.ts
│   │   └── cache.ts          # /api/cache (stage cache management)
│   │
│   ├── websocket/
│   │   └── manager.ts        # WebSocket connection manager
│   │
│   ├── fs/                   # Local workspace file system manager
│   ├── infrastructure/       # Infra bootstrap (MongoDB, ChromaDB, SQLite, FS)
│   ├── types/                # Shared type definitions
│   └── utils/                # Logger, helpers
│
└── workspace/                # Local project workspace directory
```

---

## 🔄 Stage Engine & Lifecycle

Projects move through the following stages:

| Stage | Description |
|---|---|
| `PLANNING` | Multi-screen planning flow: PRD analysis (Screen 1), then AI-driven UI/UX design (Screen 2) |
| `IMPLEMENTATION` | Code generation and story execution |
| `REVIEW` | Quality review of generated artifacts |
| `TESTING` | Test execution via the `ExecutorHandler` |
| `COMPLETE` | Project finished |

### Planning Stage — Screen 1 (PRD Analysis)
1. **Initial Analysis** — Understands the project from a user description
2. **Clarification** — Asks targeted clarifying questions
3. **Gap Filling** — Identifies missing information and fills gaps
4. **Edge Cases** — Surfaces edge cases and assumptions
5. **PRD Generation** — Produces a structured Product Requirements Document

### Planning Stage — Screen 2 (UI/UX Design)
1. **Mood Selection** — User selects a visual mood/theme
2. **Inspiration Rating** — AI generates design inspirations; user rates them
3. **Design Tokens** — Generates a full design token system (colors, typography, spacing)
4. **Style Guide** — Produces a comprehensive brand/style guide
5. **Screen Generation** — Generates individual UI screens as HTML/CSS prototypes
6. **Component Refinement** — Iteratively refines UI components based on feedback
7. **Variant Chat** — Real-time chat to tweak specific screen variants
8. **Prototype Assembly** — Combines all screens into a full clickable prototype

---

## 📡 API Endpoints

### Projects — `/api/projects`
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get project status & metadata |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/projects/:id/artifacts` | List all generated artifacts |
| `GET` | `/api/projects/:id/artifacts/:path` | Download a specific artifact |

### Cache — `/api/cache`
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/cache/status/:projectId` | Get stage cache status for a project |
| `DELETE` | `/api/cache/clear/:projectId` | Clear all cached stages for a project |
| `DELETE` | `/api/cache/clear/:projectId/:stage` | Clear a specific stage's cache |

---

## 🔌 WebSocket

Real-time bidirectional communication for live project updates.

**URL:** `ws://localhost:3000/ws/projects/:projectId`

### Client → Server Events

| Event Type | Description |
|---|---|
| `user_response` | General user message during planning |
| `start_uiux_design` | Trigger Screen 2 (UI/UX design flow) |
| `mood_selected` | User selects a visual mood |
| `inspirations_rated` | User rates generated design inspirations |
| `screen_feedback` | User provides feedback on a generated screen |
| `variant_chat` | Chat message for a specific screen variant |
| `complete_screen2` | Signal completion of the UI/UX design phase |

### Server → Client Events

| Event Type | Description |
|---|---|
| `update` | General status update or task log |
| `question` | Server requires user input |
| `artifact` | A new artifact (file) has been generated |
| `error` | An error occurred |

---

## 🤖 LLM Providers

The LLM provider is configured via the `LLM_PROVIDER` environment variable. Supported providers:

| Value | Provider |
|---|---|
| `gemini` | Google Gemini *(default)* |
| `claude` | Anthropic Claude |
| `openrouter` | OpenRouter (multi-model gateway) |
| `cloudflare` | Cloudflare Workers AI |
| `nvidia` | NVIDIA NIM |

---

## 🧠 Memory System (ChromaDB + Embeddings)

The memory system powers the AI's long-term and short-term context:

- **Session Memory** — In-memory per-project document store
- **ChromaDB** — Vector database for semantic search and retrieval-augmented generation
- **Embedding Service** — Pluggable embedding provider (defaults to a local/Chroma-native embedder)

Memory tools available to the AI agents:
- `memory_store` — Store a document with metadata
- `memory_search` — Semantic search across stored documents
- `memory_list` — List all documents for a project
- `memory_delete` — Delete a stored document

---

## 🛠 Agent Tool System

The tool executor registers and dispatches tools for AI agents to use:

| Tool Category | Tools |
|---|---|
| **Memory** | `memory_store`, `memory_search`, `memory_list`, `memory_delete` |
| **File System** | `file_read`, `file_write`, `file_list`, `file_delete` |
| **Research** | `web_search`, `deep_research` |

---

## 🗂 Storage

| Storage | Use | Technology |
|---|---|---|
| MongoDB | Project metadata, stages, artifacts index | MongoDB |
| ChromaDB | Vector embeddings for AI memory | ChromaDB |
| SQLite | Chat history per project | `ChatDatabase` (SQLite) |
| Google Drive | Remote artifact storage / file sync | Google Drive API |
| Local FS | `workspace/` directory for generated files | Bun FS |

---

## 🚀 Setup & Run

### Prerequisites

- [Bun](https://bun.sh/docs/installation) (latest)
- [MongoDB](https://www.mongodb.com/try/download/community)
- [ChromaDB](https://www.trychroma.com) running instance

### Installation

```bash
bun install
```

### Configuration

Create a `.env` file in the root directory:

```env
# Server
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ella

# LLM Provider (gemini | claude | openrouter | cloudflare | nvidia)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key

# ChromaDB
CHROMA_URL=http://localhost:8000

# Google Drive (optional, for artifact sync)
GOOGLE_APPLICATION_CREDENTIALS=./token.json

# Stage Cache (optional, set to true to enable)
ENABLE_STAGE_CACHE=true
```

### Running the Server

**Development** (hot reload):
```bash
bun dev
```

**Production:**
```bash
bun start
```

Server runs on `http://localhost:3000`.

### Testing

```bash
bun test
```

---

## 🧪 Stage Caching

ELLA supports caching of expensive planning stages to speed up development iteration. When `ENABLE_STAGE_CACHE=true` is set, individual stage results (e.g., initial analysis, clarification, PRD) are cached per-project and reused on replay.

Cache can be managed via the `/api/cache` endpoints.

---

*Powered by [Bun](https://bun.sh) & [Hono](https://hono.dev)*
