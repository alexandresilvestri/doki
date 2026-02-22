import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
	await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

	return knex.schema.createTable('users', (table) => {
		table.uuid('id', { primaryKey: true })
			.defaultTo(knex.raw('uuid_generate_v4()'))
		table.string('name', 80).notNullable()
		table.string('email', 255).unique().notNullable()
		table.string('password_hash').notNullable()
		table.enum('role', ['admin', 'manager', 'viewer'])
			.notNullable()
			.defaultTo('viewer')
		table.boolean('is_active')
			.notNullable()
			.defaultTo(true)
		table.timestamps(true, true)
	})
}

export async function down(knex: Knex): Promise<void> {
	return knex.schema.dropTableIfExists('users')
}