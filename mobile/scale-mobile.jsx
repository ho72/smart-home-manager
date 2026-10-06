import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { PALETTE, IconCheck, IconPlus, IconScale, IconSettings, IconTrash } from '../components/shared'
import { MobileHeader } from './shared-mobile'
import { api } from '../src/api.js'

const SCALE_BODY_PROGRESS_DURATION_MS = 2400
const GENDER_OPTIONS = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
]
const HISTORY_RANGE_OPTIONS = [
  { value: '7', label: '7일', days: 7 },
  { value: '30', label: '30일', days: 30 },
  { value: '90', label: '90일', days: 90 },
  { value: 'all', label: '전체', days: null },
]
const BODY_METRIC_OPTIONS = [
  { value: 'weight', label: '체중', unit: 'kg', digits: 2, good: 'down', dot: '#E89A3C', desc: '몸 전체의 무게예요.', getValue: item => item?.weightKg },
  { value: 'bmi', label: 'BMI', unit: '', digits: 1, good: 'down', dot: '#E0937A', desc: '키 대비 비만 지표예요.', getValue: item => item?.analysis?.bmi },
  { value: 'bodyFat', label: '체지방률', unit: '%', digits: 1, good: 'down', dot: '#E0937A', desc: '몸무게 중 지방 비율이에요.', getValue: item => item?.analysis?.bodyFatPercent },
  { value: 'fatMass', label: '체지방량', unit: 'kg', digits: 1, good: 'down', dot: '#D9805A', desc: '몸 안의 지방 무게예요.', getValue: item => item?.analysis?.fatMassKg },
  { value: 'leanMass', label: '제지방량', unit: 'kg', digits: 1, good: 'up', dot: '#E89A3C', desc: '지방을 뺀 몸의 무게예요.', getValue: item => item?.analysis?.fatFreeMassKg },
  { value: 'muscle', label: '골격근량', unit: 'kg', digits: 1, good: 'up', dot: '#86B89A', desc: '운동으로 키우는 근육량이에요.', getValue: item => item?.analysis?.skeletalMuscleMassKg },
  { value: 'balance', label: '바디밸런스', unit: '점', digits: 0, good: 'up', dot: '#F0A94A', desc: '체성분 균형 종합 점수예요.', getValue: item => item?.analysis?.bodyBalance?.bodyBalanceScore },
]
const REPORT_COLORS = {
  amber: '#E89A3C',
  amberText: '#F0A94A',
  green: '#86B89A',
  coral: '#E0937A',
  red: '#C25E48',
  blue: '#8AA9D6',
  muted: '#8a817a',
  panel: '#17120e',
  panelAlt: '#120e0a',
  line: '#2a221b',
  innerLine: '#241d16',
}

function clampProgress(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function animationNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function formatWeightKg(value) {
  const text = typeof value === 'object' && value !== null ? value.weightKgText : null
  if (typeof text === 'string' && text.trim()) return text
  const raw = typeof value === 'object' && value !== null ? value.weightKg : value
  const n = Number(raw)
  return Number.isFinite(n) ? n.toFixed(2) : '--.--'
}

function formatNumber(value, digits = 1) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

function formatKg(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(1)}kg` : '—'
}

function formatPercent(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—'
}

function formatKcal(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}kcal` : '—'
}

