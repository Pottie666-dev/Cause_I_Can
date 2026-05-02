import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DateTimePicker from '@react-native-community/datetimepicker'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://ridgeway-mansion-api.onrender.com'

function startOfDay(d) {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  return t
}

function endOfDayDate(d) {
  const t = new Date(d)
  t.setHours(23, 59, 59, 999)
  return t
}

function startOfCurrentMonth(d = new Date()) {
  const t = new Date(d)
  return startOfDay(new Date(t.getFullYear(), t.getMonth(), 1))
}

function addCalendarDays(d, n) {
  const t = startOfDay(d)
  t.setDate(t.getDate() + n)
  return t
}

function formatPawnDate(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const DEFAULT_PAWN_SHOP_NAME = 'Pawn Inc'

function defaultPawnShopSelectionName(shops) {
  if (!shops.length) return ''
  const preferred = shops.find((s) => s.name.trim().toLowerCase() === DEFAULT_PAWN_SHOP_NAME.toLowerCase())
  return (preferred ?? shops[0]).name
}

function isOpenPawnTicket(ticket) {
  return !ticket.status || ticket.status === 'open'
}

function ticketPriority(ticket) {
  return Math.min(5, Math.max(1, Math.round(Number(ticket.priority)) || 3))
}

/** Priority accents get darker as urgency increases from P1 to P5. */
const PAWN_PRIORITY_ACCENT = {
  1: '#9a7b4f',
  2: '#7a5c1a',
  3: '#5c3d14',
  4: '#4e110a',
  5: '#2c0b06',
}

const METER_TYPES = [
  { value: 'power', label: 'Power', icon: '⚡' },
  { value: 'water', label: 'Water', icon: '💧' },
]

function meterTypeFor(meter) {
  return meter?.meterType === 'water' ? 'water' : 'power'
}

function meterTypeLabel(value) {
  return METER_TYPES.find((type) => type.value === value)?.label || 'Power'
}

function meterTypeIcon(value) {
  return METER_TYPES.find((type) => type.value === value)?.icon || '⚡'
}

const HIDDEN_METER_IDS_KEY = 'ridgeway_power_hidden_meter_ids'
const SESSION_USER_KEY = 'ridgeway_session_user'

async function persistSessionUser(user) {
  if (user && typeof user._id === 'string') {
    await AsyncStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
  }
}

async function clearSessionUser() {
  try {
    await AsyncStorage.removeItem(SESSION_USER_KEY)
  } catch {
    /* Web / storage quirks — callers still clear session in React state */
  }
}

async function loadHiddenMeterIds() {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_METER_IDS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

async function saveHiddenMeterIds(ids) {
  await AsyncStorage.setItem(HIDDEN_METER_IDS_KEY, JSON.stringify([...ids]))
}

/** Local calendar date from YYYY-MM-DD (avoids UTC shift). */
function parseLocalYyyyMmDd(s) {
  if (!s || typeof s !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(dt.getTime()) ? null : dt
}

function formatPowerDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isAdmin(user) {
  return user?.role === 'admin'
}

/** Checkers Hyper–inspired palette (dashboard, shop, chores, login) */
const CHECKERS = {
  teal: '#3C8D8B',
  tealDark: '#2f706e',
  lime: '#A5D64B',
  limeMuted: '#ecf8d4',
  bg: '#F4F6F7',
  card: '#ffffff',
  text: '#1a3332',
  textMuted: '#5c7a79',
}

/** Shop item urgency (stored as red / yellow / green on the server). */
const SHOP_PRIORITY_KEYS = ['red', 'yellow', 'green']
const SHOP_PRIORITY_LABEL = { red: 'Today', yellow: 'Tomorrow', green: 'Whenever' }

function shopPriorityLabel(p) {
  return SHOP_PRIORITY_LABEL[p] ?? p ?? ''
}

/** All red-priority (“Today”) items not yet bought — any category */
function importantShopItemsForDashboard(items) {
  return items
    .filter((item) => item.priority === 'red' && !item.purchased)
    .sort((a, b) => Number(a.reminderAt || 0) - Number(b.reminderAt || 0))
}

/** Open pawn tickets with return date in the next `days` days (from today’s midnight). */
function pawnTicketsDueWithinDays(tickets, days) {
  const start = startOfDay(new Date()).getTime()
  const end = start + days * 24 * 60 * 60 * 1000
  return tickets
    .filter((t) => {
      const st = t.status || 'open'
      if (st !== 'open') return false
      const ret = Number(t.returnDate || 0)
      return ret >= start && ret < end
    })
    .sort((a, b) => Number(a.returnDate || 0) - Number(b.returnDate || 0))
}

const shopDashboardStyles = StyleSheet.create({
  dashboardTile: {
    borderWidth: 2,
    borderColor: CHECKERS.teal,
    backgroundColor: '#e6f3f2',
  },
  dashboardIconRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: CHECKERS.teal,
    backgroundColor: CHECKERS.limeMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dashboardIcon: { marginBottom: 0, fontSize: 28, color: CHECKERS.tealDark },
  dashboardTileLabel: { color: CHECKERS.tealDark, fontWeight: '800' },
})

/** South African flag palette + bright accents (textiles / rainbow energy) */
const SA = {
  red: '#E03C31',
  blue: '#002395',
  green: '#007749',
  yellow: '#FFB81C',
  /** Ring border — darker gold, like Power/Shop icon circles */
  darkYellow: '#C99403',
  /** Dashboard tile fill — soft yellow behind flag stripe + label */
  lightYellow: '#FFF9E6',
  black: '#1a1a1a',
  white: '#FFFFFF',
  cream: '#FFF8F0',
}
const SA_FLAG_STRIPES = [SA.red, SA.blue, SA.green, SA.yellow, SA.black, '#F5F0E8']

/** Cycle through flag colours for each letter (readable on light yellow / blue bar). */
const SA_FLAG_LABEL_COLORS = [SA.red, SA.blue, SA.green, SA.yellow, SA.black]

function SweepSussieFlagText({ text, style }) {
  const s = typeof text === 'string' ? text : ''
  return (
    <Text style={style}>
      {s.split('').map((ch, i) => (
        <Text key={`sf-${i}`} style={{ color: SA_FLAG_LABEL_COLORS[i % SA_FLAG_LABEL_COLORS.length] }}>
          {ch}
        </Text>
      ))}
    </Text>
  )
}

/** Dashboard “Important” / pawn collections — soft red text */
const DASH_SOFT_RED = {
  title: '#c45a5a',
  body: '#b86868',
  meta: '#a96f6f',
}

const sweepSussieStyles = StyleSheet.create({
  screen: {
    backgroundColor: SA.cream,
  },
  screenStripeBar: {
    flexDirection: 'row',
    height: 5,
    width: '100%',
  },
  screenStripeSeg: { flex: 1, height: '100%' },
  card: {
    borderColor: SA.blue,
    borderLeftWidth: 4,
    borderLeftColor: SA.green,
  },
  dashboardTile: {
    borderWidth: 2,
    borderColor: SA.yellow,
    backgroundColor: SA.lightYellow,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'flex-start',
  },
  dashboardStripeTop: {
    flexDirection: 'row',
    height: 6,
    width: '100%',
  },
  dashboardStripeSeg: { flex: 1, height: '100%' },
  dashboardTileInner: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 14,
    width: '100%',
  },
  /** Circular ring like Power / Shop tiles: dark yellow border, soft fill. */
  dashboardIconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: SA.darkYellow,
    backgroundColor: SA.lightYellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  dashboardIcon: {
    fontSize: 34,
    marginBottom: 0,
  },
  dashboardTileLabel: {
    fontWeight: '900',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    textShadowColor: 'rgba(0, 35, 125, 0.12)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 3,
  },
  topBar: {
    backgroundColor: SA.blue,
    borderBottomWidth: 4,
    borderBottomColor: SA.green,
  },
  topBarTitle: {
    color: SA.white,
    fontWeight: '900',
    fontSize: 17,
    textShadowColor: SA.red,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  topBarLink: {
    color: SA.yellow,
    fontWeight: '800',
  },
  sectionTitle: {
    color: SA.blue,
    fontWeight: '800',
  },
  daySection: {
    borderLeftWidth: 5,
    borderLeftColor: SA.red,
    backgroundColor: SA.white,
  },
  dayTitle: {
    color: SA.green,
    fontWeight: '900',
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: SA.yellow,
    backgroundColor: '#FFF9E6',
  },
  chipTextSelected: {
    color: SA.blue,
    fontWeight: '800',
  },
})

async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!response.ok) {
    const msg =
      data && typeof data === 'object' && typeof data.error === 'string'
        ? data.error
        : text
          ? `${text.slice(0, 240)}${text.length > 240 ? '…' : ''}`
          : `Request failed (${response.status})`
    throw new Error(msg)
  }
  if (text && data === null) {
    throw new Error('Server returned a non-JSON response (check EXPO_PUBLIC_API_URL).')
  }
  return data ?? {}
}

export default function App() {
  const [sessionReady, setSessionReady] = useState(false)
  const [screen, setScreen] = useState('login')
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [importantShopItems, setImportantShopItems] = useState([])
  const [duePawnTickets, setDuePawnTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchDashboardLists = useCallback(async () => {
    try {
      const [shopItems, categories, tickets] = await Promise.all([
        apiFetch('/api/shop-items'),
        apiFetch('/api/shop-categories'),
        apiFetch('/api/pawn-tickets'),
      ])
      setImportantShopItems(importantShopItemsForDashboard(shopItems))
      setDuePawnTickets(pawnTicketsDueWithinDays(tickets, 7))
    } catch (_err) {
      setImportantShopItems([])
      setDuePawnTickets([])
    }
  }, [])

  /** Stable ref — inline lambdas here caused ShopScreen refresh loop + flickering loaders */
  const onShopDashboardSync = useCallback(() => {
    void fetchDashboardLists()
  }, [fetchDashboardLists])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_USER_KEY)
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw)
          if (
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed._id === 'string' &&
            typeof parsed.name === 'string'
          ) {
            setUser({
              _id: parsed._id,
              username: typeof parsed.username === 'string' ? parsed.username : '',
              name: parsed.name,
              role: parsed.role === 'admin' || parsed.role === 'member' ? parsed.role : 'member',
            })
            setScreen('dashboard')
            try {
              const [shopItems, categories, tickets] = await Promise.all([
                apiFetch('/api/shop-items'),
                apiFetch('/api/shop-categories'),
                apiFetch('/api/pawn-tickets'),
              ])
              if (!cancelled) {
                setImportantShopItems(importantShopItemsForDashboard(shopItems))
                setDuePawnTickets(pawnTicketsDueWithinDays(tickets, 7))
              }
            } catch {
              if (!cancelled) {
                setImportantShopItems([])
                setDuePawnTickets([])
              }
            }
          }
        }
      } catch {
        await AsyncStorage.removeItem(SESSION_USER_KEY)
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const doLogin = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      setUser(data.user)
      await persistSessionUser(data.user)
      setScreen('dashboard')
      await fetchDashboardLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [fetchDashboardLists, password, username])

  const doLogout = useCallback(async () => {
    await clearSessionUser()
    setUser(null)
    setScreen('login')
    setPassword('')
    setUsername('')
    setError('')
  }, [])

  if (!sessionReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.card, { margin: 16, alignItems: 'center', paddingVertical: 48 }]}>
          <ActivityIndicator size="large" color={CHECKERS.teal} />
        </View>
      </SafeAreaView>
    )
  }

  if (screen === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.loginScrollContent}
          >
            <Image
              source={require('./public/ridgewayView.jpeg')}
              style={styles.loginHeroImage}
              resizeMode="cover"
              accessibilityLabel="Ridgeway Mansion"
            />
            <View style={styles.loginFormBlock}>
              <TextInput
                placeholder="Name"
                value={username}
                onChangeText={setUsername}
                style={styles.input}
                autoCapitalize="none"
              />
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
              />
              <TouchableOpacity style={styles.loginPrimaryBtn} onPress={() => void doLogin()}>
                <Text style={styles.buttonText}>Login</Text>
              </TouchableOpacity>
              {loading ? <ActivityIndicator size="small" color={CHECKERS.teal} style={styles.marginTop8} /> : null}
              {error ? <Text style={[styles.error, styles.loginErrorCenter]}>{error}</Text> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  if (screen === 'dashboard') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.dashboardTopBar}>
          <Pressable
            onPress={() => void doLogout()}
            style={({ pressed }) => [styles.dashboardLogoutBtn, pressed && styles.dashboardLogoutPressed]}
            accessibilityLabel="Log out"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Text style={styles.dashboardLogoutText}>Logout</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contentWrap}>
          <View style={[styles.card, styles.dashboardHeaderCard]}>
            <Text style={styles.dashboardTitle}>Ridgeway Mansion</Text>
            <Text style={styles.dashboardSubtitle}>Welcome {user?.name}</Text>
          </View>
          <View style={styles.grid}>
            {isAdmin(user) ? (
              <DashboardTile
                imageSource={require('./public/PAWNSHIT.jpeg')}
                icon="🏦"
                label="Pawn Shit"
                variant="pawn"
                onPress={() => setScreen('pawn')}
              />
            ) : null}
            <DashboardTile icon="⚡" label="Power H20" variant="power" onPress={() => setScreen('power')} />
            <DashboardTile icon="🛒" label="SMOKES & SWEETS" variant="shop" onPress={() => setScreen('shop')} />
            <DashboardTile icon="🧹" label="Sweep Sussie" variant="chores" onPress={() => setScreen('chores')} />
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, styles.dashboardUrgentTitle]}>Important · Today</Text>
            {importantShopItems.length === 0 ? (
              <Text style={[styles.empty, styles.dashboardUrgentMeta]}>Nothing marked for today.</Text>
            ) : null}
            {importantShopItems.map((item) => (
              <View key={item._id} style={styles.itemRow}>
                <Text style={[styles.itemText, styles.dashboardUrgentBody]}>🔴 {item.title}</Text>
                <Text style={[styles.itemMeta, styles.dashboardUrgentMeta]}>
                  {item.reminderAt ? `Reminder: ${formatPowerDate(new Date(item.reminderAt))}` : 'No reminder set'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, styles.dashboardUrgentTitle]}>Collections due · next 7 days</Text>
            {duePawnTickets.length === 0 ? (
              <Text style={[styles.empty, styles.dashboardUrgentMeta]}>No open tickets due in the next week.</Text>
            ) : null}
            {duePawnTickets.map((ticket) => (
              <View key={ticket._id} style={styles.itemRow}>
                <Text style={[styles.itemText, styles.dashboardUrgentBody]}>{ticket.shopName || 'Shop'}</Text>
                <Text style={[styles.itemMeta, styles.dashboardUrgentMeta]}>
                  Return by {ticket.returnDate ? formatPowerDate(new Date(ticket.returnDate)) : '—'} · R{' '}
                  {Number(ticket.totalRepayAmount || 0).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (screen === 'pawn') {
    return <PawnScreen user={user} onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'power') {
    return <PowerScreen user={user} onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'shop') {
    return <ShopScreen user={user} onBack={() => setScreen('dashboard')} onUpdatedUrgent={onShopDashboardSync} />
  }
  if (screen === 'chores') {
    return <ChoresScreen user={user} onBack={() => setScreen('dashboard')} />
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Loading...</Text>
      </View>
    </SafeAreaView>
  )
}

function DashboardTile({ icon, label, imageSource, variant, onPress }) {
  const isPower = variant === 'power'
  const isPawn = variant === 'pawn'
  const isShop = variant === 'shop'
  const isChores = variant === 'chores'
  const tileStyles = [
    styles.tile,
    isPower && powerStyles.dashboardTile,
    isPawn && pawnStyles.dashboardTile,
    isShop && shopDashboardStyles.dashboardTile,
    isChores && sweepSussieStyles.dashboardTile,
  ]
  const labelStyles = [
    styles.tileLabel,
    isPower && powerStyles.dashboardTileLabel,
    isPawn && pawnStyles.dashboardTileLabel,
    isShop && shopDashboardStyles.dashboardTileLabel,
    isChores && sweepSussieStyles.dashboardTileLabel,
  ]
  return (
    <TouchableOpacity style={tileStyles} onPress={onPress}>
      {isChores ? (
        <>
          <View style={sweepSussieStyles.dashboardStripeTop}>
            {SA_FLAG_STRIPES.map((color, i) => (
              <View key={`sa-${i}`} style={[sweepSussieStyles.dashboardStripeSeg, { backgroundColor: color }]} />
            ))}
          </View>
          <View style={sweepSussieStyles.dashboardTileInner}>
            <View style={sweepSussieStyles.dashboardIconRing}>
              <Text style={[styles.tileIcon, sweepSussieStyles.dashboardIcon]}>{icon}</Text>
            </View>
            <SweepSussieFlagText text={label} style={labelStyles} />
          </View>
        </>
      ) : imageSource ? (
        <>
          <View style={pawnStyles.dashboardIconRing}>
            <Image source={imageSource} style={pawnStyles.dashboardTileImage} resizeMode="cover" />
          </View>
          <Text style={labelStyles}>{label}</Text>
        </>
      ) : isPower ? (
        <>
          <View style={powerStyles.dashboardIconRing}>
            <Text style={[styles.tileIcon, powerStyles.dashboardIcon]}>{icon}</Text>
          </View>
          <Text style={labelStyles}>{label}</Text>
        </>
      ) : isShop ? (
        <>
          <View style={shopDashboardStyles.dashboardIconRing}>
            <Text style={[styles.tileIcon, shopDashboardStyles.dashboardIcon]}>{icon}</Text>
          </View>
          <Text style={labelStyles}>{label}</Text>
        </>
      ) : (
        <>
          <Text style={styles.tileIcon}>{icon}</Text>
          <Text style={labelStyles}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

function TopBar({ title, onBack, onRefresh, variant }) {
  const pawn = variant === 'pawn'
  const power = variant === 'power'
  const chores = variant === 'chores'
  const titleStyles = [styles.topTitle, pawn && pawnStyles.topBarTitle, power && powerStyles.topBarTitle, chores && sweepSussieStyles.topBarTitle]
  return (
    <View style={[styles.topBar, pawn && pawnStyles.topBar, power && powerStyles.topBar, chores && sweepSussieStyles.topBar]}>
      <TouchableOpacity style={styles.topButton} onPress={onBack}>
        <Text
          style={[styles.topButtonText, pawn && pawnStyles.topBarLink, power && powerStyles.topBarLink, chores && sweepSussieStyles.topBarLink]}
        >
          Back
        </Text>
      </TouchableOpacity>
      {chores ? (
        <SweepSussieFlagText text={title} style={titleStyles} />
      ) : (
        <Text style={titleStyles}>{title}</Text>
      )}
      <TouchableOpacity style={styles.topButton} onPress={() => void onRefresh()}>
        <Text
          style={[styles.topButtonText, pawn && pawnStyles.topBarLink, power && powerStyles.topBarLink, chores && sweepSussieStyles.topBarLink]}
        >
          Refresh
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function PawnScreen({ user, onBack }) {
  const [tickets, setTickets] = useState([])
  const [pawnShops, setPawnShops] = useState([])
  const [shopPickerOpen, setShopPickerOpen] = useState(false)
  const [addShopOpen, setAddShopOpen] = useState(false)
  const [addShopName, setAddShopName] = useState('')
  const [shopName, setShopName] = useState('')
  const [pawnedDate, setPawnedDate] = useState(() => startOfDay(new Date()))
  const [returnDate, setReturnDate] = useState(() => addCalendarDays(startOfDay(new Date()), 30))
  const [datePickerTarget, setDatePickerTarget] = useState(null)
  const [repayAmount, setRepayAmount] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [itemAmount, setItemAmount] = useState('')
  const [ticketItems, setTicketItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ticketLifecycle, setTicketLifecycle] = useState(null)
  const [ticketLifecycleDate, setTicketLifecycleDate] = useState(() => startOfDay(new Date()))
  const [androidLifecyclePicker, setAndroidLifecyclePicker] = useState(false)
  const [pawnTab, setPawnTab] = useState('new')
  const [expandedShops, setExpandedShops] = useState({})
  const [priorityModalTicket, setPriorityModalTicket] = useState(null)
  const [priorityDraft, setPriorityDraft] = useState(3)

  const ticketsByShop = useMemo(() => {
    const map = new Map()
    for (const t of tickets) {
      const key = (t.shopName || 'Unknown').trim() || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.pawnedDate || 0) - (a.pawnedDate || 0))
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [tickets])

  useEffect(() => {
    setExpandedShops((prev) => {
      const next = { ...prev }
      for (const [shopName] of ticketsByShop) {
        if (next[shopName] === undefined) next[shopName] = true
      }
      return next
    })
  }, [ticketsByShop])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ticketData, shopData] = await Promise.all([apiFetch('/api/pawn-tickets'), apiFetch('/api/pawn-shops')])
      setTickets(ticketData)
      setPawnShops(shopData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pawn tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (pawnShops.length === 0) {
      setShopName('')
      return
    }
    setShopName((current) => {
      const trimmed = current.trim()
      if (trimmed === '') return defaultPawnShopSelectionName(pawnShops)
      const stillThere = pawnShops.some((s) => s.name === trimmed)
      if (!stillThere) return defaultPawnShopSelectionName(pawnShops)
      return current
    })
  }, [pawnShops])

  const addItemToTicket = () => {
    if (!itemDescription.trim()) return
    setTicketItems((prev) => [
      ...prev,
      { description: itemDescription.trim(), amountReceived: Number(itemAmount || 0) },
    ])
    setItemDescription('')
    setItemAmount('')
  }

  const saveTicket = async () => {
    if (!shopName.trim()) {
      setError('Choose a pawn shop from the list.')
      return
    }
    if (ticketItems.length === 0) {
      setError('Add at least one item: enter a description, tap Add Item, then Save Ticket.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await apiFetch('/api/pawn-tickets', {
        method: 'POST',
        body: JSON.stringify({
          userId: user?._id,
          shopName: shopName.trim(),
          pawnedDate: pawnedDate.getTime(),
          returnDate: returnDate.getTime(),
          totalRepayAmount: Number(repayAmount || 0),
          items: ticketItems,
        }),
      })
      const today = startOfDay(new Date())
      setPawnedDate(today)
      setReturnDate(addCalendarDays(today, 30))
      setRepayAmount('')
      setTicketItems([])
      setPawnTab('tickets')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ticket')
    } finally {
      setLoading(false)
    }
  }

  const openPriorityEditor = (ticket) => {
    setPriorityDraft(ticketPriority(ticket))
    setPriorityModalTicket(ticket)
  }

  const saveTicketPriority = async () => {
    if (!priorityModalTicket) return
    setLoading(true)
    setError('')
    try {
      await apiFetch(`/api/pawn-tickets/${priorityModalTicket._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: user?._id, priority: priorityDraft }),
      })
      setPriorityModalTicket(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save priority')
    } finally {
      setLoading(false)
    }
  }

  const openTicketCollect = (ticket) => {
    setTicketLifecycleDate(startOfDay(new Date()))
    setTicketLifecycle({ kind: 'collect', ticket })
    setAndroidLifecyclePicker(false)
  }

  const openTicketExtend = (ticket) => {
    setTicketLifecycleDate(startOfDay(new Date()))
    setTicketLifecycle({ kind: 'extend', ticket })
    setAndroidLifecyclePicker(false)
  }

  const confirmTicketLifecycle = async () => {
    if (!ticketLifecycle) return
    setLoading(true)
    setError('')
    try {
      const tid = ticketLifecycle.ticket._id
      if (ticketLifecycle.kind === 'collect') {
        await apiFetch(`/api/pawn-tickets/${tid}`, {
          method: 'PATCH',
          body: JSON.stringify({
            userId: user?._id,
            action: 'collect',
            collectedAt: ticketLifecycleDate.getTime(),
          }),
        })
      } else {
        await apiFetch(`/api/pawn-tickets/${tid}`, {
          method: 'PATCH',
          body: JSON.stringify({
            userId: user?._id,
            action: 'extend',
            extendedDate: ticketLifecycleDate.getTime(),
          }),
        })
      }
      setTicketLifecycle(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update ticket')
    } finally {
      setLoading(false)
    }
  }

  const markTicketLost = (ticket) => {
    Alert.alert('Mark as lost?', 'This pawn ticket will be closed as lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark lost',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setLoading(true)
            setError('')
            try {
              await apiFetch(`/api/pawn-tickets/${ticket._id}`, {
                method: 'PATCH',
                body: JSON.stringify({ userId: user?._id, action: 'lost' }),
              })
              await refresh()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not update ticket')
            } finally {
              setLoading(false)
            }
          })()
        },
      },
    ])
  }

  const deleteTicket = (ticket) => {
    Alert.alert('Delete ticket?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setLoading(true)
            setError('')
            try {
              await apiFetch(`/api/pawn-tickets/${ticket._id}`, {
                method: 'DELETE',
                body: JSON.stringify({ userId: user?._id }),
              })
              await refresh()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not delete ticket')
            } finally {
              setLoading(false)
            }
          })()
        },
      },
    ])
  }

  const saveNewShopFromDialog = async () => {
    const name = addShopName.trim()
    if (!name) return
    setLoading(true)
    setError('')
    try {
      await apiFetch('/api/pawn-shops', {
        method: 'POST',
        body: JSON.stringify({ userId: user?._id, name }),
      })
      setAddShopName('')
      setAddShopOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shop')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.container, pawnStyles.screen]}>
      <TopBar title="Pawn Shit" variant="pawn" onBack={onBack} onRefresh={refresh} />
      <Modal visible={addShopOpen} animationType="fade" transparent>
        <KeyboardAvoidingView
          style={[styles.modalBackdropCentered, pawnStyles.modalBackdropTint, styles.modalKeyboardAvoid]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          <View style={[styles.dialogCard, pawnStyles.dialogCard]}>
            <Text style={[styles.modalTitle, pawnStyles.modalTitle]}>Add pawn shop</Text>
            <TextInput
              value={addShopName}
              onChangeText={setAddShopName}
              style={[styles.input, pawnStyles.input]}
              placeholder="Shop name"
              placeholderTextColor="#9a7b6a"
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.buttonSecondary, pawnStyles.buttonSecondary]}
                onPress={() => { setAddShopOpen(false); setAddShopName('') }}
              >
                <Text style={[styles.buttonText, pawnStyles.buttonSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.buttonPrimary,
                  pawnStyles.buttonPrimary,
                  !addShopName.trim() ? styles.buttonDisabled : null,
                ]}
                disabled={!addShopName.trim()}
                onPress={() => void saveNewShopFromDialog()}
              >
                <Text style={[styles.buttonText, pawnStyles.buttonPrimaryText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={Platform.OS === 'ios' && datePickerTarget !== null} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, pawnStyles.modalBackdropTintDark]}>
          <View style={[styles.datePickerSheet, pawnStyles.datePickerSheet]}>
            <View style={[styles.datePickerToolbar, pawnStyles.datePickerToolbar]}>
              <TouchableOpacity onPress={() => setDatePickerTarget(null)} hitSlop={12}>
                <Text style={[styles.datePickerToolbarBtn, pawnStyles.datePickerToolbarBtn]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDatePickerTarget(null)} hitSlop={12}>
                <Text style={[styles.datePickerToolbarBtn, pawnStyles.datePickerToolbarBtn]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={datePickerTarget === 'return' ? returnDate : pawnedDate}
              mode="date"
              display="spinner"
              onChange={(_, date) => {
                if (!date) return
                const sd = startOfDay(date)
                if (datePickerTarget === 'pawn') {
                  setPawnedDate(sd)
                  setReturnDate(addCalendarDays(sd, 30))
                } else if (datePickerTarget === 'return') {
                  setReturnDate(sd)
                }
              }}
              themeVariant="light"
            />
          </View>
        </View>
      </Modal>
      {Platform.OS === 'android' && datePickerTarget === 'pawn' ? (
        <DateTimePicker
          value={pawnedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (event?.type === 'dismissed') {
              setDatePickerTarget(null)
              return
            }
            if (date) {
              const sd = startOfDay(date)
              setPawnedDate(sd)
              setReturnDate(addCalendarDays(sd, 30))
            }
            setDatePickerTarget(null)
          }}
        />
      ) : null}
      {Platform.OS === 'android' && datePickerTarget === 'return' ? (
        <DateTimePicker
          value={returnDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (event?.type === 'dismissed') {
              setDatePickerTarget(null)
              return
            }
            if (date) setReturnDate(startOfDay(date))
            setDatePickerTarget(null)
          }}
        />
      ) : null}
      <Modal visible={shopPickerOpen} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, pawnStyles.modalBackdropTintDark]}>
          <View style={[styles.modalCard, pawnStyles.modalCard]}>
            <View style={[styles.datePickerToolbar, styles.shopPickerToolbar, pawnStyles.shopPickerToolbar]}>
              <TouchableOpacity onPress={() => setShopPickerOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={pawnStyles.shopPickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, pawnStyles.modalTitle, pawnStyles.shopPickerTitle]} numberOfLines={1}>
                Pick pawn shop name
              </Text>
              <View style={styles.shopPickerToolbarSpacer} />
            </View>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {pawnShops.length === 0 ? (
                <Text style={[styles.empty, pawnStyles.mutedText]}>No shops saved yet. Tap + above New Ticket to add one.</Text>
              ) : null}
              {pawnShops.map((shop) => (
                <TouchableOpacity
                  key={shop._id}
                  style={[styles.modalRow, pawnStyles.modalRow]}
                  onPress={() => {
                    setShopName(shop.name)
                    setShopPickerOpen(false)
                  }}
                >
                  <Text style={[styles.itemText, pawnStyles.itemText]}>{shop.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={ticketLifecycle !== null} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, pawnStyles.modalBackdropTintDark]}>
          <View style={[styles.datePickerSheet, pawnStyles.datePickerSheet]}>
            <Text style={[styles.modalTitle, pawnStyles.modalTitle, { marginBottom: 8 }]}>
              {ticketLifecycle?.kind === 'collect' ? 'Date collected' : 'Extension starts (return +30 days)'}
            </Text>
            <Text style={[styles.itemMeta, pawnStyles.itemMeta, { marginBottom: 12 }]}>
              {ticketLifecycle?.kind === 'collect'
                ? 'When was this pawn collected?'
                : 'New ticket: pawned this date, return date 30 days later.'}
            </Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={ticketLifecycleDate}
                mode="date"
                display="spinner"
                onChange={(_, date) => {
                  if (date) setTicketLifecycleDate(startOfDay(date))
                }}
                themeVariant="light"
              />
            ) : (
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.itemText, pawnStyles.itemText]}>{formatPawnDate(ticketLifecycleDate)}</Text>
                <TouchableOpacity
                  style={[styles.buttonSecondary, pawnStyles.buttonSecondary, { marginTop: 8 }]}
                  onPress={() => setAndroidLifecyclePicker(true)}
                >
                  <Text style={[styles.buttonText, pawnStyles.buttonSecondaryText]}>Choose date</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.buttonSecondary, pawnStyles.buttonSecondary]}
                onPress={() => {
                  setTicketLifecycle(null)
                  setAndroidLifecyclePicker(false)
                }}
              >
                <Text style={[styles.buttonText, pawnStyles.buttonSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.buttonPrimary, pawnStyles.buttonPrimary]} onPress={() => void confirmTicketLifecycle()}>
                <Text style={[styles.buttonText, pawnStyles.buttonPrimaryText]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {Platform.OS === 'android' && androidLifecyclePicker && ticketLifecycle ? (
        <DateTimePicker
          value={ticketLifecycleDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setAndroidLifecyclePicker(false)
            if (event?.type === 'dismissed') return
            if (date) setTicketLifecycleDate(startOfDay(date))
          }}
        />
      ) : null}
      <Modal visible={priorityModalTicket !== null} animationType="fade" transparent>
        <View style={[styles.modalBackdropCentered, pawnStyles.modalBackdropTint]}>
          <View style={[styles.dialogCard, pawnStyles.dialogCard]}>
            <Text style={[styles.modalTitle, pawnStyles.modalTitle]}>Ticket priority</Text>
            <Text style={[styles.itemMeta, pawnStyles.itemMeta, { marginBottom: 12 }]}>
              1 = lowest · 5 = highest. Long-press a ticket anytime to edit. Darker colors = higher priority.
            </Text>
            <View style={styles.pawnPriorityPickRow}>
              {[1, 2, 3, 4, 5].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.pawnPriorityPickChip,
                    { backgroundColor: PAWN_PRIORITY_ACCENT[p] },
                    priorityDraft === p ? styles.pawnPriorityPickChipSelected : null,
                  ]}
                  onPress={() => setPriorityDraft(p)}
                >
                  <Text style={styles.pawnPriorityPickChipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.buttonSecondary, pawnStyles.buttonSecondary]}
                onPress={() => setPriorityModalTicket(null)}
              >
                <Text style={[styles.buttonText, pawnStyles.buttonSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.buttonPrimary, pawnStyles.buttonPrimary]} onPress={() => void saveTicketPriority()}>
                <Text style={[styles.buttonText, pawnStyles.buttonPrimaryText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <View style={pawnStyles.pawnTabBar}>
        <TouchableOpacity
          style={[pawnStyles.pawnTab, pawnTab === 'new' && pawnStyles.pawnTabActive]}
          onPress={() => setPawnTab('new')}
        >
          <Text style={[pawnStyles.pawnTabText, pawnTab === 'new' && pawnStyles.pawnTabTextActive]}>New ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[pawnStyles.pawnTab, pawnTab === 'tickets' && pawnStyles.pawnTabActive]}
          onPress={() => setPawnTab('tickets')}
        >
          <Text style={[pawnStyles.pawnTabText, pawnTab === 'tickets' && pawnStyles.pawnTabTextActive]}>Tickets</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.contentWrap, styles.formScrollBottom]}
        >
        {error ? <Text style={[styles.error, pawnStyles.error, { marginBottom: 4 }]}>{error}</Text> : null}
        {pawnTab === 'new' ? (
        <View style={[styles.card, pawnStyles.card]}>
          <View style={styles.newTicketHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleNoMb, pawnStyles.sectionTitle]}>New Ticket</Text>
            <TouchableOpacity
              style={[styles.addShopPlus, pawnStyles.addShopPlus]}
              onPress={() => {
                setAddShopName('')
                setAddShopOpen(true)
              }}
              accessibilityLabel="Add pawn shop to saved list"
            >
              <Text style={[styles.addShopPlusText, pawnStyles.addShopPlusText]}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.fieldLabel, pawnStyles.fieldLabel]}>Pawn shop name</Text>
          <TouchableOpacity
            style={[styles.dropdownField, pawnStyles.dropdownField]}
            onPress={() => setShopPickerOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Choose pawn shop from list"
          >
            <View style={styles.dropdownFieldInner}>
              <Text
                style={[
                  shopName ? styles.dropdownFieldText : styles.dropdownPlaceholder,
                  shopName ? pawnStyles.dropdownFieldText : pawnStyles.dropdownPlaceholder,
                ]}
              >
                {shopName || '— Choose a shop —'}
              </Text>
              <Text style={[styles.dropdownChevron, pawnStyles.dropdownChevron]}>▼</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.fieldLabel, pawnStyles.fieldLabel]}>Pawned date</Text>
          <TouchableOpacity
            style={[styles.dropdownField, pawnStyles.dropdownField]}
            onPress={() => setDatePickerTarget('pawn')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Choose pawned date"
          >
            <View style={styles.dropdownFieldInner}>
              <Text style={[styles.dropdownFieldText, pawnStyles.dropdownFieldText]}>{formatPawnDate(pawnedDate)}</Text>
              <Text style={[styles.dropdownChevron, pawnStyles.dropdownChevron]}>▼</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.fieldLabel, pawnStyles.fieldLabel]}>Return date</Text>
          <TouchableOpacity
            style={[styles.dropdownField, pawnStyles.dropdownField]}
            onPress={() => setDatePickerTarget('return')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Choose return date"
          >
            <View style={styles.dropdownFieldInner}>
              <Text style={[styles.dropdownFieldText, pawnStyles.dropdownFieldText]}>{formatPawnDate(returnDate)}</Text>
              <Text style={[styles.dropdownChevron, pawnStyles.dropdownChevron]}>▼</Text>
            </View>
          </TouchableOpacity>
          <TextInput
            value={repayAmount}
            onChangeText={setRepayAmount}
            style={[styles.input, pawnStyles.input]}
            placeholder="Total repay amount"
            placeholderTextColor="#9a7b6a"
            keyboardType="numeric"
          />

          <Text style={[styles.sectionTitle, pawnStyles.sectionTitle]}>Ticket Items</Text>
          <TextInput
            value={itemDescription}
            onChangeText={setItemDescription}
            style={[styles.input, pawnStyles.input]}
            placeholder="Item description"
            placeholderTextColor="#9a7b6a"
          />
          <TextInput
            value={itemAmount}
            onChangeText={setItemAmount}
            style={[styles.input, pawnStyles.input]}
            placeholder="Amount received for item"
            placeholderTextColor="#9a7b6a"
            keyboardType="numeric"
          />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.buttonSecondary, pawnStyles.buttonSecondary]} onPress={addItemToTicket}>
              <Text style={[styles.buttonText, pawnStyles.buttonSecondaryText]}>Add Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.buttonPrimary, pawnStyles.buttonPrimary]} onPress={() => void saveTicket()}>
              <Text style={[styles.buttonText, pawnStyles.buttonPrimaryText]}>Save Ticket</Text>
            </TouchableOpacity>
          </View>
          {ticketItems.map((item, index) => (
            <Text key={`${item.description}-${index}`} style={[styles.itemMeta, pawnStyles.itemMeta]}>
              • {item.description} (R {item.amountReceived.toFixed(2)})
            </Text>
          ))}
        </View>
        ) : null}
        {pawnTab === 'tickets' ? (
        <View style={[styles.card, pawnStyles.card]}>
          <Text style={[styles.sectionTitle, pawnStyles.sectionTitle]}>By shop</Text>
          <Text style={[styles.itemMeta, pawnStyles.itemMetaDim, { marginBottom: 8 }]}>
            Long-press a ticket to set priority (1–5). Tap a shop to expand or collapse.
          </Text>
          {loading ? <ActivityIndicator size="small" color="#ffb833" style={{ marginVertical: 8 }} /> : null}
          {tickets.length === 0 ? <Text style={[styles.empty, pawnStyles.mutedText]}>No pawn tickets yet.</Text> : null}
          {ticketsByShop.map(([shopName, shopTickets]) => (
            <View key={shopName} style={pawnStyles.shopGroup}>
              <TouchableOpacity
                style={pawnStyles.shopGroupHeader}
                onPress={() =>
                  setExpandedShops((p) => ({ ...p, [shopName]: p[shopName] === false ? true : false }))
                }
                activeOpacity={0.75}
              >
                <Text style={pawnStyles.shopGroupChevron}>{expandedShops[shopName] !== false ? '▼' : '▶'}</Text>
                <Text style={pawnStyles.shopGroupTitle}>{shopName}</Text>
                <Text style={pawnStyles.shopGroupCount}>({shopTickets.length})</Text>
              </TouchableOpacity>
              {expandedShops[shopName] !== false
                ? shopTickets.map((ticket) => {
                    const ticketOpen = isOpenPawnTicket(ticket)
                    const pr = ticketPriority(ticket)
                    const accent = PAWN_PRIORITY_ACCENT[pr]
                    return (
                      <View key={ticket._id} style={[pawnStyles.ticketCard, { borderLeftColor: accent }]}>
                        <View style={pawnStyles.ticketCardInner}>
                          <Pressable
                            style={pawnStyles.ticketCardMain}
                            onLongPress={() => openPriorityEditor(ticket)}
                            delayLongPress={450}
                          >
                            <View style={pawnStyles.ticketTopRow}>
                              <Text style={pawnStyles.ticketPawnedRow}>
                                Pawned ·{' '}
                                {ticket.pawnedDate
                                  ? new Date(ticket.pawnedDate).toLocaleDateString(undefined, {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                              </Text>
                              <View style={[pawnStyles.ticketPriorityPill, { backgroundColor: accent }]}>
                                <Text style={pawnStyles.ticketPriorityPillText}>P{pr}</Text>
                              </View>
                            </View>
                            {(ticket.items || []).map((item, idx) => (
                              <Text key={`${ticket._id}-it-${idx}`} style={pawnStyles.ticketItemLine}>
                                {item.description}
                                <Text style={pawnStyles.ticketItemAmount}>
                                  {' '}
                                  · R {Number(item.amountReceived || 0).toFixed(2)}
                                </Text>
                              </Text>
                            ))}
                            {ticket.status === 'collected' ? (
                              <Text style={[styles.itemMeta, pawnStyles.statusCollectedMeta, pawnStyles.ticketStatusLine]}>
                                ✓ Collected
                                {ticket.collectedAt ? ` · ${new Date(ticket.collectedAt).toLocaleDateString()}` : ''}
                              </Text>
                            ) : null}
                            {ticket.status === 'extended' ? (
                              <Text style={[styles.itemMeta, pawnStyles.statusExtendedMeta, pawnStyles.ticketStatusLine]}>
                                ↗ Extended — new ticket created
                              </Text>
                            ) : null}
                            {ticket.status === 'lost' ? (
                              <Text style={[styles.itemMeta, pawnStyles.statusLostMeta, pawnStyles.ticketStatusLine]}>✕ Lost — closed</Text>
                            ) : null}
                            {ticket.extendedFromTicketId ? (
                              <Text style={[styles.itemMeta, pawnStyles.itemMetaDim]}>Continued from prior ticket</Text>
                            ) : null}
                            <View style={pawnStyles.ticketFooterRow}>
                              <Text style={pawnStyles.ticketFooterText}>
                                Return{' '}
                                <Text style={pawnStyles.ticketFooterEm}>
                                  {ticket.returnDate ? new Date(ticket.returnDate).toLocaleDateString() : '—'}
                                </Text>
                                {' · '}Repay{' '}
                                <Text style={pawnStyles.ticketFooterEm}>R {Number(ticket.totalRepayAmount || 0).toFixed(2)}</Text>
                              </Text>
                            </View>
                          </Pressable>
                          {ticketOpen ? (
                            <View style={pawnStyles.ticketActionsCol}>
                              <TouchableOpacity
                                style={[pawnStyles.actionBtnTiny, pawnStyles.actionBtnTinyCollect]}
                                onPress={() => openTicketCollect(ticket)}
                                hitSlop={8}
                              >
                                <Text style={pawnStyles.actionIconTinyCollect}>✓</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[pawnStyles.actionBtnTiny, pawnStyles.actionBtnTinyExtend]}
                                onPress={() => openTicketExtend(ticket)}
                                hitSlop={8}
                              >
                                <Text style={pawnStyles.actionIconTinyExtend}>↗</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[pawnStyles.actionBtnTiny, pawnStyles.actionBtnTinyLost]}
                                onPress={() => markTicketLost(ticket)}
                                hitSlop={8}
                              >
                                <Text style={pawnStyles.actionIconTinyLost}>✕</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[pawnStyles.actionBtnTiny, pawnStyles.actionBtnTinyDelete]}
                                onPress={() => deleteTicket(ticket)}
                                hitSlop={8}
                                accessibilityLabel="Delete ticket"
                              >
                                <Text style={pawnStyles.actionIconTinyDelete}>🗑</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={pawnStyles.ticketActionsColClosed}>
                              {ticket.status === 'collected' ? <Text style={pawnStyles.statusCollected}>✓</Text> : null}
                              {ticket.status === 'extended' ? <Text style={pawnStyles.statusExtended}>↗</Text> : null}
                              {ticket.status === 'lost' ? <Text style={pawnStyles.statusLost}>✕</Text> : null}
                              <TouchableOpacity
                                style={[pawnStyles.actionBtnTiny, pawnStyles.actionBtnTinyDelete, { marginTop: 6 }]}
                                onPress={() => deleteTicket(ticket)}
                                hitSlop={8}
                                accessibilityLabel="Delete ticket"
                              >
                                <Text style={pawnStyles.actionIconTinyDelete}>🗑</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    )
                  })
                : null}
            </View>
          ))}
        </View>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function PowerScreen({ user, onBack }) {
  const [meters, setMeters] = useState([])
  const [transactions, setTransactions] = useState([])
  const [hiddenMeterIds, setHiddenMeterIds] = useState(() => new Set())
  const [powerTab, setPowerTab] = useState('record')
  const [selectedMeterId, setSelectedMeterId] = useState('')
  const [amount, setAmount] = useState('')
  const [units, setUnits] = useState('')
  const [readingInput, setReadingInput] = useState('')
  const [loadDate, setLoadDate] = useState(() => startOfDay(new Date()))
  const [randomReading, setRandomReading] = useState('')
  const [snapshotDate, setSnapshotDate] = useState(() => startOfDay(new Date()))
  const [statsStartDate, setStatsStartDate] = useState(() => startOfCurrentMonth())
  const [statsEndDate, setStatsEndDate] = useState(() => startOfDay(new Date()))
  const [statsMeterScope, setStatsMeterScope] = useState('both')
  const [powerPickerTarget, setPowerPickerTarget] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [savingLoad, setSavingLoad] = useState(false)
  const [savingReading, setSavingReading] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const submitLock = useRef(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isPowerAdmin = isAdmin(user)

  const hydrateHidden = useCallback(async () => {
    const s = await loadHiddenMeterIds()
    setHiddenMeterIds(s)
  }, [])

  useEffect(() => {
    void hydrateHidden()
  }, [hydrateHidden])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [metersData, txData] = await Promise.all([apiFetch('/api/meters'), apiFetch('/api/meter-transactions')])
      setMeters(metersData)
      setTransactions(txData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading utility data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visibleMeters = useMemo(
    () => meters.filter((m) => !hiddenMeterIds.has(String(m._id))),
    [meters, hiddenMeterIds],
  )
  const powerMeters = useMemo(() => visibleMeters.filter((m) => meterTypeFor(m) === 'power'), [visibleMeters])
  const waterMeters = useMemo(() => visibleMeters.filter((m) => meterTypeFor(m) === 'water'), [visibleMeters])

  const metersForStats = useMemo(() => {
    if (statsMeterScope === 'power') return powerMeters
    if (statsMeterScope === 'water') return waterMeters
    return visibleMeters
  }, [statsMeterScope, powerMeters, waterMeters, visibleMeters])

  useEffect(() => {
    if (!selectedMeterId && visibleMeters[0]) setSelectedMeterId(visibleMeters[0]._id)
    if (selectedMeterId && !visibleMeters.some((m) => m._id === selectedMeterId)) {
      setSelectedMeterId(visibleMeters[0]?._id || '')
    }
  }, [visibleMeters, selectedMeterId])

  const hideMeter = (meter) => {
    if (!isPowerAdmin) {
      Alert.alert('Permission', 'Only admins can hide meters.')
      return
    }
    Alert.alert('Hide meter?', `“${meter.name}” will be hidden from lists and stats. You can restore hidden meters below.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Hide',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const next = new Set(hiddenMeterIds)
            next.add(String(meter._id))
            setHiddenMeterIds(next)
            await saveHiddenMeterIds(next)
            if (selectedMeterId === meter._id) setSelectedMeterId('')
          })()
        },
      },
    ])
  }

  const restoreMeter = (meterId) => {
    if (!isPowerAdmin) {
      Alert.alert('Permission', 'Only admins can restore hidden meters.')
      return
    }
    void (async () => {
      const next = new Set(hiddenMeterIds)
      next.delete(String(meterId))
      setHiddenMeterIds(next)
      await saveHiddenMeterIds(next)
    })()
  }

  const meterLookup = useMemo(() => Object.fromEntries(meters.map((meter) => [meter._id, meter])), [meters])

  const hiddenMeters = useMemo(
    () => meters.filter((m) => hiddenMeterIds.has(String(m._id))),
    [meters, hiddenMeterIds],
  )

  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => !hiddenMeterIds.has(String(tx.meterId)))
        .sort((a, b) => Number(b.date || 0) - Number(a.date || 0)),
    [transactions, hiddenMeterIds],
  )

  const validateLoadFields = () => {
    if (!selectedMeterId) {
      setError('Select a meter.')
      return null
    }
    if (!amount.trim() || !units.trim() || !readingInput.trim()) {
      setError('Amount, units, and current reading are required.')
      return null
    }
    const amt = Number(amount.trim())
    const unt = Number(units.trim())
    const r = Number(readingInput.trim())
    if (!Number.isFinite(amt) || !Number.isFinite(unt) || !Number.isFinite(r)) {
      setError('Amount, units, and reading must be valid numbers.')
      return null
    }
    return { amt, unt, r }
  }

  const validateReadingSnapshotFields = () => {
    if (!selectedMeterId) {
      setError('Select a meter.')
      return null
    }
    if (!randomReading.trim()) {
      setError('Reading is required.')
      return null
    }
    const r = Number(randomReading.trim())
    if (!Number.isFinite(r)) {
      setError('Reading must be a valid number.')
      return null
    }
    return r
  }

  const executeSaveLoad = async () => {
    const vals = validateLoadFields()
    if (!vals) return
    if (submitLock.current || savingLoad) return
    submitLock.current = true
    setSavingLoad(true)
    setError('')
    try {
      await apiFetch('/api/meter-transactions', {
        method: 'POST',
        body: JSON.stringify({
          meterId: selectedMeterId,
          userId: user?._id,
          amount: vals.amt,
          units: vals.unt,
          reading: vals.r,
          entryType: 'load',
          date: loadDate.getTime(),
        }),
      })
      setAmount('')
      setUnits('')
      setReadingInput('')
      setLoadDate(startOfDay(new Date()))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save load')
    } finally {
      submitLock.current = false
      setSavingLoad(false)
    }
  }

  const promptSaveLoad = () => {
    const vals = validateLoadFields()
    if (!vals) return
    const meterName = meterLookup[selectedMeterId]?.name || 'Meter'
    Alert.alert(
      'Save utility load?',
      `${meterName}\nR ${vals.amt.toFixed(2)} · ${vals.unt.toFixed(2)} units\nReading ${vals.r.toFixed(2)}\n${formatPowerDate(loadDate)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => void executeSaveLoad() },
      ],
    )
  }

  const executeSaveReading = async () => {
    const r = validateReadingSnapshotFields()
    if (r == null) return
    if (submitLock.current || savingReading) return
    submitLock.current = true
    setSavingReading(true)
    setError('')
    try {
      await apiFetch('/api/meter-transactions', {
        method: 'POST',
        body: JSON.stringify({
          meterId: selectedMeterId,
          userId: user?._id,
          amount: 0,
          units: 0,
          reading: r,
          entryType: 'reading',
          date: snapshotDate.getTime(),
        }),
      })
      setRandomReading('')
      setSnapshotDate(startOfDay(new Date()))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save reading')
    } finally {
      submitLock.current = false
      setSavingReading(false)
    }
  }

  const promptSaveReading = () => {
    const r = validateReadingSnapshotFields()
    if (r == null) return
    const meterName = meterLookup[selectedMeterId]?.name || 'Meter'
    Alert.alert(
      'Save reading snapshot?',
      `${meterName}\nReading ${r.toFixed(2)}\n${formatPowerDate(snapshotDate)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => void executeSaveReading() },
      ],
    )
  }

  const openEditTransaction = (transaction) => {
    setEditDraft({
      _id: transaction._id,
      meterId: transaction.meterId,
      entryType: (transaction.entryType || 'load') === 'reading' ? 'reading' : 'load',
      amountStr: String(transaction.amount ?? ''),
      unitsStr: String(transaction.units ?? ''),
      readingStr:
        transaction.reading != null && Number.isFinite(Number(transaction.reading)) ? String(transaction.reading) : '',
      date: startOfDay(new Date(transaction.date || Date.now())),
    })
    setError('')
  }

  const executeSaveEdit = async () => {
    if (!editDraft) return
    if (!editDraft.readingStr.trim()) {
      setError('Reading is required.')
      return
    }
    const rd = Number(editDraft.readingStr.trim())
    if (!Number.isFinite(rd)) {
      setError('Reading must be a valid number.')
      return
    }
    let amt = 0
    let unt = 0
    if (editDraft.entryType === 'load') {
      if (!editDraft.amountStr.trim() || !editDraft.unitsStr.trim()) {
        setError('Amount and units are required for a load.')
        return
      }
      amt = Number(editDraft.amountStr.trim())
      unt = Number(editDraft.unitsStr.trim())
      if (!Number.isFinite(amt) || !Number.isFinite(unt)) {
        setError('Amount and units must be valid numbers.')
        return
      }
    }
    setSavingEdit(true)
    setError('')
    try {
      await apiFetch(`/api/meter-transactions/${editDraft._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          userId: user?._id,
          meterId: editDraft.meterId,
          entryType: editDraft.entryType,
          amount: editDraft.entryType === 'reading' ? 0 : amt,
          units: editDraft.entryType === 'reading' ? 0 : unt,
          reading: rd,
          date: editDraft.date.getTime(),
        }),
      })
      setEditDraft(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update transaction')
    } finally {
      setSavingEdit(false)
    }
  }

  const promptSaveEdit = () => {
    if (!editDraft) return
    Alert.alert('Save changes?', 'Update this transaction on the server.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => void executeSaveEdit() },
    ])
  }

  const confirmDeleteTransaction = (transaction) => {
    if (!isPowerAdmin) {
      Alert.alert('Permission', 'Only admins can delete transactions.')
      return
    }
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await apiFetch(`/api/meter-transactions/${transaction._id}`, {
                method: 'DELETE',
                body: JSON.stringify({ userId: user?._id }),
              })
              setEditDraft(null)
              await refresh()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not delete')
            }
          })()
        },
      },
    ])
  }

  const onTransactionLongPress = (transaction) => {
    const m = meterLookup[transaction.meterId]
    const buttons = [{ text: 'Edit', onPress: () => openEditTransaction(transaction) }]
    if (isPowerAdmin) {
      buttons.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDeleteTransaction(transaction),
      })
    }
    buttons.push({ text: 'Cancel', style: 'cancel' })
    Alert.alert(
      'Transaction',
      `${m?.name || 'Meter'} · ${new Date(transaction.date || Date.now()).toLocaleDateString()}`,
      buttons,
    )
  }

  const applyPowerPickerDate = (rawDate) => {
    const sd = startOfDay(rawDate)
    switch (powerPickerTarget) {
      case 'loadDate':
        setLoadDate(sd)
        break
      case 'snapshotDate':
        setSnapshotDate(sd)
        break
      case 'statsStart':
        setStatsStartDate(sd)
        break
      case 'statsEnd':
        setStatsEndDate(sd)
        break
      case 'editDate':
        setEditDraft((prev) => (prev ? { ...prev, date: sd } : null))
        break
      default:
        break
    }
  }

  const powerPickerValue = useMemo(() => {
    switch (powerPickerTarget) {
      case 'loadDate':
        return loadDate
      case 'snapshotDate':
        return snapshotDate
      case 'statsStart':
        return statsStartDate
      case 'statsEnd':
        return statsEndDate
      case 'editDate':
        return editDraft?.date ?? startOfDay(new Date())
      default:
        return startOfDay(new Date())
    }
  }, [powerPickerTarget, loadDate, snapshotDate, statsStartDate, statsEndDate, editDraft])

  const statsBundle = useMemo(() => {
    const startMs = startOfDay(statsStartDate).getTime()
    const endMs = endOfDayDate(statsEndDate).getTime()
    if (startMs > endMs) return { error: 'Start date must be on or before end date.' }

    const visibleIds = new Set(metersForStats.map((m) => String(m._id)))
    const inRange = (tx) => {
      const t = Number(tx.date || 0)
      return t >= startMs && t <= endMs && visibleIds.has(String(tx.meterId))
    }

    const txsInRange = transactions.filter(inRange)
    const loads = txsInRange.filter((tx) => (tx.entryType || 'load') !== 'reading')
    const loadAmount = loads.reduce((s, tx) => s + Number(tx.amount || 0), 0)
    const loadUnits = loads.reduce((s, tx) => s + Number(tx.units || 0), 0)

    const intervals = []
    for (const m of metersForStats) {
      const chain = transactions
        .filter((tx) => String(tx.meterId) === String(m._id) && visibleIds.has(String(tx.meterId)))
        .filter((tx) => tx.reading != null && Number.isFinite(Number(tx.reading)))
        .sort((a, b) => Number(a.date) - Number(b.date))

      for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1]
        const curr = chain[i]
        const d1 = Number(curr.date)
        if (d1 < startMs || d1 > endMs) continue
        const delta = Number(curr.reading) - Number(prev.reading)
        const dayMs = 24 * 60 * 60 * 1000
        const days = Math.max(1 / 24, (d1 - Number(prev.date)) / dayMs)
        intervals.push({
          meterId: m._id,
          meterName: m.name,
          kind: meterTypeFor(m),
          from: Number(prev.date),
          to: d1,
          delta,
          days,
          avgPerDay: delta / days,
        })
      }
    }

    const sumDelta = intervals.reduce((s, x) => s + x.delta, 0)
    const sumDays = intervals.reduce((s, x) => s + x.days, 0)
    const avgDailyFromReading = sumDays > 0 ? sumDelta / sumDays : 0
    const monthlyProjection = avgDailyFromReading * 30

    return {
      startMs,
      endMs,
      loadAmount,
      loadUnits,
      intervals,
      avgDailyFromReading,
      monthlyProjection,
      sumDelta,
    }
  }, [transactions, metersForStats, statsStartDate, statsEndDate])

  const renderMeterColumn = (title, list) => (
    <View style={powerStyles.meterColumn}>
      <Text style={powerStyles.meterColumnTitle}>{title}</Text>
      {list.length === 0 ? <Text style={[styles.empty, powerStyles.empty]}>No meters</Text> : null}
      {list.map((meter) => (
        <Pressable
          key={meter._id}
          style={[powerStyles.meterColumnChip, selectedMeterId === meter._id ? powerStyles.meterChipActive : null]}
          onPress={() => setSelectedMeterId(meter._id)}
          onLongPress={isPowerAdmin ? () => hideMeter(meter) : undefined}
          delayLongPress={isPowerAdmin ? 450 : undefined}
        >
          <Text
            style={[powerStyles.meterColumnChipText, selectedMeterId === meter._id ? powerStyles.meterChipTextActive : null]}
            numberOfLines={3}
          >
            {meterTypeIcon(meterTypeFor(meter))} {meter.name}
          </Text>
        </Pressable>
      ))}
    </View>
  )

  return (
    <SafeAreaView style={[styles.container, powerStyles.screen]}>
      <TopBar title="Power H20" variant="power" onBack={onBack} onRefresh={refresh} />
      <View style={powerStyles.powerTabBar}>
        <TouchableOpacity
          style={[powerStyles.powerTab, powerTab === 'record' && powerStyles.powerTabActive]}
          onPress={() => setPowerTab('record')}
        >
          <Text style={[powerStyles.powerTabText, powerTab === 'record' && powerStyles.powerTabTextActive]}>Record</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[powerStyles.powerTab, powerTab === 'history' && powerStyles.powerTabActive]}
          onPress={() => setPowerTab('history')}
        >
          <Text style={[powerStyles.powerTabText, powerTab === 'history' && powerStyles.powerTabTextActive]}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[powerStyles.powerTab, powerTab === 'stats' && powerStyles.powerTabActive]} onPress={() => setPowerTab('stats')}>
          <Text style={[powerStyles.powerTabText, powerTab === 'stats' && powerStyles.powerTabTextActive]}>Stats</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.contentWrap,
            styles.formScrollBottom,
            powerTab === 'record' ? powerStyles.recordContentWrap : null,
          ]}
        >
          {powerTab === 'record' ? (
            <View style={[styles.card, powerStyles.card, powerStyles.recordCard]}>
              <View style={powerStyles.meterColumns}>
                {renderMeterColumn('Power', powerMeters)}
                {renderMeterColumn('Water', waterMeters)}
              </View>
              {isPowerAdmin && hiddenMeters.length > 0 ? (
                <View style={{ marginTop: 6 }}>
                  <Text style={[styles.itemMeta, powerStyles.itemMeta, powerStyles.recordMeta]}>Hidden — tap to restore</Text>
                  <View style={[styles.row, { marginTop: 6 }]}>
                    {hiddenMeters.map((m) => (
                      <TouchableOpacity key={m._id} style={powerStyles.restoreChip} onPress={() => restoreMeter(m._id)}>
                        <Text style={powerStyles.restoreChipText}>
                          {meterTypeIcon(meterTypeFor(m))} {m.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {powerTab === 'record' ? (
            <>
              <View style={[styles.card, powerStyles.card, powerStyles.recordCard]}>
                <Text style={[styles.sectionTitle, powerStyles.sectionTitle, powerStyles.recordSectionTitle]}>Record utility load</Text>
                <Text style={[styles.itemMeta, powerStyles.itemMeta, powerStyles.recordMeta]}>
                  Selected: {meterLookup[selectedMeterId]?.name || '—'}
                </Text>
                <View style={powerStyles.loadFormGrid}>
                  <View style={powerStyles.loadFormRow}>
                    <TextInput
                      value={amount}
                      onChangeText={setAmount}
                      style={[styles.input, powerStyles.input, powerStyles.recordInput, powerStyles.loadFormHalf]}
                      placeholder="Amount (R) *"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                    />
                    <TextInput
                      value={units}
                      onChangeText={setUnits}
                      style={[styles.input, powerStyles.input, powerStyles.recordInput, powerStyles.loadFormHalf]}
                      placeholder="Units *"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={powerStyles.loadFormRow}>
                    <TextInput
                      value={readingInput}
                      onChangeText={setReadingInput}
                      style={[styles.input, powerStyles.input, powerStyles.recordInput, powerStyles.loadFormHalf]}
                      placeholder="Reading *"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                    />
                    <TouchableOpacity
                      style={[styles.input, powerStyles.input, powerStyles.dateTouch, powerStyles.recordInput, powerStyles.loadFormHalf]}
                      onPress={() => setPowerPickerTarget('loadDate')}
                      accessibilityRole="button"
                      accessibilityLabel="Choose transaction date"
                    >
                      <Text style={[powerStyles.dateTouchLabel, powerStyles.recordDateTouchLabel]}>Date *</Text>
                      <Text style={[powerStyles.dateTouchValue, powerStyles.recordDateTouchValue]}>{formatPowerDate(loadDate)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.buttonPrimary,
                    powerStyles.buttonPrimary,
                    powerStyles.recordPrimaryBtn,
                    (savingLoad || !selectedMeterId) && styles.buttonDisabled,
                  ]}
                  disabled={savingLoad || !selectedMeterId}
                  onPress={promptSaveLoad}
                >
                  <Text style={[styles.buttonText, powerStyles.buttonPrimaryText, powerStyles.recordPrimaryBtnText]}>
                    {savingLoad ? 'Saving…' : 'Save load'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.card, powerStyles.card, powerStyles.recordCard]}>
                <Text style={[styles.sectionTitle, powerStyles.sectionTitle, powerStyles.recordSectionTitle]}>Reading snapshot</Text>
                <View style={powerStyles.loadFormGrid}>
                  <View style={powerStyles.loadFormRow}>
                    <TextInput
                      value={randomReading}
                      onChangeText={setRandomReading}
                      style={[styles.input, powerStyles.input, powerStyles.recordInput, powerStyles.loadFormHalf]}
                      placeholder="Reading *"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                    />
                    <TouchableOpacity
                      style={[styles.input, powerStyles.input, powerStyles.dateTouch, powerStyles.recordInput, powerStyles.loadFormHalf]}
                      onPress={() => setPowerPickerTarget('snapshotDate')}
                      accessibilityRole="button"
                      accessibilityLabel="Choose reading date"
                    >
                      <Text style={[powerStyles.dateTouchLabel, powerStyles.recordDateTouchLabel]}>Date *</Text>
                      <Text style={[powerStyles.dateTouchValue, powerStyles.recordDateTouchValue]}>{formatPowerDate(snapshotDate)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.buttonPrimary,
                    powerStyles.buttonPrimary,
                    powerStyles.recordPrimaryBtn,
                    (savingReading || !selectedMeterId) && styles.buttonDisabled,
                  ]}
                  disabled={savingReading || !selectedMeterId}
                  onPress={promptSaveReading}
                >
                  <Text style={[styles.buttonText, powerStyles.buttonPrimaryText, powerStyles.recordPrimaryBtnText]}>
                    {savingReading ? 'Saving…' : 'Save reading'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {powerTab === 'history' ? (
            <View style={[styles.card, powerStyles.card]}>
              <Text style={[styles.sectionTitle, powerStyles.sectionTitle]}>Transaction history</Text>
              <Text style={[styles.itemMeta, powerStyles.itemMeta, { marginBottom: 8 }]}>
                Long-press a row to edit{isPowerAdmin ? ' or delete' : ''}.
              </Text>
              {loading ? <ActivityIndicator size="small" color="#facc15" /> : null}
              {visibleTransactions.length === 0 ? (
                <Text style={[styles.empty, powerStyles.empty]}>No transactions yet.</Text>
              ) : null}
              {visibleTransactions.map((transaction) => {
                const m = meterLookup[transaction.meterId]
                const isReadingOnly = (transaction.entryType || 'load') === 'reading'
                const rd =
                  transaction.reading != null && Number.isFinite(Number(transaction.reading)) ? Number(transaction.reading) : null
                return (
                  <Pressable
                    key={transaction._id}
                    style={[styles.itemRow, powerStyles.itemRow]}
                    onLongPress={() => onTransactionLongPress(transaction)}
                    delayLongPress={450}
                  >
                    <Text style={[styles.itemText, powerStyles.itemText]}>
                      {isReadingOnly ? '📋 ' : '💳 '}
                      {meterTypeIcon(meterTypeFor(m))} {m?.name || 'Unknown meter'}
                    </Text>
                    <Text style={[styles.itemMeta, powerStyles.itemMeta]}>
                      {isReadingOnly ? 'Reading only' : 'Load'} · {meterTypeLabel(meterTypeFor(m))}
                      {!isReadingOnly
                        ? ` · R ${Number(transaction.amount || 0).toFixed(2)} · ${Number(transaction.units || 0).toFixed(2)} units`
                        : ''}
                      {rd != null ? ` · Reading ${rd.toFixed(2)}` : ''}
                    </Text>
                    <Text style={[styles.itemMeta, powerStyles.itemMeta]}>
                      {new Date(transaction.date || Date.now()).toLocaleDateString()}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {powerTab === 'stats' ? (
            <View style={[styles.card, powerStyles.card, powerStyles.recordCard]}>
              <Text style={[styles.sectionTitle, powerStyles.sectionTitle, powerStyles.recordSectionTitle]}>Summary & usage</Text>
              <View style={powerStyles.statsScopeRow}>
                {[
                  { id: 'both', label: 'Both' },
                  { id: 'power', label: 'Power' },
                  { id: 'water', label: 'Water' },
                ].map(({ id, label }) => (
                  <TouchableOpacity
                    key={id}
                    style={[powerStyles.statsScopeChip, statsMeterScope === id && powerStyles.statsScopeChipActive]}
                    onPress={() => setStatsMeterScope(id)}
                  >
                    <Text
                      style={[powerStyles.statsScopeChipText, statsMeterScope === id && powerStyles.statsScopeChipTextActive]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.input, powerStyles.input, powerStyles.recordInput, powerStyles.dateTouch]}
                onPress={() => setPowerPickerTarget('statsStart')}
                accessibilityRole="button"
              >
                <Text style={[powerStyles.dateTouchLabel, powerStyles.recordDateTouchLabel]}>Range start *</Text>
                <Text style={[powerStyles.dateTouchValue, powerStyles.recordDateTouchValue]}>{formatPowerDate(statsStartDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.input, powerStyles.input, powerStyles.recordInput, powerStyles.dateTouch]}
                onPress={() => setPowerPickerTarget('statsEnd')}
                accessibilityRole="button"
              >
                <Text style={[powerStyles.dateTouchLabel, powerStyles.recordDateTouchLabel]}>Range end *</Text>
                <Text style={[powerStyles.dateTouchValue, powerStyles.recordDateTouchValue]}>{formatPowerDate(statsEndDate)}</Text>
              </TouchableOpacity>
              {statsBundle?.error ? <Text style={[styles.error, powerStyles.error]}>{statsBundle.error}</Text> : null}
              {!statsBundle?.error && statsBundle ? (
                <>
                  <Text style={[styles.itemMeta, powerStyles.itemMeta, { marginTop: 8 }]}>
                    Loads in range: R {statsBundle.loadAmount.toFixed(2)} · {statsBundle.loadUnits.toFixed(2)} units purchased
                  </Text>
                  <Text style={[styles.itemMeta, powerStyles.itemMeta]}>
                    Avg usage / day (from reading intervals in range): {statsBundle.avgDailyFromReading.toFixed(2)}
                  </Text>
                  <Text style={[styles.itemMeta, powerStyles.itemMeta]}>
                    Rough 30-day projection (reading trend): {statsBundle.monthlyProjection.toFixed(2)} units
                  </Text>
                  <Text style={[styles.sectionTitle, powerStyles.sectionTitle, { marginTop: 12 }]}>Between readings</Text>
                  {statsBundle.intervals.length === 0 ? (
                    <Text style={[styles.empty, powerStyles.empty]}>No completed reading intervals in this range.</Text>
                  ) : (
                    statsBundle.intervals.map((row, idx) => (
                      <View key={`${row.meterId}-${row.to}-${idx}`} style={[styles.itemRow, powerStyles.itemRow]}>
                        <Text style={[styles.itemText, powerStyles.itemText]}>
                          {meterTypeIcon(row.kind)} {row.meterName}
                        </Text>
                        <Text style={[styles.itemMeta, powerStyles.itemMeta]}>
                          Δ {row.delta.toFixed(2)} over {row.days.toFixed(2)} d · avg {row.avgPerDay.toFixed(2)}/d
                        </Text>
                        <Text style={[styles.itemMeta, powerStyles.itemMeta]}>
                          {new Date(row.from).toLocaleDateString()} → {new Date(row.to).toLocaleDateString()}
                        </Text>
                      </View>
                    ))
                  )}
                </>
              ) : null}
            </View>
          ) : null}

          {error ? <Text style={[styles.error, powerStyles.error]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={Platform.OS === 'ios' && powerPickerTarget !== null} animationType="slide" transparent>
        <View style={[styles.modalBackdropCentered, styles.modalKeyboardAvoid]}>
          <View style={[styles.dialogCard, powerStyles.card, { width: '100%', maxWidth: 400 }]}>
            <View style={[styles.datePickerToolbar, powerStyles.datePickerToolbarPower]}>
              <TouchableOpacity onPress={() => setPowerPickerTarget(null)} hitSlop={12}>
                <Text style={powerStyles.dateToolbarBtn}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPowerPickerTarget(null)} hitSlop={12}>
                <Text style={powerStyles.dateToolbarBtn}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={powerPickerValue}
              mode="date"
              display="spinner"
              onChange={(_, date) => {
                if (date) applyPowerPickerDate(date)
              }}
              themeVariant="light"
            />
          </View>
        </View>
      </Modal>
      {Platform.OS === 'android' && powerPickerTarget !== null ? (
        <DateTimePicker
          value={powerPickerValue}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (event?.type === 'dismissed') {
              setPowerPickerTarget(null)
              return
            }
            if (date) applyPowerPickerDate(date)
            setPowerPickerTarget(null)
          }}
        />
      ) : null}

      <Modal visible={editDraft !== null} animationType="fade" transparent>
        <KeyboardAvoidingView
          style={[styles.modalBackdropCentered, styles.modalKeyboardAvoid]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}
        >
          <View style={[styles.dialogCard, powerStyles.card, { width: '100%', maxWidth: 420 }]}>
            <Text style={[styles.modalTitle, powerStyles.sectionTitle]}>Edit transaction</Text>
            <Text style={[styles.itemMeta, powerStyles.itemMeta, { marginBottom: 8 }]}>Meter</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalWrap}>
              {meters.map((meter) => (
                <TouchableOpacity
                  key={meter._id}
                  style={[powerStyles.meterChip, editDraft?.meterId === meter._id ? powerStyles.meterChipActive : null]}
                  onPress={() => setEditDraft((prev) => (prev ? { ...prev, meterId: meter._id } : null))}
                >
                  <Text style={[powerStyles.meterChipText, editDraft?.meterId === meter._id ? powerStyles.meterChipTextActive : null]}>
                    {meterTypeIcon(meterTypeFor(meter))} {meter.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {editDraft?.entryType === 'load' ? (
              <>
                <TextInput
                  value={editDraft.amountStr}
                  onChangeText={(t) => setEditDraft((prev) => (prev ? { ...prev, amountStr: t } : null))}
                  style={[styles.input, powerStyles.input]}
                  placeholder="Amount (R) *"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                />
                <TextInput
                  value={editDraft.unitsStr}
                  onChangeText={(t) => setEditDraft((prev) => (prev ? { ...prev, unitsStr: t } : null))}
                  style={[styles.input, powerStyles.input]}
                  placeholder="Units *"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                />
              </>
            ) : (
              <Text style={[styles.itemMeta, powerStyles.itemMeta]}>Reading snapshot — amount/units stay zero.</Text>
            )}
            <TextInput
              value={editDraft?.readingStr ?? ''}
              onChangeText={(t) => setEditDraft((prev) => (prev ? { ...prev, readingStr: t } : null))}
              style={[styles.input, powerStyles.input]}
              placeholder="Meter reading *"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={[styles.input, powerStyles.input, powerStyles.dateTouch]}
              onPress={() => setPowerPickerTarget('editDate')}
              accessibilityRole="button"
            >
              <Text style={powerStyles.dateTouchLabel}>Date *</Text>
              <Text style={powerStyles.dateTouchValue}>{editDraft ? formatPowerDate(editDraft.date) : '—'}</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.buttonSecondary, powerStyles.buttonSecondary]} onPress={() => setEditDraft(null)}>
                <Text style={[styles.buttonText, powerStyles.buttonSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonPrimary, powerStyles.buttonPrimary, savingEdit && styles.buttonDisabled]}
                disabled={savingEdit}
                onPress={promptSaveEdit}
              >
                <Text style={[styles.buttonText, powerStyles.buttonPrimaryText]}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

function ShopScreen({ user, onBack, onUpdatedUrgent }) {
  const shopAdmin = isAdmin(user)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [categoryName, setCategoryName] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [quantityInput, setQuantityInput] = useState('')
  const [priority, setPriority] = useState('yellow')
  const [reminderDate, setReminderDate] = useState(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryPickTarget, setCategoryPickTarget] = useState(null)
  const [shopReminderPicker, setShopReminderPicker] = useState(null)
  const [shopReminderDraft, setShopReminderDraft] = useState(() => startOfDay(new Date()))
  const [editItem, setEditItem] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shopTab, setShopTab] = useState('add')

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })),
    [categories],
  )

  const itemsByCategory = useMemo(() => {
    const sorted = [...categories].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    )
    const nameById = Object.fromEntries(categories.map((c) => [String(c._id), c.name]))
    const buckets = new Map(sorted.map((c) => [c.name, []]))
    for (const item of items) {
      const label = nameById[String(item.categoryId)] || 'Other'
      if (!buckets.has(label)) buckets.set(label, [])
      buckets.get(label).push(item)
    }
    return Array.from(buckets.entries()).map(([name, list]) => ({
      name,
      items: [...list].sort((a, b) => {
        const pri = (x) => (x.priority === 'red' ? 0 : x.priority === 'yellow' ? 1 : 2)
        const d = pri(a) - pri(b)
        if (d !== 0) return d
        return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
      }),
    }))
  }, [categories, items])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [categoriesData, itemsData] = await Promise.all([apiFetch('/api/shop-categories'), apiFetch('/api/shop-items')])
      setCategories(categoriesData)
      setItems(itemsData)
      onUpdatedUrgent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading shopping list')
    } finally {
      setLoading(false)
    }
  }, [onUpdatedUrgent])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (sortedCategories.length === 0) return
    if (!sortedCategories.some((c) => c._id === selectedCategoryId)) {
      setSelectedCategoryId(sortedCategories[0]._id)
    }
  }, [sortedCategories, selectedCategoryId])

  const openShopReminderPicker = (mode) => {
    if (mode === 'add') {
      setShopReminderDraft(reminderDate ?? startOfDay(new Date()))
    } else if (editItem) {
      setShopReminderDraft(editItem.reminderAt != null ? startOfDay(new Date(editItem.reminderAt)) : startOfDay(new Date()))
    }
    setShopReminderPicker(mode)
  }

  const confirmShopReminderPicker = () => {
    const sd = startOfDay(shopReminderDraft)
    if (shopReminderPicker === 'add') setReminderDate(sd)
    else if (shopReminderPicker === 'edit' && editItem) setEditItem({ ...editItem, reminderAt: sd.getTime() })
    setShopReminderPicker(null)
  }

  const clearShopReminderPicker = () => {
    if (shopReminderPicker === 'add') setReminderDate(null)
    else if (shopReminderPicker === 'edit' && editItem) setEditItem({ ...editItem, reminderAt: null })
    setShopReminderPicker(null)
  }

  const addCategory = async () => {
    if (!categoryName.trim()) return
    await apiFetch('/api/shop-categories', {
      method: 'POST',
      body: JSON.stringify({ userId: user?._id, name: categoryName.trim() }),
    })
    setCategoryName('')
    await refresh()
  }

  const addItem = async () => {
    if (!itemTitle.trim() || !selectedCategoryId) return
    let quantity = null
    const qt = quantityInput.trim()
    if (qt) {
      const n = Number(qt)
      if (Number.isFinite(n) && n >= 0) quantity = n
    }
    await apiFetch('/api/shop-items', {
      method: 'POST',
      body: JSON.stringify({
        title: itemTitle.trim(),
        userId: user?._id,
        categoryId: selectedCategoryId,
        priority,
        reminderAt: reminderDate ? startOfDay(reminderDate).getTime() : null,
        quantity,
      }),
    })
    setItemTitle('')
    setQuantityInput('')
    setReminderDate(null)
    setPriority('yellow')
    await refresh()
  }

  const patchItem = async (itemId, patch) => {
    await apiFetch(`/api/shop-items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, userId: user?._id }),
    })
    await refresh()
  }

  const deleteItem = async (itemId) => {
    await apiFetch(`/api/shop-items/${itemId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: user?._id }),
    })
    await refresh()
  }

  const confirmDeleteItem = (item) => {
    Alert.alert('Remove item?', `Remove “${item.title}” from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteItem(item._id) },
    ])
  }

  const openEditItem = (item) => {
    const q = item.quantity
    setEditItem({
      _id: item._id,
      title: item.title || '',
      categoryId: item.categoryId,
      priority: item.priority || 'yellow',
      reminderAt: item.reminderAt != null ? Number(item.reminderAt) : null,
      quantityStr: q != null && q !== '' && Number.isFinite(Number(q)) ? String(q) : '',
    })
    setError('')
  }

  const saveEditItem = async () => {
    if (!editItem || !editItem.title.trim() || !editItem.categoryId) return
    setSavingEdit(true)
    setError('')
    try {
      let quantity = null
      const qt = (editItem.quantityStr ?? '').trim()
      if (qt) {
        const n = Number(qt)
        if (Number.isFinite(n) && n >= 0) quantity = n
      }
      await patchItem(editItem._id, {
        title: editItem.title.trim(),
        categoryId: editItem.categoryId,
        priority: editItem.priority,
        reminderAt: editItem.reminderAt,
        quantity,
      })
      setEditItem(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item')
    } finally {
      setSavingEdit(false)
    }
  }

  const categoriesLookup = Object.fromEntries(categories.map((category) => [category._id, category.name]))
  const highPriority = items.filter((item) => item.priority === 'red' && !item.purchased)

  const selectedCatLabel =
    sortedCategories.find((c) => c._id === selectedCategoryId)?.name || '— Choose category —'
  const editCatLabel = editItem
    ? sortedCategories.find((c) => c._id === editItem.categoryId)?.name || '— Category —'
    : '—'

  const renderShopItemRow = (item) => (
    <View key={item._id} style={styles.itemRow}>
      <View style={styles.shopItemHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.itemText}>
            {item.purchased ? '✓ ' : ''}
            {item.title}
          </Text>
          <Text style={styles.itemMeta}>
            {categoriesLookup[item.categoryId] || 'Unknown'} · {shopPriorityLabel(item.priority)}
            {item.quantity != null && item.quantity !== '' && Number.isFinite(Number(item.quantity))
              ? ` · ×${Number(item.quantity)}`
              : ''}
            {item.reminderAt ? ` · ${formatPowerDate(new Date(item.reminderAt))}` : ''}
          </Text>
        </View>
        {shopAdmin ? (
          <View style={styles.shopAdminActions}>
            <TouchableOpacity
              style={[styles.shopBoughtBtn, item.purchased && styles.shopBoughtBtnActive]}
              onPress={() => void patchItem(item._id, { purchased: !item.purchased })}
              accessibilityLabel={item.purchased ? 'Mark not bought' : 'Mark bought'}
            >
              <Text style={[styles.shopBoughtBtnText, item.purchased && styles.shopBoughtBtnTextActive]}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shopRemoveBtn}
              onPress={() => confirmDeleteItem(item)}
              accessibilityLabel="Remove item"
            >
              <Text style={styles.shopRemoveBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <View style={[styles.row, styles.shopPriorityRow]}>
        {SHOP_PRIORITY_KEYS.map((p) => (
          <TouchableOpacity
            key={`${item._id}-${p}`}
            style={[styles.shopPriorityPill, item.priority === p && styles.prioritySelected]}
            onPress={() => void patchItem(item._id, { priority: p })}
          >
            <Text style={styles.shopPriorityPillText}>{shopPriorityLabel(p)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.smallButton} onPress={() => openEditItem(item)}>
          <Text style={styles.smallButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <TopBar title="SMOKES & SWEETS" onBack={onBack} onRefresh={refresh} />
      <View style={styles.shopTabBar}>
        <TouchableOpacity
          style={[styles.shopTab, shopTab === 'add' && styles.shopTabActive]}
          onPress={() => setShopTab('add')}
        >
          <Text style={[styles.shopTabText, shopTab === 'add' && styles.shopTabTextActive]}>Add</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shopTab, shopTab === 'list' && styles.shopTabActive]}
          onPress={() => setShopTab('list')}
        >
          <Text style={[styles.shopTabText, shopTab === 'list' && styles.shopTabTextActive]}>Full list</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.contentWrap, styles.formScrollBottom]}
        >
          {shopTab === 'add' ? (
            <>
              {shopAdmin ? (
                <View style={styles.card}>
                  <View style={styles.shopCategoryAddRow}>
                    <TextInput
                      value={categoryName}
                      onChangeText={setCategoryName}
                      style={[styles.input, styles.shopCategoryInput]}
                      placeholder="Category name"
                    />
                    <TouchableOpacity style={styles.shopCategoryAddBtn} onPress={() => void addCategory()}>
                      <Text style={styles.shopCategoryAddBtnText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Add item</Text>
                <Text style={styles.fieldLabel}>Category</Text>
                <TouchableOpacity
                  style={[styles.dropdownField, styles.shopAddDropdownCompact]}
                  onPress={() => {
                    setCategoryPickTarget('add')
                    setCategoryModalOpen(true)
                  }}
                  accessibilityRole="button"
                >
                  <View style={styles.dropdownFieldInner}>
                    <Text
                      style={
                        selectedCategoryId
                          ? [styles.dropdownFieldText, styles.shopAddDropdownText]
                          : [styles.dropdownPlaceholder, styles.shopAddDropdownText]
                      }
                    >
                      {selectedCatLabel}
                    </Text>
                    <Text style={[styles.dropdownChevron, styles.shopAddDropdownChevron]}>▼</Text>
                  </View>
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>Item</Text>
                <TextInput value={itemTitle} onChangeText={setItemTitle} style={styles.input} placeholder="Item name" />
                <Text style={styles.fieldLabel}>Quantity (optional)</Text>
                <TextInput
                  value={quantityInput}
                  onChangeText={setQuantityInput}
                  style={styles.input}
                  placeholder="e.g. 2"
                  keyboardType="numeric"
                />
                <View style={styles.row}>
                  {SHOP_PRIORITY_KEYS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.priorityChip, styles[`priority_${p}`], priority === p ? styles.prioritySelected : null]}
                      onPress={() => setPriority(p)}
                    >
                      <Text style={styles.priorityText}>{shopPriorityLabel(p)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.fieldLabel, styles.shopReminderLabelCompact]}>Reminder</Text>
                <View style={styles.shopReminderRowCompact}>
                  <TouchableOpacity
                    style={[styles.dropdownField, styles.shopAddDropdownCompact, styles.shopReminderTouchFlex]}
                    onPress={() => openShopReminderPicker('add')}
                    accessibilityRole="button"
                  >
                    <View style={styles.dropdownFieldInner}>
                      <Text
                        style={
                          reminderDate
                            ? [styles.dropdownFieldText, styles.shopReminderInlineText]
                            : [styles.dropdownPlaceholder, styles.shopReminderInlineText]
                        }
                        numberOfLines={1}
                      >
                        {reminderDate ? formatPowerDate(reminderDate) : 'None'}
                      </Text>
                      <Text style={[styles.dropdownChevron, styles.shopAddDropdownChevron]}>📅</Text>
                    </View>
                  </TouchableOpacity>
                  {reminderDate ? (
                    <TouchableOpacity
                      style={styles.shopReminderClearX}
                      onPress={() => setReminderDate(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Clear reminder"
                      hitSlop={8}
                    >
                      <Text style={styles.shopReminderClearXText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addItem()}>
                  <Text style={styles.buttonText}>Add item</Text>
                </TouchableOpacity>
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Today</Text>
                {highPriority.length === 0 ? <Text style={styles.empty}>Nothing for today.</Text> : null}
                {highPriority.map((item) => (
                  <View key={item._id} style={styles.itemRow}>
                    <Text style={styles.itemText}>{item.title}</Text>
                    <Text style={styles.itemMeta}>
                      {categoriesLookup[item.categoryId] || 'Unknown'}
                      {item.quantity != null && item.quantity !== '' && Number.isFinite(Number(item.quantity))
                        ? ` · ×${Number(item.quantity)}`
                        : ''}
                      {item.reminderAt ? ` · ${formatPowerDate(new Date(item.reminderAt))}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {shopTab === 'list' ? (
            <View style={styles.card}>
              <View style={styles.shopListHeaderRow}>
                <Text style={[styles.sectionTitle, styles.shopListHeaderTitle]}>Shopping list by category</Text>
                <TouchableOpacity
                  style={styles.shopListRefreshBtn}
                  onPress={() => void refresh()}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh shopping list"
                >
                  <Text style={styles.shopListRefreshBtnText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              {sortedCategories.length === 0 ? <Text style={styles.empty}>Add a category first.</Text> : null}
              {loading ? <ActivityIndicator size="small" color={CHECKERS.teal} /> : null}
              {items.length === 0 && sortedCategories.length > 0 ? (
                <Text style={styles.empty}>No items yet.</Text>
              ) : null}
              {itemsByCategory.map((group, idx) => (
                <View
                  key={group.name}
                  style={[styles.shopCategorySection, idx === 0 && styles.shopCategorySectionFirst]}
                >
                  <Text style={styles.shopCategoryHeading}>{group.name}</Text>
                  {group.items.length === 0 ? (
                    <Text style={styles.empty}>No items in this category.</Text>
                  ) : (
                    group.items.map((item) => renderShopItemRow(item))
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={categoryModalOpen} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.modalBackdropCentered}
          activeOpacity={1}
          onPress={() => {
            setCategoryModalOpen(false)
            setCategoryPickTarget(null)
          }}
        >
          <View style={[styles.dialogCard, { maxWidth: 360, width: '100%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.shopCategoryModalHeader}>
              <Text style={[styles.modalTitle, styles.shopCategoryModalTitle]}>Category</Text>
              <TouchableOpacity
                onPress={() => {
                  setCategoryModalOpen(false)
                  setCategoryPickTarget(null)
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.shopCategoryModalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            {sortedCategories.map((category) => (
              <TouchableOpacity
                key={category._id}
                style={styles.modalRow}
                onPress={() => {
                  if (categoryPickTarget === 'edit' && editItem) setEditItem({ ...editItem, categoryId: category._id })
                  else setSelectedCategoryId(category._id)
                  setCategoryModalOpen(false)
                  setCategoryPickTarget(null)
                }}
              >
                <Text style={styles.itemText}>{category.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={Platform.OS === 'ios' && shopReminderPicker !== null} animationType="slide" transparent>
        <View style={[styles.modalBackdropCentered, styles.modalKeyboardAvoid]}>
          <View style={[styles.dialogCard, { width: '100%', maxWidth: 400 }]}>
            <View style={styles.datePickerToolbar}>
              <TouchableOpacity onPress={() => setShopReminderPicker(null)} hitSlop={12}>
                <Text style={styles.datePickerToolbarBtn}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => clearShopReminderPicker()} hitSlop={12}>
                <Text style={styles.datePickerToolbarBtn}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmShopReminderPicker()} hitSlop={12}>
                <Text style={styles.datePickerToolbarBtn}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={shopReminderDraft}
              mode="date"
              display="spinner"
              onChange={(_, date) => {
                if (date) setShopReminderDraft(startOfDay(date))
              }}
              themeVariant="light"
            />
          </View>
        </View>
      </Modal>
      {Platform.OS === 'android' && shopReminderPicker !== null ? (
        <DateTimePicker
          value={shopReminderDraft}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (event?.type === 'dismissed') {
              setShopReminderPicker(null)
              return
            }
            if (date) {
              const sd = startOfDay(date)
              if (shopReminderPicker === 'add') setReminderDate(sd)
              else if (shopReminderPicker === 'edit' && editItem) setEditItem({ ...editItem, reminderAt: sd.getTime() })
              setShopReminderPicker(null)
            }
          }}
        />
      ) : null}

      <Modal visible={editItem !== null} animationType="fade" transparent>
        <KeyboardAvoidingView
          style={[styles.modalBackdropCentered, styles.modalKeyboardAvoid]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}
        >
          <View style={[styles.dialogCard, { width: '100%', maxWidth: 420 }]}>
            <Text style={styles.modalTitle}>Edit item</Text>
            <Text style={styles.fieldLabel}>Category</Text>
            <TouchableOpacity
              style={styles.dropdownField}
              onPress={() => {
                setCategoryPickTarget('edit')
                setCategoryModalOpen(true)
              }}
              accessibilityRole="button"
            >
              <View style={styles.dropdownFieldInner}>
                <Text style={styles.dropdownFieldText}>{editCatLabel}</Text>
                <Text style={styles.dropdownChevron}>▼</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.fieldLabel}>Item</Text>
            <TextInput
              value={editItem?.title ?? ''}
              onChangeText={(t) => setEditItem((prev) => (prev ? { ...prev, title: t } : null))}
              style={styles.input}
              placeholder="Item name"
            />
            <Text style={styles.fieldLabel}>Quantity (optional)</Text>
            <TextInput
              value={editItem?.quantityStr ?? ''}
              onChangeText={(t) => setEditItem((prev) => (prev ? { ...prev, quantityStr: t } : null))}
              style={styles.input}
              placeholder="e.g. 2"
              keyboardType="numeric"
            />
            <View style={styles.row}>
              {SHOP_PRIORITY_KEYS.map((p) => (
                <TouchableOpacity
                  key={`edit-${p}`}
                  style={[styles.priorityChip, styles[`priority_${p}`], editItem?.priority === p ? styles.prioritySelected : null]}
                  onPress={() => setEditItem((prev) => (prev ? { ...prev, priority: p } : null))}
                >
                  <Text style={styles.priorityText}>{shopPriorityLabel(p)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, styles.shopReminderLabelCompact]}>Reminder</Text>
            <View style={styles.shopReminderRowCompact}>
              <TouchableOpacity
                style={[styles.dropdownField, styles.shopAddDropdownCompact, styles.shopReminderTouchFlex]}
                onPress={() => openShopReminderPicker('edit')}
                accessibilityRole="button"
              >
                <View style={styles.dropdownFieldInner}>
                  <Text
                    style={
                      editItem?.reminderAt
                        ? [styles.dropdownFieldText, styles.shopReminderInlineText]
                        : [styles.dropdownPlaceholder, styles.shopReminderInlineText]
                    }
                    numberOfLines={1}
                  >
                    {editItem?.reminderAt ? formatPowerDate(new Date(editItem.reminderAt)) : 'None'}
                  </Text>
                  <Text style={[styles.dropdownChevron, styles.shopAddDropdownChevron]}>📅</Text>
                </View>
              </TouchableOpacity>
              {editItem?.reminderAt ? (
                <TouchableOpacity
                  style={styles.shopReminderClearX}
                  onPress={() => setEditItem((prev) => (prev ? { ...prev, reminderAt: null } : null))}
                  accessibilityRole="button"
                  accessibilityLabel="Clear reminder"
                  hitSlop={8}
                >
                  <Text style={styles.shopReminderClearXText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.buttonSecondary} onPress={() => setEditItem(null)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonPrimary, savingEdit && styles.buttonDisabled]}
                disabled={savingEdit}
                onPress={() => void saveEditItem()}
              >
                <Text style={styles.buttonText}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

function ChoresScreen({ user, onBack }) {
  const [users, setUsers] = useState([])
  const [userNameById, setUserNameById] = useState({})
  const [chores, setChores] = useState([])
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [selectedDays, setSelectedDays] = useState(['Mon'])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const uid = user?._id ? `?userId=${encodeURIComponent(user._id)}` : ''
      const [usersData, choresData] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch(`/api/chores${uid}`),
      ])
      const onlyChildren = usersData.filter((candidate) => ['Danelle', 'Suzelle'].includes(candidate.name))
      setUsers(onlyChildren)
      setUserNameById(Object.fromEntries(usersData.map((u) => [u._id, u.name])))
      setChores(choresData)
      if (!assigneeId && onlyChildren[0]) setAssigneeId(onlyChildren[0]._id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading chores')
    } finally {
      setLoading(false)
    }
  }, [assigneeId, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggleDay = (day) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  const addChore = async () => {
    if (!title.trim() || !assigneeId || selectedDays.length === 0) return
    await apiFetch('/api/chores', {
      method: 'POST',
      body: JSON.stringify({ userId: user?._id, title: title.trim(), assignedToUserId: assigneeId, assignedDays: selectedDays }),
    })
    setTitle('')
    setSelectedDays(['Mon'])
    await refresh()
  }

  const toggleCompleted = async (chore) => {
    const can =
      isAdmin(user) || chore.assignedToUserId === user?._id
    if (!can) return
    await apiFetch(`/api/chores/${chore._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ userId: user?._id, completed: !chore.completed }),
    })
    await refresh()
  }

  const toggleAdminVerified = async (chore) => {
    if (!isAdmin(user)) return
    await apiFetch(`/api/chores/${chore._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ userId: user?._id, adminVerified: !chore.adminVerified }),
    })
    await refresh()
  }

  const choresByDay = Object.fromEntries(allDays.map((day) => [day, chores.filter((chore) => chore.assignedDays?.includes(day))]))

  return (
    <SafeAreaView style={[styles.container, sweepSussieStyles.screen]}>
      <TopBar title="Sweep Sussie" variant="chores" onBack={onBack} onRefresh={refresh} />
      <View style={sweepSussieStyles.screenStripeBar}>
        {SA_FLAG_STRIPES.map((color, i) => (
          <View key={`chores-stripe-${i}`} style={[sweepSussieStyles.screenStripeSeg, { backgroundColor: color }]} />
        ))}
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.contentWrap, styles.formScrollBottom]}
        >
        {isAdmin(user) ? (
          <View style={[styles.card, sweepSussieStyles.card]}>
            <Text style={[styles.sectionTitle, sweepSussieStyles.sectionTitle]}>Add Chore</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Chore title" />
            <View style={styles.row}>
              {users.map((candidate) => (
                <TouchableOpacity
                  key={candidate._id}
                  style={[styles.chip, assigneeId === candidate._id ? sweepSussieStyles.chipSelected : null]}
                  onPress={() => setAssigneeId(candidate._id)}
                >
                  <Text
                    style={[styles.chipText, assigneeId === candidate._id ? sweepSussieStyles.chipTextSelected : null]}
                  >
                    {candidate.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalWrap}>
              {allDays.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.chip, selectedDays.includes(day) ? sweepSussieStyles.chipSelected : null]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.chipText, selectedDays.includes(day) ? sweepSussieStyles.chipTextSelected : null]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.row}>
              <TouchableOpacity style={styles.buttonSecondary} onPress={() => setSelectedDays([...allDays])}>
                <Text style={styles.buttonText}>Whole Week</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addChore()}>
                <Text style={styles.buttonText}>Add Chore</Text>
              </TouchableOpacity>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : null}

        <View style={[styles.card, sweepSussieStyles.card]}>
          <Text style={[styles.sectionTitle, sweepSussieStyles.sectionTitle]}>Weekly Calendar</Text>
          {loading ? <ActivityIndicator size="small" color={SA.blue} /> : null}
          {allDays.map((day) => (
            <View key={day} style={[styles.daySection, sweepSussieStyles.daySection]}>
              <Text style={[styles.dayTitle, sweepSussieStyles.dayTitle]}>{day}</Text>
              {choresByDay[day]?.length === 0 ? <Text style={styles.empty}>No chores.</Text> : null}
              {choresByDay[day]?.map((chore) => {
                const assigneeName = userNameById[chore.assignedToUserId] || 'Unknown'
                const canToggleDone = isAdmin(user) || chore.assignedToUserId === user?._id
                return (
                  <View key={`${day}-${chore._id}`} style={styles.choreCalendarRow}>
                    <TouchableOpacity
                      style={styles.choreCheckHit}
                      disabled={!canToggleDone}
                      onPress={() => void toggleCompleted(chore)}
                      accessibilityLabel={chore.completed ? 'Mark chore not done' : 'Mark chore done'}
                    >
                      <Text style={styles.choreCheckGlyph}>{chore.completed ? '✅' : '⬜'}</Text>
                    </TouchableOpacity>
                    {isAdmin(user) ? (
                      <TouchableOpacity
                        style={styles.choreCheckHit}
                        onPress={() => void toggleAdminVerified(chore)}
                        accessibilityLabel={
                          chore.adminVerified ? 'Clear admin verification' : 'Admin verify chore'
                        }
                      >
                        <Text style={styles.choreCheckGlyph}>
                          {chore.adminVerified ? '🛡️' : '⬜'}
                        </Text>
                      </TouchableOpacity>
                    ) : chore.adminVerified ? (
                      <Text style={styles.choreAdminBadge} accessibilityLabel="Verified by admin">
                        🛡️
                      </Text>
                    ) : (
                      <View style={styles.choreCheckHit} />
                    )}
                    <View style={styles.choreCalendarTextCol}>
                      <Text style={styles.itemText}>{chore.title}</Text>
                      <Text style={styles.itemMeta}>
                        {assigneeName}
                        {isAdmin(user)
                          ? ` · Done ${chore.completed ? 'yes' : 'no'} · Sign-off ${chore.adminVerified ? 'yes' : 'no'}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ))}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Pawn Shit — brown & gold from logo (pawn, coin, silhouette) */
const pawnStyles = StyleSheet.create({
  screen: { backgroundColor: '#2c1810' },
  dashboardTile: {
    borderWidth: 2,
    borderColor: '#c9954a',
    backgroundColor: '#fffaf3',
  },
  dashboardIconRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#ffb833',
    backgroundColor: '#fff5e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  dashboardTileImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  dashboardTileLabel: { color: '#4e110a', fontWeight: '800' },
  topBar: {
    backgroundColor: '#4e110a',
    borderBottomColor: '#ffb833',
    borderBottomWidth: 2,
  },
  topBarTitle: { color: '#ffb833' },
  topBarLink: { color: '#ffd699' },
  card: {
    backgroundColor: '#fffaf3',
    borderColor: '#c9954a',
    borderWidth: 1,
  },
  sectionTitle: { color: '#4e110a' },
  fieldLabel: { color: '#6b3d2e' },
  input: {
    borderColor: '#c9954a',
    backgroundColor: '#fffdfb',
    color: '#2c1810',
  },
  dropdownField: {
    borderColor: '#c9954a',
    backgroundColor: '#f5ebe0',
  },
  dropdownFieldText: { color: '#2c1810' },
  dropdownPlaceholder: { color: '#9a7b6a' },
  dropdownChevron: { color: '#b8860b' },
  buttonPrimary: { backgroundColor: '#ffb833' },
  buttonPrimaryText: { color: '#3d2914' },
  buttonSecondary: { backgroundColor: '#4e110a' },
  buttonSecondaryText: { color: '#ffb833' },
  addShopPlus: {
    backgroundColor: '#ffb833',
    borderWidth: 2,
    borderColor: '#4e110a',
  },
  addShopPlusText: { color: '#4e110a', fontWeight: '800' },
  itemRow: { borderTopColor: '#e8d5c4' },
  itemText: { color: '#3d2914' },
  itemMeta: { color: '#6b5344' },
  mutedText: { color: '#8a7268' },
  error: { color: '#c41e1e' },
  modalBackdropTint: { backgroundColor: 'rgba(44, 24, 16, 0.55)' },
  modalBackdropTintDark: { backgroundColor: 'rgba(20, 8, 8, 0.65)' },
  dialogCard: {
    backgroundColor: '#fffaf3',
    borderColor: '#ffb833',
  },
  modalCard: {
    backgroundColor: '#fffaf3',
    borderColor: '#c9954a',
  },
  modalTitle: { color: '#4e110a' },
  modalRow: { borderBottomColor: '#e8d5c4' },
  datePickerSheet: {
    backgroundColor: '#fffaf3',
    borderTopWidth: 2,
    borderTopColor: '#ffb833',
  },
  datePickerToolbar: { borderBottomColor: '#e8d5c4' },
  datePickerToolbarBtn: { color: '#b8860b' },
  shopPickerToolbar: { borderBottomColor: '#e8d5c4' },
  shopPickerCancelText: {
    color: '#ffb833',
    fontSize: 16,
    fontWeight: '700',
  },
  shopPickerTitle: {
    flex: 1,
    textAlign: 'center',
    marginBottom: 0,
    paddingHorizontal: 6,
    fontSize: 15,
  },
  statusCollected: { color: '#16a34a', fontSize: 22, fontWeight: '900' },
  statusExtended: { color: '#ea580c', fontSize: 22, fontWeight: '900' },
  statusLost: { color: '#dc2626', fontSize: 22, fontWeight: '900' },
  statusCollectedMeta: { color: '#166534', fontWeight: '700', fontSize: 13 },
  statusExtendedMeta: { color: '#9a3412', fontWeight: '700', fontSize: 13 },
  statusLostMeta: { color: '#991b1b', fontWeight: '700', fontSize: 13 },
  itemMetaDim: { color: '#7c6a60', fontSize: 12, fontStyle: 'italic' },
  actionBtnCollect: {
    backgroundColor: '#dcfce7',
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 52,
    alignItems: 'center',
  },
  actionBtnExtend: {
    backgroundColor: '#ffedd5',
    borderWidth: 2,
    borderColor: '#ea580c',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 52,
    alignItems: 'center',
  },
  actionBtnLost: {
    backgroundColor: '#fee2e2',
    borderWidth: 2,
    borderColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 52,
    alignItems: 'center',
  },
  actionIconCollect: { color: '#15803d', fontSize: 22, fontWeight: '900' },
  actionIconExtend: { color: '#c2410c', fontSize: 22, fontWeight: '900' },
  actionIconLost: { color: '#b91c1c', fontSize: 22, fontWeight: '900' },
  pawnTabBar: {
    flexDirection: 'row',
    backgroundColor: '#4e110a',
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 12,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: '#ffb833',
  },
  pawnTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  pawnTabActive: { backgroundColor: '#ffb833' },
  pawnTabText: { color: '#ffd699', fontWeight: '700', fontSize: 14 },
  pawnTabTextActive: { color: '#3d2914' },
  shopGroup: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#c9954a',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fffdfb',
  },
  shopGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f0e4d4',
    borderBottomWidth: 1,
    borderBottomColor: '#c9954a',
  },
  shopGroupChevron: { color: '#4e110a', fontWeight: '800', width: 22, fontSize: 14 },
  shopGroupTitle: { flex: 1, color: '#4e110a', fontWeight: '800', fontSize: 16 },
  shopGroupCount: { color: '#6b5344', fontWeight: '600', fontSize: 13 },
  ticketCard: {
    borderLeftWidth: 5,
    backgroundColor: '#fffaf3',
    borderBottomWidth: 1,
    borderBottomColor: '#e8d5c4',
  },
  ticketCardInner: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 10 },
  ticketCardMain: { flex: 1, paddingRight: 8 },
  ticketTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  ticketPawnedRow: { flex: 1, color: '#3d2914', fontSize: 17, fontWeight: '700' },
  ticketPriorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ticketPriorityPillText: { color: '#fff8f0', fontWeight: '800', fontSize: 12 },
  ticketItemLine: { color: '#2c1810', fontSize: 16, lineHeight: 22, marginBottom: 4 },
  ticketItemAmount: { color: '#4e110a', fontWeight: '700', fontSize: 16 },
  ticketStatusLine: { marginTop: 6 },
  ticketFooterRow: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e8d5c4' },
  ticketFooterText: { color: '#5c4033', fontSize: 15 },
  ticketFooterEm: { fontWeight: '800', fontSize: 17, color: '#2c1810' },
  ticketActionsCol: { gap: 5, paddingTop: 2 },
  ticketActionsColClosed: { justifyContent: 'flex-start', paddingTop: 4, minWidth: 28, alignItems: 'center' },
  actionBtnTiny: {
    minWidth: 30,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnTinyCollect: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  actionBtnTinyExtend: { backgroundColor: '#ffedd5', borderColor: '#ea580c' },
  actionBtnTinyLost: { backgroundColor: '#fee2e2', borderColor: '#dc2626' },
  actionIconTinyCollect: { color: '#15803d', fontSize: 13, fontWeight: '900' },
  actionIconTinyExtend: { color: '#c2410c', fontSize: 13, fontWeight: '900' },
  actionIconTinyLost: { color: '#b91c1c', fontSize: 13, fontWeight: '900' },
  actionBtnTinyDelete: { backgroundColor: '#e7e5e4', borderColor: '#57534e' },
  actionIconTinyDelete: { fontSize: 12 },
})

const powerStyles = StyleSheet.create({
  screen: { backgroundColor: '#0b3b75' },
  dashboardTile: {
    borderWidth: 2,
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },
  dashboardIconRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dashboardIcon: {
    marginBottom: 0,
    color: '#facc15',
  },
  dashboardTileLabel: { color: '#0b3b75' },
  topBar: {
    backgroundColor: '#0b3b75',
    borderBottomColor: '#facc15',
    borderBottomWidth: 2,
  },
  topBarTitle: { color: '#facc15' },
  topBarLink: { color: '#dbeafe' },
  card: {
    backgroundColor: '#eff6ff',
    borderColor: '#facc15',
    borderWidth: 1,
  },
  sectionTitle: { color: '#0b3b75' },
  input: {
    borderColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  buttonPrimary: { backgroundColor: '#facc15' },
  buttonPrimaryText: { color: '#0b3b75', fontWeight: '900' },
  buttonSecondary: {
    backgroundColor: '#082f5c',
    borderWidth: 1,
    borderColor: '#facc15',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 100,
  },
  buttonSecondaryText: { color: '#dbeafe', fontWeight: '700' },
  dateTouch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateTouchLabel: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  dateTouchValue: { color: '#0b3b75', fontWeight: '800', fontSize: 15 },
  loadFormGrid: { width: '100%' },
  loadFormRow: { flexDirection: 'row', gap: 6, marginBottom: 5 },
  loadFormHalf: { flex: 1, minWidth: 0, marginBottom: 0 },
  recordContentWrap: { gap: 8, paddingTop: 6 },
  recordCard: { padding: 8 },
  recordSectionTitle: { fontSize: 14, marginBottom: 4 },
  recordMeta: { fontSize: 11, marginBottom: 4 },
  recordInput: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    fontSize: 14,
    minHeight: 36,
  },
  recordDateTouchLabel: { fontSize: 11 },
  recordDateTouchValue: { fontSize: 13 },
  recordPrimaryBtn: { paddingVertical: 8, borderRadius: 9 },
  recordPrimaryBtnText: { fontSize: 14 },
  statsScopeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  statsScopeChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  statsScopeChipActive: {
    backgroundColor: '#facc15',
    borderColor: '#0b3b75',
    borderWidth: 2,
  },
  statsScopeChipText: { color: '#0b3b75', fontWeight: '700', fontSize: 12 },
  statsScopeChipTextActive: { color: '#0b3b75', fontWeight: '800' },
  datePickerToolbarPower: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
  },
  dateToolbarBtn: { color: '#1d4ed8', fontWeight: '800', fontSize: 16 },
  typeChip: {
    flex: 1,
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: '#facc15',
    borderColor: '#0b3b75',
    borderWidth: 2,
  },
  typeChipText: { color: '#0b3b75', fontWeight: '800' },
  typeChipTextActive: { color: '#0b3b75' },
  meterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  meterChipActive: {
    backgroundColor: '#facc15',
    borderColor: '#0b3b75',
    borderWidth: 2,
  },
  meterChipText: { color: '#0b3b75', fontWeight: '700' },
  meterChipTextActive: { color: '#0b3b75', fontWeight: '900' },
  powerTabBar: {
    flexDirection: 'row',
    backgroundColor: '#082f5c',
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 12,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: '#facc15',
  },
  powerTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  powerTabActive: { backgroundColor: '#facc15' },
  powerTabText: { color: '#dbeafe', fontWeight: '700', fontSize: 12 },
  powerTabTextActive: { color: '#0b3b75' },
  meterColumns: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  meterColumn: { flex: 1, minWidth: 0 },
  meterColumnTitle: {
    color: '#0b3b75',
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 4,
  },
  meterColumnChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    marginBottom: 5,
  },
  meterColumnChipText: { color: '#0b3b75', fontWeight: '700', fontSize: 12 },
  restoreChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#ffffff',
    marginRight: 6,
    marginBottom: 6,
  },
  restoreChipText: { color: '#334155', fontSize: 12, fontWeight: '600' },
  itemRow: { borderTopColor: '#bfdbfe' },
  itemText: { color: '#0b3b75' },
  itemMeta: { color: '#1e40af' },
  empty: { color: '#1e40af' },
  error: { color: '#b91c1c' },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHECKERS.bg },
  keyboardFlex: { flex: 1 },
  loginScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    paddingBottom: 48,
  },
  loginHeroImage: {
    width: '100%',
    maxWidth: 400,
    height: 220,
    borderRadius: 12,
    marginBottom: 28,
    alignSelf: 'center',
    backgroundColor: '#e8ecec',
  },
  loginFormBlock: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  loginPrimaryBtn: {
    backgroundColor: CHECKERS.teal,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  loginErrorCenter: { textAlign: 'center' },
  formScrollBottom: { paddingBottom: 120, flexGrow: 1 },
  modalKeyboardAvoid: { flex: 1, justifyContent: 'center', width: '100%' },
  contentWrap: { padding: 16, gap: 12, paddingBottom: 40 },
  marginTop8: { marginTop: 8 },
  card: {
    backgroundColor: CHECKERS.card,
    borderRadius: 12,
    borderColor: '#dce8e8',
    borderWidth: 1,
    padding: 12,
  },
  dashboardTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 10,
    elevation: 8,
    backgroundColor: CHECKERS.bg,
  },
  dashboardLogoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  dashboardLogoutPressed: { opacity: 0.75 },
  dashboardLogoutText: {
    color: CHECKERS.tealDark,
    fontWeight: '800',
    fontSize: 16,
  },
  dashboardUrgentTitle: {
    color: DASH_SOFT_RED.title,
  },
  dashboardUrgentBody: {
    color: DASH_SOFT_RED.body,
  },
  dashboardUrgentMeta: {
    color: DASH_SOFT_RED.meta,
  },
  dashboardHeaderCard: {
    alignItems: 'center',
  },
  dashboardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: CHECKERS.text,
    textAlign: 'center',
    width: '100%',
  },
  dashboardSubtitle: {
    fontSize: 14,
    color: CHECKERS.textMuted,
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  title: { fontSize: 24, fontWeight: '800', color: CHECKERS.text },
  subtitle: { fontSize: 14, color: CHECKERS.textMuted, marginTop: 4 },
  meta: { fontSize: 12, color: CHECKERS.textMuted, marginTop: 8 },
  topBar: {
    height: 56,
    borderBottomWidth: 2,
    borderBottomColor: CHECKERS.tealDark,
    backgroundColor: CHECKERS.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  topButton: { paddingHorizontal: 8, paddingVertical: 6 },
  topButtonText: { color: CHECKERS.lime, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#b8d5d4',
    backgroundColor: CHECKERS.card,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: { fontSize: 28, marginBottom: 8 },
  tileImage: { width: 44, height: 44, borderRadius: 10, marginBottom: 8 },
  tileLabel: { fontWeight: '700', color: CHECKERS.text, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#b8d5d4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    marginBottom: 8,
    color: CHECKERS.text,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  horizontalWrap: { marginVertical: 6 },
  buttonPrimary: {
    flex: 1,
    minWidth: 120,
    backgroundColor: CHECKERS.teal,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    minWidth: 120,
    backgroundColor: CHECKERS.tealDark,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: CHECKERS.teal, marginBottom: 8 },
  sectionTitleNoMb: { marginBottom: 0 },
  pawnTicketHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pawnTicketActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  pawnPriorityPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  pawnPriorityPickChip: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pawnPriorityPickChipSelected: {
    borderWidth: 3,
    borderColor: '#ffb833',
  },
  pawnPriorityPickChipText: { color: '#fff8f0', fontWeight: '900', fontSize: 16 },
  itemRow: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  choreCalendarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    paddingVertical: 8,
    gap: 6,
  },
  choreCheckHit: {
    width: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choreCheckGlyph: { fontSize: 18 },
  choreAdminBadge: { fontSize: 16, width: 36, textAlign: 'center', paddingTop: 2 },
  choreCalendarTextCol: { flex: 1, minWidth: 0 },
  itemText: { fontSize: 15, fontWeight: '600', color: CHECKERS.text },
  itemMeta: { fontSize: 12, color: CHECKERS.textMuted, marginTop: 2 },
  empty: { color: CHECKERS.textMuted, fontSize: 13 },
  error: { color: '#b91c1c', marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: CHECKERS.limeMuted, borderColor: CHECKERS.lime },
  chipText: { color: CHECKERS.text, fontWeight: '600' },
  chipTextActive: { color: CHECKERS.tealDark, fontWeight: '700' },
  priorityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#94a3b8',
  },
  priority_green: { backgroundColor: '#dcfce7' },
  priority_yellow: { backgroundColor: '#fef9c3' },
  priority_red: { backgroundColor: '#fee2e2' },
  prioritySelected: { borderColor: '#0f172a', borderWidth: 2 },
  priorityText: { fontSize: 12, fontWeight: '700', color: '#111827' },
  buttonDisabled: { opacity: 0.45 },
  newTicketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addShopPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CHECKERS.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addShopPlusText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '300',
    marginTop: -2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: CHECKERS.teal,
    marginBottom: 4,
  },
  dropdownField: {
    borderWidth: 1,
    borderColor: '#b8d5d4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  dropdownFieldInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dropdownFieldText: { fontSize: 16, color: CHECKERS.text, flex: 1 },
  dropdownPlaceholder: { fontSize: 16, color: '#94a3b8', flex: 1 },
  dropdownChevron: { fontSize: 12, color: '#64748b' },
  modalBackdropCentered: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  datePickerSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  datePickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  datePickerToolbarBtn: { color: CHECKERS.teal, fontWeight: '700', fontSize: 16 },
  shopPickerToolbar: { paddingHorizontal: 12 },
  shopPickerToolbarSpacer: { width: 64 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  modalList: { maxHeight: 320, marginBottom: 12 },
  modalRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  smallButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  smallButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 12 },
  daySection: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  dayTitle: { fontSize: 14, fontWeight: '800', color: CHECKERS.teal, paddingTop: 8 },
  shopTabBar: {
    flexDirection: 'row',
    backgroundColor: CHECKERS.tealDark,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 12,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: CHECKERS.lime,
  },
  shopTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  shopTabActive: { backgroundColor: CHECKERS.lime },
  shopTabText: { color: '#dbeafe', fontWeight: '700', fontSize: 12 },
  shopTabTextActive: { color: CHECKERS.tealDark },
  shopCategoryAddRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  shopCategoryInput: {
    flex: 1,
    marginBottom: 0,
  },
  shopCategoryAddBtn: {
    backgroundColor: CHECKERS.teal,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopCategoryAddBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  shopCategorySection: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  shopCategorySectionFirst: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  shopListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  shopListHeaderTitle: { flex: 1, marginBottom: 0 },
  shopListRefreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CHECKERS.teal,
    backgroundColor: '#ffffff',
  },
  shopListRefreshBtnText: {
    color: CHECKERS.tealDark,
    fontWeight: '800',
    fontSize: 14,
  },
  shopCategoryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  shopCategoryModalTitle: {
    flex: 1,
    marginBottom: 0,
  },
  shopCategoryModalCloseText: {
    color: CHECKERS.teal,
    fontWeight: '800',
    fontSize: 16,
  },
  shopAddDropdownCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 36,
    marginBottom: 8,
  },
  shopAddDropdownText: {
    fontSize: 14,
  },
  shopAddDropdownChevron: {
    fontSize: 10,
  },
  shopReminderLabelCompact: {
    fontSize: 12,
    marginBottom: 4,
    marginTop: 2,
  },
  shopReminderRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  shopReminderTouchFlex: {
    flex: 1,
    marginBottom: 0,
  },
  shopReminderInlineText: {
    fontSize: 13,
  },
  shopReminderClearX: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  shopReminderClearXText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '800',
  },
  shopCategoryHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: CHECKERS.teal,
    marginBottom: 6,
  },
  shopPriorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    alignItems: 'center',
  },
  shopPriorityPill: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  shopPriorityPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CHECKERS.text,
  },
  shopItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  shopAdminActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  shopBoughtBtn: {
    borderWidth: 2,
    borderColor: CHECKERS.lime,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopBoughtBtnActive: {
    backgroundColor: CHECKERS.limeMuted,
    borderColor: CHECKERS.lime,
  },
  shopBoughtBtnText: { fontSize: 18, fontWeight: '900', color: CHECKERS.teal },
  shopBoughtBtnTextActive: { color: '#166534' },
  shopRemoveBtn: {
    borderWidth: 2,
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopRemoveBtnText: { fontSize: 18, fontWeight: '900', color: '#b91c1c' },
})
