import { Download, Volume2, RotateCcw, FolderOpen, Save, History } from 'lucide-react';
import type { PresentationProjectView } from '../shared/presentation-project';
import { toOrderedDeck, type OrderedPresentationSlide } from '../shared/presentation-deck';
import { narrateFlowchart } from '../shared/presentation-flowchart';
import { useEffect, useState, type CSSProperties } from 'react';
import type { PresentationSceneResponse } from '../shared/presentation-review-scene';
import { PresentationScenePreview, FlowchartExplorer } from './PresentationScenePreview';
import './presentation-project.css';

function SourceImage({ project, imageId, identityQuery, description }: { project: PresentationProjectView; imageId: number; identityQuery: string; description?: string }) {
  const asset = project.assets.find((item) => item.id === imageId);
  return asset ? (
    <figure>
      <img
        src={`/api/computer/presentation/image/${asset.id}?revision=${project.revision}&${identityQuery}`}
        alt={description ? `Your description: ${description}` : `AI description: ${asset.description}`}
      />
      <figcaption>{asset.filename}</figcaption>
    </figure>
  ) : (
    <p className="computer-caption">The source picture is unavailable.</p>
  );
}

function ImageDescriptionControls({ project, slide, slideNumber, disabled, ask }: { project: PresentationProjectView; slide: Extract<OrderedPresentationSlide, { type: 'cover' | 'image' }>; slideNumber: number; disabled: boolean; ask: (request: string) => void }) {
  const source = project.assets.find(asset => asset.id === slide.imageId);
  const current = slide.imageDescription ?? source?.description ?? '';
  const [description, setDescription] = useState(current);
  return <details className="presentation-image-description">
    <summary>Picture description · {slide.imageDescription ? 'your wording' : 'AI-generated'}</summary>
    <p>{current.trim().length >= 5 ? current : 'This picture needs a description.'}</p>
    {!slide.imageDescription && <p className="computer-caption">AI descriptions may be incorrect. You can correct this one by voice or below.</p>}
    <button className="secondary-button" type="button" disabled={disabled} onClick={() => ask(`Read the picture description on slide ${slideNumber}.`)}>Read picture description</button>
    <form onSubmit={event => { event.preventDefault(); ask(`Set the picture description on slide ${slideNumber} to “${description.trim()}”.`); }}>
      <label>Correct the description for slide {slideNumber}<textarea value={description} onChange={event => setDescription(event.target.value)} minLength={5} maxLength={500} rows={3} disabled={disabled} /></label>
      <button className="secondary-button" type="submit" disabled={disabled || description.trim().length < 5 || description.trim() === current}>Save description</button>
    </form>
  </details>;
}

