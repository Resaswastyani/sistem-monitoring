import { pgTable, text, integer, doublePrecision, timestamp, boolean, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'viewer'] }).notNull().default('viewer'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const vps = pgTable('vps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  host: text('host').notNull(),
  status: text('status', { enum: ['Online', 'Degraded', 'Offline'] }).notNull().default('Online'),
  latency: integer('latency').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  broker: text('broker').notNull(),
  accountNumber: text('account_number').notNull(),
  status: text('status', { enum: ['Active', 'Paused'] }).notNull().default('Active'),
  equity: doublePrecision('equity').notNull().default(0),
  balance: doublePrecision('balance').notNull().default(0),
  pnl: doublePrecision('pnl').notNull().default(0),
  trades: integer('trades').notNull().default(0),
  winRate: doublePrecision('win_rate').notNull().default(0),
  margin: doublePrecision('margin').notNull().default(0),
  vpsId: uuid('vps_id').references(() => vps.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const robots = pgTable('robots', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  strategy: text('strategy').notNull(),
  status: text('status', { enum: ['Running', 'Paused', 'Stopped'] }).notNull().default('Stopped'),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  vpsId: uuid('vps_id').references(() => vps.id, { onDelete: 'set null' }),
  orders: integer('orders').notNull().default(0),
  execution: doublePrecision('execution').notNull().default(0),
  risk: text('risk').notNull().default('Moderate'),
  apiKey: text('api_key').unique(),
  lastSeenAt: timestamp('last_seen_at'),
  lastMessage: text('last_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  tradeRef: text('trade_ref').notNull(),
  symbol: text('symbol').notNull(),
  side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
  lots: doublePrecision('lots').notNull(),
  openPrice: doublePrecision('open_price').notNull(),
  closePrice: doublePrecision('close_price').notNull(),
  pnl: doublePrecision('pnl').notNull(),
  openedAt: timestamp('opened_at').notNull().defaultNow(),
})

export const withdrawals = pgTable('withdrawals', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  method: text('method').notNull().default('Bank transfer'),
  status: text('status', { enum: ['pending', 'completed'] }).notNull().default('pending'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
})

export const profitShareRules = pgTable('profit_share_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientName: text('recipient_name').notNull(),
  percentage: doublePrecision('percentage').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const profitShareLedger = pgTable('profit_share_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  withdrawalId: uuid('withdrawal_id').notNull().references(() => withdrawals.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => profitShareRules.id, { onDelete: 'set null' }),
  recipientName: text('recipient_name').notNull(),
  percentage: doublePrecision('percentage').notNull(),
  amount: doublePrecision('amount').notNull(),
  status: text('status', { enum: ['pending', 'paid'] }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
