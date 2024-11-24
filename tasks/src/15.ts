import { neo4jDriver } from '@/clients/neo4j';
import { queryDb, submit } from '@/util/tasks';

async function main() {
  const session = neo4jDriver.session();

  try {
    const { reply: connections } = await queryDb('database', 'select * from connections');
    const { reply: users } = await queryDb('database', 'select * from users');

    await session.run(`\
MATCH (u:User)
DETACH DELETE u`);

    await session.run(
      `\
UNWIND $users as user
MERGE (u:User {id: user.id})
ON CREATE SET u.username = user.username`,
      { users },
    );

    await session.run(
      `\
UNWIND $connections as connection
MATCH (u1:User {id: connection.user1_id})
MATCH (u2:User {id: connection.user2_id})
MERGE (u1)-[r:CONNECTED_TO]->(u2)
`,
      { connections },
    );

    const barbara = users.find(({ username }) => username === 'Barbara');
    if (!barbara) throw new Error('Barbara not found.');

    const rafal = users.find(({ username }) => username === 'Rafał');
    if (!rafal) throw new Error('Rafal not found.');

    const queryResult = await session.run(
      `\
MATCH path = shortestPath(
  (start:User {id: $rafalId})-[:CONNECTED_TO*]-(end:User {id: $barbaraId})
)
RETURN [node in nodes(path) | {
  id: node.id,
  username: node.username
}] as users`,
      { barbaraId: barbara.id, rafalId: rafal.id },
    );

    const [path] = queryResult.records;
    if (!path) throw new Error('Shortest path not found.');

    const pathUsers = path.toObject().users;
    console.log('RELATION_PATH', pathUsers);

    const result = await submit(
      'connections',
      pathUsers.map(({ username }: { id: string; username: string }) => username).join(', '),
    );
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  } finally {
    await session.close();
    await neo4jDriver.close();
  }
}

main();
