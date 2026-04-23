import { createFileRoute } from '@tanstack/react-router'
import { useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Zap, Droplets, Plus, ChevronLeft, History, CreditCard } from 'lucide-react-native'

export const Route = createFileRoute('/')({
  component: AppContainer,
})

export function AppContainer() {
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
        <Text style={styles.headerTitle}>"CAUSE I SAID SO"</Text>
        <Text style={styles.headerSubtitle}>PRIMARY COMMAND CENTER</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity 
          onPress={() => onNavigate('meters')}
          style={styles.card}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#eff6ff' }]}>
            <Zap size={40} color="#2563eb" />
          </View>
          <Text style={styles.cardTitle}>Power-H20</Text>
          <Text style={styles.cardLabel}>UTILITY FLOW</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => onNavigate('pawn')}
          style={styles.card}
          activeOpacity={0.7}
        >
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
          <Text style={styles.placeholderText}>SYSTEMS READY FOR{"\n"}FURTHER DEPLOYMENT</Text>
        </View>
      </View>
    </ScrollView>
  )
}

function MetersView({ onBack }: { onBack: () => void }) {
  const listMeters = useAction(api.mongodb.listMeters)
  const [meters, setMeters] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await listMeters()
      setMeters(data || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  return (
    <View style={styles.flex1}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Power-H20</Text>
        <TouchableOpacity onPress={refresh} style={styles.backButton}>
          <History size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.p20}>
        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 50 }} />
        ) : (
          meters.map(meter => (
            <MeterCard key={meter._id} meter={meter} />
          ))
        )}
        {!loading && meters.length === 0 && (
          <Text style={styles.emptyText}>No meters found in MongoDB.</Text>
        )}
      </ScrollView>
    </View>
  )
}

function MeterCard({ meter }: { meter: any }) {
  return (
    <View style={styles.meterCard}>
      <View style={styles.meterHeader}>
        <View style={styles.row}>
          <View style={[styles.miniIcon, { backgroundColor: '#eff6ff' }]}>
            {meter.type === 'power' ? <Zap size={20} color="#2563eb" /> : <Droplets size={20} color="#0891b2" />}
          </View>
          <Text style={styles.meterName}>{meter.name}</Text>
        </View>
      </View>
      <View style={styles.p15}>
        <Text style={styles.label}>CONNECTED TO MONGODB</Text>
      </View>
    </View>
  )
}

function PawnView({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.flex1}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Pawn Shit</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.center}>
        <Text style={styles.emptyText}>Migrating Pawn Records to MongoDB...</Text>
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
  },
  p15: {
    padding: 15,
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
    borderBottomColor: '#f8fafc',
    backgroundColor: '#fcfdfe',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meterName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontWeight: '700',
    marginTop: 100,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
})
