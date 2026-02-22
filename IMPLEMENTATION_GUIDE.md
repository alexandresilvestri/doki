# Implementation Guide — DocManager

Step-by-step reference for implementing each layer of the application.
Work through the steps in order — each layer depends on the one before it.

> TypeScript convention used throughout this project: prefer `type` over `interface`.

---

## Phase 1 — Authentication

Complete the full authentication slice before building anything else. Every other feature depends on knowing who the user is.

### Step 1 — Auth Types (`types/auth.ts`)

```ts
export type UserRole = 'admin' | 'manager' | 'viewer'

export type User = {
	id: number
	name: string
	email: string
	passwordHash: string
	role: UserRole
	isActive: boolean
	createdAt: string
	updatedAt: string
}

export type SessionPayload = {
	userId: number
	email: string
	role: UserRole
}

export type LoginInput = {
	email: string
	password: string
}
```

---

### Step 2 — Database Migration: Users (`lib/db/migrations/20250101000000_create_users.ts`)

Create the `users` table with columns: `id`, `name`, `email`, `password_hash`, `role` (enum: admin/manager/viewer), `is_active`, `created_at`, `updated_at`.

Run with `npm run db:migrate`. Each file exports `up` and `down`.

```ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('table_name', (t) => {
		t.increments('id').primary()
		// ... columns
		t.timestamps(true, true) // created_at, updated_at
	})
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTableIfExists('table_name')
}
```

---

### Step 3 — Database Seed: Admin User (`lib/db/seeds/02_users.ts`)

Insert one admin user. Hash the password with `bcryptjs`, rounds: 10.

Run with `npm run db:seed`.

```ts
import type { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
	await knex('table_name').del()
	await knex('table_name').insert([
		{
			/* row */
		},
	])
}
```

---

### Step 4 — Knex Instance (`lib/db/knex.ts`)

Create a single shared Knex instance. Use the `NODE_ENV` environment variable to select the correct config from `knexfile.ts`.

```ts
import knexLib from 'knex'
import knexConfig from '../../knexfile'

const env = (process.env.NODE_ENV ?? 'development') as keyof typeof knexConfig
const db = knexLib(knexConfig[env])

export default db
```

---

### Step 5 — Auth Session (`lib/auth/session.ts`)

Use the `jose` library (already in dependencies) to sign and verify JWTs.
Two HttpOnly cookies are used: `session` (short-lived access token) and `refresh_token` (long-lived, stored in DB).

Required env vars:

| Variable | Description |
| --- | --- |
| `JWT_SECRET` | Secret used to sign access tokens |
| `JWT_REFRESH_SECRET` | Separate secret used to sign refresh tokens |
| `JWT_ACCESS_EXPIRY` | Access token lifetime in jose format (e.g. `"15m"`) |
| `JWT_REFRESH_EXPIRY` | Refresh token lifetime in jose format (e.g. `"7d"`) |

The migration for the `refresh_tokens` table lives at `lib/db/migrations/20260221000000_create_refresh_tokens.ts`.
Columns: `id` (UUID PK), `user_id` (FK → users, CASCADE delete), `token` (unique string), `expires_at`, timestamps.

Both tokens are **signed JWTs** — the access token uses `JWT_SECRET` and the refresh token uses `JWT_REFRESH_SECRET`. The refresh token is also persisted in the DB to allow revocation.

**Cookie name constants** (exported for use in route handlers):

```ts
export const SESSION_COOKIE = 'session'
export const REFRESH_COOKIE = 'refresh_token'
```

**Internal helpers** — not exported:

```ts
function getAccessSecret(): Uint8Array  // encodes JWT_SECRET
function getRefreshSecret(): Uint8Array // encodes JWT_REFRESH_SECRET
```

**Access token functions:**

```ts
export async function createSession(payload: SessionPayload): Promise<string>
// Signs a JWT with JWT_SECRET. Expiry from JWT_ACCESS_EXPIRY. Throws if env var is missing.

export async function verifySession(token: string): Promise<SessionPayload>
// Verifies signature with JWT_SECRET and returns the decoded SessionPayload. Throws on invalid/expired token.
```

**Refresh token functions:**

