import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('refresh_tokens', (table) => {
		table
			.uuid('id', { primaryKey: true })
			.defaultTo(knex.raw('uuid_generate_v4()'))
		table
			.uuid('user_id')
			.notNullable()
			.references('id')
			.inTable('users')
			.onDelete('CASCADE')
		table.string('token', 255).notNullable().unique()
		table.timestamp('expires_at').notNullable()
		table.timestamps(true, true)
	})
}

export async function down(knex: Knex): Promise<void> {
	return knex.schema.dropTableIfExists('refresh_tokens')
}
