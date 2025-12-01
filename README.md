# E.L.L.A API Server

Infrastructure backend for the Even Logic Loves Automation system. Handles Project lifecycle management, artifact persistence, and real-time frontend communication.

## 🛠 Tech Stack

- **Runtime:** Bun
- **Framework:** Hono
- **Database:** SQLite (via better-sqlite3)
- **Validation:** Zod
- **Type Safety:** Strict TypeScript

## 🚀 Setup & Run

1. **Install Dependencies:**

   ```bash
   bun install
   ```

2. **Configuration:**
   Copy `.env.example` to `.env` (Defaults work out of the box).

   ```bash
   cp .env.example .env
   ```

3. **Start Server:**
   ```bash
   bun start
   # Or for development with watch mode:
   bun dev
   ```

## 📡 API Endpoints

| Method | Endpoint                            | Description                  |
| ------ | ----------------------------------- | ---------------------------- |
| POST   | `/api/projects`                     | Create a new project         |
| GET    | `/api/projects/:id`                 | Get project status & details |
| POST   | `/api/projects/:id/answers`         | Submit answers to questions  |
| GET    | `/api/projects/:id/artifacts`       | List generated files         |
| GET    | `/api/projects/:id/artifacts/:path` | Download file content        |

## 🔌 WebSockets

Connect to: `ws://localhost:3000/ws/projects/:projectId`

### Incoming Messages (Server -> Client)

All messages follow the format:

```json
{
  "type": "update" | "question" | "artifact" | "error",
  "timestamp": "2023-...",
  "data": { ... }
}
```

## 🧪 Testing

Run the included manual test script:

```bash
chmod +x test.sh
./test.sh
```

Or run unit tests:

```bash
bun test
```
