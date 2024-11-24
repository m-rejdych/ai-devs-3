import neo4j from 'neo4j-driver';

export const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URL as string,
  neo4j.auth.basic(process.env.NEO4J_USERNAME as string, process.env.NEO4J_PASSWORD as string),
);