function SlideContents({ slide }: { slide: OrderedPresentationSlide }) {
  if (slide.type === 'flowchart')
    return <p className="computer-caption">{narrateFlowchart(slide.graph)}</p>;
  if (slide.type === 'cover')
    return <p className="presentation-cover-subtitle">{slide.subtitle}</p>;
  if (slide.type === 'process')
    return (
      <div className="presentation-process-reading">
        <ol aria-label="Diagram stages, left to right">
          {slide.stages.map((stage, index) => (
            <li key={`${slide.id}-stage-${index}`}>
              <span className="presentation-stage-number">{index + 1}</span>
              <strong>{stage.label}</strong>
              <p>{stage.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  if (slide.type === 'chart') {
    return (
      <div className="presentation-chart-preview">
        <div className="presentation-chart-table">
          <table>
            <caption>
              {slide.title} · {slide.chart.unit}
            </caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                {slide.chart.series.map((series) => (
                  <th scope="col" key={series.name}>
                    {series.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slide.chart.labels.map((label, index) => (
                <tr key={`${slide.id}-row-${index}`}>
                  <th scope="row">{label}</th>
                  {slide.chart.series.map((series) => (
                    <td key={series.name}>
                      {series.values[index].toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="computer-caption">{slide.chart.provenance.summary}</p>
      </div>
    );
  }
  return (
    <>
      {slide.type === 'image' && slide.caption && (
        <p className="presentation-image-caption">{slide.caption}</p>
      )}
      {!!slide.points?.length && (
        <ul>
          {slide.points.map((point, index) => (
            <li key={`${slide.id}-point-${index}`}>{point}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function PresentationProjectPanel({
  project,
  projectId,
  outputSha256,
  disabled,
  ask,
}: {
  project: PresentationProjectView;
  projectId?: string;
  outputSha256: string;
  disabled: boolean;
  ask: (request: string) => void;
}) {
  const deck = project.orderedDeck ?? toOrderedDeck(project.deck);
  const [preview, setPreview] = useState<PresentationSceneResponse | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewRefresh, setPreviewRefresh] = useState(0);
  const identityQuery = `sha256=${outputSha256}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`;
  const previewIdentity = `${projectId}:${outputSha256}:${project.revision}:${deck.slides.map(slide => slide.id).join(',')}`;
  const matchedPreview = preview?.sha256 === outputSha256 && (!projectId || preview.projectId === projectId) ? preview : null;
  useEffect(() => {
    const abort = new AbortController();
    setPreview(null); setPreviewError('');
    void fetch(`/api/computer/presentation/layout?${identityQuery}`, { signal: abort.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('A verified saved-layout preview is not available. Resume or edit the project to refresh it.');
      const value = await response.json() as PresentationSceneResponse;
      if (value.evidence !== 'saved-export' || value.sha256 !== outputSha256 || projectId && value.projectId !== projectId || value.revision !== project.revision || !Array.isArray(value.scenes) || value.scenes.length !== deck.slides.length || value.scenes.some((scene, i) => scene.slideId !== deck.slides[i].id)) throw new Error('The saved preview does not match this revision.');
      if (!abort.signal.aborted) setPreview(value);
    }).catch(error => { if (!abort.signal.aborted) setPreviewError(error instanceof Error ? error.message : 'The saved preview is unavailable.'); });
    return () => abort.abort();
  }, [previewIdentity, previewRefresh]);
  const themeLabel = { blue: 'Clean blue', light: 'Bright minimal', dark: 'Dark minimal' }[
    deck.theme
  ];
  return (
    <section
      className="presentation-project"
      aria-label="Voice-directed presentation"
      data-theme={deck.theme}
    >
      <header className="presentation-project-header">
        <div>
          <span className="small-label">YOUR IMAGES. YOUR DIRECTION.</span>
          <h3>{deck.title}</h3>
          <p>
            {deck.slides.length} editable slides · Revision {project.revision} · {project.folder}
          </p>
          <span className="presentation-theme-label">{themeLabel}</span>
        </div>
        <a className="primary-button" href="/api/computer/presentation/export" download>
          <Download size={16} aria-hidden="true" /> Download PowerPoint
        </a>
      </header>
      <p className="presentation-project-basis">{project.basis}</p>
      {project.researchSources?.length ? (
        <details className="computer-details">
          <summary>Web research sources</summary>
          {project.researchSources.map((source) => (
            <p key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            </p>
          ))}
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() => ask('Read the sources')}
          >
            Read sources
          </button>
        </details>
      ) : null}
      <div className="computer-toolbar">
        <button className="secondary-button" disabled={disabled} onClick={() => setPreviewRefresh(value => value + 1)}>Refresh saved preview</button>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => ask('Save my presentation')}
        >
          <Save size={16} aria-hidden="true" /> Save project
        </button>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => ask('Resume my last presentation')}
        >
          <History size={16} aria-hidden="true" /> Resume last saved
        </button>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => ask('Read the slide titles')}
        >
          <Volume2 size={16} aria-hidden="true" /> Review slides
        </button>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => ask('Open the source folder')}
        >
          <FolderOpen size={16} aria-hidden="true" /> Open source folder
        </button>
        <button
          className="secondary-button"
          disabled={
            disabled || (project.canUndo !== undefined ? !project.canUndo : project.revision === 1)
          }
          onClick={() => ask('Undo the last slide change')}
        >
          <RotateCcw size={16} aria-hidden="true" /> Undo revision
        </button>
      </div>
      {project.saved ? (
        <p className="computer-caption" role="status">
          {project.saved.revision === project.revision
            ? `Revision ${project.revision} saved ${project.saved.provider === 'neon' ? 'to Neon' : 'on this laptop'}.`
            : `Revision ${project.saved.revision} saved. Save again to keep your latest changes.`}
          {project.saved.warning ? ` ${project.saved.warning}` : ''}
        </p>
      ) : (
        <p className="computer-caption">
          Say “Save my presentation” to keep your edit history for next time.
        </p>
      )}
      <ol
        className="presentation-project-slides"
        aria-label="Presentation slides in order"
        style={{ '--presentation-text-scale': deck.textScale } as CSSProperties}
      >
        {deck.slides.map((slide, index) => {
          const imageId =
            slide.type === 'image' || slide.type === 'cover' ? slide.imageId : undefined;
          return (
            <li
              key={slide.id}
              data-slide-id={slide.id}
              style={
                slide.textScale
                  ? ({ '--presentation-text-scale': slide.textScale } as CSSProperties)
                  : undefined
              }
              className={`presentation-slide-card type-${slide.type} ${imageId !== undefined ? 'has-image' : 'text-only'} ${slide.type === 'image' ? `layout-${slide.layout}` : ''}`}
            >
              {matchedPreview?.scenes[index] && <PresentationScenePreview scene={matchedPreview.scenes[index]} project={project} identity={matchedPreview} />}
              {!matchedPreview && imageId !== undefined && <SourceImage project={project} imageId={imageId} identityQuery={identityQuery} description={'imageDescription' in slide ? slide.imageDescription : undefined} />}
              <div className="presentation-slide-content">
                <span className="small-label">
                  SLIDE {index + 1} ·{' '}
                  {slide.type === 'process' ? 'EDITABLE DIAGRAM' : slide.type.toUpperCase()}
                </span>
                <h4>{slide.title}</h4>
                <SlideContents slide={slide} />
                {slide.type === 'flowchart' && <FlowchartExplorer graph={slide.graph} slideNumber={index + 1} disabled={disabled} ask={ask} />}
                {(slide.type === 'image' || slide.type === 'cover') && slide.imageId && <ImageDescriptionControls key={`${slide.id}-${project.revision}`} project={project} slide={slide} slideNumber={index + 1} disabled={disabled} ask={ask} />}
                <button
                  className="secondary-button"
                  disabled={disabled}
                  onClick={() => ask(`Read slide ${index + 1}`)}
                >
                  <Volume2 size={14} aria-hidden="true" /> Read slide {index + 1}
                </button>
                <button className="secondary-button" disabled={disabled || !matchedPreview} onClick={() => ask(`Describe the layout of slide ${index + 1}.`)}>Describe layout</button>
              </div>
            </li>
          );
        })}
      </ol>
      {previewError && <p className="computer-caption" role="status">{previewError}</p>}
      <p className="computer-caption">
        Try “Read slide two,” “Make it less wordy,” or “Add a summary slide.” Image descriptions are
        generated by AI and may need correction.
      </p>
    </section>
  );
}
