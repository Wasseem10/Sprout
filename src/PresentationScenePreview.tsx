import { useId, useState, type KeyboardEvent } from 'react';
import type { SavedSlideScene } from '../shared/presentation-review-scene';
import type { PresentationProjectView } from '../shared/presentation-project';
import type { Flowchart } from '../shared/presentation-flowchart';
import { flowchartPaths, flowchartNodeOrder } from '../shared/presentation-flowchart';

/** Read-only drawing of server-measured regions. Text is never independently wrapped by CSS. */
export function PresentationScenePreview({ scene, project, identity }: { scene: SavedSlideScene; project: PresentationProjectView; identity: { projectId: string; sha256: string } }) {
  const markerId = useId().replace(/:/g, '');
  return <figure className="presentation-measured-preview">
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} aria-hidden="true" focusable="false" data-layout-version={scene.layoutVersion}>
      <defs><marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 z" fill="context-stroke" /></marker></defs>
      <rect width={scene.width} height={scene.height} fill={`#${scene.background}`} />
      {scene.elements.filter(e => e.kind === 'shape').map(element => {
        if (element.kind !== 'shape') return null;
        const b = element.bounds;
        return element.geometry === 'diamond' ? <polygon key={element.id} data-object-id={element.id} points={`${b.x + b.width / 2},${b.y} ${b.x + b.width},${b.y + b.height / 2} ${b.x + b.width / 2},${b.y + b.height} ${b.x},${b.y + b.height / 2}`} fill={`#${element.fill}`} stroke={`#${element.stroke}`} strokeWidth={element.strokeWidthPt / 72} />
          : <rect key={element.id} data-object-id={element.id} x={b.x} y={b.y} width={b.width} height={b.height} rx={element.geometry === 'roundRect' ? .12 : 0} fill={`#${element.fill}`} stroke={`#${element.stroke}`} strokeWidth={element.strokeWidthPt / 72} />;
      })}
      {scene.elements.filter(e => e.kind === 'connector').map(element => element.kind === 'connector' && <polyline key={element.id} data-object-id={element.id} points={element.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={`#${element.stroke}`} strokeWidth={element.strokeWidthPt / 72} markerEnd={`url(#${markerId})`} />)}
      {scene.elements.map(element => {
        if (element.kind === 'image') return <image key={element.id} data-object-id={element.id} href={`/api/computer/presentation/image/${element.imageId}?revision=${project.revision}&projectId=${encodeURIComponent(identity.projectId)}&sha256=${identity.sha256}`} x={element.bounds.x} y={element.bounds.y} width={element.bounds.width} height={element.bounds.height} preserveAspectRatio="xMidYMid meet" />;
        if (element.kind === 'chart') return <g key={element.id} data-object-id={element.id}><rect x={element.bounds.x} y={element.bounds.y} width={element.bounds.width} height={element.bounds.height} fill="none" stroke={scene.theme === 'dark' ? '#8cc6ff' : '#2465bc'} strokeWidth=".025" strokeDasharray=".12 .08" /><text x={element.bounds.x + element.bounds.width / 2} y={element.bounds.y + element.bounds.height / 2} textAnchor="middle" fontFamily="Arial" fontSize=".23" fill={scene.theme === 'dark' ? '#f4f7ff' : '#142541'}>Native chart region · values in the table below</text></g>;
        if (element.kind !== 'text') return null;
        const b = element.bounds, align = 'align' in element && element.align === 'center' ? 'middle' : 'start';
        const top = b.y + (b.height - element.lines.length * element.lineHeight) / 2;
        return <g key={element.id} data-object-id={element.id}>{element.lines.map((line, index) => <text key={index} x={align === 'middle' ? b.x + b.width / 2 : b.x} y={top + element.lineHeight * (index + .8)} fontFamily="Arial" fontSize={element.fontSize / 72} fontWeight={element.bold ? 700 : 400} fill={`#${element.color}`} textAnchor={align} {...(line.text ? { textLength: line.width, lengthAdjust: 'spacingAndGlyphs' as const } : {})}>{line.text}</text>)}</g>;
      })}
    </svg>
    <figcaption>Saved slide layout{scene.slideType === 'chart' ? ' · chart frame only; PowerPoint lays out its axes and bars' : ''}. Use the controls below for spoken review.</figcaption>
  </figure>;
}

/** Logical graph navigation stays independent of visual arrow interpretation. Requests use the normal semantic executor. */
export function FlowchartExplorer({ graph, slideNumber, disabled, ask }: { graph: Flowchart; slideNumber: number; disabled: boolean; ask: (request: string) => void }) {
  const [active, setActive] = useState(0);
  const paths = flowchartPaths(graph);
  const orderedIds = flowchartNodeOrder(graph);
  const nodes = orderedIds.map(id => graph.nodes.find(node => node.id === id)!);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-node-id]')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 || !buttons.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    setActive(next); buttons[next].focus();
  }
  return <section className="presentation-graph-explorer" aria-label={`Explore diagram on slide ${slideNumber}`}>
    <p>Explore steps with Up/Down, Home/End, then Enter to hear a step. Tab moves to branch controls.</p>
    <div role="group" aria-label="Diagram steps" onKeyDown={navigate}>
      {nodes.map((node, index) => <button key={node.id} type="button" className="secondary-button" data-node-id={node.id} tabIndex={index === Math.min(active, nodes.length - 1) ? 0 : -1} disabled={disabled} onFocus={() => setActive(index)} onClick={() => ask(`Explain the node “step ${index + 1}: ${node.label}” on the flowchart on slide ${slideNumber}.`)}>{index + 1}. {node.label} <span>({node.kind})</span></button>)}
    </div>
    <div role="group" aria-label="Decision branches">
      {paths.branches.map(branch => <button key={branch.edgeId} type="button" className="secondary-button" disabled={disabled} onClick={() => ask(`Explain the ${JSON.stringify(branch.label)} branch of the flowchart on slide ${slideNumber}.`)}>Read {branch.label} branch</button>)}
    </div>
  </section>;
}
