export interface Env {
	KV: KVNamespace
	RL_READ: RateLimit
	RL_WRITE: RateLimit
	RL_AUTH: RateLimit
	DISCORD_CLIENT_ID: string
	DISCORD_CLIENT_SECRET: string
	SESSION_KEY: string
	PUBLIC_URL: string
	INDEX_SEED?: string
	DEV_LOGIN?: string
}

export interface Session {
	u: string
	g: number
	e: number
}

export class HttpError extends Error {
	constructor(
		public status: number,
		public code: string,
	) {
		super(code)
	}
}
