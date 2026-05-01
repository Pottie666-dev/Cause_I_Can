import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://ridgeway-mansion-api.onrender.com'
const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isAdmin(user) {
  return user?.role === 'admin'
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data
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

function TopBar({ title, onBack, onRefresh }) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.topButton} onPress={onBack}>
        <Text style={styles.topButtonText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.topTitle}>{title}</Text>
      <TouchableOpacity style={styles.topButton} onPress={() => void onRefresh()}>
        <Text style={styles.topButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  )
}

function PawnScreen({ user, onBack }) {
  const [tickets, setTickets] = useState([])
  const [shopName, setShopName] = useState('')
  const [pawnedDate, setPawnedDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [repayAmount, setRepayAmount] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [itemAmount, setItemAmount] = useState('')
  const [ticketItems, setTicketItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/pawn-tickets')
      setTickets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pawn tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
    if (!shopName.trim() || ticketItems.length === 0) return
    setLoading(true)
    setError('')
    try {
      await apiFetch('/api/pawn-tickets', {
        method: 'POST',
        body: JSON.stringify({
          userId: user?._id,
          shopName: shopName.trim(),
          pawnedDate: pawnedDate ? new Date(pawnedDate).getTime() : Date.now(),
          returnDate: returnDate ? new Date(returnDate).getTime() : null,
          totalRepayAmount: Number(repayAmount || 0),
          items: ticketItems,
        }),
      })
      setShopName('')
      setPawnedDate('')
      setReturnDate('')
      setRepayAmount('')
      setTicketItems([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ticket')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <TopBar title="Pawn Shit" onBack={onBack} onRefresh={refresh} />
      <ScrollView contentContainerStyle={styles.contentWrap}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>New Ticket</Text>
          <TextInput value={shopName} onChangeText={setShopName} style={styles.input} placeholder="Pawn shop name" />
          <TextInput
            value={pawnedDate}
            onChangeText={setPawnedDate}
            style={styles.input}
            placeholder="Pawned date (YYYY-MM-DD)"
          />
          <TextInput
            value={returnDate}
            onChangeText={setReturnDate}
            style={styles.input}
            placeholder="Return date (YYYY-MM-DD)"
          />
          <TextInput
            value={repayAmount}
            onChangeText={setRepayAmount}
            style={styles.input}
            placeholder="Total repay amount"
            keyboardType="numeric"
          />

          <Text style={styles.sectionTitle}>Ticket Items</Text>
          <TextInput
            value={itemDescription}
            onChangeText={setItemDescription}
            style={styles.input}
            placeholder="Item description"
          />
          <TextInput
            value={itemAmount}
            onChangeText={setItemAmount}
            style={styles.input}
            placeholder="Amount received for item"
            keyboardType="numeric"
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.buttonSecondary} onPress={addItemToTicket}>
              <Text style={styles.buttonText}>Add Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonPrimary} onPress={() => void saveTicket()}>
              <Text style={styles.buttonText}>Save Ticket</Text>
            </TouchableOpacity>
          </View>
          {ticketItems.map((item, index) => (
            <Text key={`${item.description}-${index}`} style={styles.itemMeta}>
              • {item.description} (R {item.amountReceived.toFixed(2)})
            </Text>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pawn Tickets</Text>
          {loading ? <ActivityIndicator size="small" color="#4f46e5" /> : null}
          {tickets.length === 0 ? <Text style={styles.empty}>No pawn tickets yet.</Text> : null}
          {tickets.map((ticket) => (
            <View key={ticket._id} style={styles.itemRow}>
              <Text style={styles.itemText}>{ticket.shopName}</Text>
              <Text style={styles.itemMeta}>
                Pawned: {ticket.pawnedDate ? new Date(ticket.pawnedDate).toLocaleDateString() : 'N/A'} | Return:{' '}
                {ticket.returnDate ? new Date(ticket.returnDate).toLocaleDateString() : 'N/A'}
              </Text>
              <Text style={styles.itemMeta}>Repay total: R {Number(ticket.totalRepayAmount || 0).toFixed(2)}</Text>
              {(ticket.items || []).map((item, idx) => (
                <Text key={`${ticket._id}-${idx}`} style={styles.itemMeta}>
                  - {item.description} (R {Number(item.amountReceived || 0).toFixed(2)})
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
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
      <ScrollView contentContainerStyle={styles.contentWrap}>
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
      <ScrollView contentContainerStyle={styles.contentWrap}>
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
      <ScrollView contentContainerStyle={styles.contentWrap}>
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
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
