# Monitoring Dashboard Example

This example demonstrates how to build a full-stack monitoring dashboard for the `http-queue-manager` library using GraphQL and React.

## Components

- **Backend**: A [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) server running on Bun. It connects to the Queue Manager instance and exposes statistics, request history, and control operations via GraphQL.
- **Frontend**: A [Vite](https://vitejs.dev/) + [React](https://react.dev/) application. It uses [Apollo Client](https://www.apollographql.com/docs/react/) to fetch real-time data and mutations to control the queue.

## Features

- 📊 **Real-time Stats**: View processing, pending, completed, and failed counts.
- 🚦 **Queue Control**: Enqueue single or bulk requests.
- 📝 **Request Monitor**: Watch requests flow through the system with status updates.
- 🎨 **Premium UI**: Dark mode interface with glassmorphism effects.

## How to Run

### Prerequisites

Ensure you have Redis and PostgreSQL running (use the root docker-compose):

```bash
docker compose up -d
```

### 1. Start the Backend

From the root of the repo:

```bash
cd examples/dashboard/backend
bun install
bun run dev
```

The GraphQL API will be available at `http://localhost:4000/graphql`.

### 2. Start the Frontend

In a new terminal:

```bash
cd examples/dashboard/frontend
bun install
bun run dev
```

Open `http://localhost:5173` to view the dashboard.

## Simulation

To see the dashboard in action:
1. Open the dashboard.
2. Use the "Enqueue Request" form to send a request (try `https://httpbin.org/delay/2` for long running).
3. Use "Simulate Load" to enqueue 10 requests at once.
4. Watch the counters and list update in real-time.
