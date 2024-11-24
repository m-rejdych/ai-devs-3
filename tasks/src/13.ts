import { queryDb, submit } from '@/util/tasks';
import { getChatCompletion } from '@/util/openai';

function getContext(usersDefinition: string, datacentersDefinition: string): string {
  return `Your job is to create an SQL query to database, that will match the user request. Below, there are an SQL queries, that were used to create tables, that you operate on. Use them to determina table structure, which you will use to generate SQL for the user. Return just the SQL query and nothing more. Do not include any comments, skip markdown code block wrapper.

<users_table_create_query>
${usersDefinition}
</users_table_create_query>

<datacenters_table_create_query>
${datacentersDefinition}
</datacenters_table_create_query>`;
}

async function main(): Promise<void> {
  try {
    const usersCreateTable = await queryDb('database', 'SHOW CREATE TABLE users');
    const usersDefinition = usersCreateTable.reply[0]!['Create Table'];
    const datacentersCreateTable = await queryDb('database', 'SHOW CREATE TABLE datacenters');
    const datacentersDefinition = datacentersCreateTable.reply[0]!['Create Table'];

    const completion = await getChatCompletion({
      context: getContext(usersDefinition as string, datacentersDefinition as string),
      query: 'Select datacenters, that are active, and which managers are inactive.',
    });
    if (!completion) throw new Error('Completion not completed.');
    console.log('COMPLETION', completion);

    const dbResult = await queryDb('database', completion);
    console.log('DB RESULT', dbResult.reply);

    const result = await submit(
      'database',
      dbResult.reply.map(({ dc_id }) => dc_id),
    );
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
