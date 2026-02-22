import { UUID } from './index'

export type UserRole = 'admin' | 'manager' | 'viewer'

export type User = {
	id: UUID
	name: string
	email: string
	passwordHash: string
	role: UserRole
	isActive: boolean
	createdAt: string
	updatedAt: string
}

export type SessionPayload = {
	userId: UUID
	email: string
	role: UserRole
}

export type LoginInput = {
	email: string
	password: string
}
