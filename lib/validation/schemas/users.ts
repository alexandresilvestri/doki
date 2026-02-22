import { z } from 'zod'

const nameSchema = z
	.string()
	.trim()
	.min(1, 'is required')
	.min(2, 'must be between 2 and 50 characters')
	.max(50, 'must be between 2 and 50 characters')
	.regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'contains invalid characters')
	.refine((val) => !/\d/.test(val), 'cannot contain numbers')
	.refine((val) => !/["'`<>\\;]/.test(val), 'contains invalid characters')

const emailSchema = z.email()

const passwordSchema = z
	.string()
	.min(1, 'Password is required')
	.min(8, 'Password must be between 8 and 100 characters')
	.max(100, 'Password must be between 8 and 100 characters')
	.refine(
		(val) => /[a-z]/.test(val),
		'Password must contain at least one lowercase letter'
	)
	.refine(
		(val) => /[A-Z]/.test(val),
		'Password must contain at least one uppercase letter'
	)
	.refine((val) => /\d/.test(val), 'Password must contain at least one number')
	.refine(
		(val) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val),
		'Password must contain at least one special character'
	)
	.refine((val) => !/\s/.test(val), 'Password cannot contain spaces')

const roleSchema = z.enum(['admin', 'manager', 'viewer'], {
	error: 'Role must be admin, manager, or viewer'
})


export const createUserSchema = z.object({
	body: z.object({
		name: nameSchema,
		email: emailSchema,
		password: passwordSchema,
		roleId: roleSchema,
	}),
})

export const getUserSchema = z.object({
	params: z.object({
		id: z.uuid({ version: 'v4', message: 'Invalid user ID' }),
	}),
})

export const updateUserSchema = z.object({
	params: z.object({
		id: z.uuid({ version: 'v4', message: 'Invalid user ID' }),
	}),
	body: z.object({
		firstName: nameSchema.optional(),
		lastName: nameSchema.optional(),
		email: emailSchema.optional(),
		password: passwordSchema.optional(),
		userTypeId: z.string().trim().min(1, 'User type is required').optional(),
	}),
})

export const deleteUserSchema = z.object({
	params: z.object({
		id: z.uuid({ version: 'v4', message: 'Invalid user ID' }),
	}),
})

export const updateUserWorksSchema = z.object({
	params: z.object({
		id: z.uuid({ version: 'v4', message: 'Invalid user ID' }),
	}),
	body: z.object({
		workIds: z.array(z.uuid({ version: 'v4', message: 'Invalid work ID' })),
	}),
})