function formatSignedKg(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}kg`
}

function numericValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatPlainNumber(value, digits = 1) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

function formatDelta(value, digits = 1, unit = '') {
  const n = Number(value)
  if (!Number.isFinite(n)) return '변화 없음'
  if (Math.abs(n) < 0.0001) return '변화 없음'
  return `${n > 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(digits)}${unit}`
}

function scoreTone(score, accent = REPORT_COLORS.amber) {
  const n = Number(score)
  if (!Number.isFinite(n)) return accent
  if (n >= 70) return REPORT_COLORS.green
  if (n >= 60) return REPORT_COLORS.amber
  return REPORT_COLORS.coral
}

function friendlyBalanceGrade(balance) {
  const score = Number(balance?.bodyBalanceScore)
  if (!Number.isFinite(score)) return balance?.bodyBalanceGrade || '분석 대기'
  if (score >= 80) return '아주 좋아요'
  if (score >= 70) return '좋아요'
  if (score >= 60) return '관리 필요'
  return '주의 필요'
}

function comparisonRow(label, current, standard, overGood = false) {
  const cur = Number(current)
  const std = Number(standard)
  if (!Number.isFinite(cur) || !Number.isFinite(std) || std <= 0) {
    return { label, pos: '50%', color: REPORT_COLORS.muted, diff: '—', statusLabel: '분석 대기' }
  }
  const diff = cur - std
  const pos = Math.max(6, Math.min(94, 50 + (diff / std) * 130))
  const near = Math.abs(diff) / std < 0.04
  const over = diff >= 0
  const favorable = overGood ? over : !over
  const color = near ? REPORT_COLORS.amber : favorable ? REPORT_COLORS.green : REPORT_COLORS.coral
  return {
    label,
    pos: `${pos.toFixed(1)}%`,
    color,
    diff: formatSignedKg(diff),
    statusLabel: near ? '표준 수준' : over ? '표준보다 많아요' : '표준보다 적어요',
  }
}

function indexZone(value, thresholds, labels, colors) {
  const n = Number(value)
  if (!Number.isFinite(n)) return { label: '분석 대기', color: REPORT_COLORS.muted }
  for (let i = 0; i < thresholds.length; i += 1) {
    if (n < thresholds[i]) return { label: labels[i], color: colors[i] }
  }
  return { label: labels[labels.length - 1], color: colors[colors.length - 1] }
}

function metricOption(metricKey) {
  return BODY_METRIC_OPTIONS.find(item => item.value === metricKey) || BODY_METRIC_OPTIONS[0]
}

function metricNumericValue(item, metricKey) {
  const option = metricOption(metricKey)
  const n = Number(option.getValue(item))
  return Number.isFinite(n) ? n : null
}

function formatMetricValue(value, metricKey) {
  const option = metricOption(metricKey)
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const text = n.toFixed(option.digits)
  return option.unit ? `${text}${option.unit}` : text
}

function formatShortDate(item) {
  if (!item) return ''
  const timeMs = measurementTimeMs(item)
  if (!timeMs) return ''
  return new Date(timeMs).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function formatTrendDate(value) {
  const timeMs = typeof value === 'number' ? value : measurementTimeMs(value)
  if (!timeMs) return '날짜 없음'
  return new Date(timeMs).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAxisDate(timeMs) {
  if (!timeMs) return ''
  return new Date(timeMs).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function pctBetween(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n) || max <= min) return 0
  return Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100))
}

function uniqueMeasurements(latest, history) {
  const map = new Map()
  ;[latest, ...(history || [])].forEach(item => {
    if (item?.id) map.set(item.id, item)
  })
  return Array.from(map.values()).sort((a, b) => measurementTimeMs(b) - measurementTimeMs(a))
}

function numberOrUndefined(value) {
  if (value === '' || value === null || value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function formatBirthDateInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

function isValidBirthDate(value) {
  const text = String(value || '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function formatWhen(item) {
  if (!item) return ''
  if (item.scaleTime) return item.scaleTime.replace('T', ' ').replace('Z', '')
  if (item.receivedAt) {
    return new Date(item.receivedAt * 1000).toLocaleString('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }
  return ''
}

function measurementTimeMs(item) {
  if (!item) return 0
  if (typeof item.receivedAt === 'number') return item.receivedAt * 1000
  if (item.scaleTime) {
    const parsed = Date.parse(item.scaleTime)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function profileFromSummary(summary) {
  const p = summary?.profile || {}
  return {
    displayName: p.display_name || p.displayName || '',
    heightCm: p.height_cm ?? p.heightCm ?? '',
    birthDate: p.birth_date || p.birthDate || '',
    gender: p.gender || '',
    baselineWeightKg: p.baseline_weight_kg ?? p.baselineWeightKg ?? '',
    expectedWeightMin: p.expected_weight_min ?? p.expectedWeightMin ?? '',
    expectedWeightMax: p.expected_weight_max ?? p.expectedWeightMax ?? '',
    avgImpedanceOhm: p.avg_impedance_ohm ?? p.avgImpedanceOhm ?? '',
  }
}

function isProfileComplete(profile) {
  const height = Number(profile?.heightCm)
  const weight = Number(profile?.baselineWeightKg)
  const validGender = GENDER_OPTIONS.some(item => item.value === profile?.gender)
  return Number.isFinite(height) && height > 0 && Number.isFinite(weight) && weight > 0 && !!profile?.birthDate && validGender
}

function genderLabel(value) {
  return GENDER_OPTIONS.find(item => item.value === value)?.label || '미입력'
}

function formatBirthDate(value) {
  if (!value) return '미입력'
  const [year, month, day] = String(value).split('-')
  if (!year || !month || !day) return value
  return `${year}.${month}.${day}`
}

function latestMeasurementKey(item) {
  if (!item) return null
  return item.id || item.measurementKey || `${item.receivedAt || ''}:${item.weightKg || ''}:${item.impedanceOhm || ''}`
}

function liveFromMeasurement(item, homeId) {
  if (!item) return null
  const receivedAt = item.receivedAt || Math.floor(Date.now() / 1000)
  return {
    active: true,
    homeId,
    sessionId: item.id || latestMeasurementKey(item),
    state: 'done',
    progress: 100,
    progressDurationMs: SCALE_BODY_PROGRESS_DURATION_MS,
    weightKg: item.weightKg,
    weightKgText: item.weightKgText || formatWeightKg(item.weightKg),
    impedanceOhm: item.impedanceOhm,
    stable: !!item.stable,
    hasImpedance: !!item.hasImpedance || !!item.impedanceOhm,
    message: '새 측정값을 수신했습니다',
    measurementId: item.id,
    status: item.status,
    assignedUserId: item.assignedUserId,
    confidence: item.confidence,
    updatedAt: receivedAt,
    updatedAtMs: receivedAt * 1000,
    sequence: `latest:${latestMeasurementKey(item)}`,
  }
}

function liveOverlayKey(live) {
  if (!live?.active) return null
  const home = live.homeId || ''
  const device = live.scaleDeviceId || live.deviceId || ''
  if (live.sessionId) return `${home}:${device}:session:${live.sessionId}`
  if (live.measurementId) return `${home}:${device}:measurement:${live.measurementId}`
  if (live.scaleTime) return `${home}:${device}:time:${live.scaleTime}`
  return `${home}:${device}:${live.state || ''}:${Math.round(Number(live.weightKg || 0) * 100)}`
}

export function ScaleMobile({ back, go, tweaks, mode = 'dashboard', deviceId, homeId, homeName }) {
  const accent = tweaks.accent
  const r = tweaks.radius
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [pending, setPending] = useState([])
  const [profile, setProfile] = useState(profileFromSummary(null))
  const [user, setUser] = useState(undefined)
  const [live, setLive] = useState(null)
  const [dismissedLiveKey, setDismissedLiveKey] = useState(null)
  const [issued, setIssued] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyRange, setHistoryRange] = useState('90')
  const [historyMetric, setHistoryMetric] = useState('weight')
  const [metricDetailOpen, setMetricDetailOpen] = useState(false)
  const [selectedTrendMeasurementId, setSelectedTrendMeasurementId] = useState(null)
  const [pendingSettingsOpen, setPendingSettingsOpen] = useState(false)
  const [selectedMeasurementId, setSelectedMeasurementId] = useState(null)
  const [expandedMonths, setExpandedMonths] = useState({})
  const profileDirtyRef = useRef(false)
  const liveDoneRef = useRef(null)
  const latestReadyRef = useRef(false)
  const latestSeenRef = useRef(null)

  const latest = summary?.latest || null
  const devices = summary?.devices || []
  const resolvedHomeId = homeId || summary?.home?.id || null
  const resolvedHomeName = homeName || summary?.home?.name || '현재 홈'
  const scaleQuery = useMemo(() => (resolvedHomeId ? { homeId: resolvedHomeId } : {}), [resolvedHomeId])
  const userLoaded = user !== undefined
  const canManageScale = !!user?.username && summary?.home?.owner_user_id === user.username
  const profileComplete = isProfileComplete(profile)
  const savedProfileComplete = summary !== null && isProfileComplete(profileFromSummary(summary))
  const liveKey = liveOverlayKey(live)
  const liveState = live?.state || ''
  const liveDone = liveState === 'done'
  const livePending = live?.status === 'pending'
  const liveDoneForCurrentUser = liveDone &&
    !livePending &&
    !!live?.assignedUserId &&
    !!user?.username &&
    live.assignedUserId === user.username
  const showMeasurementOverlay = mode === 'dashboard' &&
    !!live?.active &&
    liveKey !== dismissedLiveKey &&
    (!liveDone || liveDoneForCurrentUser)
  const measurements = useMemo(() => uniqueMeasurements(latest, history), [latest, history])
  const selectedMeasurement = useMemo(() => {
    if (!selectedMeasurementId) return null
    return measurements.find(item => item.id === selectedMeasurementId) || null
  }, [measurements, selectedMeasurementId])

  const load = useCallback(async ({ silent = false, notifyLatest = false } = {}) => {
    if (!silent) setError('')
    try {
      const query = homeId ? { homeId } : {}
      const [s, h, p] = await Promise.all([
        api.scaleSummary(query),
        api.scaleHistory(730, query),
        api.scalePending(query),
      ])
      setSummary(s)
      setHistory(h || [])
      setPending(p || [])
      if (!profileDirtyRef.current) setProfile(profileFromSummary(s))
      const nextLatest = s?.latest || null
      const nextKey = latestMeasurementKey(nextLatest)
      if (!latestReadyRef.current) {
        latestReadyRef.current = true
        latestSeenRef.current = nextKey
      } else if (notifyLatest && nextKey && nextKey !== latestSeenRef.current) {
        latestSeenRef.current = nextKey
        setDismissedLiveKey(null)
        setLive(liveFromMeasurement(nextLatest, s?.home?.id || homeId || resolvedHomeId))
      } else if (nextKey) {
        latestSeenRef.current = nextKey
      }
    } catch (e) {
      if (!silent) setError(e?.message || '체중계 정보를 불러오지 못했습니다.')
    }
  }, [homeId, resolvedHomeId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    latestReadyRef.current = false
    latestSeenRef.current = null
    setDismissedLiveKey(null)
    setMetricDetailOpen(false)
    setSelectedTrendMeasurementId(null)
    setPendingSettingsOpen(false)
    setSelectedMeasurementId(null)
    profileDirtyRef.current = false
  }, [resolvedHomeId])
  useEffect(() => {
    let alive = true
    api.me().then(me => { if (alive) setUser(me) }).catch(() => { if (alive) setUser(null) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (mode !== 'dashboard') return
    let alive = true
    const poll = async () => {
      try {
        const query = homeId || resolvedHomeId ? { homeId: homeId || resolvedHomeId } : {}
        const next = await api.scaleLive(query)
        if (!alive) return
        setLive(next)
        const doneKey = next?.measurementId || `${next?.updatedAt || 0}:${next?.state || ''}`
        if (next?.active && next?.state === 'done' && doneKey && liveDoneRef.current !== doneKey) {
          liveDoneRef.current = doneKey
          load({ silent: true })
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [homeId, load, mode, resolvedHomeId])
  useEffect(() => {
    if (mode !== 'dashboard') return
    const id = setInterval(() => {
      load({ silent: true, notifyLatest: true })
    }, 2000)
    return () => clearInterval(id)
  }, [load, mode])
  const dismissLive = useCallback(() => {
    const key = liveKey
    if (!key) return
    setDismissedLiveKey(key)
    setLive(prev => {
      if (liveOverlayKey(prev) !== key) return prev
      return prev ? { ...prev, active: false, state: 'idle', progress: 0 } : prev
    })
    const query = homeId || resolvedHomeId ? { homeId: homeId || resolvedHomeId } : {}
    api.scaleClearLive(query).catch(() => {})
  }, [homeId, liveKey, resolvedHomeId])
  useEffect(() => {
    if (!live?.active || !liveKey) return undefined
    const state = live.state || ''
    const pendingClaim = live.status === 'pending'
    if (state !== 'error' && !(state === 'done' && !pendingClaim)) return undefined

    const id = setTimeout(() => {
      dismissLive()
    }, state === 'error' ? 6000 : 9000)
    return () => clearTimeout(id)
  }, [dismissLive, live?.active, live?.state, live?.status, liveKey])
  useEffect(() => {
    if (mode === 'settings' && !profileComplete) setEditingProfile(true)
  }, [mode, profileComplete])
  useEffect(() => {
    if (!measurements.length || (selectedMeasurementId && !measurements.some(item => item.id === selectedMeasurementId))) {
      setSelectedMeasurementId(null)
    }
    if (selectedTrendMeasurementId && !measurements.some(item => item.id === selectedTrendMeasurementId)) {
      setSelectedTrendMeasurementId(null)
    }
  }, [measurements, selectedMeasurementId, selectedTrendMeasurementId])
  useEffect(() => {
    if (!selectedMeasurementId || typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedMeasurementId])
  useEffect(() => {
    if (!metricDetailOpen || typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [metricDetailOpen, historyMetric])

  const trend = useMemo(() => {
    if (history.length < 2) return null
    const newest = history[0]?.weightKg
    const oldest = history[history.length - 1]?.weightKg
    if (typeof newest !== 'number' || typeof oldest !== 'number') return null
    const diff = newest - oldest
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}kg`
  }, [history])

  const openSettings = () => {
    if (!go) return
    go(deviceId ? `scale:${deviceId}:settings` : 'scale:settings')
  }

  const changeHistoryRange = (value) => {
    setHistoryRange(value)
    setSelectedTrendMeasurementId(null)
  }

  const changeHistoryMetric = (value) => {
    setHistoryMetric(value)
    setSelectedTrendMeasurementId(null)
  }

  const openMetricDetail = (value) => {
    setHistoryMetric(value)
    setSelectedTrendMeasurementId(null)
    setMetricDetailOpen(true)
  }

  const toggleScaleMonth = useCallback((monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }))
  }, [])

  const updateProfile = useCallback((patch) => {
    profileDirtyRef.current = true
    setProfile(prev => ({ ...prev, ...patch }))
  }, [])

  const saveProfile = async ({ closeEditor = false } = {}) => {
    const heightCm = numberOrUndefined(profile.heightCm)
    const baselineWeightKg = numberOrUndefined(profile.baselineWeightKg)
    const birthDate = String(profile.birthDate || '').trim()
    const gender = String(profile.gender || '').trim()
    const validGender = GENDER_OPTIONS.some(item => item.value === gender)
    if (!heightCm || heightCm <= 0 || !baselineWeightKg || baselineWeightKg <= 0 || !birthDate || !validGender) {
      setError('키, 몸무게, 생년월일, 성별을 입력해 주세요.')
      return false
    }
    if (!isValidBirthDate(birthDate)) {
      setError('생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.')
      return false
    }
    setBusy(true)
    setError('')
    try {
      await api.scaleSaveProfile({
        displayName: profile.displayName || undefined,
        heightCm,
        baselineWeightKg,
        birthDate,
        gender,
        expectedWeightMin: numberOrUndefined(profile.expectedWeightMin),
        expectedWeightMax: numberOrUndefined(profile.expectedWeightMax),
        avgImpedanceOhm: numberOrUndefined(profile.avgImpedanceOhm),
      }, scaleQuery)
      profileDirtyRef.current = false
      await load()
      if (closeEditor) setEditingProfile(false)
      return true
    } catch (e) {
      setError(e?.message || '프로필 저장 실패')
      return false
    } finally {
      setBusy(false)
    }
  }

  const createDevice = async () => {
    if (!canManageScale) return
    setBusy(true)
    setError('')
    try {
      const data = await api.scaleCreateDevice({ name: 'Mi Scale', model: 'XMTZC05HM' }, scaleQuery)
      setIssued(data)
      await load()
    } catch (e) {
      setError(e?.message || '디바이스 토큰 발급 실패')
    } finally {
      setBusy(false)
    }
  }

  const deleteDevice = async (device) => {
    if (!canManageScale || !device?.id) return
    if (!confirm(`${device.name || device.deviceId} 토큰을 삭제할까요? 이 ESP32는 새 토큰을 다시 입력하기 전까지 업로드할 수 없습니다.`)) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.scaleDeleteDevice(device.id, scaleQuery)
      setIssued(null)
      await load()
    } catch (e) {
      setError(e?.message || '토큰 삭제 실패')
    } finally {
      setBusy(false)
    }
  }

  const claim = async (id) => {
    setBusy(true)
    setError('')
    try {
      await api.scaleClaim(id, scaleQuery)
      await load()
    } catch (e) {
      setError(e?.message || '측정값 확인 실패')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'settings') {
    if (pendingSettingsOpen) {
      return (
        <>
          <MobileHeader title="미확인 측정값" onBack={() => setPendingSettingsOpen(false)} accent={accent}/>
          <div style={{ padding: '18px 14px 36px' }}>
            <PendingMeasurementsPanel
              r={r}
              accent={accent}
              pending={pending}
              busy={busy}
              onClaim={claim}
            />
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        </>
      )
    }

    return (
      <>
        <MobileHeader title="체중계 설정" onBack={back} accent={accent}/>
        <div style={{ padding: '18px 14px 36px' }}>
          <ProfileSummaryCard
            r={r}
            accent={accent}
            profile={profile}
            complete={profileComplete}
            onEdit={() => setEditingProfile(true)}
          />

          {(editingProfile || !profileComplete) && (
            <ProfileEditorCard
              r={r}
              accent={accent}
              profile={profile}
              setProfile={updateProfile}
              busy={busy}
              onSave={() => saveProfile({ closeEditor: true })}
            />
          )}

          <Card r={r}>
            <SectionTitle title="연결 홈" sub={resolvedHomeName}/>
            <StatusLine
              label={devices.length ? `${devices.length}개 체중계 연결됨` : '체중계 미등록'}
              sub={devices.length ? 'ESP32 측정값 업로드 가능' : 'ESP32 토큰을 발급해 연결하세요'}
              active={devices.length > 0}
              accent={accent}
            />
          </Card>

          <PendingMeasurementsEntry
            r={r}
            accent={accent}
            pendingCount={pending.length}
            onOpen={() => setPendingSettingsOpen(true)}
          />

          {!userLoaded ? (
            <Card r={r}>
              <SectionTitle title="ESP32 토큰" sub="권한을 확인하는 중입니다."/>
              <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, padding: '4px 0' }}>
                잠시만 기다려주세요.
              </div>
            </Card>
          ) : canManageScale ? (
            <Card r={r}>
              <SectionTitle title="ESP32 토큰" sub="홈 소유자만 토큰을 발급하거나 삭제할 수 있습니다."/>
              {devices.map(d => (
                <DeviceTokenRow key={d.id} device={d} busy={busy} onDelete={() => deleteDevice(d)}/>
              ))}
              <button onClick={createDevice} disabled={busy} style={buttonStyle(accent, busy)}>
                <IconPlus size={17} color={busy ? PALETTE.charcoal.dim : '#14100d'}/>
                디바이스 토큰 발급
              </button>
              {issued && (
                <div style={{
                  marginTop: 12, padding: 12, borderRadius: 12,
                  background: '#17130f', border: `1px solid ${accent}44`,
                  color: PALETTE.charcoal.text, fontSize: 12, lineHeight: 1.65,
                  wordBreak: 'break-all',
                }}>
                  <div><b>server_url</b>: {issued.serverUrl}</div>
                  {issued.liveServerUrl && <div><b>live_url</b>: {issued.liveServerUrl}</div>}
                  <div><b>device_id</b>: {issued.deviceId}</div>
                  <div><b>device_token</b>: {issued.deviceToken}</div>
                </div>
              )}
            </Card>
          ) : (
            <Card r={r}>
              <SectionTitle title="ESP32 토큰" sub="홈 소유자만 체중계 연결을 관리할 수 있습니다."/>
              {devices.map(d => (
                <MetaRow key={d.id} label={d.name || 'Mi Scale'} value={d.deviceId}/>
              ))}
              {!devices.length && (
                <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, padding: '4px 0' }}>
                  아직 연결된 체중계가 없습니다.
                </div>
              )}
            </Card>
          )}

          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </>
    )
  }

  const settingsButton = go ? (
    <button onClick={openSettings} aria-label="체중계 설정" style={{
      width: 40, height: 40, borderRadius: 12,
      border: `1px solid ${PALETTE.charcoal.line}`,
      background: 'rgba(255,255,255,0.04)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
    }}>
      <IconSettings size={18} color={PALETTE.charcoal.text}/>
    </button>
  ) : null

  if (summary === null) {
    return (
      <>
        <MobileHeader title="체중계" onBack={back} accent={accent}/>
        <div style={{ padding: '18px 14px 36px' }}>
          <Card r={r}>
            <SectionTitle title="프로필 확인 중" sub="체중계 정보를 불러오는 중입니다."/>
          </Card>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </>
    )
  }

  if (!savedProfileComplete) {
    return (
      <>
        <MobileHeader title="체중계" onBack={back} accent={accent}/>
        <div style={{ padding: '18px 14px 36px' }}>
          <ProfileSetupCard
            r={r}
            accent={accent}
            profile={profile}
            setProfile={updateProfile}
            busy={busy}
            onSave={() => saveProfile()}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </>
    )
  }

  if (selectedMeasurement) {
    return (
      <>
        <MobileHeader title="측정 리포트" onBack={() => setSelectedMeasurementId(null)} accent={accent}/>
        <div style={{ padding: '18px 14px 36px' }}>
          <MeasurementDetailCard
            r={r}
            accent={accent}
            measurement={selectedMeasurement}
            profile={profile}
            onClose={() => setSelectedMeasurementId(null)}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </div>

        {showMeasurementOverlay && (
          <MeasurementOverlay
            live={live}
            accent={accent}
            busy={busy}
            onClaim={claim}
            onClose={dismissLive}
          />
        )}
      </>
    )
  }

  if (metricDetailOpen) {
    const metric = metricOption(historyMetric)
    return (
      <>
        <MobileHeader title={`${metric.label} 변화`} onBack={() => setMetricDetailOpen(false)} accent={accent}/>
        <div style={{ padding: '18px 14px 36px' }}>
          <MetricTrendHeaderCard
            r={r}
            accent={accent}
            measurements={measurements}
            metricKey={historyMetric}
          />
          <ScaleTrendCard
            r={r}
            accent={accent}
            measurements={measurements}
            selectedMeasurementId={selectedTrendMeasurementId}
            metricKey={historyMetric}
            rangeKey={historyRange}
            onMetricChange={changeHistoryMetric}
            onRangeChange={changeHistoryRange}
            onSelectMeasurement={setSelectedTrendMeasurementId}
            onOpenMeasurement={setSelectedMeasurementId}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </div>

        {showMeasurementOverlay && (
          <MeasurementOverlay
            live={live}
            accent={accent}
            busy={busy}
            onClaim={claim}
            onClose={dismissLive}
          />
        )}
      </>
    )
  }

  return (
    <>
      <MobileHeader title="체중계" onBack={back} right={settingsButton} accent={accent}/>
      <div style={{ padding: '18px 14px 36px' }}>
        <LatestScaleCard
          r={r}
          accent={accent}
          devices={devices}
          latest={latest}
          historyCount={history.length}
          trend={trend}
        />

        <TrendOverviewGrid
          measurements={measurements}
          metricKey={null}
          onMetricSelect={openMetricDetail}
        />

        <MeasurementMonthGroups
          measurements={measurements}
          expandedMonths={expandedMonths}
          onToggleMonth={toggleScaleMonth}
          onSelectMeasurement={setSelectedMeasurementId}
        />

        {error && <ErrorText>{error}</ErrorText>}
      </div>

      {showMeasurementOverlay && (
        <MeasurementOverlay
          live={live}
          accent={accent}
          busy={busy}
          onClaim={claim}
          onClose={dismissLive}
        />
      )}
    </>
  )
}

