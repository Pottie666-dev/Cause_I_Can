import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native'
import { useAction } from 'convex/react'
import * as Clipboard from 'expo-clipboard'
import {
  Zap,
  Droplets,
  Plus,
  ChevronLeft,
  History,
  CreditCard,
  Copy,
} from 'lucide-react-native'
import { api } from '../convex/_generated/api'

type Meter = {
  _id: string
  name: string
  type: string
  meterNumber: string | null
}

type PawnSlip = {
  _id: string
  shopName: string
  slipNumber: string | null
  pawnAmount: number
  repayAmount: number
  repayDate: number
}

export function MobileApp() {
  const [currentView, setCurrentView] = useState<'home' | 'meters' | 'pawn'>('home')

  return (
    <SafeAreaView style={styles.container}>
      {currentView === 'home' && <HomeView onNavigate={setCurrentView} />}
      {currentView === 'meters' && <MetersView onBack={() => setCurrentView('home')} />}
      {currentView === 'pawn' && <PawnView onBack={() => setCurrentView('home')} />}
    </SafeAreaView>
  )
}

function HomeView({
  onNavigate,
}: {
  onNavigate: (view: 'home' | 'meters' | 'pawn') => void
}) {
  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.homeContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CAUSE I SAID SO</Text>
        <Text style={styles.headerSubtitle}>PRIMARY COMMAND CENTER</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity onPress={() => onNavigate('meters')} style={styles.card} activeOpacity={0.7}>
          <View style={[styles.iconContainer, { backgroundColor: '#eff6ff' }]}>
            <Zap size={40} color="#2563eb" />
          </View>
          <Text style={styles.cardTitle}>Power-H20</Text>
          <Text style={styles.cardLabel}>UTILITY FLOW</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onNavigate('pawn')} style={styles.card} activeOpacity={0.7}>
          <View style={[styles.iconContainer, { backgroundColor: '#fffbeb' }]}>
            <CreditCard size={40} color="#d97706" />
          </View>
          <Text style={styles.cardTitle}>Pawn Shit</Text>
          <Text style={styles.cardLabel}>ASSET VAULT</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.placeholderContainer}>
        <View style={styles.placeholder}>
          <Plus size={24} color="#cbd5e1" />
          <Text style={styles.placeholderText}>SYSTEMS READY FOR{`\n`}FURTHER DEPLOYMENT</Text>
        </View>
      </View>
    </ScrollView>
  )
}

function MetersView({ onBack }: { onBack: () => void }) {
  const listMeters = useAction(api.mongodb.listMeters)
  const createMeter = useAction(api.mongodb.createMeter)
  const [meters, setMeters] = useState<Array<Meter>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [meterName, setMeterName] = useState('')
  const [meterNumber, setMeterNumber] = useState('')
  const [meterType, setMeterType] = useState<'power' | 'water'>('power')

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listMeters({})
      setMeters(data || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load meters')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateMeter = async () => {
    if (!meterName.trim() || !meterNumber.trim()) {
      setError('Please enter both the meter name and meter number.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createMeter({
        name: meterName.trim(),
        type: meterType,
        meterNumber: meterNumber.trim(),
      })
      setMeterName('')
      setMeterNumber('')
      await refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to save meter')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyMeterNumber = async (value: string | null) => {
    if (!value) {
      return
    }

    await Clipboard.setStringAsync(value)
    Alert.alert('Copied', `Meter number ${value} copied.`)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <View style={styles.flex1}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Power-H20</Text>
        <TouchableOpacity onPress={() => void refresh()} style={styles.backButton}>
          <History size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.p20}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add utility meter</Text>
          <Text style={styles.formHint}>You can now save the meter number and copy it instantly later.</Text>

          <TextInput
            value={meterName}
            onChangeText={setMeterName}
            placeholder="Meter name"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          <TextInput
            value={meterNumber}
            onChangeText={setMeterNumber}
            placeholder="Meter number"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="characters"
          />

          <View style={styles.typeRow}>
            {(['power', 'water'] as const).map((type) => {
              const isActive = meterType === type
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setMeterType(type)}
                  style={[styles.typeChip, isActive ? styles.typeChipActive : null]}
                >
                  <Text style={[styles.typeChipText, isActive ? styles.typeChipTextActive : null]}>
                    {type === 'power' ? 'Power' : 'Water'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <TouchableOpacity
            onPress={() => void handleCreateMeter()}
            style={[styles.saveButton, saving ? styles.saveButtonDisabled : null]}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save meter'}</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 50 }} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!loading && !error ? (
          meters.map((meter) => (
            <MeterCard key={meter._id} meter={meter} onCopy={() => void handleCopyMeterNumber(meter.meterNumber)} />
          ))
        ) : null}
        {!loading && !error && meters.length === 0 ? (
          <Text style={styles.emptyText}>No meters found in MongoDB.</Text>
        ) : null}
      </ScrollView>
    </View>
  )
}

