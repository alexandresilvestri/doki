import knexLib from 'knex'
import knexConfig from '../../knexfile'

const env = (process.env.NODE_ENV ?? 'development') as keyof typeof knexConfig
const db = knexLib(knexConfig[env])

export default db
