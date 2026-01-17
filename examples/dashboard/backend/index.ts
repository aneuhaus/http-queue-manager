import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';
import { createQueueManager } from '../../../src';

async function main() {
  console.log('🚀 Starting Dashboard Backend...');

  // Initialize QueueManager
  const queue = await createQueueManager({
    redis: { url: 'redis://localhost:6379' },
    postgres: {
      connectionString: 'postgresql://queue:queue_password@localhost:5432/queue',
    },
    // Dashboard needs to see everything so maybe don't start workers here if we just want to monitor?
    // But if we want to enqueue, we need a QM. 
    // If we want to process requests, we can set workerCount > 0.
    // Let's set workerCount: 0 so this instance is just for API/Monitoring, 
    // assuming another instance (the main app) is processing.
    // Or set it to 1 to demonstrate processing.
    workerCount: 1, 
  });

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: createResolvers(queue),
  });

  const yoga = createYoga({ schema });
  const server = createServer(yoga);

  server.listen(4000, () => {
    console.log('Server is running on http://localhost:4000/graphql');
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await queue.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);
