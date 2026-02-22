import db from '../lib/db/knex'
import type { User } from '../types/auth'
import type { UUID } from '../types'

export async function findByEmail(email: string): Promise<User | null> {
  const user = await db<User>('users').where({ email }).first()
	return user ?? null
}

export async function findById(id: UUID): Promise<User | null> {
	const user = await db<User>('users').where({ id }).first()
	return user ?? null
}
