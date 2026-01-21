# E.L.L.A API Server

**E.L.L.A** (Even Logic Loves Automation) API Server is the intelligent backend powering the E.L.L.A system. It orchestrates project lifecycles, manages artifacts, and facilitates real-time communication between the AI logic and the frontend.

Built for speed and modern standards using **Bun**, **Hono**, and **MongoDB**.

## 🛠 Tech Stack

- **Runtime:** [Bun](httpss://bun.sh)
- **Framework:** [Hono](httpss://hono.dev)
- **Database:**
    - [MongoDB](httpss://www.mongodb.com) (Primary data storage)
    - [ChromaDB](httpss://www.trychroma.com) (Vector embedding storage for LLM context)
- **Validation:** [Zod](httpss://zod.dev)
- **WebSockets:** Native Bun WebSockets
- **Key Libraries:** `googleapis`, `cheerio`

## 🚀 Setup & Run

### Prerequisites

- [Bun](httpss://bun.sh/docs/installation) (Latest version)
- [MongoDB](httpss://www.mongodb.com/try/download/community)
- ChromaDB (Ensure a ChromaDB instance is reachable if vector features are used)

### Installation

```bash
bun install
```

### Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Ensure your `.env` contains necessary configuration (adjust as needed):
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/ella
# Add other keys required by internal modules (e.g., GOOGLE_APPLICATION_CREDENTIALS if used)
```

### Running the Server

**Development Mode** (with hot recall):
```bash
bun dev
```

**Production Mode**:
```bash
bun start
```

The server listens on `http://localhost:3000` by default.

## 📡 API Endpoints

### Projects
- `POST /api/projects`: Create a new project.
- `GET /api/projects`: List all projects.
- `GET /api/projects/:id`: Get detailed status of a specific project.
- `DELETE /api/projects/:id`: Remove a project.

### Interactions
- `POST /api/projects/:id/answers`: Submit answers to system questions.
- `GET /api/projects/:id/artifacts`: Retrieve generated artifacts (files).
- `GET /api/projects/:id/artifacts/:path`: Download a specific artifact.

## 🔌 WebSockets

Real-time updates are handled via WebSockets, allowing the frontend to receive immediate feedback on valid logic generation, questions, or errors.

**URL:** `ws://localhost:3000/ws/projects/:projectId`

### Events (Server -> Client)
Messages are JSON formatted with a `type`:
- `update`: General status update or log.
- `question`: The system requires user input.
- `artifact`: A new file/artifact has been generated.
- `error`: Something went wrong.

## 🧪 Testing

Run strict unit tests with:

```bash
bun test
```

## 📂 Project Structure

- `src/db`: Database connection and schema handling.
- `src/routes`: HTTP API route definitions.
- `src/websocket`: WebSocket connection manager and event handling.
- `src/utils`: Helper functions (logger, validators).
- `src/services`: Core logic integration (if applicable).

---

*Powered by [Bun](httpss://bun.sh) & [Hono](httpss://hono.dev)*
