import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://ridgeway-mansion.onrender.com'

export default function App() {
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/items`)
      if (!response.ok) throw new Error(`Failed to load items (${response.status})`)
      const data = await response.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const addItem = useCallback(async () => {
    const trimmed = title.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (!response.ok) throw new Error(`Failed to add item (${response.status})`)
      setTitle('')
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [fetchItems, title])

  const headerText = useMemo(() => `API: ${apiUrl}`, [])

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Ridgeway-Mansion</Text>
        <Text style={styles.subtitle}>Simple Expo + Render + MongoDB</Text>
        <Text style={styles.meta}>{headerText}</Text>
      </View>

      <View style={styles.card}>
        <TextInput
          placeholder="Add item title"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          autoCapitalize="sentences"
        />
        <View style={styles.row}>
          <TouchableOpacity style={styles.buttonPrimary} onPress={() => void addItem()}>
            <Text style={styles.buttonText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => void fetchItems()}>
            <Text style={styles.buttonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Items</Text>
        {loading ? <ActivityIndicator size="small" color="#4f46e5" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              <Text style={styles.itemText}>{item.title}</Text>
              <Text style={styles.itemMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          )}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>No items yet.</Text> : null}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16, gap: 12 },
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
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  buttonPrimary: {
    flex: 1,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  itemRow: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  itemText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  empty: { color: '#64748b', fontSize: 13 },
  error: { color: '#b91c1c', marginBottom: 8 },
})
