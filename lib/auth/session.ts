import { SignJWT, jwtVerify, decodeJwt } from 'jose'
import { NextResponse } from 'next/server'
import db from '@/lib/db/knex'
import type { SessionPayload } from '@/types/auth'
import type { UUID } from '@/types'

export const SESSION_COOKIE = 'session'
export const REFRESH_COOKIE = 'refresh_token'

function getAccessSecret(): Uint8Array {
	const s = process.env.JWT_SECRET
	if (!s) throw new Error('JWT_SECRET is not set')
	return new TextEncoder().encode(s)
}

function getRefreshSecret(): Uint8Array {
	const s = process.env.JWT_REFRESH_SECRET
	if (!s) throw new Error('JWT_REFRESH_SECRET is not set')
	return new TextEncoder().encode(s)
}

export async function createSession(payload: SessionPayload): Promise<string> {
	const expiresIn = process.env.JWT_ACCESS_EXPIRY
	if (!expiresIn) throw new Error('JWT_ACCESS_EXPIRY is not set')
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(getAccessSecret())
}

export async function verifySession(token: string): Promise<SessionPayload> {
	const { payload } = await jwtVerify(token, getAccessSecret())
	return {
		userId: payload.userId as UUID,
		email: payload.email as string,
		role: payload.role as SessionPayload['role'],
	}
}

export async function createRefreshToken(userId: UUID): Promise<string> {
	const expiresIn = process.env.JWT_REFRESH_EXPIRY
	if (!expiresIn) throw new Error('JWT_REFRESH_EXPIRY is not set')
	const token = await new SignJWT({ userId })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(getRefreshSecret())
	const { exp } = decodeJwt(token)
	await db('refresh_tokens').insert({
		user_id: userId,
		token,
		expires_at: new Date((exp as number) * 1000),
	})
	return token
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
	try {
		await jwtVerify(refreshToken, getRefreshSecret())
	} catch {
		return null
	}

	const row = await db('refresh_tokens')
		.join('users', 'refresh_tokens.user_id', 'users.id')
		.where('refresh_tokens.token', refreshToken)
		.where('refresh_tokens.expires_at', '>', db.fn.now())
		.select('refresh_tokens.user_id', 'users.email', 'users.role')
		.first()

	if (!row) return null

	return createSession({
		userId: row.user_id,
		email: row.email,
		role: row.role,
	})
}

export async function revokeRefreshToken(token: string): Promise<void> {
	await db('refresh_tokens').where({ token }).delete()
}

const COOKIE_BASE = { httpOnly: true, path: '/', sameSite: 'lax' as const }

export async function issueTokens(res: NextResponse, payload: SessionPayload): Promise<void> {
	const [accessToken, refreshToken] = await Promise.all([
		createSession(payload),
		createRefreshToken(payload.userId),
	])
	res.cookies.set(SESSION_COOKIE, accessToken, COOKIE_BASE)
	res.cookies.set(REFRESH_COOKIE, refreshToken, COOKIE_BASE)
}

export function clearTokens(res: NextResponse): void {
	res.cookies.delete(SESSION_COOKIE)
	res.cookies.delete(REFRESH_COOKIE)
}

function parseCookie(cookieHeader: string, name: string): string | null {
	return (
		cookieHeader
			.split(';')
			.map((c) => c.trim().split('='))
			.find(([key]) => key === name)?.[1] ?? null
	)
}

export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
	const cookie = req.headers.get('cookie')
	if (!cookie) return null
	const token = parseCookie(cookie, SESSION_COOKIE)
	if (!token) return null
	try {
		return await verifySession(decodeURIComponent(token))
	} catch {
		return null
	}
}

export function getRefreshTokenFromRequest(req: Request): string | null {
	const cookie = req.headers.get('cookie')
	if (!cookie) return null
	const token = parseCookie(cookie, REFRESH_COOKIE)
	return token ? decodeURIComponent(token) : null
}
