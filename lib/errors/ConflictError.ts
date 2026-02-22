import { AppError } from './AppError'

export class ConflictError extends AppError {
	public readonly field ?: string
	constructor(message: string, field?: string) {
		super(message, 409)
		this.name = 'ConflictError'
		this.field = field
	}
}