function MeterCard({
  meter,
  onCopy,
}: {
  meter: Meter
  onCopy: () => void
}) {
  const number = meter.meterNumber ?? 'No meter number yet'
  const canCopy = Boolean(meter.meterNumber)

  return (
    <View style={styles.meterCard}>
      <View style={styles.meterHeader}>
        <View style={styles.row}>
          <View style={[styles.miniIcon, { backgroundColor: '#eff6ff' }]}>
            {meter.type === 'power' ? (
              <Zap size={20} color="#2563eb" />
            ) : (
              <Droplets size={20} color="#0891b2" />
            )}
          </View>
          <View style={styles.meterHeaderTextWrap}>
            <Text style={styles.meterName}>{meter.name}</Text>
            <Text style={styles.meterType}>{meter.type.toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <View style={styles.p15}>
        <Text style={styles.label}>METER NUMBER</Text>
        <View style={styles.meterNumberRow}>
          <Text style={styles.meterNumberValue}>{number}</Text>
          <TouchableOpacity
            onPress={onCopy}
            style={[styles.copyButton, !canCopy ? styles.copyButtonDisabled : null]}
            disabled={!canCopy}
          >
            <Copy size={16} color={canCopy ? '#2563eb' : '#94a3b8'} />
          </TouchableOpacity>
        </View>
        <Text style={styles.statusLabel}>CONNECTED TO MONGODB</Text>
      </View>
    </View>
  )
}

function PawnView({ onBack }: { onBack: () => void }) {
  const listPawnSlips = useAction(api.mongodb.listActivePawnSlips)
  const createPawnSlip = useAction(api.mongodb.createPawnSlip)
  const [pawnSlips, setPawnSlips] = useState<Array<PawnSlip>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [shopName, setShopName] = useState('')
  const [slipNumber, setSlipNumber] = useState('')
  const [pawnAmount, setPawnAmount] = useState('0')
  const [repayAmount, setRepayAmount] = useState('0')

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listPawnSlips({})
      setPawnSlips(data || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load pawn slips')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePawnSlip = async () => {
    if (!shopName.trim() || !slipNumber.trim()) {
      setError('Please enter both the shop name and slip number.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createPawnSlip({
        shopName: shopName.trim(),
        slipNumber: slipNumber.trim(),
        pawnAmount: Number(pawnAmount) || 0,
        repayAmount: Number(repayAmount) || 0,
        repayDate: Date.now() + 1000 * 60 * 60 * 24 * 30,
        items: [{ description: 'General items' }],
      })
      setShopName('')
      setSlipNumber('')
      setPawnAmount('0')
      setRepayAmount('0')
      await refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to save pawn slip')
    } finally {
      setSaving(false)
    }
  }

  const handleCopySlipNumber = async (value: string | null) => {
    if (!value) return
    await Clipboard.setStringAsync(value)
    Alert.alert('Copied', `Slip number ${value} copied.`)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <View style={styles.flex1}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Pawn Shit</Text>
        <TouchableOpacity onPress={() => void refresh()} style={styles.backButton}>
          <History size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.p20}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add pawn slip</Text>
          <Text style={styles.formHint}>Save the slip number and copy it later from the vault list.</Text>

          <TextInput
            value={shopName}
            onChangeText={setShopName}
            placeholder="Shop name"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          <TextInput
            value={slipNumber}
            onChangeText={setSlipNumber}
            placeholder="Slip number"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="characters"
          />

          <View style={styles.typeRow}>
            <TextInput
              value={pawnAmount}
              onChangeText={setPawnAmount}
              placeholder="Pawn amount"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.halfInput]}
              keyboardType="decimal-pad"
            />
            <TextInput
              value={repayAmount}
              onChangeText={setRepayAmount}
              placeholder="Repay amount"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.halfInput]}
              keyboardType="decimal-pad"
            />
          </View>

          <TouchableOpacity
            onPress={() => void handleCreatePawnSlip()}
            style={[styles.saveButton, saving ? styles.saveButtonDisabled : null]}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save slip'}</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 50 }} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!loading && !error
          ? pawnSlips.map((slip) => (
              <PawnSlipCard key={slip._id} slip={slip} onCopy={() => void handleCopySlipNumber(slip.slipNumber)} />
            ))
          : null}
        {!loading && !error && pawnSlips.length === 0 ? (
          <Text style={styles.emptyText}>No pawn slips found in MongoDB.</Text>
        ) : null}
      </ScrollView>
    </View>
  )
}