```ts
export async function createRefreshToken(userId: UUID): Promise<string>
// Signs a JWT with JWT_REFRESH_SECRET and JWT_REFRESH_EXPIRY.
// Reads exp from the signed token via decodeJwt and persists the token + expires_at in refresh_tokens.

export async function refreshAccessToken(refreshToken: string): Promise<string | null>
// 1. Verifies JWT signature with JWT_REFRESH_SECRET — returns null on failure.
// 2. Joins refresh_tokens + users; checks token exists in DB and has not expired — returns null if not found.
// 3. Rebuilds SessionPayload from the DB row (user_id, email, role).
// 4. Returns a new access token. The refresh token is NOT replaced.
// When the refresh token itself expires the user must log in again.

export async function revokeRefreshToken(token: string): Promise<void>
// Deletes the token row from DB. Call on logout.
```

**Cookie helpers** (set/clear on a `NextResponse`):

```ts
export async function issueTokens(res: NextResponse, payload: SessionPayload): Promise<void>
// Calls createSession + createRefreshToken in parallel, then sets both HttpOnly cookies on res.

export function clearTokens(res: NextResponse): void
// Deletes both SESSION_COOKIE and REFRESH_COOKIE from res.
```

**Request reader helpers:**

```ts
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null>
// Reads the session cookie, calls verifySession. Returns null on missing or invalid token.

export function getRefreshTokenFromRequest(req: Request): string | null
// Reads the raw refresh_token cookie value. Returns null if absent.
```

**Token flow summary:**

| Event | Actions |
| ------- | ------- |
| Login | `issueTokens(res, payload)` — sets both cookies |
| Authenticated request | `getSessionFromRequest(req)` — no DB hit |
| Access token expired | `refreshAccessToken(token)` → set new `session` cookie |
| Logout | `revokeRefreshToken(token)` → `clearTokens(res)` |

---

### Step 6 — Login Validator (`lib/utils/validators.ts`)

Use `zod` to define the login schema. The remaining schemas (employee, document) are added in Phase 2.

- `loginSchema` — validates `LoginInput`

---

### Step 7 — User Repository (`repositories/user.repository.ts`)

- `findByEmail(email: string): Promise<User | null>`
- `findById(id: number): Promise<User | null>`

---

### Step 8 — Auth Service (`services/auth.service.ts`)

- `login(input: LoginInput): Promise<string>` — find user by email, compare password with `bcryptjs.compare`, sign session, return token
- `hashPassword(password: string): Promise<string>` — `bcryptjs.hash(password, 10)`

---

### Step 9 — Minimal UI Components (`components/ui/`)

Only the primitives needed by the login form. The remaining components are added in Phase 2.

| File         | Description                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `button.tsx` | Variants: `primary`, `secondary`, `danger`, `ghost`. Props: `onClick`, `disabled`, `loading`, `type` |
| `input.tsx`  | Controlled input with label, error message, and helper text                                          |

---

### Step 10 — Login Form (`components/auth/login-form.tsx`)

Controlled form with email and password fields. On submit, calls `POST /api/auth/login` and redirects to `/` on success.

---

### Step 11 — Login Page (`app/login/page.tsx`)

Renders `<LoginForm />`. If a session already exists, redirect to `/`.

---

### Step 12 — Auth API Routes (`app/api/auth/`)

Return `NextResponse.json(...)`. Validate request bodies with the Zod schema from Step 6.

| Route                | Method | Description                                                                                                                                        |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/login`    | POST   | Validate body → call `authService.login` → set `session` and `refresh_token` HttpOnly cookies → return 200                                         |
| `/api/auth/logout`   | POST   | Call `revokeRefreshToken` → clear both `session` and `refresh_token` cookies → return 200                                                          |
| `/api/auth/refresh`  | POST   | `getRefreshTokenFromRequest` → `refreshAccessToken` → set new `session` cookie only → return 200; return 401 if token is missing, invalid, or expired |

---

## Phase 2 — Application

With authentication in place, build the rest of the data layer and UI.

### Step 13 — Remaining Types (`types/`)

### `types/employee.ts`

```ts
export type Employee = {
	id: number
	unitId: number
	name: string
	cpf: string
	rg?: string
	email: string
	phone?: string
	role: string
	department?: string
	admissionDate: string
	profilePhotoKey?: string // S3 object key
	isActive: boolean
	createdAt: string
	updatedAt: string
}

export type EmployeeWithUnit = Employee & { unitName: string }

export type CreateEmployeeInput = Omit<
	Employee,
	'id' | 'createdAt' | 'updatedAt'
>
export type UpdateEmployeeInput = Partial<CreateEmployeeInput>

