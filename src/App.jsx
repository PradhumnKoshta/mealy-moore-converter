import { useCallback, useMemo, useState } from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  GitBranch,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'

const demoMachine = {
  states: [
    { id: 'q0', output: '0', x: 130, y: 170 },
    { id: 'q1', output: '1', x: 410, y: 290 },
  ],
  alphabet: ['0', '1'],
  initialState: 'q0',
  transitions: [
    { id: 'e1', from: 'q0', input: '0', output: '0', to: 'q0' },
    { id: 'e2', from: 'q0', input: '1', output: '1', to: 'q1' },
    { id: 'e3', from: 'q1', input: '0', output: '1', to: 'q0' },
    { id: 'e4', from: 'q1', input: '1', output: '0', to: 'q1' },
  ],
}

function convertMealyToMoore(machine) {
  const key = (state, output) => `${state}::${output}`
  const pairs = new Map()
  const pairStates = new Map()

  const ensurePair = (state, output) => {
    const id = key(state, output)
    if (!pairs.has(id)) {
      pairs.set(id, { id, name: `${state}/${output}`, original: state, output })
    }
    return id
  }

  const initialId = ensurePair(machine.initialState, '–')
  for (const transition of machine.transitions) ensurePair(transition.to, transition.output)
  for (const state of machine.states) {
    const statePairs = [...pairs.values()].filter((pair) => pair.original === state.id)
    pairStates.set(state.id, statePairs.map((pair) => pair.id))
  }

  const transitions = []
  for (const transition of machine.transitions) {
    const targetId = ensurePair(transition.to, transition.output)
    for (const sourceId of pairStates.get(transition.from) ?? []) {
      transitions.push({
        id: `m-${transitions.length + 1}`,
        from: sourceId,
        input: transition.input,
        to: targetId,
      })
    }
  }

  const originalOrder = new Map(machine.states.map((state, index) => [state.id, index]))
  const variantsByOriginal = new Map()
  for (const pair of pairs.values()) {
    const variants = variantsByOriginal.get(pair.original) ?? []
    variants.push(pair)
    variantsByOriginal.set(pair.original, variants)
  }
  for (const variants of variantsByOriginal.values()) {
    variants.sort((left, right) => {
      if (left.id === initialId) return -1
      if (right.id === initialId) return 1
      return String(left.output).localeCompare(String(right.output))
    })
  }
  const states = [...variantsByOriginal.entries()].flatMap(([original, variants]) => variants.map((pair, row) => ({
    ...pair,
    x: 90 + (originalOrder.get(original) ?? 0) * 230,
    y: 95 + row * 150,
    initial: pair.id === initialId,
  })))

  return { direction: 'moore', states, transitions, alphabet: [...machine.alphabet], initialState: initialId }
}

function convertMooreToMealy(machine) {
  const stateOutputs = new Map(machine.states.map((state) => [state.id, String(state.output ?? '').trim()]))
  const states = machine.states.map((state) => ({ ...state, initial: state.id === machine.initialState }))
  const transitions = machine.transitions.map((transition, index) => ({
    id: `m-${index + 1}`,
    from: transition.from,
    input: transition.input,
    output: stateOutputs.get(transition.to) ?? '',
    to: transition.to,
  }))
  return { direction: 'mealy', states, transitions, alphabet: [...machine.alphabet], initialState: machine.initialState }
}

