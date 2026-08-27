'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Bot, Check, ChevronDown, CircleHelp, Copy, CreditCard, Download, Edit3, LayoutDashboard, LineChart, Menu, MessageCircle, MoreHorizontal, Moon, Pause, Pencil, Play, Plus, RefreshCw, Search, Send, Server, Settings, ShieldCheck, Sun, Trash2, TrendingUp, Users, Wallet, Wifi, WifiOff, X, Zap } from 'lucide-react'

type Account = { id: string; label: string; broker: string; accountNumber: string; customerName: string | null; customerPhone: string | null; status: 'Active' | 'Paused'; initialDeposit: number; equity: number; balance: number; pnl: number; trades: number; winRate: number; margin: number; vpsId: string | null }
type AppUser = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'viewer'; active?: boolean; createdAt?: string }
type Robot = { id: string; name: string; strategy: string; status: 'Running' | 'Paused' | 'Stopped'; accountId: string; vpsId: string | null; orders: number; execution: number; risk: string; apiKey: string | null; lastSeenAt: string | null; lastMessage: string | null }
type VPS = { id: string; name: string; region: string; host: string; status: 'Online' | 'Degraded' | 'Offline'; latency: number }
type Trade = { id: string; tradeRef: string; symbol: string; side: 'BUY' | 'SELL'; lots: number; openPrice: number; closePrice: number; pnl: number; source: 'robot' | 'manual'; openedAt: string }
type Withdrawal = { id: string; accountId: string; amount: number; method: string; status: 'pending' | 'completed'; createdAt: string; completedAt: string | null }
type ProfitShareRule = { id: string; recipientName: string; percentage: number; active: boolean }
type LedgerEntry = { id: string; withdrawalId: string; recipientName: string; percentage: number; amount: number }
type NotificationSettings = { gatewayUrl: string; gatewayApiKey: string; ownerPhone: string }
type EventType = 'trade_closed' | 'manual_trade' | 'withdrawal' | 'robot_status'
type NotificationRule = { id: string; eventType: EventType; active: boolean; notifyOwner: boolean; notifyClient: boolean }
const eventTypeLabels: Record<EventType, string> = { trade_closed: 'Trade selesai (robot)', manual_trade: 'Trading manual terdeteksi', withdrawal: 'Withdrawal', robot_status: 'Robot online / offline' }

const nav = [['Overview', LayoutDashboard], ['Trade History', Activity], ['Accounts', CreditCard], ['Analytics', BarChart3], ['Robot Control', Bot], ['Withdrawals', Wallet], ['VPS Management', Server]] as const
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const relativeTime = (iso: string) => {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Request failed') }
  return res.json()
}

function Stat({ label, value, change, icon: Icon, negative = false }: { label: string; value: string; change: string; icon: any; negative?: boolean }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="icon-box"><Icon /></span></div><div className="stat-value">{value}</div><div className={negative ? 'delta negative' : 'delta'}>{negative ? <ArrowDownRight /> : <ArrowUpRight />}{change}<span className="delta-caption">vs last period</span></div></div> }

