import { NextRequest } from 'next/server'
import { ZodType, ZodError } from 'zod'
import { ValidationError } from '../../errors/index.js'

export const validate = (schema: ZodType) => {
	return async (request: NextRequest, params?: Record<string, string>) => {
		try {
			const body = await request.json().catch(() => ({}))
			const query = Object.fromEntries(new URL(request.url).searchParams)
			return await schema.parseAsync({
				body,
				params: params ?? {},
				query,
			})
		} catch (err) {
			if (err instanceof ZodError) {
				const messages = err.issues
					.map((e) => `${e.path.join('.')}: ${e.message}`)
					.join('; ')
				throw new ValidationError(messages)
			}
			throw err
		}
	}
}
