/**
 * Settings card for the desktop companion, rebranded from the dsh-dafeiyu
 * client bundle (MIT). Written with createElement (no JSX) to match the client
 * bundling preset. React is loaded lazily at registration time: the skin must
 * never depend on the platform module table resolving react, and the card is
 * purely decorative — if DSH ever changes the slot contract or react is
 * unavailable, it must fail quietly instead of failing the whole WebUI load.
 */
import type { Context } from '@deepseek-ai/cordis'
import type * as ReactTypes from 'react'

const CONFIG_ENDPOINT = '/plugins/maid-whale-webui/config'
const SLOT_NAME = 'settings.plugin.item'
const SLOT_KEY = 'maid-whale-webui-companion'

interface CompanionConfig {
  enabled?: boolean
  scale?: number
  bubbleScale?: number
  activityLevel?: string
  reducedMotion?: boolean
  bubbleMode?: string
  bubbleStates?: string[]
  includeSubagents?: boolean
}

const cardStyle = {
  listStyle: 'none',
  border: '1px solid var(--border-color, #d8d8d8)',
  borderRadius: 12,
  padding: 16,
  background: 'var(--surface-color, transparent)',
  display: 'grid',
  gap: 14,
} as const
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 } as const
const selectStyle = { minWidth: 120, padding: '6px 10px', borderRadius: 8 } as const
const BUBBLE_STATE_OPTIONS = [
  ['IDLE', '空闲'],
  ['THINKING', '思考中'],
  ['WORKING', '工作中'],
  ['WAITING', '等待确认'],
  ['SUCCESS', '完成'],
  ['ERROR', '错误'],
] as const
const bubbleGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, auto)',
  gap: '6px 14px',
  padding: '10px 12px',
  border: '1px solid var(--border-color, #d8d8d8)',
  borderRadius: 8,
} as const