function validateMachine(machine, direction) {
  const issues = []
  if (machine.states.length === 0) issues.push('Add at least one state.')
  if (!machine.states.some((state) => state.id === machine.initialState)) issues.push('Choose a valid start state.')

  const seen = new Set()
  for (const transition of machine.transitions) {
    if (!machine.states.some((state) => state.id === transition.from)) issues.push(`${transition.id}: source state does not exist.`)
    if (!machine.states.some((state) => state.id === transition.to)) issues.push(`${transition.id}: destination state does not exist.`)
    if (!machine.alphabet.includes(transition.input)) issues.push(`${transition.id}: input is missing from the alphabet.`)
    if (direction === 'mealy' && !transition.output.trim()) issues.push(`${transition.id}: transition output cannot be empty.`)
    const cell = `${transition.from}|${transition.input}`
    if (seen.has(cell)) issues.push(`More than one transition is defined for ${transition.from} on ${transition.input}.`)
    seen.add(cell)
  }
  if (direction === 'moore') {
    for (const state of machine.states) {
      if (!state.output?.trim()) issues.push(`${state.id}: state output cannot be empty.`)
    }
  }

  for (const state of machine.states) {
    for (const symbol of machine.alphabet) {
      if (!seen.has(`${state.id}|${symbol}`)) issues.push(`Missing transition: ${state.id} on ${symbol}.`)
    }
  }
  return issues
}