function Card({ r, children }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card,
      border: `1px solid ${PALETTE.charcoal.line}`,
      borderRadius: r + 2,
      padding: 16,
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

function PendingMeasurementsEntry({ r, accent, pendingCount, onOpen }) {
  const hasPending = pendingCount > 0
  return (
    <Card r={r}>
      <SectionTitle
        title="미확인 측정값"
        sub={hasPending ? `${pendingCount}개 측정값을 확인해야 합니다.` : '자동 배정되지 않은 측정값을 확인합니다.'}
      />
      <button
        type="button"
        onClick={onOpen}
        style={{
          width: '100%',
          minHeight: 58,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 15,
          border: `1px solid ${hasPending ? accent + '66' : PALETTE.charcoal.line}`,
          background: hasPending ? accent + '12' : '#17130f',
          color: PALETTE.charcoal.text,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          background: hasPending ? accent + '22' : '#120f0c',
          border: `1px solid ${hasPending ? accent + '55' : PALETTE.charcoal.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconScale size={20} color={hasPending ? accent : PALETTE.charcoal.dim}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>
            확인 필요한 측정값
          </div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 3 }}>
            {hasPending ? '내 기록으로 가져올 측정값이 있습니다.' : '현재 대기 중인 측정값은 없습니다.'}
          </div>
        </div>
        <div style={{
          color: hasPending ? accent : PALETTE.charcoal.dim,
          fontSize: 13,
          fontWeight: 850,
          whiteSpace: 'nowrap',
        }}>
          {pendingCount}개
        </div>
        <div style={{ color: '#6f665f', fontSize: 22, lineHeight: 1 }}>›</div>
      </button>
    </Card>
  )
}

function PendingMeasurementsPanel({ r, accent, pending, busy, onClaim }) {
  return (
    <Card r={r}>
      <SectionTitle
        title="미확인 측정값"
        sub={pending.length ? '사용자에게 자동 배정되지 않은 측정값입니다.' : '확인할 측정값이 없습니다.'}
      />
      {!pending.length ? (
        <div style={{
          minHeight: 132,
          borderRadius: 16,
          background: '#17130f',
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: PALETTE.charcoal.dim,
          fontSize: 13,
          lineHeight: 1.55,
          padding: 18,
        }}>
          자동 배정에 실패한 측정값이 생기면 여기에서 확인할 수 있습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map(item => (
            <div key={item.id} style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 12,
              alignItems: 'center',
              padding: '14px 15px',
              borderRadius: 16,
              background: '#17130f',
              border: `1px solid ${PALETTE.charcoal.line}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <div style={{
                    fontSize: 25,
                    lineHeight: 1,
                    fontWeight: 850,
                    color: PALETTE.charcoal.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatWeightKg(item)}
                  </div>
                  <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, fontWeight: 800 }}>kg</div>
                </div>
                <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 7 }}>
                  {formatWhen(item) || '측정 시간 없음'}
                </div>
                <div style={{ color: '#746b64', fontSize: 11.5, marginTop: 4 }}>
                  자동 배정 대기
                </div>
              </div>
              <button
                onClick={() => onClaim(item.id)}
                disabled={busy}
                style={{
                  ...smallButtonStyle(accent, busy),
                  minWidth: 74,
                  height: 40,
                }}
              >
                내 기록
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SectionTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: PALETTE.charcoal.text, fontSize: 17, fontWeight: 700 }}>{title}</div>
      {sub && <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function StatusLine({ label, sub, active, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 14, flexShrink: 0,
        background: active ? accent + '22' : '#17130f',
        border: `1px solid ${active ? accent + '55' : PALETTE.charcoal.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconScale size={22} color={active ? accent : PALETTE.charcoal.dim}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 15, fontWeight: 700 }}>{label}</div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

function ProfileSummaryCard({ r, accent, profile, complete, onEdit }) {
  const hasRange = profile.expectedWeightMin !== '' && profile.expectedWeightMax !== ''
  return (
    <Card r={r}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <SectionTitle
          title="내 프로필"
          sub={complete ? '체중 분석에 사용할 기본 정보' : '분석을 시작하려면 기본 정보를 입력하세요'}
        />
        <button onClick={onEdit} style={{ ...smallButtonStyle(accent, false), minWidth: 58 }}>
          수정
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <ProfilePill label="키" value={profile.heightCm ? `${profile.heightCm}cm` : '미입력'}/>
        <ProfilePill label="몸무게" value={profile.baselineWeightKg ? `${formatWeightKg(profile.baselineWeightKg)}kg` : '미입력'}/>
        <ProfilePill label="생년월일" value={formatBirthDate(profile.birthDate)}/>
        <ProfilePill label="성별" value={genderLabel(profile.gender)}/>
      </div>
      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 13,
        border: `1px solid ${complete ? accent + '44' : PALETTE.charcoal.warn + '38'}`,
        background: complete ? accent + '12' : PALETTE.charcoal.warn + '10',
        color: complete ? PALETTE.charcoal.text : PALETTE.charcoal.warn,
        fontSize: 12,
        fontWeight: 700,
      }}>
        {complete ? (hasRange ? '자동 매칭 보조 정보까지 저장됨' : '기본 분석 프로필 저장됨') : '키, 몸무게, 생년월일, 성별 입력 필요'}
      </div>
    </Card>
  )
}

function ProfileSetupCard({ r, accent, profile, setProfile, busy, onSave }) {
  return (
    <Card r={r}>
      <ProfileFormHeader accent={accent} title="분석 프로필 설정" sub="체중 분석을 시작하려면 기본 정보가 필요합니다."/>
      <ProfileFields profile={profile} setProfile={setProfile} accent={accent}/>
      <button onClick={onSave} disabled={busy} style={{ ...buttonStyle(accent, busy), marginTop: 24 }}>
        <IconCheck size={17} color={busy ? PALETTE.charcoal.dim : '#14100d'}/>
        프로필 저장
      </button>
    </Card>
  )
}

function ProfileEditorCard({ r, accent, profile, setProfile, busy, onSave }) {
  return (
    <Card r={r}>
      <SectionTitle title="프로필 수정" sub="기본 정보는 사용자별로 저장되고 위젯을 삭제해도 유지됩니다."/>
      <ProfileFields profile={profile} setProfile={setProfile} accent={accent} includeMatching/>
      <button onClick={onSave} disabled={busy} style={{ ...buttonStyle(accent, busy), marginTop: 24 }}>
        <IconCheck size={17} color={busy ? PALETTE.charcoal.dim : '#14100d'}/>
        저장
      </button>
    </Card>
  )
}

function ProfileFields({ profile, setProfile, accent, includeMatching = false }) {
  return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="키" type="number" suffix="cm" value={profile.heightCm} marginBottom={0} onChange={v => setProfile({ ...profile, heightCm: v })}/>
        <Field label="몸무게" type="number" suffix="kg" value={profile.baselineWeightKg} marginBottom={0} onChange={v => setProfile({ ...profile, baselineWeightKg: v })}/>
        <Field label="생년월일" type="date" value={profile.birthDate} marginBottom={0} onChange={v => setProfile({ ...profile, birthDate: v })}/>
      <GenderSegment value={profile.gender} accent={accent} onChange={v => setProfile({ ...profile, gender: v })}/>
      {includeMatching && (
        <>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, fontWeight: 800, margin: '14px 0 8px' }}>
            매칭 보조 정보
          </div>
          <Field label="표시 이름" value={profile.displayName} marginBottom={0} onChange={v => setProfile({ ...profile, displayName: v })}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="최소 kg" type="number" value={profile.expectedWeightMin} marginBottom={0} onChange={v => setProfile({ ...profile, expectedWeightMin: v })}/>
            <Field label="최대 kg" type="number" value={profile.expectedWeightMax} marginBottom={0} onChange={v => setProfile({ ...profile, expectedWeightMax: v })}/>
          </div>
          <Field label="평균 Ω" type="number" value={profile.avgImpedanceOhm} marginBottom={0} onChange={v => setProfile({ ...profile, avgImpedanceOhm: v })}/>
        </>
      )}
    </div>
  )
}

function ProfileFormHeader({ accent, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <div style={{
        width: 46,
        height: 46,
        borderRadius: 15,
        background: accent + '20',
        border: `1px solid ${accent}55`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <IconScale size={24} color={accent}/>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 18, fontWeight: 800 }}>{title}</div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>
      </div>
    </div>
  )
}

function GenderSegment({ value, accent, onChange }) {
  return (
    <div>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, marginBottom: 8 }}>성별</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GENDER_OPTIONS.length}, minmax(0, 1fr))`,
        gap: 8,
      }}>
        {GENDER_OPTIONS.map(option => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                minHeight: 46,
                borderRadius: 13,
                border: `1px solid ${selected ? accent + '88' : PALETTE.charcoal.line}`,
                background: selected ? accent + '22' : '#17130f',
                color: selected ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
                fontSize: 14,
                fontWeight: 800,
                fontFamily: 'inherit',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ProfilePill({ label, value }) {
  return (
    <div style={{ background: '#17130f', borderRadius: 13, padding: '10px 9px', border: `1px solid ${PALETTE.charcoal.line}` }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 10, marginBottom: 5 }}>{label}</div>
      <div style={{
        color: PALETTE.charcoal.text,
        fontSize: 13,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}

function LatestScaleCard({ r, accent, devices, latest, historyCount, trend }) {
  const trendValue = trend || '—'
  const trendColor = typeof trendValue === 'string' && trendValue.startsWith('-') ? REPORT_COLORS.green : REPORT_COLORS.coral
  return (
    <div style={{
      background: REPORT_COLORS.panel,
      border: `1px solid ${REPORT_COLORS.line}`,
      borderRadius: 26,
      padding: 22,
      marginBottom: 18,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {devices.length > 0 && (
        <div style={{
          position: 'absolute', top: -62, right: -44,
          width: 220, height: 220, borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}24 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
        <div>
          <div style={{
            fontSize: 12,
            color: '#9d9186',
            letterSpacing: 2,
            textTransform: 'uppercase',
            fontWeight: 800,
          }}>
            LATEST
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 8 }}>
            <div style={{
              fontSize: 62,
              lineHeight: 0.92,
              fontWeight: 800,
              color: PALETTE.charcoal.text,
              letterSpacing: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {latest ? formatWeightKg(latest) : '--.--'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: PALETTE.charcoal.dim, paddingBottom: 8 }}>kg</div>
          </div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, marginTop: 10 }}>
            {latest ? formatWhen(latest) : '측정 대기'}
          </div>
        </div>
        <div style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          background: accent + '24',
          border: `1px solid ${accent}66`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconScale size={28} color={accent}/>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 22, position: 'relative' }}>
        <Metric label="임피던스" value={latest?.impedanceOhm ? `${latest.impedanceOhm}Ω` : '—'} large/>
        <Metric label="기록" value={`${historyCount}개`} large/>
        <Metric label="변화" value={trendValue} large color={trendValue === '—' ? PALETTE.charcoal.text : trendColor}/>
      </div>
    </div>
  )
}

function MetricTrendHeaderCard({ r, accent, measurements, metricKey }) {
  const metric = metricOption(metricKey)
  const ordered = measurements
    .filter(item => measurementTimeMs(item) > 0)
    .sort((a, b) => measurementTimeMs(a) - measurementTimeMs(b))
  const newestTime = ordered[ordered.length - 1] ? measurementTimeMs(ordered[ordered.length - 1]) : Date.now()
  const cutoff = newestTime - 90 * 86400000
  const points = (ordered.filter(item => measurementTimeMs(item) >= cutoff).length ? ordered.filter(item => measurementTimeMs(item) >= cutoff) : ordered)
    .map(item => ({ item, value: numericValue(metric.getValue(item)), time: measurementTimeMs(item) }))
    .filter(point => point.value !== null)
  const currentPoint = points[points.length - 1]
  const firstPoint = points[0]
  const values = points.map(point => point.value)
  const current = currentPoint?.value
  const first = firstPoint?.value
  const delta = Number(current) - Number(first)
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null
  const highlightLabel = metric.good === 'up' ? '최고' : '최저'
  const highlightValue = metric.good === 'up' ? max : min
  let deltaColor = REPORT_COLORS.muted
  if (metric.good !== 'flat' && Number.isFinite(delta) && Math.abs(delta) > 0.0001) {
    const good = metric.good === 'down' ? delta < 0 : delta > 0
    deltaColor = good ? REPORT_COLORS.green : REPORT_COLORS.coral
  }
  const stats = [
    { label: '시작', value: first !== undefined ? formatMetricValue(first, metricKey) : '—' },
    { label: '평균', value: average !== null ? formatMetricValue(average, metricKey) : '—' },
    { label: highlightLabel, value: highlightValue !== null ? formatMetricValue(highlightValue, metricKey) : '—' },
  ]

  return (
    <div style={{
      background: `linear-gradient(180deg, ${REPORT_COLORS.panel} 0%, #14100c 100%)`,
      border: `1px solid ${accent}33`,
      borderRadius: Math.max(20, r + 8),
      padding: 0,
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: metric.dot }}/>
      <div style={{ padding: '20px 20px 17px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: 4, background: metric.dot }}/>
              <div style={{ color: PALETTE.charcoal.text, fontSize: 22, fontWeight: 850, letterSpacing: 0 }}>{metric.label}</div>
            </div>
            <div style={{ color: '#92877e', fontSize: 13, lineHeight: 1.5, marginTop: 7 }}>
              {currentPoint ? formatTrendDate(currentPoint.time) : '기록 없음'}
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{
              color: accent,
              fontSize: 34,
              lineHeight: 1,
              fontWeight: 850,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}>
              {current !== undefined ? formatMetricValue(current, metricKey) : '—'}
            </div>
            <div style={{ color: deltaColor, fontSize: 12.5, fontWeight: 850, marginTop: 8, whiteSpace: 'nowrap' }}>
              90일 {Number.isFinite(delta) ? formatDelta(delta, metric.digits, metric.unit) : '기록 대기'}
            </div>
          </div>
        </div>

        <div style={{ color: '#8f857c', fontSize: 12.5, lineHeight: 1.55, marginTop: 14 }}>
          {metric.desc}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        borderTop: `1px solid ${REPORT_COLORS.innerLine}`,
        background: 'rgba(0,0,0,0.12)',
      }}>
        {stats.map((item, index) => (
          <div key={item.label} style={{
            padding: '13px 10px 14px',
            borderLeft: index === 0 ? 0 : `1px solid ${REPORT_COLORS.innerLine}`,
            textAlign: 'center',
            minWidth: 0,
          }}>
            <div style={{ color: '#756c64', fontSize: 11.5, fontWeight: 800 }}>{item.label}</div>
            <div style={{
              color: PALETTE.charcoal.text,
              fontSize: 15,
              fontWeight: 850,
              marginTop: 5,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScaleTrendCard({
  r,
  accent,
  measurements,
  selectedMeasurementId,
  metricKey,
  rangeKey,
  onMetricChange,
  onRangeChange,
  onSelectMeasurement,
  onOpenMeasurement,
}) {
  const range = HISTORY_RANGE_OPTIONS.find(item => item.value === rangeKey) || HISTORY_RANGE_OPTIONS[2]
  const metric = metricOption(metricKey)
  const newestTime = measurements[0] ? measurementTimeMs(measurements[0]) : Date.now()
  const cutoff = range.days ? newestTime - range.days * 86400000 : 0
  const points = measurements
    .filter(item => !range.days || measurementTimeMs(item) >= cutoff)
    .map(item => ({ item, value: metricNumericValue(item, metricKey), time: measurementTimeMs(item) }))
    .filter(point => point.value !== null && point.time > 0)
    .sort((a, b) => a.time - b.time)
  const selectedPoint = points.find(point => point.item.id === selectedMeasurementId) || null
  const focusedPoint = selectedPoint || points[points.length - 1] || null
  const focusedIndex = focusedPoint ? points.findIndex(point => point.item.id === focusedPoint.item.id) : -1
  const previousPoint = focusedIndex > 0 ? points[focusedIndex - 1] : null
  const chartValue = focusedPoint?.value
  const chartDomainStart = points[0]?.time || newestTime
  const chartDomainEnd = points[points.length - 1]?.time || newestTime
  const rangeDelta = points.length >= 2 ? points[points.length - 1].value - points[0].value : null
  let rangeDeltaColor = REPORT_COLORS.muted
  if (Number.isFinite(rangeDelta) && Math.abs(rangeDelta) > 0.0001) {
    const good = metric.good === 'down' ? rangeDelta < 0 : rangeDelta > 0
    rangeDeltaColor = good ? REPORT_COLORS.green : REPORT_COLORS.coral
  }

  return (
    <div style={{
      background: REPORT_COLORS.panel,
      border: `1px solid ${REPORT_COLORS.line}`,
      borderRadius: 26,
      padding: '20px 18px 18px',
      marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 20, fontWeight: 850, letterSpacing: 0 }}>변화 그래프</div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>
            {points.length ? `${range.label} 기준 · ${points.length}개 기록` : '표시할 기록 없음'}
          </div>
        </div>
        <div style={{
          minWidth: 108,
          textAlign: 'right',
          background: REPORT_COLORS.panelAlt,
          border: `1px solid ${REPORT_COLORS.innerLine}`,
          borderRadius: 15,
          padding: '10px 11px',
        }}>
          <div style={{
            color: accent,
            fontSize: 20,
            lineHeight: 1,
            fontWeight: 850,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            letterSpacing: 0,
          }}>
            {chartValue !== undefined ? formatMetricValue(chartValue, metricKey) : '—'}
          </div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 11.5, fontWeight: 750, marginTop: 6 }}>
            {focusedPoint ? formatShortDate(focusedPoint.item) : metric.label}
          </div>
        </div>
      </div>

      <SegmentedControl
        options={HISTORY_RANGE_OPTIONS}
        value={rangeKey}
        onChange={onRangeChange}
        accent={accent}
      />
      <SegmentedControl
        options={BODY_METRIC_OPTIONS}
        value={metricKey}
        onChange={onMetricChange}
        accent={accent}
        scroll
      />

      <MiniLineChart
        points={points}
        metricKey={metricKey}
        selectedMeasurementId={selectedMeasurementId}
        accent={accent}
        domainStart={chartDomainStart}
        domainEnd={chartDomainEnd}
        onSelectMeasurement={onSelectMeasurement}
      />

      <TrendSelectionSummary
        point={focusedPoint}
        previousPoint={previousPoint}
        metricKey={metricKey}
        accent={accent}
        onOpenMeasurement={onOpenMeasurement}
      />

      {Number.isFinite(rangeDelta) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 12,
          padding: '12px 14px',
          borderRadius: 16,
          background: '#100c09',
          border: `1px solid ${REPORT_COLORS.innerLine}`,
        }}>
          <div style={{ color: '#8f857c', fontSize: 12.5, fontWeight: 750 }}>{range.label} 전체 변화</div>
          <div style={{ color: rangeDeltaColor, fontSize: 13, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>
            {formatDelta(rangeDelta, metric.digits, metric.unit)}
          </div>
        </div>
      )}
    </div>
  )
}

function TrendSelectionSummary({ point, previousPoint, metricKey, accent, onOpenMeasurement }) {
  const metric = metricOption(metricKey)
  if (!point) {
    return (
      <div style={{
        marginTop: 12,
        padding: '14px 15px',
        borderRadius: 16,
        background: REPORT_COLORS.panelAlt,
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        color: PALETTE.charcoal.dim,
        fontSize: 12.5,
      }}>
        기록이 쌓이면 선택한 날짜의 값이 표시됩니다.
      </div>
    )
  }

  const diff = previousPoint ? point.value - previousPoint.value : null
  let diffColor = REPORT_COLORS.muted
  if (Number.isFinite(diff) && Math.abs(diff) > 0.0001) {
    const good = metric.good === 'down' ? diff < 0 : diff > 0
    diffColor = good ? REPORT_COLORS.green : REPORT_COLORS.coral
  }

  return (
    <div style={{
      marginTop: 12,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: 12,
      alignItems: 'center',
      padding: '14px 15px',
      borderRadius: 17,
      background: REPORT_COLORS.panelAlt,
      border: `1px solid ${accent}2e`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <div style={{
            color: PALETTE.charcoal.text,
            fontSize: 22,
            lineHeight: 1,
            fontWeight: 850,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}>
            {formatMetricValue(point.value, metricKey)}
          </div>
          <div style={{ color: diffColor, fontSize: 12.5, fontWeight: 850, whiteSpace: 'nowrap' }}>
            {previousPoint ? formatDelta(diff, metric.digits, metric.unit) : '첫 기록'}
          </div>
        </div>
        <div style={{ color: '#81786f', fontSize: 12, fontWeight: 750, marginTop: 7 }}>
          {formatTrendDate(point.time)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenMeasurement?.(point.item.id)}
        style={{
          height: 40,
          padding: '0 13px',
          borderRadius: 13,
          border: `1px solid ${accent}66`,
          background: accent + '18',
          color: PALETTE.charcoal.text,
          fontSize: 12.5,
          fontWeight: 850,
          fontFamily: 'inherit',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        리포트 보기
      </button>
    </div>
  )
}

function SegmentedControl({ options, value, onChange, accent, scroll = false }) {
  return (
    <div style={{
      display: scroll ? 'flex' : 'grid',
      gridTemplateColumns: scroll ? undefined : `repeat(${options.length}, minmax(0, 1fr))`,
      gap: 8,
      overflowX: scroll ? 'auto' : 'visible',
      padding: scroll ? '0 0 4px' : 0,
      marginTop: scroll ? 10 : 18,
      marginBottom: 0,
      WebkitOverflowScrolling: 'touch',
    }}>
      {options.map(option => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              minHeight: scroll ? 48 : 46,
              minWidth: scroll ? 94 : 0,
              flex: scroll ? '0 0 auto' : 1,
              padding: scroll ? '0 14px' : '0 10px',
              borderRadius: 14,
              border: `1px solid ${active ? accent : REPORT_COLORS.innerLine}`,
              background: active ? accent + '28' : REPORT_COLORS.panelAlt,
              color: active ? PALETTE.charcoal.text : '#9b938b',
              fontSize: scroll ? 13 : 14,
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function MiniLineChart({ points, metricKey, selectedMeasurementId, accent, domainStart, domainEnd, onSelectMeasurement }) {
  const svgRef = useRef(null)
  const width = 360
  const height = 188
  const padX = 12
  const padTop = 16
  const padBottom = 30
  const plotWidth = width - padX * 2
  const plotHeight = height - padTop - padBottom
  const values = points.map(point => point.value)
  let min = Math.min(...values)
  let max = Math.max(...values)

  if (!points.length) {
    return (
      <div style={{
        height: 188,
        marginTop: 18,
        borderRadius: 18,
        background: REPORT_COLORS.panelAlt,
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: PALETTE.charcoal.dim,
        fontSize: 13,
      }}>
        표시할 분석 기록이 없습니다.
      </div>
    )
  }

  if (metricKey === 'balance') {
    min = 0
    max = 100
  } else if (metricKey === 'bmi') {
    min = Math.min(15, min - 1)
    max = Math.max(40, max + 1)
  } else if (min === max) {
    min -= 1
    max += 1
  } else {
    const pad = (max - min) * 0.18
    min -= pad
    max += pad
  }

  const pointTimeMin = Math.min(...points.map(point => point.time))
  const pointTimeMax = Math.max(...points.map(point => point.time))
  const timeMin = Number.isFinite(domainStart) ? domainStart : pointTimeMin
  const timeMax = Number.isFinite(domainEnd) ? domainEnd : pointTimeMax
  const xForTime = (time) => padX + (timeMax === timeMin ? plotWidth / 2 : ((time - timeMin) / (timeMax - timeMin)) * plotWidth)
  const yFor = (value) => padTop + (1 - ((value - min) / (max - min))) * plotHeight
  const coords = points.map(point => ({
    ...point,
    x: xForTime(point.time),
    y: yFor(point.value),
  }))
  const linePath = coords.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height - padBottom} L ${coords[0].x.toFixed(2)} ${height - padBottom} Z`
    : ''
  const last = coords[coords.length - 1]
  const selectedPoint = coords.find(point => point.item.id === selectedMeasurementId) || last
  const activePointId = selectedMeasurementId || last?.item.id
  const many = coords.length > 40
  const gradientId = `scale-trend-gradient-${metricKey}`
  const selectNearestPoint = (event) => {
    if (!coords.length || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (!rect.width) return
    const chartX = ((event.clientX - rect.left) / rect.width) * width
    const nearest = coords.reduce((best, point) => (
      Math.abs(point.x - chartX) < Math.abs(best.x - chartX) ? point : best
    ), coords[0])
    if (nearest?.item?.id) {
      onSelectMeasurement(nearest.item.id)
    }
  }
  const tooltipWidth = 108
  const tooltipHeight = 40
  const tooltipGap = 18
  const tooltip = selectedPoint ? (() => {
    const aboveY = selectedPoint.y - tooltipHeight - tooltipGap
    const belowY = selectedPoint.y + tooltipGap
    const maxY = height - padBottom - tooltipHeight - 2
    const y = aboveY >= 2 ? aboveY : Math.min(maxY, belowY)
    const x = Math.max(2, Math.min(width - tooltipWidth - 2, selectedPoint.x - tooltipWidth / 2))
    return {
      x,
      y,
      textX: x + tooltipWidth / 2,
      valueY: y + 16,
      dateY: y + 31,
    }
  })() : null

  return (
    <div style={{
      marginTop: 18,
      borderRadius: 18,
      background: REPORT_COLORS.panelAlt,
      border: `1px solid ${REPORT_COLORS.innerLine}`,
      overflow: 'hidden',
      position: 'relative',
      padding: '14px 12px 8px',
    }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="체성분 변화 그래프"
        onPointerDown={event => {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          selectNearestPoint(event)
        }}
        onPointerMove={event => {
          if (event.buttons || event.pointerType === 'touch') selectNearestPoint(event)
        }}
        style={{ display: 'block', touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28"/>
            <stop offset="100%" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(level => {
          const y = padTop + plotHeight * level
          return <line key={level} x1={padX} y1={y} x2={width - padX} y2={y} stroke={REPORT_COLORS.innerLine} strokeWidth="1"/>
        })}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`}/>}
        {linePath && <path d={linePath} fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>}
        {coords.map(point => {
          const active = point.item.id === activePointId
          if (many && !active) return null
          return (
            <circle
              key={point.item.id}
              cx={point.x}
              cy={point.y}
              r={active ? 6.2 : 4.5}
              fill={active ? accent : '#140f0b'}
              stroke={active ? '#fff4db' : accent}
              strokeWidth={active ? 2.5 : 2}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectMeasurement(point.item.id)}
            />
          )
        })}
        {coords.map(point => (
          <circle
            key={`${point.item.id}:hit`}
            cx={point.x}
            cy={point.y}
            r={many ? 10 : 13}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectMeasurement(point.item.id)}
          />
        ))}
        {selectedPoint && (
          <>
            <line x1={selectedPoint.x} y1={padTop} x2={selectedPoint.x} y2={height - padBottom} stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={tooltip.x}
                y={tooltip.y}
                width={tooltipWidth}
                height={tooltipHeight}
                rx="9"
                fill="#000"
                opacity="0.82"
                stroke="#3a2f24"
              />
              <text x={tooltip.textX} y={tooltip.valueY} fill="#fff" fontSize="13" fontWeight="800" textAnchor="middle">
                {formatMetricValue(selectedPoint.value, metricKey)}
              </text>
              <text x={tooltip.textX} y={tooltip.dateY} fill="#b3aaa1" fontSize="10.5" textAnchor="middle">
                {formatShortDate(selectedPoint.item)}
              </text>
            </g>
          </>
        )}
        <text x={padX} y={height - 10} fill="#6b625a" fontSize="11">{formatAxisDate(timeMin)}</text>
        <text x={width - padX} y={height - 10} fill="#6b625a" fontSize="11" textAnchor="end">{formatAxisDate(timeMax)}</text>
      </svg>
    </div>
  )
}

function TrendOverviewGrid({ measurements, metricKey, onMetricSelect }) {
  if (!measurements.length) return null
  const newestTime = measurements[0] ? measurementTimeMs(measurements[0]) : Date.now()
  const cutoff = newestTime - 90 * 86400000
  const ranged = measurements
    .filter(item => measurementTimeMs(item) >= cutoff)
    .sort((a, b) => measurementTimeMs(a) - measurementTimeMs(b))
  const source = ranged.length >= 2 ? ranged : measurements.slice().sort((a, b) => measurementTimeMs(a) - measurementTimeMs(b))
  const cards = BODY_METRIC_OPTIONS.map(option => {
    const values = source
      .map(item => numericValue(option.getValue(item)))
      .filter(value => value !== null)
    if (!values.length) return null
    const current = values[values.length - 1]
    const first = values[0]
    const delta = current - first
    let deltaColor = REPORT_COLORS.muted
    if (option.good !== 'flat' && Math.abs(delta) > 0.0001) {
      const good = option.good === 'down' ? delta < 0 : delta > 0
      deltaColor = good ? REPORT_COLORS.green : REPORT_COLORS.coral
    }
    return {
      option,
      values,
      current,
      delta,
      deltaColor,
    }
  }).filter(Boolean)

  if (!cards.length) return null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '24px 2px 12px' }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 21, fontWeight: 800 }}>한눈에 보기</div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 13 }}>눌러서 변화 보기</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        {cards.map(card => {
          const active = !!metricKey && metricKey === card.option.value
          const isWeightCard = card.option.value === 'weight'
          return (
            <button
              key={card.option.value}
              type="button"
              onClick={() => onMetricSelect(card.option.value)}
              style={{
                position: 'relative',
                minHeight: 158,
                background: REPORT_COLORS.panel,
                border: `1px solid ${active ? REPORT_COLORS.amber : REPORT_COLORS.line}`,
                borderRadius: 20,
                padding: 16,
                cursor: 'pointer',
                overflow: 'hidden',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  border: `1.5px solid ${REPORT_COLORS.amber}`,
                  borderRadius: 20,
                  pointerEvents: 'none',
                }}/>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: 3, background: card.option.dot }}/>
                <div style={{ color: PALETTE.charcoal.text, fontSize: 15, fontWeight: 800 }}>{card.option.label}</div>
              </div>
              <div style={{ color: '#857c74', fontSize: 11.5, lineHeight: 1.4, marginTop: 5, minHeight: 32 }}>
                {card.option.desc}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isWeightCard ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) auto',
                alignItems: 'end',
                columnGap: 8,
                rowGap: 7,
                marginTop: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, minWidth: 0 }}>
                  <div style={{
                    color: PALETTE.charcoal.text,
                    fontSize: isWeightCard ? 25 : 27,
                    lineHeight: 1,
                    fontWeight: 800,
                    letterSpacing: 0,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatPlainNumber(card.current, card.option.digits)}
                  </div>
                  {card.option.unit && (
                    <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, fontWeight: 800, paddingBottom: 2 }}>
                      {card.option.unit}
                    </div>
                  )}
                </div>
                <div style={{
                  color: card.deltaColor,
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  justifySelf: isWeightCard ? 'start' : 'end',
                  maxWidth: '100%',
                }}>
                  {formatDelta(card.delta, card.option.digits, card.option.unit)}
                </div>
              </div>
              <div style={{ color: '#7c736b', fontSize: 11.5, fontWeight: 800, marginTop: 8 }}>
                기록 변화 보기 ›
              </div>
              <div style={{ marginTop: 12, height: 34 }}>
                <MiniSparkline values={card.values} color={card.option.dot}/>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function MeasurementMonthGroups({ measurements, expandedMonths, onToggleMonth, onSelectMeasurement }) {
  const orderedAsc = measurements
    .filter(item => item?.id && measurementTimeMs(item) > 0)
    .sort((a, b) => measurementTimeMs(a) - measurementTimeMs(b))
  const orderedDesc = orderedAsc.slice().reverse()

  if (!orderedDesc.length) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '26px 2px 12px' }}>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 21, fontWeight: 800 }}>측정 기록</div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 13 }}>기록 없음</div>
        </div>
        <div style={{
          background: REPORT_COLORS.panel,
          border: `1px solid ${REPORT_COLORS.line}`,
          borderRadius: 20,
          padding: 18,
          color: PALETTE.charcoal.dim,
          fontSize: 13,
          lineHeight: 1.55,
          marginBottom: 18,
        }}>
          ESP32가 측정값을 보내면 여기에 표시됩니다.
        </div>
      </>
    )
  }

  const previousById = new Map()
  orderedAsc.forEach((item, index) => {
    if (index > 0) previousById.set(item.id, orderedAsc[index - 1])
  })

  const groupsMap = new Map()
  orderedAsc.forEach(item => {
    const date = new Date(measurementTimeMs(item))
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = `${date.getFullYear()}년 ${date.getMonth() + 1}월`
    if (!groupsMap.has(key)) groupsMap.set(key, { key, label, items: [] })
    groupsMap.get(key).items.push(item)
  })
  const groups = Array.from(groupsMap.values()).sort((a, b) => b.key.localeCompare(a.key))
  const latestMonthKey = groups[0]?.key

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '26px 2px 12px' }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 21, fontWeight: 800 }}>측정 기록</div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 13 }}>전체 {orderedDesc.length}개 · 월별로 묶음</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {groups.map(group => {
          const explicit = Object.prototype.hasOwnProperty.call(expandedMonths, group.key)
          const expanded = explicit ? expandedMonths[group.key] : group.key === latestMonthKey
          const first = group.items[0]
          const last = group.items[group.items.length - 1]
          const monthDelta = Number(last?.weightKg) - Number(first?.weightKg)
          const monthDeltaText = Number.isFinite(monthDelta) && Math.abs(monthDelta) >= 0.05
            ? `${monthDelta <= 0 ? '▼' : '▲'} ${Math.abs(monthDelta).toFixed(1)}kg`
            : '–'
          const monthDeltaColor = monthDeltaText === '–' ? REPORT_COLORS.muted : monthDelta <= 0 ? REPORT_COLORS.green : REPORT_COLORS.coral

          return (
            <div key={group.key} style={{
              background: REPORT_COLORS.panel,
              border: `1px solid ${REPORT_COLORS.line}`,
              borderRadius: 20,
              overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={() => onToggleMonth(group.key)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '16px 18px',
                  background: 'transparent',
                  border: 0,
                  color: PALETTE.charcoal.text,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800, flex: 1, minWidth: 0 }}>{group.label}</div>
                <div style={{ color: monthDeltaColor, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{monthDeltaText}</div>
                <div style={{
                  color: '#9b938b',
                  fontSize: 12,
                  fontWeight: 800,
                  background: REPORT_COLORS.panelAlt,
                  border: `1px solid ${REPORT_COLORS.innerLine}`,
                  borderRadius: 9,
                  padding: '4px 9px',
                  whiteSpace: 'nowrap',
                }}>
                  {group.items.length}회
                </div>
                <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, width: 13, textAlign: 'center' }}>{expanded ? '▾' : '▸'}</div>
              </button>

              {expanded && (
                <div>
                  {group.items.slice().reverse().map(item => {
                    const prev = previousById.get(item.id)
                    const diff = prev ? Number(item.weightKg) - Number(prev.weightKg) : 0
                    const deltaText = !prev || !Number.isFinite(diff)
                      ? '첫 측정'
                      : `${diff <= 0 ? '▼' : '▲'} ${Math.abs(diff).toFixed(2)}kg`
                    const deltaColor = !prev ? REPORT_COLORS.muted : diff <= 0 ? REPORT_COLORS.green : REPORT_COLORS.coral
                    const score = item.analysis?.bodyBalance?.bodyBalanceScore
                    const rowDate = new Date(measurementTimeMs(item))
                    const dateText = rowDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).replace(/\s/g, ' ')
                    const timeText = rowDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectMeasurement(item.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 13,
                          padding: '13px 18px',
                          border: 0,
                          borderTop: `1px solid ${REPORT_COLORS.innerLine}`,
                          background: 'transparent',
                          color: PALETTE.charcoal.text,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800 }}>{dateText}</div>
                          <div style={{ color: '#7c736b', fontSize: 11.5, marginTop: 2 }}>{timeText} 측정</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ color: PALETTE.charcoal.text, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                            {formatWeightKg(item)}<span style={{ color: PALETTE.charcoal.dim, fontSize: 11, fontWeight: 800 }}>kg</span>
                          </div>
                          <div style={{ color: deltaColor, fontSize: 11, fontWeight: 800, marginTop: 1 }}>{deltaText}</div>
                        </div>
                        <div style={{
                          flex: '0 0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          background: 'rgba(232,154,60,0.10)',
                          border: '1px solid rgba(232,154,60,0.28)',
                          borderRadius: 10,
                          padding: '4px 8px',
                        }}>
                          <span style={{ color: scoreTone(score), fontSize: 14, fontWeight: 800 }}>{Number.isFinite(Number(score)) ? score : '—'}</span>
                          <span style={{ color: PALETTE.charcoal.dim, fontSize: 9.5, fontWeight: 800 }}>점</span>
                        </div>
                        <div style={{ color: '#5f574f', fontSize: 20, lineHeight: 1 }}>›</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function MiniSparkline({ values, color }) {
  const width = 130
  const height = 34
  const pad = 3
  const nums = values.map(Number).filter(Number.isFinite)
  if (!nums.length) return null
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    min -= 1
    max += 1
  }
  const xFor = index => nums.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (nums.length - 1)
  const yFor = value => height - pad - ((value - min) / (max - min)) * (height - pad * 2)
  const coords = nums.map((value, index) => ({ x: xFor(index), y: yFor(value) }))
  const path = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {last && <circle cx={last.x} cy={last.y} r="3" fill={color}/>}
    </svg>
  )
}

function ReportPromptCard({ r, accent }) {
  return (
    <Card r={r}>
      <div style={{
        minHeight: 112,
        borderRadius: 16,
        border: `1px dashed ${accent}55`,
        background: '#17130f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 18,
      }}>
        <div>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 16, fontWeight: 800 }}>
            그래프의 점을 선택하세요
          </div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>
            선택한 날짜의 BMI 구간, 바디 밸런스, 표준 대비 차이를 리포트로 보여줍니다.
          </div>
        </div>
      </div>
    </Card>
  )
}

function MeasurementDetailCard({ r, accent, measurement, profile, onClose }) {
  if (!measurement) return null
  const analysis = measurement.analysis
  const balance = analysis?.bodyBalance || null

  return (
    <div>
      {!analysis ? (
        <ReportSectionCard>
          <ReportSectionHeading title="측정 리포트" sub={formatWhen(measurement) || '측정 시간 없음'}/>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, lineHeight: 1.55 }}>
            이 측정값에는 아직 체성분 분석 데이터가 없습니다.
          </div>
        </ReportSectionCard>
      ) : (
        <>
          <BodyBalanceHero measurement={measurement} analysis={analysis} balance={balance} accent={accent}/>
          <ReportQuickStats measurement={measurement} analysis={analysis}/>
          <CompositionReport analysis={analysis} measurement={measurement}/>
          {balance && <StandardCompareReport measurement={measurement} analysis={analysis} balance={balance}/>}
          <StandardReferenceReport measurement={measurement} analysis={analysis} balance={balance}/>
          <BmiBandReport analysis={analysis} balance={balance}/>
          <IndexBarsReport analysis={analysis}/>
          <BmrReport analysis={analysis}/>
          <CalculationInputsReport measurement={measurement} analysis={analysis} profile={profile}/>
          <MeasurementMetaReport measurement={measurement} analysis={analysis}/>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        style={{
          width: '100%',
          minHeight: 52,
          marginTop: 20,
          padding: '0 16px',
          background: REPORT_COLORS.panel,
          border: `1px solid ${REPORT_COLORS.line}`,
          borderRadius: 18,
          color: '#bcb3aa',
          fontSize: 15,
          fontWeight: 800,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        기록 목록으로 돌아가기
      </button>
    </div>
  )
}

function ReportSectionCard({ children, style }) {
  return (
    <div style={{
      background: REPORT_COLORS.panel,
      border: `1px solid ${REPORT_COLORS.line}`,
      borderRadius: 24,
      padding: '22px 20px',
      marginBottom: 14,
      ...style,
    }}>
      {children}
    </div>
  )
}

function ReportSectionHeading({ title, sub, right }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 20, fontWeight: 800 }}>{title}</div>
        {right}
      </div>
      {sub && <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function BodyBalanceHero({ measurement, analysis, balance, accent }) {
  const score = numericValue(balance?.bodyBalanceScore)
  const scoreRounded = score !== null ? Math.round(score) : null
  const color = scoreTone(scoreRounded, accent)
  const message = balance?.message || `${analysis?.bmiCategory || 'BMI'} 구간으로 분류됩니다.`
  const grade = balance ? friendlyBalanceGrade(balance) : '분석 대기'

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: '#1f1914',
      border: `1px solid ${accent}55`,
      borderRadius: 22,
      padding: '24px 22px',
      marginBottom: 14,
    }}>
      <div style={{
        position: 'absolute',
        top: -70,
        left: -30,
        width: 240,
        height: 240,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${scoreRounded !== null && scoreRounded >= 70 ? 'rgba(134,184,154,0.18)' : 'rgba(232,154,60,0.18)'}, transparent 70%)`,
        pointerEvents: 'none',
      }}/>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{
          width: 140,
          height: 140,
          flex: '0 0 auto',
          borderRadius: '50%',
          background: `conic-gradient(${color} ${scoreRounded !== null ? (scoreRounded / 100) * 360 : 0}deg, #2a221b 0)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 112,
            height: 112,
            borderRadius: '50%',
            background: '#140f0b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ color, fontSize: 46, lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {scoreRounded !== null ? scoreRounded : '—'}
            </div>
            <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 3 }}>/ 100점</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>바디 밸런스</div>
          <div style={{ color, fontSize: 27, fontWeight: 800, marginTop: 4 }}>{grade}</div>
          <div style={{ color: '#bcb3aa', fontSize: 13.5, lineHeight: 1.55, marginTop: 9 }}>{message}</div>
        </div>
      </div>
      <div style={{
        position: 'relative',
        color: '#857c74',
        fontSize: 12.5,
        lineHeight: 1.55,
        marginTop: 16,
        background: REPORT_COLORS.panelAlt,
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        borderRadius: 14,
        padding: '11px 13px',
      }}>
        체지방·근육·수분의 균형을 100점으로 환산한 종합 점수예요. 점수가 높을수록 표준 체형에 가깝고 균형 잡힌 몸이에요.
      </div>
    </div>
  )
}

function ReportQuickStats({ measurement, analysis }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
      <ReportStat label="측정 체중" value={formatWeightKg(measurement)} unit="kg"/>
      <ReportStat label="BMI" value={formatPlainNumber(analysis.bmi, 1)} sub={analysis.bmiCategory || '—'} tone={REPORT_COLORS.coral}/>
      <ReportStat label="비만도" value={formatPlainNumber(analysis.obesityDegreePercent, 0)} unit="%" sub="표준=100%"/>
    </div>
  )
}

function ReportStat({ label, value, unit, sub, tone }) {
  return (
    <div style={{
      background: REPORT_COLORS.panel,
      border: `1px solid ${REPORT_COLORS.line}`,
      borderRadius: 18,
      padding: '15px 14px',
      minWidth: 0,
    }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 12 }}>{label}</div>
      <div style={{ color: PALETTE.charcoal.text, fontSize: 23, lineHeight: 1.1, fontWeight: 800, marginTop: 5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
        {unit && <span style={{ color: PALETTE.charcoal.dim, fontSize: 12, fontWeight: 800, marginLeft: 2 }}>{unit}</span>}
      </div>
      {sub && <div style={{ color: tone || '#857c74', fontSize: 11, fontWeight: 700, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function CompositionReport({ analysis, measurement }) {
  const weight = numericValue(measurement?.weightKg)
  const fatPct = numericValue(analysis.bodyFatPercent)
  const leanPct = numericValue(analysis.fatFreeMassPercent) ?? (weight && numericValue(analysis.fatFreeMassKg) ? (numericValue(analysis.fatFreeMassKg) / weight) * 100 : null)
  const waterPct = numericValue(analysis.bodyWaterPercent)
  const muscleKg = numericValue(analysis.skeletalMuscleMassKg)
  const musclePct = weight && muscleKg !== null ? (muscleKg / weight) * 100 : null
  const fatBar = fatPct !== null ? `${Math.max(14, Math.min(86, fatPct)).toFixed(1)}%` : '50%'
  const waterBar = waterPct !== null ? `${Math.max(4, Math.min(100, waterPct)).toFixed(0)}%` : '0%'
  const muscleBar = musclePct !== null ? `${Math.max(4, Math.min(100, musclePct)).toFixed(0)}%` : '0%'

  return (
    <ReportSectionCard>
      <ReportSectionHeading
        title="체성분 구성"
        sub="내 몸무게가 어떤 성분으로 이뤄졌는지 보여줘요. 지방은 적을수록, 근육이 포함된 제지방은 많을수록 건강해요."
      />
      <div style={{ display: 'flex', height: 46, borderRadius: 13, overflow: 'hidden', border: `1px solid ${REPORT_COLORS.innerLine}` }}>
        <div style={{
          width: fatBar,
          background: 'linear-gradient(135deg,#E0937A,#cf7d63)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 40,
        }}>
          <span style={{ color: '#2a140c', fontSize: 12, fontWeight: 800 }}>{formatPlainNumber(fatPct, 1)}%</span>
        </div>
        <div style={{
          flex: 1,
          background: 'linear-gradient(135deg,#E89A3C,#d2862c)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ color: '#2a1c08', fontSize: 12, fontWeight: 800 }}>{formatPlainNumber(leanPct, 1)}%</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
        <CompositionLegend color={REPORT_COLORS.coral} label="체지방량" value={formatPlainNumber(analysis.fatMassKg, 1)} unit="kg"/>
        <CompositionLegend color={REPORT_COLORS.amber} label="제지방량" value={formatPlainNumber(analysis.fatFreeMassKg, 1)} unit="kg"/>
      </div>
      <div style={{ height: 1, background: REPORT_COLORS.innerLine, margin: '18px 0' }}/>
      <SubMetricBar label="체수분량" sub="몸속 수분" value={`${formatPlainNumber(analysis.totalBodyWaterKg, 1)}kg · ${formatPlainNumber(waterPct, 1)}%`} width={waterBar} color={REPORT_COLORS.blue}/>
      <SubMetricBar label="골격근량" sub="운동으로 키우는 근육" value={`${formatPlainNumber(muscleKg, 1)}kg · ${formatPlainNumber(musclePct, 0)}%`} width={muscleBar} color={REPORT_COLORS.green} style={{ marginTop: 16 }}/>
    </ReportSectionCard>
  )
}

function CompositionLegend({ color, label, value, unit }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 12 }}>{label}</div>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 16, fontWeight: 800, marginTop: 2 }}>
          {value}<span style={{ color: PALETTE.charcoal.dim, fontSize: 11, fontWeight: 800 }}>{unit}</span>
        </div>
      </div>
    </div>
  )
}

function SubMetricBar({ label, sub, value, width, color, style }) {
  return (
    <div style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 14, fontWeight: 800 }}>
          {label} <span style={{ color: PALETTE.charcoal.dim, fontSize: 12, fontWeight: 500 }}>{sub}</span>
        </div>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: REPORT_COLORS.innerLine, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width, background: color, borderRadius: 6 }}/>
      </div>
    </div>
  )
}

function StandardCompareReport({ measurement, analysis, balance }) {
  const compares = [
    comparisonRow('체중', measurement?.weightKg, balance.standardWeightKg, false),
    comparisonRow('체지방량', analysis?.fatMassKg, balance.standardFatMassKg, false),
    comparisonRow('제지방량 (근육)', analysis?.fatFreeMassKg, balance.standardLeanMassKg, true),
  ]
  return (
    <ReportSectionCard>
      <ReportSectionHeading
        title="표준 체형과 비교"
        sub="같은 키·성별의 표준 체형과 내 몸을 비교했어요. 가운데 밝은 구간이 표준 범위, 동그라미가 현재 내 위치예요."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {compares.map(row => (
          <div key={row.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
              <div style={{ color: PALETTE.charcoal.text, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{row.label}</div>
              <div style={{ color: '#857c74', fontSize: 13, textAlign: 'right' }}>
                {row.statusLabel} <span style={{ color: row.color, fontWeight: 800 }}>{row.diff}</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 14, borderRadius: 8, background: REPORT_COLORS.innerLine }}>
              <div style={{ position: 'absolute', left: '38%', width: '24%', top: 0, bottom: 0, background: 'rgba(232,154,60,0.22)', borderLeft: '1px dashed #6b5a44', borderRight: '1px dashed #6b5a44' }}/>
              <div style={{ position: 'absolute', top: '50%', left: row.pos, width: 18, height: 18, borderRadius: '50%', background: row.color, border: '3px solid #140f0b', transform: 'translate(-50%,-50%)' }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b625a', fontSize: 10.5, marginTop: 5 }}>
              <span>적음</span><span>표준</span><span>많음</span>
            </div>
          </div>
        ))}
      </div>
    </ReportSectionCard>
  )
}

function StandardReferenceReport({ measurement, analysis, balance }) {
  const standardWeight = balance?.standardWeightKg ?? analysis.standardWeightKg
  const standardFat = balance?.standardFatMassKg ?? analysis.bodyBalanceStandardFatMassKg
  const standardLean = balance?.standardLeanMassKg ?? analysis.bodyBalanceStandardLeanMassKg
  const rows = [
    {
      label: '체중',
      current: measurement?.weightKg,
      standard: standardWeight,
      diff: balance?.weightDiffKg ?? analysis.weightDiffKg ?? analysis.bodyBalanceWeightDiffKg,
    },
    {
      label: '체지방량',
      current: analysis.fatMassKg,
      standard: standardFat,
      diff: balance?.fatDiffKg ?? analysis.bodyBalanceFatDiffKg,
    },
    {
      label: '제지방량',
      current: analysis.fatFreeMassKg,
      standard: standardLean,
      diff: balance?.leanDiffKg ?? analysis.bodyBalanceLeanDiffKg,
    },
  ]
  const hasAny = rows.some(row => numericValue(row.current) !== null || numericValue(row.standard) !== null || numericValue(row.diff) !== null)
  if (!hasAny) return null

  return (
    <ReportSectionCard>
      <ReportSectionHeading
        title="표준 기준값"
        sub="바디 밸런스 계산에 사용한 키·성별 기준 표준값과 현재 차이예요."
      />
      <div style={{
        background: REPORT_COLORS.panelAlt,
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr repeat(3, minmax(0, 1fr))',
          gap: 1,
          background: REPORT_COLORS.innerLine,
          color: '#7c736b',
          fontSize: 10.5,
          fontWeight: 800,
        }}>
          {['항목', '현재', '표준', '차이'].map(label => (
            <div key={label} style={{ background: REPORT_COLORS.panelAlt, padding: '10px 9px', textAlign: label === '항목' ? 'left' : 'right' }}>
              {label}
            </div>
          ))}
        </div>
        {rows.map(row => {
          const diff = numericValue(row.diff)
          const diffColor = diff === null || Math.abs(diff) < 0.05
            ? REPORT_COLORS.muted
            : row.label === '제지방량'
              ? (diff >= 0 ? REPORT_COLORS.green : REPORT_COLORS.coral)
              : (diff <= 0 ? REPORT_COLORS.green : REPORT_COLORS.coral)
          return (
            <div key={row.label} style={{
              display: 'grid',
              gridTemplateColumns: '1.05fr repeat(3, minmax(0, 1fr))',
              gap: 1,
              background: REPORT_COLORS.innerLine,
              borderTop: `1px solid ${REPORT_COLORS.innerLine}`,
            }}>
              <ReferenceCell strong align="left">{row.label}</ReferenceCell>
              <ReferenceCell>{formatKg(row.current)}</ReferenceCell>
              <ReferenceCell>{formatKg(row.standard)}</ReferenceCell>
              <ReferenceCell color={diffColor}>{formatSignedKg(row.diff)}</ReferenceCell>
            </div>
          )
        })}
      </div>
      <div style={{
        color: '#857c74',
        fontSize: 12.5,
        lineHeight: 1.55,
        marginTop: 12,
        background: '#0f0c08',
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        borderRadius: 12,
        padding: '10px 12px',
      }}>
        표준값은 의료 진단 기준이 아니라, 현재 체성분을 비교하기 위한 참고용 기준값이에요.
      </div>
    </ReportSectionCard>
  )
}

function ReferenceCell({ children, color, strong = false, align = 'right' }) {
  return (
    <div style={{
      background: REPORT_COLORS.panelAlt,
      color: color || PALETTE.charcoal.text,
      fontSize: 12.5,
      fontWeight: strong ? 800 : 700,
      padding: '12px 9px',
      textAlign: align,
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {children}
    </div>
  )
}

function BmiBandReport({ analysis, balance }) {
  const bmi = numericValue(analysis.bmi)
  const marker = `${Math.max(2, Math.min(98, (((bmi ?? 15) - 15) / 25) * 100)).toFixed(1)}%`
  const standardWeight = balance?.standardWeightKg ?? analysis.standardWeightKg
  const weightDiff = balance?.weightDiffKg ?? analysis.weightDiffKg

  return (
    <ReportSectionCard>
      <ReportSectionHeading
        title="BMI 구간"
        sub="키와 몸무게로 계산한 비만 지표예요. 화살표 위치가 내 BMI 구간이에요."
        right={<div style={{ color: REPORT_COLORS.coral, fontSize: 22, fontWeight: 800 }}>{formatPlainNumber(bmi, 1)}</div>}
      />
      <div style={{ position: 'relative', marginTop: 26 }}>
        <div style={{ position: 'absolute', top: -20, left: marker, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>나</div>
          <div style={{ width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: `9px solid ${PALETTE.charcoal.text}` }}/>
        </div>
        <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ width: '14%', background: '#6E8FB0' }}/>
          <div style={{ width: '18%', background: '#86B89A' }}/>
          <div style={{ width: '8%', background: '#C9B06A' }}/>
          <div style={{ width: '20%', background: '#E89A3C' }}/>
          <div style={{ width: '20%', background: '#D9805A' }}/>
          <div style={{ width: '20%', background: '#C25E48' }}/>
        </div>
      </div>
      <div style={{ display: 'flex', color: '#6b625a', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
        <div style={{ width: '14%' }}>저체중</div>
        <div style={{ width: '18%' }}>정상</div>
        <div style={{ width: '8%' }}>과체중</div>
        <div style={{ width: '20%' }}>비만1</div>
        <div style={{ width: '20%' }}>비만2</div>
        <div style={{ width: '20%' }}>비만3</div>
      </div>
      <div style={{
        color: '#857c74',
        fontSize: 12.5,
        lineHeight: 1.55,
        marginTop: 14,
        background: REPORT_COLORS.panelAlt,
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        borderRadius: 14,
        padding: '11px 13px',
      }}>
        현재 <b style={{ color: REPORT_COLORS.coral }}>{analysis.bmiCategory || '분석 대기'}</b> 구간이에요. 표준체중은 <b style={{ color: '#bcb3aa' }}>{formatPlainNumber(standardWeight, 1)}kg</b>이고, 지금은 그보다 <b style={{ color: '#bcb3aa' }}>{formatSignedKg(weightDiff)}</b> 차이가 있어요.
      </div>
    </ReportSectionCard>
  )
}

function IndexBarsReport({ analysis }) {
  const ffmi = numericValue(analysis.ffmi)
  const fmi = numericValue(analysis.fmi)
  if (ffmi === null && fmi === null) return null
  const ffZone = indexZone(ffmi, [17, 20, 22], ['근육량 부족', '적정', '우수', '매우 발달'], [REPORT_COLORS.blue, REPORT_COLORS.green, '#7AA98C', REPORT_COLORS.amber])
  const fmZone = indexZone(fmi, [3, 6, 9], ['낮음', '적정', '다소 높음', '높음'], [REPORT_COLORS.blue, REPORT_COLORS.green, '#E0A05A', '#D9805A'])
  const bars = [
    {
      title: 'FFMI',
      sub: '제지방량 지수 · 근육 발달도',
      value: ffmi,
      zone: ffZone,
      markerPos: `${Math.max(2, Math.min(98, (((ffmi ?? 14) - 14) / 10) * 100)).toFixed(1)}%`,
      segments: [
        { width: '30%', color: REPORT_COLORS.blue, label: '부족' },
        { width: '30%', color: REPORT_COLORS.green, label: '적정' },
        { width: '20%', color: '#7AA98C', label: '우수' },
        { width: '20%', color: '#C9A24E', label: '발달' },
      ],
      ticks: [['0%', '14'], ['30%', '17'], ['60%', '20'], ['80%', '22'], ['100%', '24']],
      note: ffmi === null ? '제지방량 데이터가 필요해요.' : ffmi < 17 ? '근육량이 표준보다 적은 편이에요. 근력 운동이 도움돼요.' : ffmi < 20 ? '근육량이 적정 수준이에요. 잘 유지해 주세요.' : ffmi < 22 ? '근육이 잘 발달해 있어요.' : '근육량이 매우 많은 편이에요.',
    },
    {
      title: 'FMI',
      sub: '지방량 지수 · 체지방 수준',
      value: fmi,
      zone: fmZone,
      markerPos: `${Math.max(2, Math.min(98, (((fmi ?? 1) - 1) / 10) * 100)).toFixed(1)}%`,
      segments: [
        { width: '20%', color: REPORT_COLORS.blue, label: '부족' },
        { width: '30%', color: REPORT_COLORS.green, label: '적정' },
        { width: '30%', color: '#E0A05A', label: '주의' },
        { width: '20%', color: '#D9805A', label: '높음' },
      ],
      ticks: [['0%', '1'], ['20%', '3'], ['50%', '6'], ['80%', '9'], ['100%', '11']],
      note: fmi === null ? '체지방량 데이터가 필요해요.' : fmi < 3 ? '체지방이 적은 편이에요.' : fmi < 6 ? '체지방이 적정 수준이에요.' : fmi < 9 ? '체지방이 적정보다 다소 많아요. 체지방 관리가 도움돼요.' : '체지방이 많은 편이에요. 체지방 관리가 우선이에요.',
    },
  ]

  return (
    <ReportSectionCard>
      <ReportSectionHeading
        title="근육·지방 지수"
        sub="키 대비 근육량(FFMI)과 지방량(FMI) 지수예요. 키가 달라도 공정하게 비교할 수 있어요."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {bars.map(bar => <IndexMetricBar key={bar.title} bar={bar}/>)}
      </div>
    </ReportSectionCard>
  )
}

function IndexMetricBar({ bar }) {
  const valueText = formatPlainNumber(bar.value, 1)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>{bar.title}</div>
        <div style={{ color: bar.zone.color, fontSize: 19, fontWeight: 800, whiteSpace: 'nowrap' }}>{valueText}</div>
      </div>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 11.5, marginTop: 2 }}>{bar.sub}</div>
      <div style={{ position: 'relative', marginTop: 26 }}>
        <div style={{ position: 'absolute', top: -21, left: bar.markerPos, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>나 {valueText}</div>
          <div style={{ width: 0, height: 0, borderLeft: '6.5px solid transparent', borderRight: '6.5px solid transparent', borderTop: `8px solid ${PALETTE.charcoal.text}` }}/>
        </div>
        <div style={{ display: 'flex', height: 16, borderRadius: 6, overflow: 'hidden' }}>
          {bar.segments.map(segment => <div key={segment.label} style={{ width: segment.width, background: segment.color }}/>)}
        </div>
        <div style={{ position: 'relative', height: 13, marginTop: 5 }}>
          {bar.ticks.map(([pos, label]) => (
            <div key={label} style={{ position: 'absolute', left: pos, transform: 'translateX(-50%)', color: '#6b625a', fontSize: 9.5 }}>
              {label}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 1, fontSize: 10, textAlign: 'center' }}>
        {bar.segments.map(segment => <div key={segment.label} style={{ width: segment.width, color: segment.color, fontWeight: 800 }}>{segment.label}</div>)}
      </div>
      <div style={{
        color: '#857c74',
        fontSize: 12.5,
        lineHeight: 1.5,
        marginTop: 11,
        background: '#0f0c08',
        border: `1px solid ${REPORT_COLORS.innerLine}`,
        borderRadius: 12,
        padding: '10px 12px',
      }}>
        현재 <b style={{ color: bar.zone.color }}>{bar.zone.label}</b> · {bar.note}
      </div>
    </div>
  )
}

function BmrReport({ analysis }) {
  return (
    <ReportSectionCard style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{
        width: 54,
        height: 54,
        flex: '0 0 auto',
        borderRadius: 16,
        background: 'rgba(232,154,60,0.14)',
        border: '1px solid rgba(232,154,60,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <IconScale size={26} color={REPORT_COLORS.amber}/>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 14, fontWeight: 800 }}>기초대사량 (BMR)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 2 }}>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 32, lineHeight: 1, fontWeight: 800, letterSpacing: 0 }}>
            {formatKcal(analysis.bmrKcal).replace('kcal', '')}
          </div>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 15, fontWeight: 800, paddingBottom: 5 }}>kcal / 일</div>
        </div>
        <div style={{ color: '#857c74', fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>
          하루 종일 가만히 있어도 생명 유지에 쓰이는 최소 칼로리예요. 근육이 많을수록 높아져요.
        </div>
      </div>
    </ReportSectionCard>
  )
}

function CalculationInputsReport({ measurement, analysis, profile }) {
  const bodyBalanceVersion = analysis.bodyBalanceAlgorithmVersion || analysis.bodyBalance?.algorithmVersion
  const items = [
    { label: '키', value: profile?.heightCm ? `${profile.heightCm}cm` : '—' },
    { label: '성별', value: genderLabel(profile?.gender) },
    { label: '생년월일', value: profile?.birthDate ? formatBirthDate(profile.birthDate) : '—' },
    { label: '계산 나이', value: analysis.age ? `만 ${analysis.age}세` : '—' },
    { label: '기준 몸무게', value: profile?.baselineWeightKg ? `${formatWeightKg(profile.baselineWeightKg)}kg` : '—' },
    { label: '측정 체중', value: `${formatWeightKg(measurement)}kg` },
    { label: '임피던스', value: measurement?.impedanceOhm ? `${measurement.impedanceOhm} Ω` : '—' },
    { label: '저항지수', value: formatPlainNumber(analysis.resistanceIndex, 1) },
    { label: '분석 알고리즘', value: analysis.algorithmVersion || '—', wide: true },
    { label: '밸런스 알고리즘', value: bodyBalanceVersion || '—', wide: true },
  ]

  return (
    <ReportSectionCard>
      <ReportSectionHeading
        title="계산 입력값"
        sub="이 리포트를 계산할 때 사용한 프로필, 측정 원본값, 알고리즘 정보예요."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {items.map(item => (
          <CalculationInputPill key={item.label} label={item.label} value={item.value} wide={item.wide}/>
        ))}
      </div>
    </ReportSectionCard>
  )
}

function CalculationInputPill({ label, value, wide = false }) {
  return (
    <div style={{
      gridColumn: wide ? '1 / -1' : undefined,
      background: REPORT_COLORS.panelAlt,
      border: `1px solid ${REPORT_COLORS.innerLine}`,
      borderRadius: 14,
      padding: '12px 12px',
      minWidth: 0,
    }}>
      <div style={{ color: '#7c736b', fontSize: 11.5, marginBottom: 5 }}>{label}</div>
      <div style={{
        color: PALETTE.charcoal.text,
        fontSize: 14,
        fontWeight: 800,
        lineHeight: 1.35,
        fontVariantNumeric: 'tabular-nums',
        wordBreak: wide ? 'break-all' : 'normal',
        whiteSpace: wide ? 'normal' : 'nowrap',
        overflow: wide ? 'visible' : 'hidden',
        textOverflow: wide ? 'clip' : 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}

function MeasurementMetaReport({ measurement, analysis }) {
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : []
  const warnText = warnings.length ? warnings.join(' · ') : '경고 없음 · 측정 상태가 양호해요'
  const meta = [
    { k: '신뢰도 등급', v: analysis.confidenceGrade || '—' },
    { k: '저항지수', v: formatPlainNumber(analysis.resistanceIndex, 1) },
    { k: '임피던스', v: measurement.impedanceOhm ? `${measurement.impedanceOhm} Ω` : '—' },
    { k: '나이', v: analysis.age ? `만 ${analysis.age}세` : '—' },
    { k: '분석 버전', v: analysis.algorithmVersion || '—' },
    { k: '밸런스 버전', v: analysis.bodyBalanceAlgorithmVersion || analysis.bodyBalance?.algorithmVersion || '—' },
    { k: '측정 시각', v: formatWhen(measurement) || '—' },
  ]
  return (
    <div style={{ background: REPORT_COLORS.panelAlt, border: `1px solid ${REPORT_COLORS.innerLine}`, borderRadius: 22, padding: 20 }}>
      <div style={{ color: PALETTE.charcoal.text, fontSize: 16, fontWeight: 800 }}>측정 신뢰도 · 기술 정보</div>
      <div style={{ color: '#7c736b', fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
        측정 신뢰도와 계산에 사용된 값이에요. 참고용으로만 봐주세요.
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 14,
        background: 'rgba(134,184,154,0.1)',
        border: '1px solid rgba(134,184,154,0.3)',
        borderRadius: 12,
        padding: '11px 13px',
      }}>
        <IconCheck size={18} color={REPORT_COLORS.green}/>
        <span style={{ color: '#9cc7ab', fontSize: 13, fontWeight: 800 }}>{warnText}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, marginTop: 14, background: REPORT_COLORS.innerLine, borderRadius: 12, overflow: 'hidden' }}>
        {meta.map(item => (
          <div key={item.k} style={{ background: REPORT_COLORS.panelAlt, padding: '12px 14px', minWidth: 0 }}>
            <div style={{ color: '#7c736b', fontSize: 11.5 }}>{item.k}</div>
            <div style={{ color: PALETTE.charcoal.text, fontSize: 14, fontWeight: 800, marginTop: 3, wordBreak: 'break-word' }}>{item.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScaleRangeBar({ title, value, valueText, min, max, segments }) {
  const left = pctBetween(value, min, max)
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, fontWeight: 800 }}>{title}</div>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{valueText}</div>
      </div>
      <div style={{ position: 'relative', height: 16, borderRadius: 999, overflow: 'hidden', background: '#17130f', border: `1px solid ${PALETTE.charcoal.line}` }}>
        <div style={{ display: 'flex', height: '100%' }}>
          {segments.map(segment => (
            <div
              key={segment.label}
              style={{
                width: `${((segment.end - segment.start) / (max - min)) * 100}%`,
                background: segment.color,
                opacity: 0.72,
              }}
            />
          ))}
        </div>
        <div style={{
          position: 'absolute',
          left: `${left}%`,
          top: -2,
          width: 3,
          height: 20,
          borderRadius: 999,
          background: '#fff4db',
          boxShadow: '0 0 10px rgba(255,244,219,0.55)',
          transform: 'translateX(-50%)',
        }}/>
      </div>
      <div style={{ display: 'flex', marginTop: 5, gap: 4 }}>
        {segments.map(segment => (
          <div
            key={segment.label}
            style={{
              width: `${((segment.end - segment.start) / (max - min)) * 100}%`,
              color: PALETTE.charcoal.dim,
              fontSize: 9,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {segment.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function BodyComparisonBars({ balance, accent }) {
  const rows = [
    { label: '체중 차이', value: balance.weightDiffKg, warn: value => Math.abs(value) > 3 },
    { label: '체지방 차이', value: balance.fatDiffKg, warn: value => value > 2 },
    { label: '제지방 차이', value: balance.leanDiffKg, warn: value => value < -1 },
  ]
  const maxAbs = Math.max(3, ...rows.map(row => Math.abs(Number(row.value) || 0)))
  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: '#17130f', border: `1px solid ${PALETTE.charcoal.line}` }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, fontWeight: 800, marginBottom: 10 }}>표준 대비 비교</div>
      {rows.map(row => {
        const value = Number(row.value)
        const safe = Number.isFinite(value) ? value : 0
        const width = Math.min(50, (Math.abs(safe) / maxAbs) * 50)
        const warn = row.warn(safe)
        const color = warn ? PALETTE.charcoal.warn : accent
        return (
          <div key={row.label} style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: PALETTE.charcoal.text, fontSize: 12, fontWeight: 700 }}>{row.label}</span>
              <span style={{ color, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatSignedKg(row.value)}</span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ position: 'absolute', left: '50%', top: -3, width: 1, height: 14, background: 'rgba(255,255,255,0.18)' }}/>
              <div style={{
                position: 'absolute',
                top: 0,
                height: 8,
                borderRadius: 999,
                background: color,
                left: safe < 0 ? `${50 - width}%` : '50%',
                width: `${width}%`,
                opacity: 0.85,
              }}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BodyCompositionCard({ r, accent, latest }) {
  if (!latest) return null
  const analysis = latest.analysis
  const balance = analysis?.bodyBalance || null
  const grade = analysis?.confidenceGrade
  const hasBia = analysis?.algorithmVersion === 'research_deurenberg_ffm_janssen_smm_v1'
  const primaryMetrics = [
    { label: 'BMI', value: formatNumber(analysis?.bmi, 1), sub: analysis?.bmiCategory || '—' },
    { label: hasBia ? '체지방률 추정' : 'BMI 기반 체지방률', value: formatPercent(analysis?.bodyFatPercent), sub: grade ? `신뢰도 ${grade}` : '—' },
    { label: '골격근량 추정', value: formatKg(analysis?.skeletalMuscleMassKg), sub: hasBia ? 'Janssen' : '임피던스 필요' },
    { label: '기초대사량', value: formatKcal(analysis?.bmrKcal), sub: 'Mifflin' },
  ]
  const detailMetrics = [
    { label: '체지방량 추정', value: formatKg(analysis?.fatMassKg) },
    { label: '제지방량 추정', value: formatKg(analysis?.fatFreeMassKg) },
    { label: '체수분량 추정', value: formatKg(analysis?.totalBodyWaterKg) },
    { label: '체수분률 추정', value: formatPercent(analysis?.bodyWaterPercent) },
    { label: 'FFMI', value: formatNumber(analysis?.ffmi, 1) },
    { label: 'FMI', value: formatNumber(analysis?.fmi, 1) },
  ]

  return (
    <Card r={r}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <SectionTitle
          title="체성분 분석"
          sub={analysis ? `${formatWhen(latest)} 기준` : '분석 가능한 측정값을 준비하는 중입니다.'}
        />
        <div style={{
          minHeight: 28,
          padding: '0 10px',
          borderRadius: 999,
          border: `1px solid ${analysis ? accent + '66' : PALETTE.charcoal.line}`,
          background: analysis ? accent + '18' : '#17130f',
          color: analysis ? accent : PALETTE.charcoal.dim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}>
          {analysis ? '추정값' : '대기'}
        </div>
      </div>

      {!analysis ? (
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, lineHeight: 1.55 }}>
          프로필과 임피던스가 포함된 측정값이 있으면 BMI와 체성분 추정값이 표시됩니다.
        </div>
      ) : (
        <>
          {balance && <BodyBalanceSummary balance={balance} accent={accent}/>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {primaryMetrics.map(metric => (
              <AnalysisMetric key={metric.label} metric={metric} accent={accent}/>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
            {detailMetrics.map(metric => (
              <Metric key={metric.label} label={metric.label} value={metric.value}/>
            ))}
          </div>

          {analysis.warnings?.length > 0 && (
            <div style={{
              marginTop: 12,
              padding: '10px 11px',
              borderRadius: 12,
              border: `1px solid ${PALETTE.charcoal.warn}33`,
              background: PALETTE.charcoal.warn + '10',
              color: PALETTE.charcoal.warn,
              fontSize: 12,
              lineHeight: 1.45,
            }}>
              {analysis.warnings[0]}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function BodyBalanceSummary({ balance, accent }) {
  return (
    <div style={{
      marginBottom: 12,
      borderRadius: 16,
      padding: 13,
      border: `1px solid ${accent}44`,
      background: `linear-gradient(135deg, ${accent}18, rgba(255,255,255,0.035))`,
      boxShadow: `0 0 24px ${accent}10 inset`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 10, fontWeight: 800 }}>바디 밸런스 점수 · 추정값</div>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 13, lineHeight: 1.45, marginTop: 7 }}>
            {balance.message}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            color: accent,
            fontSize: 34,
            lineHeight: 0.95,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {balance.bodyBalanceScore}
            <span style={{ color: PALETTE.charcoal.dim, fontSize: 13, marginLeft: 2 }}>/100</span>
          </div>
          <div style={{ color: PALETTE.charcoal.text, fontSize: 12, fontWeight: 800, marginTop: 5 }}>
            {balance.bodyBalanceGrade}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, marginTop: 12 }}>
        <Metric label="표준 체중" value={formatKg(balance.standardWeightKg)}/>
        <Metric label="체지방 차이" value={formatKg(balance.fatDiffKg)}/>
        <Metric label="제지방 차이" value={formatKg(balance.leanDiffKg)}/>
      </div>
    </div>
  )
}

function AnalysisMetric({ metric, accent }) {
  return (
    <div style={{
      minHeight: 86,
      borderRadius: 14,
      padding: '12px 11px',
      border: `1px solid ${PALETTE.charcoal.line}`,
      background: '#17130f',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 10, fontWeight: 700 }}>{metric.label}</div>
      <div>
        <div style={{
          color: PALETTE.charcoal.text,
          fontSize: 22,
          lineHeight: 1.1,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}>
          {metric.value}
        </div>
        <div style={{ color: metric.sub?.startsWith('신뢰도') ? accent : PALETTE.charcoal.dim, fontSize: 11, marginTop: 4, fontWeight: 700 }}>
          {metric.sub}
        </div>
      </div>
    </div>
  )
}

function MeasurementOverlay({ live, accent, busy, onClaim, onClose }) {
  const progress = clampProgress(live?.progress)
  const state = live?.state || 'idle'
  const done = state === 'done'
  const error = state === 'error'
  const waitingImpedance = state === 'waiting_impedance'
  const pending = live?.status === 'pending'
  const phaseDurationMs = Math.max(1000, Math.min(20000, Number(live?.progressDurationMs || SCALE_BODY_PROGRESS_DURATION_MS)))
  const phaseProgressActive = waitingImpedance
  const phaseToken = `${live?.homeId || ''}:${live?.scaleDeviceId || live?.deviceId || ''}:${Math.round(Number(live?.weightKg || 0) * 100)}`
  const phaseStartRef = useRef(null)
  const phaseTokenRef = useRef(null)
  const [displayProgress, setDisplayProgress] = useState(progress)
  const weight = formatWeightKg(live)
  const title = error
    ? '측정 실패'
    : done
      ? (pending ? '측정 완료 · 확인 필요' : '측정 완료')
      : waitingImpedance
        ? '임피던스 측정 중'
        : state === 'uploading'
          ? '업로드 중'
          : state === 'stabilizing'
            ? '안정값 확인 중'
            : state === 'detected'
              ? '체중계 감지됨'
              : '측정 중'
  const sub = live?.message || (done
    ? 'ESP32에서 측정값을 수신했습니다'
    : waitingImpedance
      ? '몸무게는 안정화됐고 임피던스 값을 기다리는 중입니다'
      : '체중계 위에서 잠시 움직이지 말고 기다려주세요')
  const progressColor = error ? PALETTE.charcoal.warn : accent
  const displayProgressInt = Math.round(clampProgress(displayProgress))
  const progressDeg = clampProgress(displayProgress) * 3.6
  const progressLabel = done ? '완료' : error ? '중단' : '진행 중'

  useEffect(() => {
    let frame = 0

    if (!phaseProgressActive) {
      phaseStartRef.current = null
      phaseTokenRef.current = null
      setDisplayProgress(error ? progress : (done || state === 'uploading' || progress >= 100 ? 100 : 0))
      return () => {}
    }

    const now = animationNow()
    if (phaseTokenRef.current !== phaseToken || phaseStartRef.current == null) {
      phaseTokenRef.current = phaseToken
      phaseStartRef.current = now - ((progress / 100) * phaseDurationMs)
    }

    const tick = () => {
      const startedAt = phaseStartRef.current ?? animationNow()
      const next = clampProgress(((animationNow() - startedAt) / phaseDurationMs) * 100)
      setDisplayProgress(next)
      if (next < 100) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [phaseProgressActive, phaseToken, phaseDurationMs, progress, done, error, state])

  if (typeof document === 'undefined') return null

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 420,
      background: 'rgba(0,0,0,0.68)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: 'min(364px, 100%)',
        borderRadius: 25,
        padding: 2,
        background: `conic-gradient(from 0deg at 50% 50%, ${progressColor} ${progressDeg}deg, rgba(255,255,255,0.09) ${progressDeg}deg 360deg)`,
        boxShadow: `0 24px 70px rgba(0,0,0,0.48), 0 0 34px ${accent}1c`,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          width: 12,
          height: 3,
          borderRadius: 999,
          background: progressColor,
          boxShadow: `0 0 10px ${progressColor}66`,
          opacity: displayProgressInt > 0 || done || error ? 1 : 0.36,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}/>
        <div style={{
          background: '#1f1914',
          border: `1px solid ${error ? PALETTE.charcoal.warn + '44' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 23,
          padding: 20,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -56, right: -46,
            width: 170, height: 170, borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}/>
          <button onClick={onClose} aria-label="닫기" style={{
            position: 'absolute', top: 4, right: 4,
            width: 48, height: 48, borderRadius: 16,
            border: 0,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            zIndex: 5,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              border: `1px solid ${PALETTE.charcoal.line}`,
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
            }}>
              <span style={{ display: 'block', lineHeight: 0, transform: 'rotate(45deg)' }}>
                <IconPlus size={17} color={PALETTE.charcoal.dim}/>
              </span>
            </span>
          </button>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 22,
              background: accent + '20',
              border: `1px solid ${accent}55`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
            }}>
              <IconScale size={34} color={accent}/>
            </div>
            <div style={{ color: PALETTE.charcoal.text, fontSize: 21, fontWeight: 800 }}>
              {title}
            </div>
            <div style={{ color: PALETTE.charcoal.dim, fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
              {sub}
            </div>

            <div style={{
              fontSize: 58,
              lineHeight: 0.95,
              fontWeight: 700,
              letterSpacing: 0,
              color: done || waitingImpedance || state === 'measuring' || state === 'stabilizing' ? PALETTE.charcoal.text : PALETTE.charcoal.dimDeep,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 24,
              whiteSpace: 'nowrap',
            }}>
              {weight}
              <span style={{ fontSize: 18, color: PALETTE.charcoal.dim, marginLeft: 5 }}>kg</span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 20,
              padding: '10px 12px',
              borderRadius: 13,
              background: '#17130f',
              border: `1px solid ${PALETTE.charcoal.line}`,
              color: PALETTE.charcoal.dim,
              fontSize: 12,
            }}>
              <span>{progressLabel}</span>
              <strong style={{ color: progressColor, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{displayProgressInt}%</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginTop: 10 }}>
              <Metric label="임피던스" value={live?.impedanceOhm ? `${live.impedanceOhm}Ω` : '—'}/>
              <Metric label="상태" value={waitingImpedance ? '임피던스 대기' : live?.stable ? '안정값' : done ? '완료' : '측정'}/>
            </div>
            {done && pending && (
              <button onClick={() => onClaim(live.measurementId)} disabled={busy} style={{
                ...buttonStyle(accent, busy),
                marginTop: 14,
              }}>
                내 기록으로 저장
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Metric({ label, value, large = false, color }) {
  return (
    <div style={{
      background: large ? REPORT_COLORS.panelAlt : '#17130f',
      borderRadius: large ? 16 : 12,
      padding: large ? '13px 14px' : '10px 8px',
      border: `1px solid ${large ? REPORT_COLORS.innerLine : PALETTE.charcoal.line}`,
      minWidth: 0,
    }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: large ? 12 : 10, marginBottom: large ? 6 : 5 }}>{label}</div>
      <div style={{
        color: color || PALETTE.charcoal.text,
        fontSize: large ? 19 : 15,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}

function MeasurementHistoryRow({ item, active, accent }) {
  const analysis = item.analysis || {}
  const balance = analysis.bodyBalance
  return (
    <div
      style={{
        width: '100%',
        border: `1px solid ${active ? accent + '66' : PALETTE.charcoal.line}`,
        background: active ? accent + '12' : 'transparent',
        borderRadius: 13,
        padding: '10px 11px',
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {formatWeightKg(item)}kg
        </div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, marginTop: 3 }}>
          {formatWhen(item)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
        <HistoryPill label="BMI" value={formatNumber(analysis.bmi, 1)} active={active} accent={accent}/>
        <HistoryPill label="밸런스" value={balance ? `${balance.bodyBalanceScore}` : '—'} active={active} accent={accent}/>
      </div>
    </div>
  )
}

function HistoryPill({ label, value, active, accent }) {
  return (
    <div style={{
      minWidth: 48,
      borderRadius: 10,
      padding: '6px 7px',
      background: active ? accent + '18' : '#17130f',
      border: `1px solid ${active ? accent + '55' : PALETTE.charcoal.line}`,
      textAlign: 'center',
    }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 9, marginBottom: 2 }}>{label}</div>
      <div style={{ color: active ? accent : PALETTE.charcoal.text, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function MetaRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '10px 0', borderTop: `1px solid ${PALETTE.charcoal.line}`,
      fontSize: 13,
    }}>
      <span style={{ color: PALETTE.charcoal.text, fontWeight: 600 }}>{label}</span>
      <span style={{ color: PALETTE.charcoal.dim, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function DeviceTokenRow({ device, busy, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '10px 0', borderTop: `1px solid ${PALETTE.charcoal.line}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 13, fontWeight: 700 }}>{device.name || 'Mi Scale'}</div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, marginTop: 3, wordBreak: 'break-all' }}>{device.deviceId}</div>
      </div>
      <button onClick={onDelete} disabled={busy} style={dangerButtonStyle(busy)}>
        <IconTrash size={15} color={busy ? PALETTE.charcoal.dim : PALETTE.charcoal.warn}/>
        삭제
      </button>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', marginBottom = 10, suffix = '' }) {
  const isDate = type === 'date'
  return (
    <label style={{ display: 'block', marginBottom }}>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <input
          value={value}
          type={isDate ? 'text' : type}
          inputMode={type === 'number' ? 'decimal' : isDate ? 'numeric' : undefined}
          placeholder={isDate ? 'YYYY-MM-DD' : undefined}
          pattern={isDate ? '\\d{4}-\\d{2}-\\d{2}' : undefined}
          onChange={e => onChange(isDate ? formatBirthDateInput(e.target.value) : e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            background: '#17130f', color: PALETTE.charcoal.text,
            border: `1px solid ${PALETTE.charcoal.line}`,
            borderRadius: 12,
            height: 44,
            minHeight: 44,
            padding: suffix ? '0 48px 0 12px' : '0 12px',
            textAlign: 'left',
            fontSize: 15,
            lineHeight: '44px',
            outline: 'none',
            fontFamily: 'inherit',
            appearance: 'none',
            WebkitAppearance: 'none',
            colorScheme: 'dark',
            ...(isDate ? { paddingRight: 12 } : null),
          }}
        />
        {suffix && (
          <span style={{
            position: 'absolute',
            right: 13,
            top: '50%',
            transform: 'translateY(-50%)',
            color: PALETTE.charcoal.dim,
            fontSize: 13,
            fontWeight: 800,
            pointerEvents: 'none',
          }}>
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

function ErrorText({ children }) {
  return (
    <div style={{ color: PALETTE.charcoal.warn, textAlign: 'center', fontSize: 13, marginTop: 12 }}>
      {children}
    </div>
  )
}

function buttonStyle(accent, busy) {
  return {
    width: '100%', minHeight: 48, borderRadius: 14,
    border: 'none', marginTop: 8,
    background: busy ? '#2a231c' : accent,
    color: busy ? PALETTE.charcoal.dim : '#14100d',
    fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    cursor: busy ? 'wait' : 'pointer',
  }
}

function smallButtonStyle(accent, busy) {
  return {
    minHeight: 34, padding: '0 12px', borderRadius: 10,
    border: `1px solid ${accent}66`,
    background: busy ? '#2a231c' : accent + '22',
    color: busy ? PALETTE.charcoal.dim : accent,
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
  }
}

function dangerButtonStyle(busy) {
  return {
    minHeight: 34, padding: '0 10px', borderRadius: 10,
    border: `1px solid ${PALETTE.charcoal.warn}55`,
    background: busy ? '#2a231c' : PALETTE.charcoal.warn + '12',
    color: busy ? PALETTE.charcoal.dim : PALETTE.charcoal.warn,
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    flexShrink: 0,
    cursor: busy ? 'wait' : 'pointer',
  }
}