function createCardModule(React: typeof ReactTypes) {
  const h = React.createElement

  interface FieldProps {
    label: string
    hint: string
    children?: ReactTypes.ReactNode
  }

  function Field({ label, hint, children }: FieldProps) {
    return h(
      'label',
      { style: rowStyle },
      h(
        'span',
        null,
        h('span', { style: { display: 'block', fontWeight: 600 } }, label),
        h('small', { style: { display: 'block', opacity: 0.65, marginTop: 3 } }, hint),
      ),
      children,
    )
  }

  interface BubbleStatePickerProps {
    value: string[]
    disabled: boolean
    onChange: (next: string[]) => void
  }

  function BubbleStatePicker({ value, disabled, onChange }: BubbleStatePickerProps) {
    const selected = Array.isArray(value) ? value : []
    const toggle = (state: string, checked: boolean) => {
      const next = new Set(selected)
      if (checked) next.add(state)
      else next.delete(state)
      onChange([...next])
    }
    return h(
      'div',
      { style: bubbleGridStyle },
      ...BUBBLE_STATE_OPTIONS.map(([state, label]) =>
        h(
          'label',
          { key: state, style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h('input', {
            type: 'checkbox',
            checked: selected.includes(state),
            disabled,
            onChange: (event: ReactTypes.ChangeEvent<HTMLInputElement>) => toggle(state, event.target.checked),
          }),
          label,
        ),
      ),
    )
  }

  function CompanionCard(): ReactTypes.ReactElement {
    const [status, setStatus] = React.useState<'loading' | 'ready' | 'unavailable'>('loading')
    const [value, setValue] = React.useState<CompanionConfig>({})
    const [busy, setBusy] = React.useState(false)
    const patchSeq = React.useRef(0)
    const sliderTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
    const writable = status === 'ready' && !busy
    React.useEffect(() => {
      let active = true
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`settings request failed: ${response.status}`)
          return (await response.json()) as CompanionConfig
        })
        .then((next) => {
          if (active) {
            setValue(next)
            setStatus('ready')
          }
        })
        .catch(() => {
          if (active) setStatus('unavailable')
        })
      return () => {
        active = false
        for (const timer of sliderTimers.current.values()) clearTimeout(timer)
        sliderTimers.current.clear()
      }
    }, [])
    const write = async (field: string, next: unknown) => {
      const seq = ++patchSeq.current
      setBusy(true)
      try {
        const response = await fetch(CONFIG_ENDPOINT, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field]: next }),
        })
        if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
        const updated = (await response.json()) as CompanionConfig
        if (seq === patchSeq.current) {
          setValue(updated)
          setStatus('ready')
        }
      } catch {
        if (seq === patchSeq.current) setStatus('unavailable')
      } finally {
        if (seq === patchSeq.current) setBusy(false)
      }
    }
    const writeSlider = (field: 'scale' | 'bubbleScale', next: number) => {
      // Keep the slider responsive while dragging: update the local value
      // immediately and send a single debounced PATCH once the user pauses.
      setValue((prev) => ({ ...prev, [field]: next }))
      // Invalidate any in-flight write so a stale response cannot overwrite
      // the optimistic slider value while the user keeps dragging.
      patchSeq.current += 1
      const pending = sliderTimers.current.get(field)
      if (pending) clearTimeout(pending)
      const timer = setTimeout(() => {
        sliderTimers.current.delete(field)
        void write(field, next)
      }, 250)
      sliderTimers.current.set(field, timer)
    }
    return h(
      'li',
      { style: cardStyle, 'data-testid': 'maid-whale-companion-settings' },
      h(
        'div',
        null,
        h('strong', { style: { fontSize: 16 } }, '鲸鱼桌宠'),
        h(
          'p',
          { style: { margin: '5px 0 0', opacity: 0.72 } },
          '入口和状态属于 DSH，鲸鲸始终显示在 Windows 桌面最上层；DSH 最小化时也会继续陪伴。',
        ),
      ),
      status === 'unavailable'
        ? h('span', { role: 'status' }, '鲸鱼桌宠设置尚未连接到 DSH Host。')
        : status === 'loading'
          ? h('span', null, '正在读取设置…')
          : h(
              React.Fragment,
              null,
              h(
                Field,
                { label: '启用鲸鱼桌宠', hint: '关闭后立即退出；重新开启无需单独启动程序。' },
                h('input', {
                  type: 'checkbox',
                  checked: value.enabled !== false,
                  disabled: !writable,
                  onChange: (event: ReactTypes.ChangeEvent<HTMLInputElement>) =>
                    void write('enabled', event.target.checked),
                }),
              ),
              h(
                Field,
                { label: '角色大小', hint: `${Math.round((value.scale ?? 1) * 100)}%` },
                h('input', {
                  type: 'range',
                  min: 0.5,
                  max: 1.4,
                  step: 0.05,
                  value: value.scale ?? 1,
                  disabled: status !== 'ready',
                  onChange: (event: ReactTypes.ChangeEvent<HTMLInputElement>) =>
                    void writeSlider('scale', Number(event.target.value)),
                }),
              ),
              h(
                Field,
                { label: '活跃程度', hint: '控制空闲时微动作的出现频率。' },
                h(
                  'select',
                  {
                    value: value.activityLevel ?? 'normal',
                    disabled: !writable,
                    style: selectStyle,
                    onChange: (event: ReactTypes.ChangeEvent<HTMLSelectElement>) =>
                      void write('activityLevel', event.target.value),
                  },
                  h('option', { value: 'quiet' }, '安静'),
                  h('option', { value: 'normal' }, '标准'),
                  h('option', { value: 'lively' }, '活泼'),
                ),
              ),
              h(
                Field,
                { label: '减少动态效果', hint: '减少走动、循环帧和程序化晃动。' },
                h('input', {
                  type: 'checkbox',
                  checked: value.reducedMotion === true,
                  disabled: !writable,
                  onChange: (event: ReactTypes.ChangeEvent<HTMLInputElement>) =>
                    void write('reducedMotion', event.target.checked),
                }),
              ),
              h(
                Field,
                { label: '气泡显示', hint: '常驻显示、完全隐藏，或自定义哪些状态显示气泡。' },
                h(
                  'select',
                  {
                    value: value.bubbleMode ?? 'always',
                    disabled: !writable,
                    style: selectStyle,
                    onChange: (event: ReactTypes.ChangeEvent<HTMLSelectElement>) =>
                      void write('bubbleMode', event.target.value),
                  },
                  h('option', { value: 'always' }, '常驻显示'),
                  h('option', { value: 'hidden' }, '完全隐藏'),
                  h('option', { value: 'custom' }, '自定义显示状态'),
                ),
              ),
              (value.bubbleMode ?? 'always') !== 'hidden'
                ? h(
                    Field,
                    { label: '气泡大小', hint: `${Math.round((value.bubbleScale ?? 1) * 100)}%` },
                    h('input', {
                      type: 'range',
                      min: 0.8,
                      max: 1.2,
                      step: 0.05,
                      value: value.bubbleScale ?? 1,
                      disabled: status !== 'ready',
                      onChange: (event: ReactTypes.ChangeEvent<HTMLInputElement>) =>
                        void writeSlider('bubbleScale', Number(event.target.value)),
                    }),
                  )
                : null,
              (value.bubbleMode ?? 'always') === 'custom'
                ? h(
                    Field,
                    { label: '自定义显示状态', hint: '勾选后，只有这些状态出现时才会显示气泡。' },
                    h(BubbleStatePicker, {
                      value: value.bubbleStates ?? ['SUCCESS', 'ERROR', 'WAITING'],
                      disabled: !writable,
                      onChange: (next: string[]) => void write('bubbleStates', next),
                    }),
                  )
                : null,
              h(
                Field,
                { label: '响应子 Agent', hint: '默认只跟随顶层任务，避免状态过度跳动。' },
                h('input', {
                  type: 'checkbox',
                  checked: value.includeSubagents === true,
                  disabled: !writable,
                  onChange: (event: ReactTypes.ChangeEvent<HTMLInputElement>) =>
                    void write('includeSubagents', event.target.checked),
                }),
              ),
              busy ? h('small', { role: 'status' }, '正在保存…') : null,
            ),
    )
  }

  return { CompanionCard }
}

interface SlotsContext {
  slots?: {
    register?: (options: Record<string, unknown>, component: () => ReactTypes.ReactElement) => unknown
    inject?: (slot: string, callback: () => void) => unknown
  }
}

/** Register the companion settings card; react and slot failures stay local to this card. */
export function registerCompanionSettingsCard(ctx: Context): void {
  void Promise.resolve(import('react'))
    .then((React) => {
      const slotsCtx = ctx as unknown as SlotsContext
      const { CompanionCard } = createCardModule(React)
      const registerCard = () => {
        try {
          slotsCtx.slots?.register?.(
            { name: SLOT_NAME, key: SLOT_KEY, id: SLOT_KEY, order: 30, inject: () => ({}) },
            CompanionCard,
          )
        } catch (error) {
          console.error('[maid-whale-webui] failed to register companion settings card:', error)
        }
      }
      try {
        slotsCtx.slots?.inject?.(SLOT_NAME, registerCard)
      } catch (error) {
        console.error('[maid-whale-webui] failed to inject settings slot:', error)
      }
    })
    .catch((error) => {
      console.error('[maid-whale-webui] companion settings card skipped (react unavailable):', error)
    })
}
