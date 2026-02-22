import { Knex } from 'knex'
import argon2 from 'argon2'
import { randomUUID } from 'crypto'

export async function seed(knex: Knex): Promise<void> {
	const generateHash = async (passwd: string): Promise<string> => {
		const passwordHash = await argon2.hash(passwd)
		return passwordHash
	}

	const passwdAdmin = '48fj5bncanqnjdf3obkwldu'

	await knex('users').insert({
		id: randomUUID(),
		name: 'Admin',
		email: 'alexandretunni03@gmail.com',
		passwordHash: await generateHash(passwdAdmin),
		role: 'admin',
		isActive: true
	})
}