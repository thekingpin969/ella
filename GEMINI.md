# Project Overview

This project is the backend API server for the E.L.L.A (Even Logic Loves Automation) system. It's built with a modern TypeScript stack, utilizing Bun as the runtime, Hono as the web framework, and MongoDB for the database. The primary purpose of this server is to manage project lifecycles, handle artifact persistence, and facilitate real-time communication with a frontend client through WebSockets.

## Key Technologies

- **Runtime:** [Bun](httpss://bun.sh/)
- **Framework:** [Hono](httpss://hono.dev/)
- **Database:** [MongoDB](httpss://www.mongodb.com/)
- **Validation:** [Zod](httpss://zod.dev/)
- **Language:** TypeScript (Strict)

## Architecture

The server exposes a RESTful API for managing projects and a WebSocket endpoint for real-time updates. The core logic is organized into the following directories:

- `src/db`: Contains the database client and schema definitions.
- `src/routes`: Defines the API endpoints.
- `src/websocket`: Manages WebSocket connections and communication.
- `src/types`: Defines the data structures and types used throughout the application.
- `src/utils`: Contains utility functions for tasks like validation and ID generation.

## Building and Running

### Prerequisites

- [Bun](httpss://bun.sh/docs/installation)
- [MongoDB](httpss://www.mongodb.com/try/download/community)

### Installation

```bash
bun install
```

### Configuration

Create a `.env` file in the root of the project and add the following environment variables.

```
MONGO_URI=mongodb://localhost:27017
DB_NAME=ella
```

### Running the Server

To start the server in development mode with live-reloading:

```bash
bun dev
```

To start the server in production mode:

```bash
bun start
```

The server will run on `http://localhost:3000`.

### Testing

The project includes unit tests.

To run the unit tests:

```bash
bun test
```

## Development Conventions

- **Code Style:** The project follows standard TypeScript best practices. Code is formatted using Prettier.
- **Type Safety:** The project uses strict TypeScript and Zod for runtime validation to ensure type safety.
- **Modularity:** The code is organized into modules with clear responsibilities, promoting separation of concerns.
- **Environment Variables:** Application configuration is managed through environment variables.