export type EmployeeFilters = {
	unitId?: number
	department?: string
	isActive?: boolean
	search?: string
}
```

### `types/document.ts`

```ts
export type DocumentCategory =
	| 'certificate'
	| 'exam'
	| 'register'
	| 'training'
	| 'other'
export type DocumentStatus = 'active' | 'expired' | 'pending'

export type Document = {
	id: number
	employeeId: number
	category: DocumentCategory
	title: string
	description?: string
	fileKey: string // S3 object key
	fileName: string
	fileType: string
	fileSize: number // bytes
	issuedAt?: string
	expiresAt?: string
	status: DocumentStatus
	uploadedBy: number // user id
	createdAt: string
	updatedAt: string
}

export type DocumentWithEmployee = Document & { employeeName: string }
export type CreateDocumentInput = Omit<
	Document,
	'id' | 'createdAt' | 'updatedAt'
>
export type UpdateDocumentInput = Partial<CreateDocumentInput>

export type DocumentFilters = {
	employeeId?: number
	category?: DocumentCategory
	status?: DocumentStatus
	search?: string
}

export type ShareLink = { url: string; expiresAt: string }
```

### `types/unit.ts`

```ts
export type Unit = {
	id: number
	name: string
	cnpj?: string
	address?: string
	city?: string
	state?: string
	isActive: boolean
	createdAt: string
	updatedAt: string
}

export type CreateUnitInput = Omit<Unit, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateUnitInput = Partial<CreateUnitInput>
```

### `types/index.ts`

```ts
export * from './employee'
export * from './document'
export * from './unit'
export * from './auth'

export type PaginatedResponse<T> = {
	data: T[]
	total: number
	page: number
	perPage: number
	totalPages: number
}

export type ApiError = {
	message: string
	code?: string
	details?: Record<string, string[]>
}
```

---

### Step 14 — Remaining DB Migrations (`lib/db/migrations/`)

Use the Knex migration skeleton from Step 2.

### `20250101000001_create_units.ts`

Create the `units` table with columns: `id`, `name`, `cnpj` (unique, nullable), `address`, `city`, `state`, `is_active`, `created_at`, `updated_at`.

### `20250101000002_create_employees.ts`

Create the `employees` table with columns: `id`, `unit_id` (FK → units), `name`, `cpf` (unique), `rg`, `email` (unique), `phone`, `role`, `department`, `admission_date`, `profile_photo_key`, `is_active`, `created_at`, `updated_at`.

### `20250101000003_create_documents.ts`

Create the `documents` table with columns: `id`, `employee_id` (FK → employees), `category` (enum), `title`, `description`, `file_key`, `file_name`, `file_type`, `file_size`, `issued_at`, `expires_at`, `status` (enum: active/expired/pending), `uploaded_by` (FK → users), `created_at`, `updated_at`.

---

### Step 15 — Remaining Seeds (`lib/db/seeds/`)

Use the Knex seed skeleton from Step 3.

- `01_units.ts` — insert 2–3 sample construction units
- `03_employees.ts` — insert sample employees linked to the units above

---

### Step 16 — S3 Client & Operations (`lib/s3/`)

### `lib/s3/client.ts`

Create a single `S3Client` instance from `@aws-sdk/client-s3`, configured from env vars (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

```ts
import { S3Client } from '@aws-sdk/client-s3'
// export const s3 = new S3Client({ ... })
```

### `lib/s3/operations.ts`

Functions to implement using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`:

- `getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>` — `PutObjectCommand` presigned URL for browser direct upload
- `getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>` — `GetObjectCommand` presigned URL for download/view
- `deleteObject(key: string): Promise<void>` — `DeleteObjectCommand`
- `generateFileKey(employeeId: number, fileName: string): string` — builds the S3 key path, e.g. `employees/{id}/documents/{timestamp}-{fileName}`

---

### Step 17 — Remaining Utilities (`lib/utils/`)

### `lib/utils/formatters.ts`

Pure functions, no dependencies:

- `formatCpf(cpf: string): string` — formats raw digits as `000.000.000-00`
- `formatPhone(phone: string): string` — formats as `(00) 00000-0000`
- `formatFileSize(bytes: number): string` — converts to human-readable (KB, MB, GB)
- `formatDate(date: string): string` — returns `DD/MM/YYYY`

### `lib/utils/validators.ts` (remaining schemas)

Add to the validators file created in Step 6:

