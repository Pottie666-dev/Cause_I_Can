import React, { useCallback, useEffect, useMemo, useState } from 'react'
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

/** Darker palette accents — P1 darkest, P5 strongest gold-brown */
const PAWN_PRIORITY_ACCENT = {
  1: '#1a0f0c',
  2: '#2c1810',
  3: '#4e110a',
  4: '#5c3d14',
  5: '#7a5c1a',
}

const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isAdmin(user) {
  return user?.role === 'admin'
}

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
  const [screen, setScreen] = useState('login')
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [urgentShopItems, setUrgentShopItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const headerText = useMemo(() => `API: ${apiUrl}`, [])

  const fetchUrgentShopItems = useCallback(async () => {
    try {
      const shopItems = await apiFetch('/api/shop-items')
      setUrgentShopItems(shopItems.filter((item) => item.priority === 'red' && !item.purchased).slice(0, 5))
    } catch (_err) {
      setUrgentShopItems([])
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
      setScreen('dashboard')
      await fetchUrgentShopItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [fetchUrgentShopItems, password, username])

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
            <View style={styles.card}>
              <Text style={styles.title}>Ridgeway-Mansion</Text>
              <Text style={styles.subtitle}>Login to open your dashboard</Text>
              <Text style={styles.meta}>{headerText}</Text>
            </View>

            <View style={styles.card}>
              <TextInput
                placeholder="Name or user code (Pottie/u1)"
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
              <TouchableOpacity style={styles.buttonPrimary} onPress={() => void doLogin()}>
                <Text style={styles.buttonText}>Login</Text>
              </TouchableOpacity>
              {loading ? <ActivityIndicator size="small" color="#4f46e5" style={styles.marginTop8} /> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  if (screen === 'dashboard') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentWrap}>
          <View style={styles.card}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>Welcome {user?.name}</Text>
          </View>
          <View style={styles.grid}>
            {isAdmin(user) ? (
              <DashboardTile
                imageSource={require('./public/PAWNSHIT.jpeg')}
                icon="🏦"
                label="Pawn Shit"
                onPress={() => setScreen('pawn')}
              />
            ) : null}
            <DashboardTile icon="⚡" label="Power H20" onPress={() => setScreen('power')} />
            <DashboardTile icon="🛒" label="SHOPList" onPress={() => setScreen('shop')} />
            <DashboardTile icon="📅" label="D & Z" onPress={() => setScreen('chores')} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Most Important SHOPList Items</Text>
            {urgentShopItems.length === 0 ? <Text style={styles.empty}>No red-priority items right now.</Text> : null}
            {urgentShopItems.map((item) => (
              <View key={item._id} style={styles.itemRow}>
                <Text style={styles.itemText}>🔴 {item.title}</Text>
                <Text style={styles.itemMeta}>
                  {item.reminderAt ? `Reminder: ${new Date(item.reminderAt).toLocaleString()}` : 'No reminder set'}
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => {
              setUser(null)
              setScreen('login')
              setPassword('')
            }}
          >
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
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
    return <ShopScreen user={user} onBack={() => setScreen('dashboard')} onUpdatedUrgent={() => void fetchUrgentShopItems()} />
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

function DashboardTile({ icon, label, imageSource, onPress }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress}>
      {imageSource ? <Image source={imageSource} style={styles.tileImage} resizeMode="cover" /> : <Text style={styles.tileIcon}>{icon}</Text>}
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function TopBar({ title, onBack, onRefresh, variant }) {
  const pawn = variant === 'pawn'
  return (
    <View style={[styles.topBar, pawn && pawnStyles.topBar]}>
      <TouchableOpacity style={styles.topButton} onPress={onBack}>
        <Text style={[styles.topButtonText, pawn && pawnStyles.topBarLink]}>Back</Text>
      </TouchableOpacity>
      <Text style={[styles.topTitle, pawn && pawnStyles.topBarTitle]}>{title}</Text>
      <TouchableOpacity style={styles.topButton} onPress={() => void onRefresh()}>
        <Text style={[styles.topButtonText, pawn && pawnStyles.topBarLink]}>Refresh</Text>
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
  const [meterName, setMeterName] = useState('')
  const [meterNumber, setMeterNumber] = useState('')
  const [selectedMeterId, setSelectedMeterId] = useState('')
  const [amount, setAmount] = useState('')
  const [units, setUnits] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [metersData, txData] = await Promise.all([apiFetch('/api/meters'), apiFetch('/api/meter-transactions')])
      setMeters(metersData)
      setTransactions(txData)
      if (!selectedMeterId && metersData[0]) setSelectedMeterId(metersData[0]._id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading utility data')
    } finally {
      setLoading(false)
    }
  }, [selectedMeterId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addMeter = async () => {
    if (!meterName.trim()) return
    await apiFetch('/api/meters', {
      method: 'POST',
      body: JSON.stringify({ userId: user?._id, name: meterName.trim(), meterNumber: meterNumber.trim() }),
    })
    setMeterName('')
    setMeterNumber('')
    await refresh()
  }

  const addTransaction = async () => {
    if (!selectedMeterId) return
    await apiFetch('/api/meter-transactions', {
      method: 'POST',
      body: JSON.stringify({
        meterId: selectedMeterId,
        userId: user?._id,
        amount: Number(amount || 0),
        units: Number(units || 0),
        date: dateInput ? new Date(dateInput).getTime() : Date.now(),
      }),
    })
    setAmount('')
    setUnits('')
    setDateInput('')
    await refresh()
  }

  const meterLookup = Object.fromEntries(meters.map((meter) => [meter._id, meter]))

  return (
    <SafeAreaView style={styles.container}>
      <TopBar title="Power H20" onBack={onBack} onRefresh={refresh} />
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
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add Meter</Text>
            <TextInput value={meterName} onChangeText={setMeterName} style={styles.input} placeholder="Meter name" />
            <TextInput
              value={meterNumber}
              onChangeText={setMeterNumber}
              style={styles.input}
              placeholder="Meter number (optional)"
            />
            <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addMeter()}>
              <Text style={styles.buttonText}>Add Meter</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Record Utility Load</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalWrap}>
            {meters.map((meter) => (
              <TouchableOpacity
                key={meter._id}
                style={[styles.chip, selectedMeterId === meter._id ? styles.chipActive : null]}
                onPress={() => setSelectedMeterId(meter._id)}
              >
                <Text style={selectedMeterId === meter._id ? styles.chipTextActive : styles.chipText}>{meter.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput value={amount} onChangeText={setAmount} style={styles.input} placeholder="Amount paid" keyboardType="numeric" />
          <TextInput value={units} onChangeText={setUnits} style={styles.input} placeholder="Units loaded" keyboardType="numeric" />
          <TextInput
            value={dateInput}
            onChangeText={setDateInput}
            style={styles.input}
            placeholder="Date (YYYY-MM-DD)"
          />
          <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addTransaction()}>
            <Text style={styles.buttonText}>Save Transaction</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Utility Transactions</Text>
          {loading ? <ActivityIndicator size="small" color="#4f46e5" /> : null}
          {transactions.length === 0 ? <Text style={styles.empty}>No utility transactions yet.</Text> : null}
          {transactions.map((transaction) => (
            <View key={transaction._id} style={styles.itemRow}>
              <Text style={styles.itemText}>{meterLookup[transaction.meterId]?.name || 'Unknown meter'}</Text>
              <Text style={styles.itemMeta}>
                R {Number(transaction.amount || 0).toFixed(2)} | {Number(transaction.units || 0).toFixed(2)} units
              </Text>
              <Text style={styles.itemMeta}>{new Date(transaction.date || Date.now()).toLocaleDateString()}</Text>
            </View>
          ))}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ShopScreen({ user, onBack, onUpdatedUrgent }) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [categoryName, setCategoryName] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [priority, setPriority] = useState('yellow')
  const [reminderInput, setReminderInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [categoriesData, itemsData] = await Promise.all([apiFetch('/api/shop-categories'), apiFetch('/api/shop-items')])
      setCategories(categoriesData)
      setItems(itemsData)
      if (!selectedCategoryId && categoriesData[0]) setSelectedCategoryId(categoriesData[0]._id)
      onUpdatedUrgent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading shopping list')
    } finally {
      setLoading(false)
    }
  }, [onUpdatedUrgent, selectedCategoryId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addCategory = async () => {
    if (!categoryName.trim()) return
    await apiFetch('/api/shop-categories', { method: 'POST', body: JSON.stringify({ userId: user?._id, name: categoryName.trim() }) })
    setCategoryName('')
    await refresh()
  }

  const addItem = async () => {
    if (!itemTitle.trim() || !selectedCategoryId) return
    await apiFetch('/api/shop-items', {
      method: 'POST',
      body: JSON.stringify({
        title: itemTitle.trim(),
        userId: user?._id,
        categoryId: selectedCategoryId,
        priority,
        reminderAt: reminderInput ? new Date(reminderInput).getTime() : null,
      }),
    })
    setItemTitle('')
    setReminderInput('')
    setPriority('yellow')
    await refresh()
  }

  const updateItem = async (itemId, patch) => {
    await apiFetch(`/api/shop-items/${itemId}`, { method: 'PATCH', body: JSON.stringify(patch) })
    await refresh()
  }

  const categoriesLookup = Object.fromEntries(categories.map((category) => [category._id, category.name]))
  const highPriority = items.filter((item) => item.priority === 'red' && !item.purchased)

  return (
    <SafeAreaView style={styles.container}>
      <TopBar title="SHOPList" onBack={onBack} onRefresh={refresh} />
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
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add Category</Text>
            <TextInput value={categoryName} onChangeText={setCategoryName} style={styles.input} placeholder="Category name" />
            <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addCategory()}>
              <Text style={styles.buttonText}>Add Category</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Add Shopping Item</Text>
          <TextInput value={itemTitle} onChangeText={setItemTitle} style={styles.input} placeholder="Item name" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalWrap}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category._id}
                style={[styles.chip, selectedCategoryId === category._id ? styles.chipActive : null]}
                onPress={() => setSelectedCategoryId(category._id)}
              >
                <Text style={selectedCategoryId === category._id ? styles.chipTextActive : styles.chipText}>
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.row}>
            {['green', 'yellow', 'red'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.priorityChip, styles[`priority_${p}`], priority === p ? styles.prioritySelected : null]}
                onPress={() => setPriority(p)}
              >
                <Text style={styles.priorityText}>{p.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={reminderInput}
            onChangeText={setReminderInput}
            style={styles.input}
            placeholder="Reminder date (YYYY-MM-DD HH:mm)"
          />
          <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addItem()}>
            <Text style={styles.buttonText}>Add Item</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Most Important (Red)</Text>
          {highPriority.length === 0 ? <Text style={styles.empty}>No red-priority items.</Text> : null}
          {highPriority.map((item) => (
            <View key={item._id} style={styles.itemRow}>
              <Text style={styles.itemText}>🔴 {item.title}</Text>
              <Text style={styles.itemMeta}>
                {categoriesLookup[item.categoryId] || 'Unknown category'} |{' '}
                {item.reminderAt ? new Date(item.reminderAt).toLocaleString() : 'No reminder'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>All Items</Text>
          {loading ? <ActivityIndicator size="small" color="#4f46e5" /> : null}
          {items.map((item) => (
            <View key={item._id} style={styles.itemRow}>
              <Text style={styles.itemText}>
                {item.purchased ? '✅' : '⬜'} {item.title}
              </Text>
              <Text style={styles.itemMeta}>
                {categoriesLookup[item.categoryId] || 'Unknown'} | Priority: {item.priority}
              </Text>
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => void updateItem(item._id, { purchased: !item.purchased })}
                >
                  <Text style={styles.smallButtonText}>{item.purchased ? 'Undo' : 'Done'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallButton} onPress={() => void updateItem(item._id, { priority: 'red' })}>
                  <Text style={styles.smallButtonText}>R</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => void updateItem(item._id, { priority: 'yellow' })}
                >
                  <Text style={styles.smallButtonText}>Y</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => void updateItem(item._id, { priority: 'green' })}
                >
                  <Text style={styles.smallButtonText}>G</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ChoresScreen({ user, onBack }) {
  const [users, setUsers] = useState([])
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
      const [usersData, choresData] = await Promise.all([apiFetch('/api/users'), apiFetch('/api/chores')])
      const onlyChildren = usersData.filter((candidate) => ['Danelle', 'Suzelle'].includes(candidate.name))
      setUsers(onlyChildren)
      setChores(isAdmin(user) ? choresData : choresData.filter((chore) => chore.assignedToUserId === user?._id))
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
    await apiFetch(`/api/chores/${chore._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ userId: user?._id, completed: !chore.completed }),
    })
    await refresh()
  }

  const userLookup = Object.fromEntries(users.map((u) => [u._id, u.name]))
  const choresByDay = Object.fromEntries(allDays.map((day) => [day, chores.filter((chore) => chore.assignedDays?.includes(day))]))

  return (
    <SafeAreaView style={styles.container}>
      <TopBar title="D & Z Chores" onBack={onBack} onRefresh={refresh} />
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
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add Chore</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Chore title" />
            <View style={styles.row}>
              {users.map((candidate) => (
                <TouchableOpacity
                  key={candidate._id}
                  style={[styles.chip, assigneeId === candidate._id ? styles.chipActive : null]}
                  onPress={() => setAssigneeId(candidate._id)}
                >
                  <Text style={assigneeId === candidate._id ? styles.chipTextActive : styles.chipText}>{candidate.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalWrap}>
              {allDays.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.chip, selectedDays.includes(day) ? styles.chipActive : null]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={selectedDays.includes(day) ? styles.chipTextActive : styles.chipText}>{day}</Text>
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Weekly Calendar</Text>
          {loading ? <ActivityIndicator size="small" color="#4f46e5" /> : null}
          {allDays.map((day) => (
            <View key={day} style={styles.daySection}>
              <Text style={styles.dayTitle}>{day}</Text>
              {choresByDay[day]?.length === 0 ? <Text style={styles.empty}>No chores.</Text> : null}
              {choresByDay[day]?.map((chore) => (
                <TouchableOpacity key={`${day}-${chore._id}`} style={styles.itemRow} onPress={() => void toggleCompleted(chore)}>
                  <Text style={styles.itemText}>
                    {chore.completed ? '✅' : '⬜'} {chore.title}
                  </Text>
                  <Text style={styles.itemMeta}>{userLookup[chore.assignedToUserId] || 'Unknown'}</Text>
                </TouchableOpacity>
              ))}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  keyboardFlex: { flex: 1 },
  loginScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 12 },
  formScrollBottom: { paddingBottom: 120, flexGrow: 1 },
  modalKeyboardAvoid: { flex: 1, justifyContent: 'center', width: '100%' },
  contentWrap: { padding: 16, gap: 12, paddingBottom: 40 },
  marginTop8: { marginTop: 8 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#475569', marginTop: 4 },
  meta: { fontSize: 12, color: '#64748b', marginTop: 8 },
  topBar: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  topButton: { paddingHorizontal: 8, paddingVertical: 6 },
  topButtonText: { color: '#4f46e5', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#dbe2ea',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: { fontSize: 28, marginBottom: 8 },
  tileImage: { width: 44, height: 44, borderRadius: 10, marginBottom: 8 },
  tileLabel: { fontWeight: '700', color: '#111827', textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  horizontalWrap: { marginVertical: 6 },
  buttonPrimary: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
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
  itemText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  empty: { color: '#64748b', fontSize: 13 },
  error: { color: '#b91c1c', marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  chipText: { color: '#334155', fontWeight: '600' },
  chipTextActive: { color: '#5b21b6', fontWeight: '700' },
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
    backgroundColor: '#4f46e5',
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
    color: '#475569',
    marginBottom: 4,
  },
  dropdownField: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  dropdownFieldInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dropdownFieldText: { fontSize: 16, color: '#111827', flex: 1 },
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
  datePickerToolbarBtn: { color: '#4f46e5', fontWeight: '700', fontSize: 16 },
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
  dayTitle: { fontSize: 14, fontWeight: '800', color: '#111827', paddingTop: 8 },
})
