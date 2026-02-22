export abstract class AppError extends Error {
	public readonly statusCode: number
	public readonly isOperational: boolean

	constructor(message: string, statusCode: number) {
		super(message)
		this.statusCode = statusCode
		// Indicates this is an expected error, not a bug
		this.isOperational = true

		Error.captureStackTrace(this, this.constructor)
	}
}