- `createEmployeeSchema` — validates `CreateEmployeeInput`
- `updateEmployeeSchema` — validates `UpdateEmployeeInput`
- `createDocumentSchema` — validates `CreateDocumentInput`

---

### Step 18 — Remaining Repositories (`repositories/`)

Thin data-access layer. Each function receives the knex instance (or imports the singleton) and returns typed results. No business logic here — only SQL queries.

### `repositories/employee.repository.ts`

- `findAll(filters?: EmployeeFilters): Promise<EmployeeWithUnit[]>` — JOIN with units, support search/filter
- `findById(id: number): Promise<EmployeeWithUnit | null>`
- `create(data: CreateEmployeeInput): Promise<Employee>`
- `update(id: number, data: UpdateEmployeeInput): Promise<Employee>`
- `softDelete(id: number): Promise<void>` — sets `is_active = false`

### `repositories/document.repository.ts`

- `findByEmployee(employeeId: number, filters?: DocumentFilters): Promise<Document[]>`
- `findAll(filters?: DocumentFilters): Promise<DocumentWithEmployee[]>`
- `findById(id: number): Promise<Document | null>`
- `create(data: CreateDocumentInput): Promise<Document>`
- `update(id: number, data: UpdateDocumentInput): Promise<Document>`
- `delete(id: number): Promise<void>`

### `repositories/unit.repository.ts`

- `findAll(): Promise<Unit[]>`
- `findById(id: number): Promise<Unit | null>`
- `create(data: CreateUnitInput): Promise<Unit>`
- `update(id: number, data: UpdateUnitInput): Promise<Unit>`

---

### Step 19 — Remaining Services (`services/`)

Business logic layer. Calls repositories and other services. API routes call services, never repositories directly.

### `services/employee.service.ts`

- `listEmployees(filters?: EmployeeFilters): Promise<EmployeeWithUnit[]>`
- `getEmployee(id: number): Promise<EmployeeWithUnit>` — throw 404 if not found
- `createEmployee(data: CreateEmployeeInput): Promise<Employee>`
- `updateEmployee(id: number, data: UpdateEmployeeInput): Promise<Employee>`
- `deleteEmployee(id: number): Promise<void>` — soft delete + delete S3 photo if exists
- `updateProfilePhoto(id: number, file: File): Promise<string>` — get presigned URL flow

### `services/document.service.ts`

- `listDocuments(filters?: DocumentFilters): Promise<DocumentWithEmployee[]>`
- `getEmployeeDocuments(employeeId: number): Promise<Document[]>`
- `getDocument(id: number): Promise<Document>` — throw 404 if not found
- `createDocument(data: CreateDocumentInput): Promise<Document>`
- `updateDocument(id: number, data: UpdateDocumentInput): Promise<Document>`
- `deleteDocument(id: number): Promise<void>` — delete DB record + S3 object
- `getDownloadUrl(id: number): Promise<string>` — presigned download URL
- `getShareLink(id: number): Promise<ShareLink>` — presigned URL with longer expiry (e.g. 7 days)
- `checkExpiredDocuments(): Promise<void>` — update status to 'expired' where `expires_at < now`

### `services/storage.service.ts`

Thin wrapper around `lib/s3/operations.ts` for use within services. Add any app-specific logic here (logging, error formatting).

---

### Step 20 — Hooks (`hooks/`)

React hooks for data fetching. Use the native `fetch` API against the REST endpoints below. Add loading and error states.

### `hooks/use-employees.ts`

- `useEmployees(filters?: EmployeeFilters)` — fetch `GET /api/employees`
- `useEmployee(id: number)` — fetch `GET /api/employees/:id`

### `hooks/use-documents.ts`

- `useDocuments(filters?: DocumentFilters)` — fetch `GET /api/documents`
- `useEmployeeDocuments(employeeId: number)` — fetch `GET /api/employees/:id/documents`

### `hooks/use-upload.ts`

- `useUpload()` — returns an `upload(file: File, endpoint: string)` function that:
  1. Calls `POST /api/upload` to get a presigned S3 URL
  2. Uploads the file directly to S3 via `PUT`
  3. Returns the `fileKey`

---

### Step 21 — Remaining UI Components (`components/ui/`)

Generic, reusable primitives. No business logic. Style with Tailwind CSS.

