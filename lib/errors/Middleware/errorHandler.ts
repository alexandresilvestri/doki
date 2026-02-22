import { NextResponse } from 'next/server'
import { AppError } from '../AppError.js'

export function handleError(err: unknown): NextResponse {
	if (err instanceof AppError) {
		const body: Record<string, unknown> = {
			status: 'error',
			message: err.message,
		}
		const withField = err as AppError & { field?: unknown }
		if (withField.field) {
			body.field = withField.field
		}
		return NextResponse.json(body, { status: err.statusCode })
	}

	console.error('ERROR: Unexpected error:', err)
	return NextResponse.json(
		{ status: 'error', message: 'Internal server error' },
		{ status: 500 },
	)
}

export function notFoundHandler(request: Request): NextResponse {
	const { pathname } = new URL(request.url)
	return NextResponse.json(
		{
			status: 'error',
			message: `Route ${request.method} ${pathname} not found`,
		},
		{ status: 404 },
	)
}