function PawnSlipCard({
  slip,
  onCopy,
}: {
  slip: PawnSlip
  onCopy: () => void
}) {
  const slipNo = slip.slipNumber ?? 'No slip number yet'
  const canCopy = Boolean(slip.slipNumber)

  return (
    <View style={styles.meterCard}>
      <View style={styles.meterHeader}>
        <View style={styles.row}>
          <View style={[styles.miniIcon, { backgroundColor: '#fffbeb' }]}>
            <CreditCard size={20} color="#d97706" />
          </View>
          <View style={styles.meterHeaderTextWrap}>
            <Text style={styles.meterName}>{slip.shopName}</Text>
            <Text style={styles.meterType}>ACTIVE PAWN SLIP</Text>
          </View>
        </View>
      </View>
      <View style={styles.p15}>
        <Text style={styles.label}>SLIP NUMBER</Text>
        <View style={styles.meterNumberRow}>
          <Text style={styles.meterNumberValue}>{slipNo}</Text>
          <TouchableOpacity
            onPress={onCopy}
            style={[styles.copyButton, !canCopy ? styles.copyButtonDisabled : null]}
            disabled={!canCopy}
          >
            <Copy size={16} color={canCopy ? '#d97706' : '#94a3b8'} />
          </TouchableOpacity>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.amountPill}>Pawn: {slip.pawnAmount.toFixed(2)}</Text>
          <Text style={styles.amountPill}>Repay: {slip.repayAmount.toFixed(2)}</Text>
        </View>
        <Text style={styles.statusLabel}>STORED IN MONGODB COLLECTION</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  flex1: {
    flex: 1,
  },
  homeContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#4f46e5',
    paddingTop: 60,
    paddingBottom: 80,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#e0e7ff',
    marginTop: 8,
    letterSpacing: 2,
  },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: -30,
    gap: 15,
  },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    marginTop: 4,
  },
  placeholderContainer: {
    padding: 24,
    marginTop: 20,
  },
  placeholder: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 30,
    padding: 40,
    alignItems: 'center',
    gap: 15,
  },
  placeholderText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    lineHeight: 18,
  },
  navBar: {
    height: 60,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  backButton: {
    padding: 10,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  p20: {
    padding: 20,
    paddingBottom: 36,
  },
  p15: {
    padding: 15,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  formHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  typeChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  typeChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  typeChipTextActive: {
    color: '#2563eb',
  },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  meterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 25,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  meterHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meterHeaderTextWrap: {
    flex: 1,
  },
  meterName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  meterType: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 8,
  },
  meterNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  meterNumberValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonDisabled: {
    backgroundColor: '#f1f5f9',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginTop: 12,
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  amountPill: {
    backgroundColor: '#f8fafc',
    color: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 16,
    marginTop: 24,
  },
  errorText: {
    textAlign: 'center',
    color: '#dc2626',
    fontSize: 15,
    marginBottom: 16,
    lineHeight: 22,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
})