| File         | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `modal.tsx`  | Overlay with title, body slot, and footer action buttons              |
| `table.tsx`  | Generic typed table: accepts `columns` config array + `data` array    |
| `badge.tsx`  | Status badge. Variants map to `DocumentStatus` and `UserRole` colors  |
| `card.tsx`   | White card container with optional header and footer slots            |
| `avatar.tsx` | Shows profile photo from S3 URL or initials fallback                  |
| `index.ts`   | Re-export all UI components (including button and input from Phase 1) |

---

### Step 22 — Feature Components

### `components/layout/sidebar.tsx`

Navigation sidebar with links to: Dashboard, Employees, Documents, Units, Settings.
Highlight the active route using `usePathname()` from `next/navigation`.

### `components/layout/header.tsx`

Top bar showing page title (from props) and logged-in user info with a logout button.

### `components/employees/`

| File                   | Description                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `employee-list.tsx`    | Table of employees using `useEmployees`. Includes search input and unit filter                                 |
| `employee-card.tsx`    | Compact card for grid view: photo, name, role, unit badge                                                      |
| `employee-form.tsx`    | Controlled form for create and edit. Uses `zod` validation via `createEmployeeSchema` / `updateEmployeeSchema` |
| `employee-profile.tsx` | Full profile view: photo, all personal fields, and embedded document list                                      |

### `components/documents/`

| File                    | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `document-list.tsx`     | Table of documents with category filter and status badge                             |
| `document-card.tsx`     | Card showing title, category, status, expiry date, and action buttons                |
| `document-uploader.tsx` | Drag-and-drop file input that calls `useUpload`, then `POST /api/documents`          |
| `document-viewer.tsx`   | Embeds PDFs (via `<iframe>`) or shows image preview using the presigned download URL |

---

### Step 23 — App Pages (`app/(dashboard)/`)

### `app/(dashboard)/layout.tsx`

Wraps all dashboard pages. Renders `<Sidebar />` and `<Header />`. Reads session server-side to pass user info to the header.

### `app/(dashboard)/page.tsx`

Dashboard home. Show summary cards: total employees, documents expiring soon, documents by category.

### `app/(dashboard)/employees/page.tsx`

Renders `<EmployeeList />`. Link to `/employees/new` in the header.

### `app/(dashboard)/employees/new/page.tsx`

Renders `<EmployeeForm />` in create mode. On success, redirect to `/employees/:id`.

### `app/(dashboard)/employees/[id]/page.tsx`

Renders `<EmployeeProfile />`. Fetches employee server-side with `employeeService.getEmployee(id)`.

### `app/(dashboard)/employees/[id]/edit/page.tsx`

Renders `<EmployeeForm />` in edit mode, prefilled with existing employee data.

### `app/(dashboard)/employees/[id]/documents/page.tsx`

Shows `<DocumentList />` filtered by this employee. Includes `<DocumentUploader />`.

### `app/(dashboard)/documents/page.tsx`

Global document list across all employees. Supports filtering by category, status, and employee.

### `app/(dashboard)/units/page.tsx`

List and manage construction units. Simple CRUD table.

### `app/(dashboard)/settings/page.tsx`

User account settings (change password). Admin-only: user management table.

---

### Step 24 — Remaining API Routes (`app/api/`)

All routes follow REST conventions. Return `NextResponse.json(...)`.
Validate request bodies with the Zod schemas from `lib/utils/validators.ts`.
Auth-protected routes: read session via `getSessionFromRequest` and return 401 if missing.

### Employees

| Route                           | Method | Description                                                |
| ------------------------------- | ------ | ---------------------------------------------------------- |
| `/api/employees`                | GET    | `employeeService.listEmployees(filters from query)`        |
| `/api/employees`                | POST   | Validate body → `employeeService.createEmployee`           |
| `/api/employees/[id]`           | GET    | `employeeService.getEmployee(id)`                          |
| `/api/employees/[id]`           | PUT    | Validate body → `employeeService.updateEmployee(id, data)` |
| `/api/employees/[id]`           | DELETE | `employeeService.deleteEmployee(id)`                       |
| `/api/employees/[id]/documents` | GET    | `documentService.getEmployeeDocuments(id)`                 |

### Documents