function StateNode({ data, selected }) {
  return (
    <div className={`machine-state ${data.initial ? 'is-initial' : ''} ${data.isOutput ? 'is-output' : ''} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      {data.initial && <span className="start-pointer">START</span>}
      <span className="state-name">{data.label}</span>
      {data.output !== undefined && <span className="state-output">output: {data.output}</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { machineState: StateNode }

function TransitionEdge({ id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, style, label, data }) {
  if (![sourceX, sourceY, targetX, targetY].every(Number.isFinite)) return null
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const length = Math.hypot(dx, dy) || 1
  const normalX = -dy / length
  const normalY = dx / length
  const laneIndex = data?.laneIndex ?? 0
  const laneCount = data?.laneCount ?? 1
  const outgoingIndex = data?.outgoingIndex ?? 0
  const outgoingCount = data?.outgoingCount ?? 1
  const bend = source === target
    ? 76 + laneIndex * 38
    : (outgoingIndex - (outgoingCount - 1) / 2) * 58 + (laneIndex - (laneCount - 1) / 2) * 24
  const control1X = sourceX + dx / 3 + normalX * bend
  const control1Y = sourceY + dy / 3 + normalY * bend
  const control2X = sourceX + dx * 2 / 3 + normalX * bend
  const control2Y = sourceY + dy * 2 / 3 + normalY * bend
  const finalX = targetX - control2X
  const finalY = targetY - control2Y
  const finalLength = Math.hypot(finalX, finalY) || 1
  const endX = targetX - finalX / finalLength * 3
  const endY = targetY - finalY / finalLength * 3
  const path = `M ${sourceX},${sourceY} C ${control1X},${control1Y} ${control2X},${control2Y} ${endX},${endY}`
  const labelT = outgoingCount > 1 ? 0.34 + 0.32 * (outgoingIndex / (outgoingCount - 1)) : 0.5
  const inverseT = 1 - labelT
  const labelX = inverseT ** 3 * sourceX + 3 * inverseT ** 2 * labelT * control1X + 3 * inverseT * labelT ** 2 * control2X + labelT ** 3 * endX
  const labelY = inverseT ** 3 * sourceY + 3 * inverseT ** 2 * labelT * control1Y + 3 * inverseT * labelT ** 2 * control2Y + labelT ** 3 * endY

  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
    {label && <EdgeLabelRenderer><div className="transition-edge-label" style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'none' }}>{label}</div></EdgeLabelRenderer>}
  </>
}

const edgeTypes = { transition: TransitionEdge }

function getEdgeLanes(transitions) {
  const groups = new Map()
  const outgoing = new Map()
  for (const transition of transitions) {
    const key = `${transition.from}::${transition.to}`
    const group = groups.get(key) ?? []
    group.push(transition)
    groups.set(key, group)
    const sourceGroup = outgoing.get(transition.from) ?? []
    sourceGroup.push(transition)
    outgoing.set(transition.from, sourceGroup)
  }
  const indexes = new Map()
  const outgoingIndexes = new Map()
  return transitions.map((transition) => {
    const key = `${transition.from}::${transition.to}`
    const laneIndex = indexes.get(key) ?? 0
    indexes.set(key, laneIndex + 1)
    const sourceGroup = outgoing.get(transition.from)
    const outgoingIndex = outgoingIndexes.get(transition.from) ?? 0
    outgoingIndexes.set(transition.from, outgoingIndex + 1)
    return { ...transition, laneIndex, laneCount: groups.get(key).length, outgoingIndex, outgoingCount: sourceGroup.length }
  })
}

function App() {
  const [machine, setMachine] = useState(demoMachine)
  const [direction, setDirection] = useState('mealy-to-moore')
  const [mode, setMode] = useState('table')
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [newSymbol, setNewSymbol] = useState('')

  const inputKind = direction === 'mealy-to-moore' ? 'mealy' : 'moore'
  const outputKind = direction === 'mealy-to-moore' ? 'moore' : 'mealy'
  const issues = useMemo(() => validateMachine(machine, inputKind), [machine, inputKind])
  const nodes = useMemo(() => machine.states.map((state) => ({
    id: state.id,
    type: 'machineState',
    position: { x: state.x, y: state.y },
    data: { label: state.id, output: inputKind === 'moore' ? state.output : undefined, initial: state.id === machine.initialState },
  })), [machine.states, machine.initialState, inputKind])
  const edges = useMemo(() => getEdgeLanes(machine.transitions).map((transition) => ({
    id: transition.id,
    source: transition.from,
    target: transition.to,
    label: inputKind === 'mealy' ? `${transition.input} / ${transition.output}` : transition.input,
    type: 'transition',
    data: { laneIndex: transition.laneIndex, laneCount: transition.laneCount, outgoingIndex: transition.outgoingIndex, outgoingCount: transition.outgoingCount },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#C0C0C0', width: 16, height: 16 },
    style: { stroke: '#C0C0C0', strokeWidth: 2.1 },
  })), [machine.transitions, inputKind])

  const outputNodes = useMemo(() => result?.states.map((state) => ({
    id: state.id,
    type: 'machineState',
    position: { x: state.x, y: state.y },
    data: { label: state.name ?? state.id, output: result.direction === 'moore' ? state.output : undefined, initial: state.initial, isOutput: true },
  })) ?? [], [result])
  const outputEdges = useMemo(() => result ? getEdgeLanes(result.transitions).map((transition) => ({
    id: transition.id,
    source: transition.from,
    target: transition.to,
    label: result.direction === 'mealy' ? `${transition.input} / ${transition.output}` : transition.input,
    type: 'transition',
    data: { laneIndex: transition.laneIndex, laneCount: transition.laneCount, outgoingIndex: transition.outgoingIndex, outgoingCount: transition.outgoingCount },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#E10600', width: 16, height: 16 },
    style: { stroke: '#E10600', strokeWidth: 2.1 },
    labelStyle: { fill: '#C0C0C0', fontWeight: 800, fontSize: 14 },
    labelBgStyle: { fill: '#2A2A2A', fillOpacity: 1, stroke: '#E10600', strokeOpacity: 0.72, strokeWidth: 1 },
    labelBgPadding: [8, 5],
    labelBgBorderRadius: 6,
  })) : [], [result])

  const updateStateOutput = (id, output) => {
    setMachine((current) => ({ ...current, states: current.states.map((state) => state.id === id ? { ...state, output } : state) }))
    setResult(null)
  }

  const updateTransition = (id, patch) => {
    setMachine((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === id ? { ...transition, ...patch } : transition),
    }))
    setResult(null)
  }

  const addState = () => {
    const number = machine.states.reduce((max, state) => {
      const match = state.id.match(/^q(\d+)$/)
      return match ? Math.max(max, Number(match[1])) : max
    }, -1) + 1
    const id = `q${number}`
    setMachine((current) => ({
      ...current,
      states: [...current.states, { id, output: '0', x: 170 + (current.states.length % 3) * 210, y: 100 + Math.floor(current.states.length / 3) * 150 }],
    }))
    setNotice(`Added ${id}. Add a transition for each input symbol before converting.`)
    setResult(null)
  }

  const removeState = (id) => {
    setMachine((current) => {
      const states = current.states.filter((state) => state.id !== id)
      return {
        ...current,
        states,
        initialState: current.initialState === id ? states[0]?.id ?? '' : current.initialState,
        transitions: current.transitions.filter((transition) => transition.from !== id && transition.to !== id),
      }
    })
    setResult(null)
  }

  const addTransition = () => {
    const firstState = machine.states[0]?.id
    if (!firstState) {
      setNotice('Add a state before adding a transition.')
      return
    }
    const missing = machine.states.flatMap((state) => machine.alphabet.map((symbol) => ({ state: state.id, symbol })))
      .find(({ state, symbol }) => !machine.transitions.some((transition) => transition.from === state && transition.input === symbol))
    const id = `e${Date.now()}`
    setMachine((current) => ({
      ...current,
      transitions: [...current.transitions, { id, from: missing?.state ?? firstState, input: missing?.symbol ?? current.alphabet[0] ?? '', output: '0', to: firstState }],
    }))
    setResult(null)
  }

  const addAlphabetSymbol = (event) => {
    event.preventDefault()
    const symbol = newSymbol.trim()
    if (!symbol || machine.alphabet.includes(symbol)) return
    setMachine((current) => ({ ...current, alphabet: [...current.alphabet, symbol] }))
    setNewSymbol('')
    setResult(null)
  }

  const onNodesChange = useCallback((changes) => {
    const positions = new Map(changes
      .filter((change) => change.type === 'position' && change.position)
      .map((change) => [change.id, change.position]))
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
    if (!positions.size && !removed.length) return
    setMachine((current) => {
      const states = current.states.filter((state) => !removed.includes(state.id)).map((state) => ({
        ...state,
        ...(positions.has(state.id) ? { x: positions.get(state.id).x, y: positions.get(state.id).y } : {}),
      }))
      return {
        ...current,
        states,
        initialState: removed.includes(current.initialState) ? states[0]?.id ?? '' : current.initialState,
        transitions: current.transitions.filter((edge) => !removed.includes(edge.from) && !removed.includes(edge.to)),
      }
    })
    if (removed.length) setResult(null)
  }, [])

  const onEdgesChange = useCallback((changes) => {
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
    if (!removed.length) return
    setMachine((current) => ({ ...current, transitions: current.transitions.filter((transition) => !removed.includes(transition.id)) }))
    setResult(null)
  }, [])

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) return
    setMachine((current) => ({
      ...current,
      transitions: [...current.transitions, {
        id: `e${Date.now()}`,
        from: connection.source,
        to: connection.target,
        input: current.alphabet.find((symbol) => !current.transitions.some((transition) => transition.from === connection.source && transition.input === symbol)) ?? current.alphabet[0] ?? '',
        output: '0',
      }],
    }))
    setNotice(`Connection added. Set its input${inputKind === 'mealy' ? ' and output' : ''} in the transition list below the canvas.`)
    setResult(null)
  }, [inputKind])

  const convert = () => {
    const errors = validateMachine(machine, inputKind)
    if (errors.length) {
      setNotice(errors[0])
      setResult(null)
      return
    }
    setResult(direction === 'mealy-to-moore' ? convertMealyToMoore(machine) : convertMooreToMealy(machine))
    setNotice(`Conversion complete. The ${outputKind === 'moore' ? 'Moore' : 'Mealy'} machine is shown below.`)
  }

  const reset = () => {
    setMachine(demoMachine)
    setDirection('mealy-to-moore')
    setResult(null)
    setNotice('Sample machine restored.')
    setMode('table')
  }

  const downloadJson = () => {
    const content = JSON.stringify({ direction, inputMachine: machine, convertedMachine: result }, null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'mealy-moore-conversion.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Automata Converter</div>
        <div className="direction-picker" role="group" aria-label="Conversion direction">
          <span className="direction-label">CONVERT</span>
          <button className={direction === 'mealy-to-moore' ? 'direction-option active' : 'direction-option'} onClick={() => { setDirection('mealy-to-moore'); setResult(null); setNotice('') }}>Mealy <ArrowRight size={13} /> Moore</button>
          <button className={direction === 'moore-to-mealy' ? 'direction-option active' : 'direction-option'} onClick={() => { setDirection('moore-to-mealy'); setResult(null); setNotice('') }}>Moore <ArrowRight size={13} /> Mealy</button>
        </div>
      </header>

      <main id="top" className="main-content">
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> AUTOMATA THEORY · CONVERSION STUDIO</div>
            <h1>{inputKind === 'mealy' ? 'Mealy' : 'Moore'} <ArrowRight className="title-arrow" size={23} /> {outputKind === 'moore' ? 'Moore' : 'Mealy'}</h1>
            <p className="intro-copy">{inputKind === 'mealy' ? 'Convert transition outputs into state outputs.' : 'Move state outputs onto transitions.'} Enter the machine in a table or draw it on the canvas.</p>
          </div>
        </section>

        <section className="workspace-card" id="workspace">
          <div className="workspace-heading">
            <div className="section-number">01</div>
            <div className="workspace-title-block"><div className="workspace-title-line"><h2>Enter your {inputKind === 'mealy' ? 'Mealy' : 'Moore'} machine</h2><span className={`machine-tag ${inputKind === 'mealy' ? 'mealy-tag' : 'moore-tag'}`}>{inputKind.toUpperCase()}</span></div><p>Define states and transitions, then choose how you want to edit them.</p></div>
            <div className="machine-meta"><span><span className="meta-dot" />{machine.states.length} states</span><span>{machine.transitions.length} transitions</span></div>
          </div>

          <div className="input-toolbar">
            <div className="segmented-control" role="tablist" aria-label="Input editor">
              <button className={mode === 'table' ? 'selected' : ''} onClick={() => setMode('table')} role="tab" aria-selected={mode === 'table'}><span className="table-icon">▤</span> Table input</button>
              <button className={mode === 'diagram' ? 'selected' : ''} onClick={() => setMode('diagram')} role="tab" aria-selected={mode === 'diagram'}><GitBranch size={15} /> Draw diagram</button>
            </div>
            <button className="text-button" onClick={reset}><RefreshCw size={14} /> Reset sample</button>
          </div>

          {mode === 'table' ? (
            <div className="input-layout">
              <div className="table-panel">
                <div className="panel-topline"><div><h3>Transition table</h3><p>{inputKind === 'mealy' ? 'Outputs are recorded on each transition.' : 'Outputs are set on states; rows show input and destination.'}</p></div><button className="small-primary" onClick={addTransition}><Plus size={14} /> Add row</button></div>
                <div className="table-wrap">
                  <table className="machine-table input-table">
                    <thead><tr><th>FROM STATE</th><th>INPUT</th>{inputKind === 'mealy' && <th>OUTPUT</th>}<th>TO STATE</th><th aria-label="Actions" /></tr></thead>
                    <tbody>
                      {machine.transitions.map((transition) => <tr key={transition.id}>
                        <td><select value={transition.from} onChange={(event) => updateTransition(transition.id, { from: event.target.value })}>{machine.states.map((state) => <option key={state.id}>{state.id}</option>)}</select></td>
                        <td><select value={transition.input} onChange={(event) => updateTransition(transition.id, { input: event.target.value })}>{machine.alphabet.map((symbol) => <option key={symbol}>{symbol}</option>)}</select></td>
                        {inputKind === 'mealy' && <td><input aria-label={`Output for transition ${transition.id}`} value={transition.output} onChange={(event) => updateTransition(transition.id, { output: event.target.value })} /></td>}
                        <td><select value={transition.to} onChange={(event) => updateTransition(transition.id, { to: event.target.value })}>{machine.states.map((state) => <option key={state.id}>{state.id}</option>)}</select></td>
                        <td><button className="row-delete" title="Delete transition" onClick={() => { setMachine((current) => ({ ...current, transitions: current.transitions.filter((item) => item.id !== transition.id) })); setResult(null) }}><Trash2 size={14} /></button></td>
                      </tr>)}
                    </tbody>
                  </table>
                  {machine.transitions.length === 0 && <div className="empty-table">No transitions yet. Add a row to get started.</div>}
                </div>
              </div>
              <aside className="machine-settings">
                <div className="settings-heading"><span className="settings-icon"><ArrowDownUp size={16} /></span><div><h3>Machine setup</h3><p>Set the start state and alphabet.</p></div></div>
                <label className="field-label" htmlFor="initial-state">START STATE</label>
                <div className="select-shell"><select id="initial-state" value={machine.initialState} onChange={(event) => { setMachine((current) => ({ ...current, initialState: event.target.value })); setResult(null) }}>{machine.states.map((state) => <option key={state.id}>{state.id}</option>)}</select><ChevronDown size={15} /></div>
                <div className="field-heading"><span className="field-label">INPUT ALPHABET</span><span className="muted-count">{machine.alphabet.length} symbols</span></div>
                <div className="alphabet-chips">{machine.alphabet.map((symbol) => <span className="alphabet-chip" key={symbol}>{symbol}<button title={`Remove ${symbol}`} onClick={() => { setMachine((current) => ({ ...current, alphabet: current.alphabet.filter((item) => item !== symbol), transitions: current.transitions.filter((item) => item.input !== symbol) })); setResult(null) }}>×</button></span>)}</div>
                <form className="add-symbol" onSubmit={addAlphabetSymbol}><input value={newSymbol} onChange={(event) => setNewSymbol(event.target.value)} placeholder="Add symbol" aria-label="New input symbol" /><button type="submit" title="Add symbol"><Plus size={15} /></button></form>
                <div className="field-heading state-heading"><span className="field-label">STATES</span><span className="muted-count">{machine.states.length} total</span></div>
                <div className="state-list">{machine.states.map((state) => <div className="state-row" key={state.id}><span className="state-token">{state.id === machine.initialState && <span className="tiny-start" />}{state.id}</span>{inputKind === 'moore' && <label className="state-output-edit"><span>OUTPUT</span><input aria-label={`Output for state ${state.id}`} value={state.output ?? ''} onChange={(event) => updateStateOutput(state.id, event.target.value)} /></label>}<button className="row-delete" title={`Remove ${state.id}`} onClick={() => removeState(state.id)}><Trash2 size={14} /></button></div>)}</div>
                <button className="add-state-button" onClick={addState}><Plus size={15} /> Add state</button>
              </aside>
            </div>
          ) : (
            <div className="diagram-editor">
              <div className="diagram-toolbar"><div className="diagram-tip"><span className="tip-icon">↗</span><span>Drag the state body to move it. Drag its right handle to another state to add a transition.</span></div><button className="small-primary" onClick={addState}><Plus size={14} /> Add state</button></div>
              <div className="flow-canvas input-canvas">
                <ReactFlowProvider>
                  <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} deleteKeyCode={['Backspace', 'Delete']} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.25} maxZoom={1.7}>
                    <Background color="#555555" gap={22} size={1} />
                    <Controls position="bottom-right" />
                  </ReactFlow>
                </ReactFlowProvider>
              </div>
              <div className="diagram-footnote"><span className="start-legend"><span className="tiny-start" />Start state</span><span>Edge labels use <strong>{inputKind === 'mealy' ? 'input / output' : 'input'}</strong></span></div>
              <div className="diagram-transition-list">
                <div className="panel-topline"><div><h3>Transition details</h3><p>{inputKind === 'mealy' ? 'Choose an input and output for each edge.' : 'Choose an input for each edge. Outputs stay on states.'}</p></div><button className="small-quiet" onClick={addTransition}><Plus size={14} /> Add transition</button></div>
                <TransitionRows machine={machine} inputKind={inputKind} updateTransition={updateTransition} remove={(id) => { setMachine((current) => ({ ...current, transitions: current.transitions.filter((item) => item.id !== id) })); setResult(null) }} />
              </div>
              <div className="diagram-state-pills"><span className="field-label">STATES</span>{machine.states.map((state) => <span key={state.id} className="state-pill"><span className={state.id === machine.initialState ? 'tiny-start' : 'pill-state-dot'} />{state.id}{inputKind === 'moore' && <label className="diagram-state-output">Output<input aria-label={`Output for ${state.id}`} value={state.output ?? ''} onChange={(event) => updateStateOutput(state.id, event.target.value)} /></label>}<button title={`Remove ${state.id}`} onClick={() => removeState(state.id)}>×</button></span>)}<label className="diagram-start-select">Start state<select value={machine.initialState} onChange={(event) => { setMachine((value) => ({ ...value, initialState: event.target.value })); setResult(null) }}>{machine.states.map((state) => <option key={state.id}>{state.id}</option>)}</select></label></div>
            </div>
          )}

          <div className={`validation-banner ${issues.length ? 'has-issues' : 'is-valid'}`}>
            <span className="validation-icon">{issues.length ? <CircleHelp size={16} /> : <Check size={16} />}</span>
            <div><strong>{issues.length ? 'Machine needs a quick check' : 'Machine is ready to convert'}</strong><span>{issues.length ? issues[0] : 'Every state has exactly one transition for each input symbol.'}</span></div>
            {issues.length > 0 && <span className="issue-count">{issues.length} {issues.length === 1 ? 'issue' : 'issues'}</span>}
          </div>
          <div className="convert-row"><div className="conversion-note"><span className="note-mark">i</span><span>{inputKind === 'mealy' ? 'Each Moore state represents an original state paired with the output produced on entry.' : 'Each Mealy transition receives the output of the Moore destination state.'}</span></div><button className="convert-button" onClick={convert} disabled={issues.length > 0}><ArrowDownUp size={16} /> Convert to {outputKind === 'moore' ? 'Moore' : 'Mealy'} <ArrowRight size={16} /></button></div>
          {notice && <div className="notice-line"><Check size={14} />{notice}</div>}
        </section>

        {result && <section className="result-section" id="result">
          <div className="result-heading"><div className="section-number result-number">02</div><div className="workspace-title-block"><div className="workspace-title-line"><h2>Your {outputKind === 'moore' ? 'Moore' : 'Mealy'} machine</h2><span className={`machine-tag ${outputKind === 'moore' ? 'moore-tag' : 'mealy-tag'}`}>{outputKind.toUpperCase()}</span></div><p>{outputKind === 'moore' ? 'Outputs are attached to states.' : 'Outputs are attached to transitions.'}</p></div><button className="export-button" onClick={downloadJson}><Download size={15} /> Export JSON</button></div>
          <div className="result-summary"><div className="summary-item"><span className="summary-value">{machine.states.length}</span><span className="summary-label">{inputKind === 'mealy' ? 'Mealy' : 'Moore'} states</span></div><div className="summary-arrow"><ArrowRight size={17} /></div><div className="summary-item"><span className="summary-value green-value">{result.states.length}</span><span className="summary-label">{outputKind === 'moore' ? 'Moore' : 'Mealy'} states</span></div><div className="summary-divider" /><div className="result-callout"><span className="callout-icon"><Check size={15} /></span><span><strong>{outputKind === 'moore' ? `${Math.max(0, result.states.length - machine.states.length)} state${result.states.length - machine.states.length === 1 ? '' : 's'} added` : 'Outputs moved to transitions'}</strong><small>{outputKind === 'moore' ? 'States split when incoming transitions produce different outputs.' : 'Each edge output matches the output of its destination state.'}</small></span></div></div>
          <div className="result-tabs-label"><span className="result-tab selected-result-tab">Converted output</span><span className="result-format-hint">TABLE + DIAGRAM</span></div>
          <div className="output-grid">
            <div className="output-panel output-table-panel"><div className="panel-topline"><div><h3>{outputKind === 'moore' ? 'Moore' : 'Mealy'} transition table</h3><p>{outputKind === 'moore' ? 'Outputs are attached to states.' : 'Each input cell shows destination / output.'}</p></div></div><div className="table-wrap"><table className="machine-table output-table"><thead><tr><th>{outputKind === 'moore' ? 'STATE / OUTPUT' : 'STATE'}</th>{result.alphabet.map((symbol) => <th key={symbol}>{symbol}</th>)}</tr></thead><tbody>{result.states.map((state) => <tr key={state.id}><td><span className="output-state-cell">{state.initial && <span className="tiny-start" />}<strong>{state.name ?? state.id}</strong>{outputKind === 'moore' && <em>output {state.output}</em>}</span></td>{result.alphabet.map((symbol) => { const edge = result.transitions.find((transition) => transition.from === state.id && transition.input === symbol); return <td key={symbol}>{edge ? <span className="next-state-cell">{result.states.find((item) => item.id === edge.to)?.name ?? edge.to}{outputKind === 'mealy' && <> / {edge.output}</>}<ArrowRight size={12} /></span> : <span className="missing-cell">—</span>}</td> })}</tr>)}</tbody></table></div>{outputKind === 'moore' && <div className="table-caption"><span className="tiny-start" /> Initial Moore state has no output before the first input.</div>}</div>
            <div className="output-panel output-diagram-panel"><div className="panel-topline"><div><h3>State diagram</h3><p>{outputKind === 'moore' ? 'Each node shows its Moore output.' : 'Each edge shows its Mealy output.'}</p></div><span className="diagram-badge"><span className="green-dot" />{result.states.length} states · {result.transitions.length} transitions</span></div><div className="flow-canvas output-canvas"><ReactFlowProvider><ReactFlow nodes={outputNodes} edges={outputEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.1 }} minZoom={0.25} maxZoom={1.7}><Background color="#555555" gap={22} size={1} /><Controls showInteractive={false} position="bottom-right" /></ReactFlow></ReactFlowProvider></div><div className="diagram-legend"><span><i className="legend-circle" />State</span>{outputKind === 'moore' && <span><i className="legend-output" />State output</span>}<span><i className="legend-arrow">→</i>{outputKind === 'moore' ? 'Input' : 'Input / output'}</span></div></div>
          </div>
        </section>}

        <footer><span>AUTOMATA THEORY <span className="footer-dot">·</span> MACHINE CONVERSION</span></footer>
      </main>
    </div>
  )
}

function TransitionRows({ machine, inputKind, updateTransition, remove }) {
  return <div className="table-wrap"><table className="machine-table input-table compact-table"><thead><tr><th>FROM</th><th>INPUT</th>{inputKind === 'mealy' && <th>OUTPUT</th>}<th>TO</th><th /></tr></thead><tbody>{machine.transitions.map((transition) => <tr key={transition.id}>
    <td><select value={transition.from} onChange={(event) => updateTransition(transition.id, { from: event.target.value })}>{machine.states.map((state) => <option key={state.id}>{state.id}</option>)}</select></td>
    <td><select value={transition.input} onChange={(event) => updateTransition(transition.id, { input: event.target.value })}>{machine.alphabet.map((symbol) => <option key={symbol}>{symbol}</option>)}</select></td>
    {inputKind === 'mealy' && <td><input aria-label={`Output for transition ${transition.id}`} value={transition.output} onChange={(event) => updateTransition(transition.id, { output: event.target.value })} /></td>}
    <td><select value={transition.to} onChange={(event) => updateTransition(transition.id, { to: event.target.value })}>{machine.states.map((state) => <option key={state.id}>{state.id}</option>)}</select></td>
    <td><button className="row-delete" onClick={() => remove(transition.id)} title="Delete transition"><Trash2 size={14} /></button></td>
  </tr>)}</tbody></table>{machine.transitions.length === 0 && <div className="empty-table">Draw a connection or add a transition.</div>}</div>
}

export default App
