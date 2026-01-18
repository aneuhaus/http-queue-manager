export const typeDefs = `
  scalar DateTime
  scalar JSON

  type Query {
    overallStats: QueueStats!
    requests(status: String, host: String, limit: Int, offset: Int): [StoredRequest!]!
    request(id: ID!): StoredRequest
    backpressure: BackpressureState!
  }

  type Mutation {
    enqueue(input: EnqueueInput!): EnqueueResult!
    enqueueMany(inputs: [EnqueueInput!]!): [EnqueueResult!]!
    cancelRequest(id: ID!): Boolean!
    retryRequest(id: ID!): Boolean!
    clearQueue: Boolean!
  }

  type QueueStats {
    pending: Int!
    processing: Int!
    completed: Int!
    failed: Int!
    dead: Int!
    avgProcessingTime: Float!
    successRate: Float!
  }

  type BackpressureState {
    totalActive: Int!
    maxConcurrency: Int!
    activeByHost: JSON!
  }

  type StoredRequest {
    id: ID!
    url: String!
    method: String!
    status: String!
    attempts: Int!
    maxRetries: Int!
    priority: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    completedAt: DateTime
    scheduledFor: DateTime
    error: String
    response: RequestResponse
    headers: JSON
    body: JSON
  }

  type RequestResponse {
    status: Int!
    duration: Int!
    attempt: Int!
    completedAt: DateTime!
  }

  type EnqueueResult {
    id: ID!
    position: Int
  }

  input EnqueueInput {
    url: String!
    method: String!
    headers: JSON
    body: JSON
    priority: Int
    maxRetries: Int
    timeout: Int
  }
`;