| Route                          | Method | Description                                                      |
| ------------------------------ | ------ | ---------------------------------------------------------------- |
| `/api/documents`               | GET    | `documentService.listDocuments(filters)`                         |
| `/api/documents`               | POST   | Validate body → `documentService.createDocument`                 |
| `/api/documents/[id]`          | GET    | `documentService.getDocument(id)`                                |
| `/api/documents/[id]`          | PUT    | Validate body → `documentService.updateDocument`                 |
| `/api/documents/[id]`          | DELETE | `documentService.deleteDocument(id)`                             |
| `/api/documents/[id]/download` | GET    | `documentService.getDownloadUrl(id)` → return presigned URL      |
| `/api/documents/[id]/share`    | POST   | `documentService.getShareLink(id)` → return `{ url, expiresAt }` |

### Upload

| Route         | Method | Description                                                                                                                 |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `/api/upload` | POST   | Body: `{ fileName, contentType, employeeId }` → `getPresignedUploadUrl(key, contentType)` → return `{ uploadUrl, fileKey }` |

### Units

| Route        | Method | Description                   |
| ------------ | ------ | ----------------------------- |
| `/api/units` | GET    | `unitRepository.findAll()`    |
| `/api/units` | POST   | `unitRepository.create(data)` |

---

## Phase 3 — Tests

### Step 25 — Tests

### Setup

**`tests/setup/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom'
// global beforeAll/afterAll hooks here
```

**`tests/setup/db.setup.ts`**
Export `setupTestDb()` and `teardownTestDb()` helpers:

- `setupTestDb`: run migrations on the test DB
- `teardownTestDb`: rollback all migrations

### Unit Tests (`tests/unit/`)

Test services in isolation. Mock repositories with `vi.mock`.

**`tests/unit/services/employee.service.test.ts`**

- listEmployees returns paginated results
- getEmployee throws when not found
- createEmployee calls repository with correct data
- deleteEmployee calls softDelete on repository

**`tests/unit/services/document.service.test.ts`**

- getShareLink returns a valid URL and expiry
- deleteDocument deletes S3 object after DB record
- checkExpiredDocuments updates status correctly

**`tests/unit/utils/formatters.test.ts`**

- formatCpf('12345678901') → '123.456.789-01'
- formatFileSize(1024) → '1 KB'
- formatFileSize(1048576) → '1 MB'

### Integration Tests (`tests/integration/`)

Test against a real test PostgreSQL database. Run `setupTestDb` in `beforeAll`.

**`tests/integration/api/employees.test.ts`**

- GET /api/employees returns 200 and array
- POST /api/employees returns 201 and created employee
- GET /api/employees/:id returns 404 for unknown id

**`tests/integration/db/employee.repository.test.ts`**

- findAll returns employees joined with unit name
- create inserts a row and returns it with id
- softDelete sets is_active to false

### E2E Tests (`tests/e2e/`) — Playwright

**`tests/e2e/auth.spec.ts`**

- redirects to /login when unauthenticated
- login with valid credentials redirects to dashboard
- login with wrong password shows error message

**`tests/e2e/employees.spec.ts`**

- employee list page shows table with data
- create employee form validates required fields
- can navigate to employee profile page

**`tests/e2e/documents.spec.ts`**

- document list shows correct categories
- download link opens correctly
- upload flow shows success feedback

---

## Implementation Order Summary

Follow this order to avoid missing dependencies at each step:

```
── Phase 1: Authentication ──────────────────────────────────────
 1. types/auth.ts               → auth data shapes
 2. db/migrations/create_users  → users table
 3. db/seeds/02_users           → admin seed user
 4. lib/db/knex.ts              → shared db connection
 5. lib/auth/session.ts         → JWT session logic
 6. lib/utils/validators.ts     → loginSchema only
 7. repositories/user           → user DB queries
 8. services/auth               → login + hashPassword
 9. components/ui/button+input  → minimal UI primitives
10. components/auth/login-form  → login form
11. app/login/page              → login page
12. app/api/auth/               → login + logout routes

── Phase 2: Application ─────────────────────────────────────────
13. types/employee+document+unit+index  → remaining data shapes
14. db/migrations/units+employees+docs  → remaining tables
15. db/seeds/01_units+03_employees      → dev seed data
16. lib/s3/                             → S3 client + operations
17. lib/utils/formatters + validators   → remaining utils
18. repositories/employee+document+unit → DB queries
19. services/employee+document+storage  → business logic
20. hooks/                              → client-side fetching
21. components/ui/ (remaining)          → UI primitives
22. components/layout+employees+docs    → feature components
23. app/(dashboard)/                    → dashboard pages
24. app/api/ (remaining)                → REST endpoints

── Phase 3: Tests ───────────────────────────────────────────────
25. tests/                      → unit → integration → e2e
```