function Table({ trades }: { trades: Trade[] }) {
  return <div className="trades-table"><div className="table-header"><div>Trade ID</div><div>Symbol</div><div>Type</div><div>Lots</div><div>Open</div><div>Close</div><div>P/L</div></div>{trades.map(t => <div className="table-row" key={t.id}><div>{t.tradeRef}</div><strong>{t.symbol}{t.source === 'manual' && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--dim)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', fontWeight: 400 }}>MANUAL</span>}</strong><div className={t.side === 'BUY' ? 'type-col buy' : 'type-col sell'}>{t.side}</div><div>{t.lots.toFixed(2)}</div><div>{t.openPrice.toLocaleString('en-US')}</div><div>{t.closePrice.toLocaleString('en-US')}</div><div className={t.pnl >= 0 ? 'profit-col' : 'loss-col'}>{(t.pnl >= 0 ? '+' : '-') + money(Math.abs(t.pnl))}</div></div>)}</div>
}

export default function Home() {
  const [active, setActive] = useState('Overview')
  const [dark, setDark] = useState(true)
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const [robotForm, setRobotForm] = useState(false)
  const [editingRobot, setEditingRobot] = useState<Robot | null>(null)
  const [vpsForm, setVpsForm] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [accountForm, setAccountForm] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [quickControls, setQuickControls] = useState(false)
  const [withdrawalForm, setWithdrawalForm] = useState(false)
  const [userForm, setUserForm] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)

  const [authenticated, setAuthenticated] = useState(false)
  const [showLogin, setShowLogin] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)

  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [vpsItems, setVpsItems] = useState<VPS[]>([])
  const [robots, setRobots] = useState<Robot[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [profitRules, setProfitRules] = useState<ProfitShareRule[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null)
  const [notifRules, setNotifRules] = useState<NotificationRule[]>([])
  const [gatewayStatus, setGatewayStatus] = useState<'idle' | 'checking' | 'connected' | 'disconnected'>('idle')
  const [gatewayStatusError, setGatewayStatusError] = useState('')
  const [gatewayResetting, setGatewayResetting] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [manualSendResult, setManualSendResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [manualSending, setManualSending] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.user) { setCurrentUser(data.user); setAuthenticated(true); setShowLogin(false) }
    })
  }, [])

  useEffect(() => {
    if (!authenticated) return
    Promise.all([
      api<{ accounts: Account[] }>('/api/accounts'),
      api<{ vps: VPS[] }>('/api/vps'),
      api<{ robots: Robot[] }>('/api/robots'),
      api<{ withdrawals: Withdrawal[] }>('/api/withdrawals'),
      api<{ rules: ProfitShareRule[] }>('/api/profit-share-rules'),
      api<{ ledger: LedgerEntry[] }>('/api/profit-share-ledger'),
    ]).then(([a, v, r, w, p, l]) => {
      setAccounts(a.accounts)
      setVpsItems(v.vps)
      setRobots(r.robots)
      setWithdrawals(w.withdrawals)
      setProfitRules(p.rules)
      setLedger(l.ledger)
      setAccountId(prev => prev || a.accounts[0]?.id || '')
    })
  }, [authenticated])

  useEffect(() => {
    if (!authenticated || !currentUser || currentUser.role === 'viewer') return
    api<{ users: AppUser[] }>('/api/users').then(d => setAppUsers(d.users)).catch(() => {})
    api<{ settings: NotificationSettings }>('/api/notification-settings').then(d => setNotifSettings(d.settings)).catch(() => {})
    api<{ rules: NotificationRule[] }>('/api/notification-rules').then(d => setNotifRules(d.rules)).catch(() => {})
  }, [authenticated, currentUser])

  useEffect(() => {
    if (!accountId) return
    api<{ trades: Trade[] }>(`/api/trades?accountId=${accountId}`).then(d => setTrades(d.trades)).catch(() => {})
  }, [accountId])

  const account = accounts.find(a => a.id === accountId) ?? accounts[0]
  const accountRobots = useMemo(() => robots.filter(r => r.accountId === account?.id), [robots, account?.id])
  const accountWithdrawals = useMemo(() => withdrawals.filter(w => w.accountId === account?.id), [withdrawals, account?.id])
  const ledgerByWithdrawal = useMemo(() => { const map: Record<string, LedgerEntry[]> = {}; ledger.forEach(l => { (map[l.withdrawalId] ??= []).push(l) }); return map }, [ledger])
  const dailyPnl = useMemo(() => {
    const days: { key: string; label: string; pnl: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push({ key, label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, pnl: 0 })
    }
    const byDay: Record<string, number> = {}
    trades.forEach(t => { const key = t.openedAt.slice(0, 10); byDay[key] = (byDay[key] ?? 0) + t.pnl })
    return days.map(d => ({ ...d, pnl: byDay[d.key] ?? 0 }))
  }, [trades])
  const symbolBreakdown = useMemo(() => {
    const bySymbol: Record<string, { pnl: number; count: number }> = {}
    trades.forEach(t => { const s = bySymbol[t.symbol] ??= { pnl: 0, count: 0 }; s.pnl += t.pnl; s.count++ })
    return Object.entries(bySymbol).map(([symbol, s]) => ({ symbol, ...s })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 5)
  }, [trades])
  const initials = ((currentUser?.name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || 'U').toUpperCase()
  const editingUser = appUsers.find(u => u.id === editingUserId) ?? null
  const editingAccount = accounts.find(a => a.id === editingAccountId) ?? null

  if (!authenticated && showLogin) return <main className={dark ? 'login-screen' : 'login-screen light-shell'}><section className="login-card"><div className="brand"><div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', display: 'inline-flex' }}><img src="/fbl-logo.png" alt="Forex For Better Living" style={{ height: 34, width: 'auto', display: 'block' }} /></div></div><div className="eyebrow"><span className="pulse" />LIVE MONITORING</div><h1>Welcome back</h1><p>Sign in to monitor your trading operations.</p><form onSubmit={async e => { e.preventDefault(); setLoginError(''); const form = new FormData(e.currentTarget); try { const data = await api<{ user: AppUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) }); setCurrentUser(data.user); setAuthenticated(true); setShowLogin(false) } catch { setLoginError('Email atau password salah') } }}><label>Email<input required name="email" type="email" placeholder="you@example.com" /></label><label>Password<input required name="password" type="password" placeholder="••••••••" /></label>{loginError && <p className="delta negative" style={{ marginTop: 4 }}>{loginError}</p>}<button className="primary-button" type="submit">Sign in</button></form><div className="demo-credentials"><strong>Need access?</strong><span>Ask your workspace owner</span><span>to add your account</span></div></section></main>

  if (authenticated && !account) return <main className={dark ? 'login-screen' : 'login-screen light-shell'}><p style={{ color: 'var(--foreground)' }}>Loading workspace…</p></main>

  const action = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600) }
  const go = (page: string) => { setActive(page); setMobileNav(false) }
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setAuthenticated(false); setShowLogin(true); setCurrentUser(null); setAccounts([]); setVpsItems([]); setRobots([]) }

  const savePauseResume = async (r: Robot) => {
    const status = r.status === 'Running' ? 'Paused' : 'Running'
    const { robot } = await api<{ robot: Robot }>(`/api/robots/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setRobots(rs => rs.map(x => x.id === r.id ? robot : x))
  }
  const deleteRobot = async (id: string) => { await api(`/api/robots/${id}`, { method: 'DELETE' }); setRobots(rs => rs.filter(x => x.id !== id)) }
  const copyApiKey = (key: string | null) => { if (!key) return; navigator.clipboard.writeText(key); action('API key copied') }
  const submitRobotForm = async () => {
    const name = (document.getElementById('robot-name') as HTMLInputElement).value || 'Untitled Robot'
    const strategy = (document.getElementById('robot-strategy') as HTMLSelectElement).value
    const vpsId = (document.getElementById('robot-vps') as HTMLSelectElement).value || null
    if (editingRobot) {
      const { robot } = await api<{ robot: Robot }>(`/api/robots/${editingRobot.id}`, { method: 'PATCH', body: JSON.stringify({ name, strategy, vpsId }) })
      setRobots(rs => rs.map(r => r.id === editingRobot.id ? robot : r))
    } else {
      const { robot } = await api<{ robot: Robot }>('/api/robots', { method: 'POST', body: JSON.stringify({ name, strategy, vpsId, accountId: account.id }) })
      setRobots(rs => [...rs, robot])
    }
    setRobotForm(false)
    action('Robot saved')
  }

  const removeVps = async (id: string) => { await api(`/api/vps/${id}`, { method: 'DELETE' }); setVpsItems(vs => vs.filter(x => x.id !== id)) }
  const submitVpsForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') || 'New VPS')
    const region = String(form.get('region') || 'Singapore')
    const host = String(form.get('host') || 'new-vps-01')
    const status = String(form.get('status') || 'Online') as VPS['status']
    const { vps: created } = await api<{ vps: VPS }>('/api/vps', { method: 'POST', body: JSON.stringify({ name, region, host, status }) })
    setVpsItems(items => [...items, created])
    setVpsForm(false)
    action(`${name} added`)
  }

  const deleteAccount = async (a: Account) => {
    if (!window.confirm(`Delete ${a.label}? This also removes its robots, trade history, and withdrawals.`)) return
    await api(`/api/accounts/${a.id}`, { method: 'DELETE' })
    setAccounts(as => as.filter(x => x.id !== a.id))
    setRobots(rs => rs.filter(r => r.accountId !== a.id))
    setWithdrawals(ws => ws.filter(w => w.accountId !== a.id))
    action(`${a.label} removed`)
  }

  const submitAccountForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const broker = String(form.get('broker') || '')
    const accountNumber = String(form.get('number') || '')
    const customerName = String(form.get('customerName') || '')
    const customerPhone = String(form.get('customerPhone') || '')
    const vpsId = String(form.get('vps') || '') || null
    const balance = Number(form.get('balance') || 0)
    const initialDeposit = Number(form.get('initialDeposit') || 0)
    if (editingAccountId) {
      const { account: updated } = await api<{ account: Account }>(`/api/accounts/${editingAccountId}`, { method: 'PATCH', body: JSON.stringify({ broker, accountNumber, customerName, customerPhone, vpsId, balance, initialDeposit }) })
      setAccounts(as => as.map(a => a.id === editingAccountId ? updated : a))
      action('Account updated')
    } else {
      const { account: created } = await api<{ account: Account }>('/api/accounts', { method: 'POST', body: JSON.stringify({ broker, accountNumber, customerName, customerPhone, vpsId, balance, initialDeposit }) })
      setAccounts(as => [...as, created])
      action('New account added')
    }
    setAccountForm(false)
    setEditingAccountId(null)
  }

  const completeWithdrawal = async (id: string) => {
    const { withdrawal, ledger: newLedger } = await api<{ withdrawal: Withdrawal; ledger: LedgerEntry[] }>(`/api/withdrawals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) })
    setWithdrawals(ws => ws.map(w => w.id === id ? withdrawal : w))
    setLedger(ls => [...ls, ...newLedger])
    action('Withdrawal marked completed')
  }
  const submitWithdrawalForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const amount = Number(form.get('amount') || 0)
    const method = String(form.get('method') || 'Bank transfer')
    const { withdrawal } = await api<{ withdrawal: Withdrawal }>('/api/withdrawals', { method: 'POST', body: JSON.stringify({ accountId: account.id, amount, method }) })
    setWithdrawals(ws => [withdrawal, ...ws])
    setWithdrawalForm(false)
    action('Withdrawal request created')
  }

  const submitRuleForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const recipientName = String(form.get('recipientName') || '')
    const percentage = Number(form.get('percentage') || 0)
    const { rule } = await api<{ rule: ProfitShareRule }>('/api/profit-share-rules', { method: 'POST', body: JSON.stringify({ recipientName, percentage }) })
    setProfitRules(rs => [...rs, rule])
    formEl.reset()
    action('Profit-share rule added')
  }
  const deleteRule = async (id: string) => { await api(`/api/profit-share-rules/${id}`, { method: 'DELETE' }); setProfitRules(rs => rs.filter(r => r.id !== id)) }

  const submitNotificationForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body = {
      gatewayUrl: String(form.get('gatewayUrl') || ''),
      gatewayApiKey: String(form.get('gatewayApiKey') || ''),
      ownerPhone: String(form.get('ownerPhone') || ''),
    }
    const { settings } = await api<{ settings: NotificationSettings }>('/api/notification-settings', { method: 'PATCH', body: JSON.stringify(body) })
    setNotifSettings(settings)
    action('Notification settings saved')
  }

  const updateNotifRule = async (eventType: EventType, patch: Partial<Pick<NotificationRule, 'active' | 'notifyOwner' | 'notifyClient'>>) => {
    const { rule } = await api<{ rule: NotificationRule }>('/api/notification-rules', { method: 'PATCH', body: JSON.stringify({ eventType, ...patch }) })
    setNotifRules(rs => rs.map(r => r.eventType === eventType ? rule : r))
  }

  const testGatewayConnection = async () => {
    setGatewayStatus('checking')
    setGatewayStatusError('')
    try {
      const result = await api<{ ok: boolean; connected?: boolean; error?: string }>('/api/notify/test', { method: 'POST' })
      if (result.ok && result.connected) setGatewayStatus('connected')
      else { setGatewayStatus('disconnected'); setGatewayStatusError(result.error || (result.ok ? 'WhatsApp belum terhubung di gateway' : 'Gagal') ) }
    } catch (err) {
      setGatewayStatus('disconnected')
      setGatewayStatusError(err instanceof Error ? err.message : 'Gagal menghubungi gateway')
    }
  }

  const resetGatewaySession = async () => {
    if (!confirm('Ini akan memutus sesi WhatsApp yang sedang aktif dan meminta scan QR baru. Lanjutkan?')) return
    setGatewayResetting(true)
    try {
      const result = await api<{ ok: boolean; error?: string }>('/api/notify/reset', { method: 'POST' })
      if (result.ok) { action('Sesi WhatsApp direset — scan QR baru untuk sambungkan lagi'); setShowQr(true) }
      else action(`Reset gagal: ${result.error || 'unknown error'}`)
    } catch (err) {
      action(`Reset gagal: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setGatewayResetting(false)
    }
  }

  const applyMessageTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => fillMessageTemplate(e.target.form)
  const fillMessageTemplate = (form: HTMLFormElement | null | undefined) => {
    const type = ((form?.elements.namedItem('type') as HTMLSelectElement | null)?.value ?? 'manual') as EventType | 'manual'
    const textarea = form?.elements.namedItem('message') as HTMLTextAreaElement | null
    if (!textarea || type === 'manual') return
    const targetVal = (form?.elements.namedItem('target') as HTMLSelectElement | null)?.value
    const acc = accounts.find(a => a.id === targetVal)
    const accRobots = acc ? robots.filter(r => r.accountId === acc.id) : []
    const robotText = accRobots.length ? accRobots.map(r => `${r.name}: ${r.status === 'Running' ? 'ON' : 'OFF'}`).join(', ') : '-'
    const lastWithdrawal = acc ? withdrawals.filter(w => w.accountId === acc.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined
    const withdrawalText = !lastWithdrawal ? 'Tidak ada' : lastWithdrawal.status === 'completed' ? `Sudah selesai (${money(lastWithdrawal.amount)})` : `Pending (${money(lastWithdrawal.amount)})`

    const bodies: Record<EventType, string> = {
      trade_closed: '✅ Update trade\n[Symbol] [BUY/SELL] [lot] lot\nP/L: [isi P/L]',
      manual_trade: '⚠️ Konfirmasi: apakah Anda baru saja melakukan trading manual di akun ini?',
      withdrawal: acc ? `🏧 Update withdrawal\n${withdrawalText}` : '🏧 Update withdrawal\nJumlah: [isi jumlah]\nStatus: [isi status]',
      robot_status: acc ? `🤖 Update status robot\n${robotText}` : '🤖 Update status robot\nRobot: [isi nama robot]\nStatus: [Online/Offline]',
    }

    const ctx = acc
      ? `\n\nKlien: ${acc.customerName ?? '-'}\nAkun: ${acc.label} (${acc.accountNumber})\nDeposito: ${money(acc.initialDeposit)}\nBalance: ${money(acc.balance)}\nRobot: ${robotText}\nWithdrawal: ${withdrawalText}`
      : ''
    textarea.value = bodies[type] + ctx
  }

  const submitManualSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setManualSendResult(null)
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const target = String(form.get('target') || '')
    const message = String(form.get('message') || '')
    if (target === 'owner' && !notifSettings?.ownerPhone) {
      setManualSendResult({ ok: false, error: 'Nomor WA owner belum diisi di atas.' })
      return
    }
    setManualSending(true)
    const body = target === 'owner' ? { phone: notifSettings?.ownerPhone, message } : { accountId: target, message }
    try {
      await api('/api/notify/send', { method: 'POST', body: JSON.stringify(body) })
      setManualSendResult({ ok: true })
      formEl.reset()
    } catch (err) {
      setManualSendResult({ ok: false, error: err instanceof Error ? err.message : 'Gagal mengirim' })
    } finally {
      setManualSending(false)
    }
  }

  const submitUserForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') || '')
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')
    const role = String(form.get('role') || 'viewer') as AppUser['role']
    if (editingUserId) {
      const body: Record<string, unknown> = { role }
      if (password) body.password = password
      const { user } = await api<{ user: AppUser }>(`/api/users/${editingUserId}`, { method: 'PATCH', body: JSON.stringify(body) })
      setAppUsers(us => us.map(u => u.id === editingUserId ? user : u))
    } else {
      const { user } = await api<{ user: AppUser }>('/api/users', { method: 'POST', body: JSON.stringify({ name, email, password, role }) })
      setAppUsers(us => [...us, user])
    }
    setUserForm(false)
    setEditingUserId(null)
    action('User saved')
  }
  const deleteUser = async (id: string) => { await api(`/api/users/${id}`, { method: 'DELETE' }); setAppUsers(us => us.filter(u => u.id !== id)) }

  const header = (title: string, subtitle: string) => <div className="page-head"><div><div className="eyebrow"><span className="pulse" />LIVE MONITORING</div><h1>{title}</h1><p>{subtitle}</p></div><div className="head-actions"><button className="outline-button" onClick={() => action('Report exported for ' + account.label)}><Download />Export report</button><button className="primary-button" onClick={() => setQuickControls(true)}><Zap />Quick controls</button></div></div>
  const accountBar = <div className="account-monitor-bar"><div><span className="account-icon">$</span><div><small>MONITORING ACCOUNT</small><strong>{account.label}</strong></div></div><select value={accountId} onChange={e => setAccountId(e.target.value)} aria-label="Select monitoring account">{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select><span className={`status ${account.status === 'Active' ? 'active' : 'paused'}`}>{account.status}</span></div>

  const dailyTotal = dailyPnl.reduce((s, d) => s + d.pnl, 0)
  const dailyMax = Math.max(1, ...dailyPnl.map(d => Math.abs(d.pnl)))
  const symbolMax = Math.max(1, ...symbolBreakdown.map(s => Math.abs(s.pnl)))
  const overview = <>
    <div className="stats-grid"><Stat label="Total equity" value={money(account.equity)} change="+12.84%" icon={TrendingUp} /><Stat label="Balance" value={money(account.balance)} change={'+' + money(account.pnl)} icon={Wallet} /><Stat label="Floating P/L" value={(account.pnl >= 0 ? '+' : '') + money(account.pnl)} change="+2.86%" icon={Activity} /><Stat label="Margin level" value={`${account.margin}%`} change="+18.4%" icon={ShieldCheck} /><Stat label="Win rate" value={`${account.winRate}%`} change="+4.2%" icon={BarChart3} /><Stat label="Total trades" value={String(account.trades)} change="+32" icon={LineChart} /><Stat label="Max drawdown" value="-4.72%" change="-1.2%" icon={AlertTriangle} negative /></div>
    <div className="dashboard-grid">
      <section className="panel equity-panel"><div className="panel-head"><div><h2>Equity performance</h2><p>Portfolio value over time</p></div><MoreHorizontal /></div><div className="equity-legend"><span><i className="legend-line" />Equity <b>{money(account.equity)}</b></span><span><i className="legend-dash" />Balance <b>{money(account.balance)}</b></span></div><div className="chart-wrap"><div className="y-axis"><span>$50k</span><span>$40k</span><span>$30k</span><span>$20k</span></div><svg className="equity-chart" viewBox="0 0 700 220" preserveAspectRatio="none"><path d="M0 190 C80 160 110 175 170 125 S260 105 330 85 S410 105 470 55 S570 80 700 20 V220 H0Z" fill="color-mix(in srgb, var(--primary) 20%, transparent)" /><path d="M0 190 C80 160 110 175 170 125 S260 105 330 85 S410 105 470 55 S570 80 700 20" fill="none" stroke="var(--primary)" strokeWidth="3" /></svg></div></section>
      <section className="panel"><div className="panel-head"><div><h2>Daily P/L</h2><p>Last 14 trading days</p></div><MoreHorizontal /></div><div className="daily-total">{(dailyTotal >= 0 ? '+' : '-') + money(Math.abs(dailyTotal))}<span>{account.balance > 0 ? `${(dailyTotal / account.balance * 100).toFixed(2)}%` : ''}</span></div><div className="daily-bars">{dailyPnl.map(d => <div className="daily-bar-col" key={d.key}><div className={d.pnl < 0 ? 'daily-bar loss' : 'daily-bar'} style={{ height: `${Math.max(4, Math.abs(d.pnl) / dailyMax * 100)}%` }} /></div>)}</div><div className="daily-bar-labels">{dailyPnl.filter((_, i) => i % 3 === 0).map(d => <span key={d.key}>{d.label}</span>)}</div></section>
    </div>
    <div className="lower-grid">
      <section className="panel"><div className="panel-head"><div><h2>Symbol breakdown</h2><p>Performance by instrument</p></div><button className="text-button" onClick={() => go('Analytics')}>View analytics<ArrowUpRight /></button></div>{symbolBreakdown.length === 0 ? <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 12 }}>Belum ada trade tercatat untuk {account.label}.</p> : <div className="symbol-list">{symbolBreakdown.map(s => <div className="symbol-breakdown-row" key={s.symbol}><span className="symbol-logo">{s.symbol.slice(0, 1)}</span><div className="symbol-name"><b>{s.symbol}</b><small>{s.count} trade{s.count > 1 ? 's' : ''}</small></div><div className="symbol-bar"><span style={{ width: `${Math.round(Math.abs(s.pnl) / symbolMax * 100)}%`, background: s.pnl >= 0 ? 'var(--primary)' : 'var(--danger)' }} /></div><strong className={s.pnl >= 0 ? 'profit-col' : 'loss-col'}>{(s.pnl >= 0 ? '+' : '-') + money(Math.abs(s.pnl))}</strong></div>)}</div>}</section>
      <section className="panel"><div className="panel-head"><div><h2>Connected accounts</h2><p>{accounts.length} account{accounts.length !== 1 ? 's' : ''} · {vpsItems.length} VPS</p></div><MoreHorizontal /></div>{accounts.slice(0, 3).map(a => { const drawdownPct = a.balance > 0 ? Math.max(0, (a.balance - a.equity) / a.balance * 100) : 0; const marginBarPct = Math.min(100, a.margin); return <div className="mini-account-card" key={a.id}><div className="account-card-head"><span className="broker-mark">{a.broker.slice(0, 1)}</span><div><b>{a.label}</b><small><span className="online-dot" />{a.status === 'Active' ? 'Online' : 'Paused'} · {vpsItems.find(v => v.id === a.vpsId)?.name ?? 'No VPS'}</small></div><strong className="account-profit" style={{ color: a.pnl >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{(a.pnl >= 0 ? '+' : '-') + money(Math.abs(a.pnl))}</strong></div><div className="account-metrics"><span>Equity<b>{money(a.equity)}</b></span><span>Drawdown<b>{drawdownPct.toFixed(2)}%</b></span><span>Margin<b>{a.margin}%</b></span></div><div className="progress"><span style={{ width: `${marginBarPct}%` }} /></div></div> })}{accounts.length > 3 && <button className="text-button" onClick={() => go('Accounts')}>View all accounts<ArrowUpRight /></button>}</section>
    </div>
    <section className="panel"><div className="panel-head"><div><h2>Recent trades</h2><p>Latest trading activity for {account.label}</p></div></div><Table trades={trades} /></section>
  </>

  const accountsPage = <section className="panel data-page"><div className="panel-head"><div><h2>Connected accounts</h2><p>Choose an account to monitor its robots, VPS, trades, and risk.</p></div><button className="primary-button" onClick={() => { setEditingAccountId(null); setAccountForm(true) }}><Plus />Add account</button></div><div className="account-cards">{accounts.map(a => <article className={`account-card ${a.id === account.id ? 'selected-account' : ''}`} key={a.id}><div className="account-card-head"><div className="account-title"><span className="broker-mark">{a.broker.slice(0, 1)}</span><div><b>{a.label}</b><small>{a.broker} · VPS {vpsItems.find(v => v.id === a.vpsId)?.name ?? '—'}{a.customerName ? ` · ${a.customerName}` : ''}</small></div></div><span className={`status ${a.status === 'Active' ? 'active' : 'paused'}`}>{a.status}</span></div><div className="account-card-body"><div><span>Equity</span><b>{money(a.equity)}</b></div><div><span>Balance</span><b>{money(a.balance)}</b></div><div><span>P/L</span><b className={a.pnl >= 0 ? 'profit-col' : 'loss-col'}>{(a.pnl >= 0 ? '+' : '') + money(a.pnl)}</b></div><div><span>Win rate</span><b>{a.winRate}%</b></div></div><div className="account-card-foot"><small>{a.trades} trades · {a.margin}% margin</small><div style={{ display: 'flex', gap: 8 }}><button className="icon-button" aria-label={`Edit ${a.label}`} onClick={() => { setEditingAccountId(a.id); setAccountForm(true) }}><Pencil /></button><button className="icon-button danger-button" aria-label={`Delete ${a.label}`} onClick={() => deleteAccount(a)}><Trash2 /></button><button className="outline-button" onClick={() => { setAccountId(a.id); setActive('Overview'); action(`Monitoring ${a.label}`) }}>Monitor account</button></div></div></article>)}</div></section>

  const robotPage = <section className="robot-page"><div className="section-toolbar"><div><h2>Robot control</h2><p>Manage automation for {account.label}</p><small style={{ color: 'var(--dim)', display: 'block', overflowWrap: 'anywhere' }}>Dashboard API URL for EA setup: <code>{typeof window !== 'undefined' ? window.location.origin : ''}/api/agent/report</code></small></div><button className="primary-button" onClick={() => { setEditingRobot(null); setRobotForm(true) }}><Plus />Create robot</button></div><div className="robot-list">{accountRobots.map(r => <article className="robot-card" key={r.id}><div className="robot-main"><span className="robot-icon"><Bot /></span><div><h3>{r.name}</h3><p>{r.strategy} · {vpsItems.find(v => v.id === r.vpsId)?.name ?? '—'}</p><span className={`robot-status ${r.status.toLowerCase()}`}>{r.status}</span></div></div><div className="robot-metrics"><div><span>Orders today</span><b>{r.orders}</b></div><div><span>Execution rate</span><b>{r.execution}%</b></div><div><span>Risk mode</span><b>{r.risk}</b></div></div><div className="robot-actions"><button className="outline-button" onClick={() => savePauseResume(r)}>{r.status === 'Running' ? <Pause /> : <Play />}{r.status === 'Running' ? 'Pause' : 'Resume'}</button><button className="icon-button" aria-label="Edit robot" onClick={() => { setEditingRobot(r); setRobotForm(true) }}><Pencil /></button><button className="icon-button danger-button" aria-label="Delete robot" onClick={() => deleteRobot(r.id)}><Trash2 /></button></div><div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}><small style={{ color: 'var(--dim)' }}>{r.lastSeenAt ? `EA last report: ${relativeTime(r.lastSeenAt)}` : 'EA belum pernah terhubung ke dashboard'}</small>{r.lastMessage && <small style={{ color: 'var(--dim)' }}>{r.lastMessage}</small>}<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><small style={{ color: 'var(--dim)' }}>API key</small><code style={{ fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{r.apiKey}</code><button className="icon-button" aria-label="Copy API key" onClick={() => copyApiKey(r.apiKey)}><Copy /></button></div></div></article>)}</div><div className="vps-section"><div className="section-toolbar"><div><h2>VPS management</h2><p>Separate execution infrastructure for each broker account.</p></div><button className="outline-button" onClick={() => setVpsForm(true)}><Server />Add VPS</button></div><div className="vps-grid">{vpsItems.map(v => <article className="vps-card" key={v.id}><div className="vps-card-head"><span className="vps-icon"><Server /></span><span className={`status ${v.status === 'Online' ? 'active' : 'paused'}`}>{v.status}</span></div><h3>{v.name}</h3><p>{v.host} · {v.region}</p><div className="vps-meta"><span>{accounts.filter(a => a.vpsId === v.id).length} account</span><span>{v.latency}ms latency</span></div><div className="vps-actions"><button onClick={() => action(`Opened ${v.name}`)}><Edit3 />Manage</button><button onClick={() => removeVps(v.id)}><Trash2 />Remove</button></div></article>)}</div></div>{robotForm && <div className="modal-backdrop"><div className="modal-card"><div className="panel-head"><div><h2>{editingRobot ? 'Edit robot' : 'Create robot'}</h2><p>Configure the robot for the selected account.</p></div><button className="icon-button" onClick={() => setRobotForm(false)}><X /></button></div><label>Robot name<input defaultValue={editingRobot?.name ?? ''} id="robot-name" placeholder="e.g. New York Scalper" /></label><label>Strategy<select defaultValue={editingRobot?.strategy ?? 'Momentum v2.4'} id="robot-strategy"><option>Momentum v2.4</option><option>Breakout v1.8</option><option>Mean Reversion v3.1</option></select></label><label>VPS<select defaultValue={editingRobot?.vpsId ?? vpsItems[0]?.id ?? ''} id="robot-vps">{vpsItems.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><div className="modal-actions"><button className="outline-button" onClick={() => setRobotForm(false)}>Cancel</button><button className="primary-button" onClick={submitRobotForm}><Check />Save robot</button></div></div></div>}</section>

  const vpsPage = <section className="panel data-page"><div className="panel-head"><div><h2>VPS management</h2><p>Monitor every execution server and the robots running on it.</p></div><button className="primary-button" onClick={() => { setVpsForm(true); action('VPS form opened') }}><Plus />Add VPS</button></div><div className="vps-overview-grid"><div className="metric-card"><span>Total VPS</span><strong>{vpsItems.length}</strong><small>Across all regions</small></div><div className="metric-card"><span>Online</span><strong>{vpsItems.filter(v => v.status === 'Online').length}</strong><small>Healthy heartbeats</small></div><div className="metric-card"><span>Assigned robots</span><strong>{robots.length}</strong><small>Mapped to accounts</small></div><div className="metric-card"><span>Avg latency</span><strong>{vpsItems.length ? Math.round(vpsItems.reduce((sum, v) => sum + v.latency, 0) / vpsItems.length) : 0}ms</strong><small>Current reading</small></div></div><div className="vps-management-grid">{vpsItems.map(v => <article className="vps-management-card" key={v.id}><div className="vps-card-head"><div className="vps-card-title"><span className="vps-icon"><Server /></span><div><h3>{v.name}</h3><p>{v.region} · {v.host}</p></div></div><span className={`status ${v.status === 'Online' ? 'active' : 'paused'}`}>{v.status}</span></div><div className="vps-health"><div><span>Latency</span><strong>{v.latency}ms</strong></div><div><span>Accounts</span><strong>{accounts.filter(a => a.vpsId === v.id).length}</strong></div><div><span>Robots</span><strong>{robots.filter(r => r.vpsId === v.id).length}</strong></div></div><div className="vps-assignments"><span>Assigned accounts</span>{accounts.filter(a => a.vpsId === v.id).map(a => <b key={a.id}>{a.label}</b>)}{robots.filter(r => r.vpsId === v.id).map(r => <small key={r.id}>{r.name} · {r.status}</small>)}</div><div className="vps-card-actions"><button className="outline-button" onClick={() => action(`${v.name} restarted`)}><Zap />Restart</button><button className="icon-button" aria-label={`Edit ${v.name}`} onClick={() => setVpsForm(true)}><Pencil /></button><button className="icon-button danger-button" aria-label={`Remove ${v.name}`} onClick={() => removeVps(v.id)}><Trash2 /></button></div></article>)}</div></section>

  const usersPage = <section className="panel data-page"><div className="panel-head"><div><h2>User management</h2><p>Control who can sign in to this workspace.</p></div><button className="primary-button" onClick={() => { setEditingUserId(null); setUserForm(true) }}><Plus />Add user</button></div><div className="account-cards">{appUsers.map(u => <article className="account-card" key={u.id}><div className="account-card-head"><div className="account-title"><span className="broker-mark">{u.name.slice(0, 1)}</span><div><b>{u.name}</b><small>{u.email}</small></div></div><span className={`status ${u.active ? 'active' : 'paused'}`}>{u.active ? 'Active' : 'Inactive'}</span></div><div className="account-card-body"><div><span>Role</span><b>{u.role}</b></div></div><div className="account-card-foot"><small>{u.createdAt ? `Added ${new Date(u.createdAt).toLocaleDateString()}` : ''}</small><div style={{ display: 'flex', gap: 8 }}><button className="outline-button" onClick={() => { setEditingUserId(u.id); setUserForm(true) }}><Pencil />Edit</button>{u.id !== currentUser?.id && <button className="icon-button danger-button" aria-label="Delete user" onClick={() => deleteUser(u.id)}><Trash2 /></button>}</div></div></article>)}</div>{userForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="user-form-title"><div className="modal-head"><div><div className="eyebrow"><Users /> USER MANAGEMENT</div><h2 id="user-form-title">{editingUserId ? 'Edit user' : 'Add user'}</h2><p>Control who can log in to this workspace.</p></div><button className="icon-button" aria-label="Close user form" onClick={() => setUserForm(false)}><X /></button></div><form className="vps-form" onSubmit={submitUserForm}><div className="vps-form-grid"><label>Name<input name="name" required={!editingUserId} disabled={!!editingUserId} defaultValue={editingUser?.name ?? ''} placeholder="Full name" /></label><label>Email<input name="email" required={!editingUserId} disabled={!!editingUserId} type="email" defaultValue={editingUser?.email ?? ''} placeholder="name@example.com" /></label><label>{editingUserId ? 'New password (optional)' : 'Password'}<input name="password" type="password" required={!editingUserId} placeholder="min. 8 characters" /></label><label>Role<select name="role" defaultValue={editingUser?.role ?? 'viewer'}><option value="viewer">Viewer</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label></div><div className="vps-form-actions"><button type="button" className="outline-button" onClick={() => setUserForm(false)}>Cancel</button><button type="submit" className="primary-button"><Check />{editingUserId ? 'Save changes' : 'Add user'}</button></div></form></section></div>}</section>

  const isAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin'

  const whatsappPage = <>
    <section className="panel"><div className="panel-head"><div><h2>WhatsApp gateway</h2><p>Baileys self-hosted — URL &amp; API key dari gateway yang Anda jalankan sendiri.</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{gatewayStatus !== 'idle' && <span className={`gateway-status ${gatewayStatus}`}>{gatewayStatus === 'checking' ? 'Checking…' : gatewayStatus === 'connected' ? <><Wifi />Connected</> : <><WifiOff />{gatewayStatusError || 'Disconnected'}</>}</span>}<button type="button" className="outline-button" onClick={testGatewayConnection} disabled={gatewayStatus === 'checking'}><Wifi />{gatewayStatus === 'checking' ? 'Testing…' : 'Test connection'}</button>{notifSettings?.gatewayUrl && <button type="button" className="outline-button" onClick={() => setShowQr(v => !v)}>{showQr ? 'Sembunyikan QR' : 'Scan QR'}</button>}{notifSettings?.gatewayUrl && <button type="button" className="outline-button" onClick={resetGatewaySession} disabled={gatewayResetting}><RefreshCw />{gatewayResetting ? 'Mereset…' : 'Reset session'}</button>}</div></div>{showQr && notifSettings?.gatewayUrl && <iframe src={`${notifSettings.gatewayUrl.replace(/\/$/, '')}/qr`} title="WhatsApp QR code" style={{ width: '100%', height: 420, border: '1px solid var(--border)', borderRadius: 11, background: '#fff', marginBottom: 16 }} />}<form key={notifSettings ? 'loaded' : 'loading'} className="vps-form" onSubmit={submitNotificationForm}><div className="vps-form-grid"><label>Gateway URL<input name="gatewayUrl" defaultValue={notifSettings?.gatewayUrl ?? ''} placeholder="https://your-gateway.example.com" /></label><label>Gateway API key<input name="gatewayApiKey" defaultValue={notifSettings?.gatewayApiKey ?? ''} placeholder="secret key" /></label><label>Nomor WA owner<input name="ownerPhone" defaultValue={notifSettings?.ownerPhone ?? ''} placeholder="6281234567890" /></label></div><div className="vps-form-actions"><button type="submit" className="primary-button"><Check />Save gateway settings</button></div></form></section>

    <section className="panel" style={{ marginTop: 16 }}><div className="panel-head"><div><h2>Notification rules</h2><p>Pilih siapa yang menerima WA untuk tiap jenis kejadian.</p></div></div><div style={{ marginTop: 16 }}>{notifRules.map(r => <div className="notify-rule-card" key={r.eventType}><div className="notify-rule-row"><div className="rule-name"><b>{eventTypeLabels[r.eventType]}</b></div><label className="toggle-col rule-active"><span className="toggle"><input type="checkbox" checked={r.active} onChange={e => updateNotifRule(r.eventType, { active: e.target.checked })} /><span className="slider" /></span><span>Aktif</span></label><label className="toggle-col"><span className="toggle"><input type="checkbox" checked={r.notifyOwner} onChange={e => updateNotifRule(r.eventType, { notifyOwner: e.target.checked })} /><span className="slider" /></span><span>Notify owner</span></label><label className="toggle-col"><span className="toggle"><input type="checkbox" checked={r.notifyClient} onChange={e => updateNotifRule(r.eventType, { notifyClient: e.target.checked })} /><span className="slider" /></span><span>Notify client</span></label></div></div>)}</div></section>

    <section className="panel" style={{ marginTop: 16 }}><div className="panel-head"><div><h2>Kirim pesan manual</h2><p>Kirim WA langsung ke owner atau customer tertentu, di luar notifikasi otomatis.</p></div></div><form className="vps-form" onSubmit={submitManualSend}><label>Kirim ke<select name="target" required defaultValue="" onChange={e => fillMessageTemplate(e.target.form)}><option value="" disabled>Pilih penerima</option><option value="owner">Owner (nomor sendiri)</option>{accounts.filter(a => a.customerPhone).map(a => <option key={a.id} value={a.id}>{a.customerName ?? a.label} — {a.label}</option>)}</select></label><label>Jenis pesan<select name="type" defaultValue="manual" onChange={applyMessageTemplate}><option value="manual">Pesan manual (bebas)</option><option value="trade_closed">Notifikasi: {eventTypeLabels.trade_closed}</option><option value="manual_trade">Notifikasi: {eventTypeLabels.manual_trade}</option><option value="withdrawal">Notifikasi: {eventTypeLabels.withdrawal}</option><option value="robot_status">Notifikasi: {eventTypeLabels.robot_status}</option></select><span style={{ display: 'block', fontSize: 11, color: 'var(--dim)', fontWeight: 400, marginTop: 4 }}>Pilih template notifikasi untuk mengisi pesan otomatis, atau tetap di "Pesan manual" untuk menulis bebas.</span></label><label>Pesan<textarea name="message" required className="wa-textarea" placeholder="Tulis pesan..." /></label><div className="vps-form-actions"><button type="submit" className="primary-button" disabled={manualSending}><Send />{manualSending ? 'Mengirim…' : 'Kirim'}</button></div>{manualSendResult && <div className={`manual-send-result ${manualSendResult.ok ? 'ok' : 'error'}`}>{manualSendResult.ok ? 'Pesan berhasil dikirim.' : `Gagal: ${manualSendResult.error}`}</div>}</form></section>
  </>

  const page = active === 'Overview' ? overview
    : active === 'Accounts' ? accountsPage
    : active === 'Robot Control' ? robotPage
    : active === 'VPS Management' ? vpsPage
    : active === 'Users' ? usersPage
    : active === 'Trade History' ? <section className="panel data-page"><div className="panel-head"><div><h2>Trade history</h2><p>{trades.length} recorded trades for {account.label}</p></div></div><Table trades={trades} /></section>
    : active === 'Analytics' ? <section className="panel data-page"><div className="panel-head"><div><h2>Analytics</h2><p>Performance metrics for {account.label}</p></div></div><div className="analytics-grid"><div className="metric-card"><span>Net profit</span><strong>{(account.pnl >= 0 ? '+' : '') + money(account.pnl * 3.7)}</strong><small>+12.84% vs previous period</small></div><div className="metric-card"><span>Profit factor</span><strong>1.84</strong><small>Healthy strategy performance</small></div><div className="metric-card"><span>Avg. win</span><strong>{(account.pnl >= 0 ? '+' : '') + money(account.pnl / 8)}</strong><small>{account.winRate}% win rate</small></div></div><div className="analytics-bars"><h3>Monthly P/L</h3>{[42, 58, 48, 70, 65, 84, 74, 96].map((n, i) => <div className="bar-column" key={i}><div className="bar" style={{ height: `${n}%` }} /><small>W{i + 1}</small></div>)}</div></section>
    : active === 'Withdrawals' ? <section className="panel data-page"><div className="panel-head"><div><h2>Withdrawals</h2><p>Withdrawal activity for {account.label}</p></div><button className="primary-button" onClick={() => setWithdrawalForm(true)}><Plus />Request withdrawal</button></div><div className="withdrawal-summary"><div><span>Available</span><strong>{money(account.balance)}</strong></div><div><span>Pending</span><strong>{money(accountWithdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0))}</strong></div><div><span>Completed this month</span><strong>{money(accountWithdrawals.filter(w => w.status === 'completed' && w.completedAt && new Date(w.completedAt).getMonth() === new Date().getMonth()).reduce((s, w) => s + w.amount, 0))}</strong></div></div>{accountWithdrawals.map(w => <div key={w.id}><div className="withdrawal-row"><span>{'WD-' + w.id.slice(0, 6).toUpperCase()}</span><span>{w.method}</span><span onClick={() => w.status === 'pending' && completeWithdrawal(w.id)} style={w.status === 'pending' ? { cursor: 'pointer', textDecoration: 'underline' } : undefined} title={w.status === 'pending' ? 'Click to mark as completed' : undefined}>{w.status === 'pending' ? 'Pending' : 'Completed'}</span><b>{money(w.amount)}</b></div>{ledgerByWithdrawal[w.id]?.length ? <small style={{ display: 'block', color: 'var(--dim)', padding: '0 0 14px' }}>Split: {ledgerByWithdrawal[w.id].map(l => `${l.recipientName} ${money(l.amount)} (${l.percentage}%)`).join(' · ')}</small> : null}</div>)}{withdrawalForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="withdrawal-form-title"><div className="modal-head"><div><div className="eyebrow"><Wallet /> WITHDRAWALS</div><h2 id="withdrawal-form-title">Request withdrawal</h2><p>Withdraw from {account.label}.</p></div><button className="icon-button" aria-label="Close withdrawal form" onClick={() => setWithdrawalForm(false)}><X /></button></div><form className="vps-form" onSubmit={submitWithdrawalForm}><div className="vps-form-grid"><label>Amount<input name="amount" required type="number" min="0" step="0.01" placeholder="500" /></label><label>Method<select name="method" defaultValue="Bank transfer"><option>Bank transfer</option><option>Crypto</option><option>Card</option></select></label></div><div className="vps-form-actions"><button type="button" className="outline-button" onClick={() => setWithdrawalForm(false)}>Cancel</button><button type="submit" className="primary-button"><Plus />Request withdrawal</button></div></form></section></div>}</section>
    : active === 'Alerts' ? <section className="panel data-page"><div className="panel-head"><div><h2>Alerts & notifications</h2><p>Account health alerts for {account.label}</p></div><button className="outline-button" onClick={() => action('All alerts marked read')}><Check />Mark all read</button></div><div className="alert-list">{['High margin usage', 'Daily profit target reached', 'Robot execution recovered'].map((x, i) => <div className="alert-item" key={x}><Bell /><div><b>{x}</b><p>{i === 0 ? 'Margin usage is above 75%. Consider reducing positions.' : i === 1 ? "Today's profit target has been reached." : 'Execution rate returned above 95%.'}</p><small>{i + 1} hour ago</small></div><button onClick={() => action('Alert dismissed')}>Dismiss</button></div>)}</div></section>
    : active === 'WhatsApp' ? whatsappPage
    : <section className="panel data-page"><div className="panel-head"><div><h2>Settings</h2><p>Workspace and monitoring preferences</p></div></div><div className="settings-form"><label>Workspace name<input defaultValue="Personal Fund" /></label><label>Default account<select value={accountId} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label><label className="switch-row"><span>Auto-pause on risk threshold</span><input type="checkbox" defaultChecked /></label><button className="primary-button" onClick={() => action('Settings saved')}><Check />Save settings</button>{isAdmin && <><label style={{ marginTop: 8 }}>Profit-sharing rules<span style={{ display: 'block', fontSize: 11, color: 'var(--dim)', fontWeight: 400 }}>Auto-calculated whenever a withdrawal is marked completed.</span></label>{profitRules.map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span>{r.recipientName}</span><b>{r.percentage}%</b><button className="icon-button danger-button" aria-label="Remove rule" onClick={() => deleteRule(r.id)}><Trash2 /></button></div>)}<form className="vps-form-grid" onSubmit={submitRuleForm}><label>Recipient<input name="recipientName" required placeholder="Partner name" /></label><label>Percentage<input name="percentage" required type="number" min="0" max="100" step="0.1" placeholder="20" /></label><button type="submit" className="outline-button" style={{ alignSelf: 'end' }}><Plus />Add rule</button></form></>}</div></section>

  return <div className={dark ? 'app-shell' : 'app-shell light-shell'}>
    {accountForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-account-title"><div className="modal-head"><div><div className="eyebrow"><CreditCard /> ACCOUNT MANAGEMENT</div><h2 id="add-account-title">{editingAccountId ? 'Edit trading account' : 'Add trading account'}</h2><p>Connect an account and assign its execution VPS.</p></div><button className="icon-button" aria-label="Close account form" onClick={() => { setAccountForm(false); setEditingAccountId(null) }}><X /></button></div><form className="vps-form" onSubmit={submitAccountForm}><div className="vps-form-grid"><label>Broker<input required name="broker" defaultValue={editingAccount?.broker ?? ''} placeholder="Broker name" /></label><label>Account number<input required name="number" defaultValue={editingAccount?.accountNumber ?? ''} placeholder="12345678" /></label><label>Customer name<input name="customerName" defaultValue={editingAccount?.customerName ?? ''} placeholder="Client's full name" /></label><label>Customer WhatsApp<input name="customerPhone" defaultValue={editingAccount?.customerPhone ?? ''} placeholder="628123456789" /></label><label>VPS assignment<select name="vps" defaultValue={editingAccount?.vpsId ?? vpsItems[0]?.id}>{vpsItems.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Deposito awal<input name="initialDeposit" type="number" defaultValue={editingAccount?.initialDeposit ?? 25000} placeholder="10000" /></label><label>{editingAccountId ? 'Balance' : 'Initial balance'}<input required name="balance" type="number" defaultValue={editingAccount?.balance ?? 25000} /></label></div><div className="vps-form-actions"><button type="button" className="outline-button" onClick={() => { setAccountForm(false); setEditingAccountId(null) }}>Cancel</button><button type="submit" className="primary-button"><Check />{editingAccountId ? 'Save changes' : 'Add account'}</button></div></form></section></div>}
    {quickControls && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="quick-controls-title"><div className="modal-head"><div><div className="eyebrow"><Zap /> QUICK CONTROLS</div><h2 id="quick-controls-title">Operations control center</h2><p>Apply actions to {account.label}.</p></div><button className="icon-button" aria-label="Close quick controls" onClick={() => setQuickControls(false)}><X /></button></div><div className="quick-control-grid"><button className="quick-control" onClick={() => { setQuickControls(false); action(`${account.label} robot paused`) }}><Pause /><strong>Pause robot</strong><span>Stop new orders safely</span></button><button className="quick-control" onClick={() => { setQuickControls(false); action(`${account.label} robot resumed`) }}><Play /><strong>Resume robot</strong><span>Allow new orders again</span></button><button className="quick-control" onClick={() => { setQuickControls(false); action(`${account.label} VPS restarted`) }}><Server /><strong>Restart VPS</strong><span>Reconnect execution host</span></button><button className="quick-control" onClick={() => { setQuickControls(false); action(`${account.label} risk mode set to conservative`) }}><ShieldCheck /><strong>Safe mode</strong><span>Lower risk for this account</span></button></div></section></div>}
    {vpsForm && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-vps-title"><div className="modal-head"><div><div className="eyebrow"><Server /> VPS MANAGEMENT</div><h2 id="add-vps-title">Add VPS server</h2><p>Register an execution server and monitor it from one place.</p></div><button className="icon-button" aria-label="Close VPS form" onClick={() => setVpsForm(false)}><X /></button></div><form className="vps-form" onSubmit={submitVpsForm}><div className="vps-form-grid"><label>Server name<input name="name" required placeholder="Tokyo Execution" /></label><label>Region<select name="region" defaultValue="Singapore"><option>Singapore</option><option>London</option><option>New York</option><option>Tokyo</option><option>Frankfurt</option></select></label><label>Host name<input name="host" required placeholder="tokyo-prod-01" /></label><label>Initial status<select name="status" defaultValue="Online"><option>Online</option><option>Degraded</option></select></label></div><div className="vps-form-actions"><button type="button" className="outline-button" onClick={() => setVpsForm(false)}>Cancel</button><button type="submit" className="primary-button"><Plus />Add VPS</button></div></form></section></div>}
    <aside className={mobileNav ? 'sidebar mobile-open' : 'sidebar'}><div className="brand"><div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', display: 'inline-flex' }}><img src="/fbl-logo.png" alt="Forex For Better Living" style={{ height: 28, width: 'auto', display: 'block' }} /></div><button className="close-nav" onClick={() => setMobileNav(false)}><X /></button></div><div className="workspace"><div className="workspace-dot" /><div><small>WORKSPACE</small><b>Personal Fund</b></div><ChevronDown /></div><div className="nav-label">Monitor</div><nav>{nav.map(([label, Icon]) => <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => go(label)}><Icon />{label}{label === 'Robot Control' && <span className="live-dot" />}</button>)}</nav><div className="nav-label settings-label">Manage</div><nav><button className={active === 'Alerts' ? 'nav-item active' : 'nav-item'} onClick={() => go('Alerts')}><Bell />Alerts <span className="badge-count">3</span></button>{isAdmin && <button className={active === 'Users' ? 'nav-item active' : 'nav-item'} onClick={() => go('Users')}><Users />User management</button>}{isAdmin && <button className={active === 'WhatsApp' ? 'nav-item active' : 'nav-item'} onClick={() => go('WhatsApp')}><MessageCircle />WhatsApp</button>}<button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => go('Settings')}><Settings />Settings</button></nav><div className="sidebar-bottom"><div className="support"><CircleHelp /><div><b>Need help?</b><small>Visit support center</small></div></div><div className="profile"><div className="avatar">{initials}</div><div><b>{currentUser?.name}</b><small>{currentUser?.role}</small></div><MoreHorizontal /></div></div></aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu /></button><div className="crumb"><span>Workspace</span><ChevronDown /><span className="slash">/</span><b>{active}</b></div><div className="top-actions"><div className="search"><Search /><input placeholder="Search anything..." /><kbd>⌘ K</kbd></div><button className="top-icon" onClick={() => go('Alerts')}><Bell /><i /></button><button className="top-icon" onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</button><div className="profile-control"><button className="profile-trigger" aria-label="Open profile menu" aria-expanded={userMenu} onClick={() => setUserMenu(value => !value)}><span className="profile-avatar">{initials}</span><ChevronDown /></button>{userMenu && <div className="profile-popover" role="menu"><div className="profile-summary"><span className="profile-avatar large">{initials}</span><div><strong>{currentUser?.name}</strong><small>{currentUser?.email}</small><em>{currentUser?.role}</em></div></div><button role="menuitem" onClick={() => { setUserMenu(false); setActive('Settings') }}><Settings />Profile & settings</button><button role="menuitem" className="logout-action" onClick={() => { setUserMenu(false); logout() }}><X />Log out</button></div>}</div></div></header><div className="content">{header(active, `Welcome back, ${currentUser?.name ?? ''}. Monitoring ${account.label}.`)}{accountBar}{page}<footer><span>FOREX for better living · {account.label}</span><span>Last sync: just now <i className="footer-live" /></span></footer></div>{notice && <div className="toast"><Check />{notice}</div>}</main>
  </div>
}
