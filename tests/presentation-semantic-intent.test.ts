import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import { interpretPresentationTurn } from '../server/computer/presentation-intent';
import { PresentationProjectError } from '../server/computer/presentation-project';
import {
  isExactPresentationCancellation,
  mergePresentationDraft,
  normalizePresentationTranscript,
  presentationTurnIntentSchema,
  type PresentationIntentContext,
  type PresentationTaskDraft,
  type PresentationTurnIntent,
} from '../shared/presentation-intent';

vi.mock('../server/computer/planner', () => ({ chat: vi.fn() }));
const chatMock = vi.mocked(chat);
const cfg = { ...config(), hfToken: 'test-token', hfModel: 'test-qwen' };
const context: PresentationIntentContext = {
  draft: null,
  activePresentation: {
    filename: 'campaign.pptx',
    title: 'Cyber Monday',
    slideCount: 6,
    reviewedSlide: 2,
  },
  conversation: [{ request: 'Read slide two', outcome: 'Slide two: Campaign goals.' }],
  lastVerifiedResult: {
    filename: 'campaign.pptx',
    revision: 2,
    saved: true,
    summary: 'Wrote six editable slides.',
    navigation: { slide: 2, verified: false, error: 'PowerPoint is busy.' },
  },
};
function intent(overrides: Partial<PresentationTurnIntent> = {}): PresentationTurnIntent {
  return {
    kind: 'request',
    domain: 'presentation',
    startsNewTask: false,
    awaitingContinuation: false,
    fields: {},
    operations: [],
    ...overrides,
  };
}
function draft(fields: PresentationTaskDraft['fields'] = {}): PresentationTaskDraft {
  return {
    id: 'draft-1',
    generation: 1,
    workflow: 'create',
    fields,
    transcripts: ['Make a presentation'],
    operations: [{ type: 'create' }],
    pendingQuestion: { field: 'topic', question: 'What should it be about?' },
    lastSuccessfulArtifact: context.lastVerifiedResult,
  };
}
beforeEach(() => vi.clearAllMocks());

describe('prospective explicit shortening policy', () => {
  it('carries a literal upper limit and repairs an invented percentage for ordinary shortening', async () => {
    const op = { type: 'revise_slide', target: 2, instruction: 'Shorten slide two to under forty words.', detailChange: 'shorten', maximumWords: 39, lengthConstraintQuote: 'under forty words' } as const;
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ operations: [op] })));
    expect((await interpretPresentationTurn(op.instruction, context, cfg, new AbortController().signal)).operations).toEqual([op]);
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ operations: [{ ...op, maximumWords: undefined, reductionPercent: 20, lengthConstraintQuote: 'Tighten slide two.' }] })));
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Tighten slide two.', detailChange: 'shorten' }] })));
    const ordinary = await interpretPresentationTurn('Tighten slide two.', context, cfg, new AbortController().signal);
    expect(ordinary.operations[0]).not.toHaveProperty('reductionPercent');
  });
  it('asks rather than executing when the model repeatedly ignores an exact or contradictory count', async () => {
    chatMock.mockResolvedValue(JSON.stringify(intent({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Shorten it.', detailChange: 'shorten' }] })));
    const result = await interpretPresentationTurn('Shorten slide two to exactly 40 words.', context, cfg, new AbortController().signal);
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(result.reply).toContain('upper word limit');
  });
});

describe('literal picture descriptions', () => {
  it('grounds the full numbered graph reference independently of its slide target', async () => {
    const operation = { type: 'read_flowchart', target: 3, scope: 'node', reference: 'step 4: Review' } as const;
    chatMock.mockResolvedValue(JSON.stringify(intent({ operations: [operation] })));
    const result = await interpretPresentationTurn('Explain the node “step 4: Review” on the flowchart on slide 3.', context, cfg, new AbortController().signal);
    expect(result?.operations).toEqual([operation]);
  });
  it('preserves supplied wording including punctuation without inventing an alternative', async () => {
    const description = 'A banner says "Ready?" beside two people.';
    chatMock.mockResolvedValue(JSON.stringify(intent({ operations: [{ type: 'edit_image_description', target: 2, description }] })));
    const result = await interpretPresentationTurn(`Set the picture description on slide two to “${description}”.`, context, cfg, new AbortController().signal);
    expect(result?.operations).toEqual([{ type: 'edit_image_description', target: 2, description }]);
  });
  it('repairs a provider-invented correction by asking for exact supplied wording', async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ operations: [{ type: 'edit_image_description', target: 2, description: 'A smiling family near a storefront.' }] })));
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ kind: 'question', reply: 'What exact description should I use for the picture?' })));
    const result = await interpretPresentationTurn('Fix the picture description on slide two.', context, cfg, new AbortController().signal);
    expect(result?.operations).toEqual([]);
    expect(result?.reply).toContain('exact description');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('does not treat the complete command as replacement text even when it is verbatim', async () => {
    chatMock.mockResolvedValue(JSON.stringify(intent({ kind: 'correction', operations: [{ type: 'edit_image_description', target: 2, description: 'Fix the picture description on slide two' }], reply: 'What would you like the new picture description to be?' })));
    const result = await interpretPresentationTurn('Fix the picture description on slide two.', context, cfg, new AbortController().signal);
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(result.reply).toContain('exact description');
  });
  it('rejects a wrong model target for a bare description answer before draft merging can clear its binding', async () => {
    const description = 'A blue banner with a white heading.';
    const pending: PresentationTaskDraft = { ...draft(), workflow: 'edit', operations: [{ type: 'edit_image_description', target: 2, description: 'Earlier wording.', binding: { projectId: 'p', targetSlideId: 'picture', boundRevision: 1 } }], pendingQuestion: { field: 'clarification', question: 'What exact description should I use?' } };
    chatMock.mockResolvedValue(JSON.stringify(intent({ kind: 'correction', operations: [{ type: 'edit_image_description', target: 7, description }] })));
    const result = await interpretPresentationTurn(description, { ...context, draft: pending, activePresentation: { ...context.activePresentation!, projectId: 'p', slideCount: 7, slides: [{ id: 'picture', index: 2, title: 'Campaign image' }] } }, cfg, new AbortController().signal);
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(pending.operations[0]).toMatchObject({ target: 2, binding: { targetSlideId: 'picture' } });
  });
  it('allows exact pending description on a later target clarification', async () => {
    const description = 'A blue banner with a white heading.';
    const pending: PresentationTaskDraft = { ...draft(), workflow: 'edit', operations: [{ type: 'edit_image_description', description }], pendingQuestion: { field: 'imageDestination', question: 'Which slide?' } };
    chatMock.mockResolvedValue(JSON.stringify(intent({ kind: 'continuation', operations: [{ type: 'edit_image_description', target: 2, description }] })));
    const result = await interpretPresentationTurn('Slide two.', { ...context, draft: pending }, cfg, new AbortController().signal);
    expect(result?.operations).toEqual([{ type: 'edit_image_description', target: 2, description }]);
  });
});

describe('verified chart insertion and saved source readback intent',()=>{
  it('keeps dataset import fields separate and grounds refresh to its quoted existing target',async()=>{
    chatMock.mockResolvedValue(JSON.stringify(intent({operations:[{type:'import_studio_source',folderName:'Revenue',folderLocation:'desktop',datasetFilename:'sales.csv'},{type:'refresh_verified_chart',target:3,targetReference:'slide three'}]})));
    const result=await interpretPresentationTurn('Load sales.csv from Revenue on my desktop and refresh the chart on slide three.',context,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'import_studio_source',folderName:'Revenue',folderLocation:'desktop',datasetFilename:'sales.csv'},{type:'refresh_verified_chart',target:3,targetReference:'slide three'}]);
  });
  it('retains a resolved dataset folder for filename-only answers without choosing another folder',async()=>{
    const pending:PresentationTaskDraft={...draft(),workflow:'edit',fields:{folderName:'Revenue',folderPath:'C:\\Users\\sample\\Desktop\\Revenue'},operations:[{type:'import_studio_source',folderName:'Revenue'}],pendingQuestion:{field:'datasetFilename',question:'Which file?'}};
    chatMock.mockResolvedValue(JSON.stringify(intent({kind:'continuation',fields:{datasetFilename:'actual.csv'}})));
    const result=await interpretPresentationTurn('actual.csv', {...context,draft:pending},cfg,new AbortController().signal);
    const merged=mergePresentationDraft(pending,result!,'actual.csv',{id:'new',generation:2});
    expect(merged?.operations).toEqual([{type:'import_studio_source',folderName:'Revenue',folderPath:'C:\\Users\\sample\\Desktop\\Revenue',datasetFilename:'actual.csv'}]);
    expect(merged?.pendingQuestion).toBeNull();
  });
  it('does not accept a dataset filename invented from a folder name',async()=>{
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({operations:[{type:'import_studio_source',folderName:'Revenue',datasetFilename:'Revenue.csv'}]})));
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({operations:[{type:'import_studio_source',folderName:'Revenue'}]})));
    const result=await interpretPresentationTurn('Load the spreadsheet in my Revenue folder.',context,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'import_studio_source',folderName:'Revenue'}]);expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('does not infer replacement or an insertion side from an ambiguous destination',async()=>{
    chatMock.mockResolvedValue(JSON.stringify(intent({operations:[{type:'insert_verified_chart',target:4,position:'after',targetReference:'slide four'}]})));
    const result=await interpretPresentationTurn('Add the revenue chart to slide four.',context,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'insert_verified_chart',target:4,targetReference:'slide four'}]);
  });
  it('grounds an explicitly spoken before relationship rather than a model default',async()=>{
    chatMock.mockResolvedValue(JSON.stringify(intent({operations:[{type:'insert_verified_chart',target:4,position:'after',targetReference:'slide four'}]})));
    const result=await interpretPresentationTurn('Insert the verified chart before slide four.',context,cfg,new AbortController().signal);
    expect(result?.operations[0]).toMatchObject({type:'insert_verified_chart',target:4,position:'before'});
  });
  it('retains the pending anchor when answering the insertion position question',async()=>{
    const ctx={...context,draft:{...draft(),workflow:'edit' as const,fields:{},operations:[{type:'insert_verified_chart' as const,target:4}],pendingQuestion:{field:'clarification' as const,question:'Before or after slide four?'}}};
    chatMock.mockResolvedValue(JSON.stringify(intent({kind:'correction',operations:[{type:'insert_verified_chart',target:4,position:'after'}]})));
    const result=await interpretPresentationTurn('After.',ctx,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'insert_verified_chart',target:4,position:'after'}]);
  });
  it('routes a source question to saved chart readback without model-generated figures',async()=>{
    chatMock.mockResolvedValue(JSON.stringify(intent({operations:[{type:'read_chart',target:2,detail:'source'}]})));
    const result=await interpretPresentationTurn('Where did the numbers in that chart come from?',context,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'read_chart',target:2,detail:'source'}]);
  });
});

describe('typed branching diagram instructions', () => {
  const graphContext: PresentationIntentContext = {...context,activePresentation:{...context.activePresentation!,slides:[{id:'flow',index:2,title:'Campaign approval',type:'flowchart',graph:{orientation:'vertical',nodes:[
    {id:'start',kind:'start',label:'Start'},{id:'decision',kind:'decision',label:'Decision'},
    {id:'launch',kind:'end',label:'Launch'},{id:'reject',kind:'end',label:'Reject'},
  ],edges:[{id:'e0',from:'start',to:'decision'},{id:'e1',from:'decision',to:'launch',branchLabel:'Approved'},{id:'e2',from:'decision',to:'reject',branchLabel:'Rejected'}]}}]}};
  it('keeps a new diagram insertion anchored to the explicitly requested slide', async () => {
    chatMock.mockResolvedValue(JSON.stringify(intent({ operations: [{type:'insert_flowchart',target:2,targetReference:'slide two',position:'after',instruction:'Show approval and rejection branches.'}] })));
    const result = await interpretPresentationTurn('After slide two add a flowchart showing approval and rejection branches.',context,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'insert_flowchart',target:2,targetReference:'slide two',position:'after',instruction:'Show approval and rejection branches.'}]);
  });
  it('routes a named branch question to a read-only graph operation', async () => {
    chatMock.mockResolvedValue(JSON.stringify(intent({ operations: [{type:'read_flowchart',target:2,scope:'branch',reference:'Rejected'}] })));
    const result = await interpretPresentationTurn('What happens on the Rejected branch?',context,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'read_flowchart',target:2,scope:'branch',reference:'Rejected'}]);
  });
  it('removes redundant unspoken endpoints while retaining the independently grounded unique edge', async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ operations: [{type:'edit_flowchart',target:2,label:'Manual review',from:'Decision',to:'Launch'}] })));
    const result = await interpretPresentationTurn('Insert Manual review before Launch.',graphContext,cfg,new AbortController().signal);
    expect(result?.operations).toEqual([{type:'edit_flowchart',target:2,label:'Manual review',to:'Launch'}]);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
  it('retains the pending graph edit when a spoken branch resolves its ambiguous connection', async () => {
    const ctx = {...graphContext,draft:{...draft(),workflow:'edit' as const,fields:{},operations:[{type:'edit_flowchart' as const,target:2,label:'Manual review',to:'Launch'}],pendingQuestion:{field:'clarification' as const,question:'Which branch?'}}};
    chatMock.mockResolvedValue(JSON.stringify(intent({kind:'correction', operations:[{type:'edit_flowchart',target:2,label:'Manual review',to:'Launch',branch:'Approved'}]})));
    const result = await interpretPresentationTurn('Approved.',ctx,cfg,new AbortController().signal);
    expect(result?.operations[0]).toMatchObject({label:'Manual review',to:'Launch',branch:'Approved'});
  });
});

describe('grounding operation changes after a failed bound slide edit', () => {
  function failedContext(): PresentationIntentContext {
    return {
      ...context,
      activePresentation: {
        filename: 'campaign.pptx',
        projectId: 'project-a',
        title: 'Campaign',
        revision: 4,
        slideCount: 7,
        verifiedSelectedSlide: 2,
        reviewedSlide: 2,
        slides: [
          { id: 'summary', index: 7, title: 'Campaign Summary' },
          { id: 'market', index: 3, title: 'Market Outlook' },
          { id: 'pricing', index: 4, title: 'Pricing Strategy' },
        ],
      },
      lastRequestedTarget: {
        projectId: 'project-a',
        slideId: 'summary',
        index: 7,
        title: 'Campaign Summary',
        revision: 4,
        operationType: 'revise_slide',
      },
      lastFailedTask: {
        fields: { open: false },
        transcript: 'Expand slide seven.',
        error: 'The expansion did not fit.',
        operations: [
          {
            type: 'revise_slide',
            target: 7,
            instruction: 'Expand slide seven.',
            detailChange: 'expand',
            binding: { projectId: 'project-a', targetSlideId: 'summary', boundRevision: 4 },
            execution: {
              operationId: 'f9ad0c66-57fd-405e-ab98-75b506bd6f59',
              turnId: '0557cbd1-94ab-4523-aa25-f651ba8e2d6f',
              turnRequestHash: 'a'.repeat(64),
              operationIndex: 0,
              operationCount: 1,
            },
          },
        ],
        artifact: { filename: 'campaign.pptx', revision: 4, projectId: 'project-a' },
      },
    };
  }
  const mistakenNewSummary = () =>
    intent({
      fields: { totalSlides: 7, contentDensity: 'standard', theme: 'blue', open: true },
      operations: [{ type: 'add_summary', target: 'last' }],
    });

  function offeredContext(): PresentationIntentContext {
    return {
      ...failedContext(),
      pendingRecovery: {
        id: 'offer-1',
        category: 'layout_capacity',
        projectId: 'project-a',
        slideId: 'summary',
        slideIndex: 7,
        title: 'Campaign Summary',
        baseRevision: 4,
        choices: ['split', 'keep'],
        question: 'Split the expanded text, or keep the saved slide unchanged?',
      },
    };
  }

  it.each([
    ['For the summary.', 'summary', 7],
    ['On the market outlook.', 'market outlook', 3],
    ['For Pricing Strategy.', 'Pricing Strategy', 4],
  ] as const)(
    'retains the failed edit for a uniquely grounded title fragment: %s',
    async (request, quote, target) => {
      const ctx = failedContext();
      chatMock
        .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
        .mockResolvedValueOnce(
          JSON.stringify({ relation: 'target_clarification', targetQuote: quote }),
        );
      const result = await interpretPresentationTurn(
        request,
        ctx,
        cfg,
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        kind: 'correction',
        retryFailedTask: true,
        startsNewTask: false,
        fields: {},
        operations: [{ type: 'revise_slide', target, detailChange: 'expand' }],
      });
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]).not.toHaveProperty('binding');
      expect(result.operations[0]).not.toHaveProperty('execution');
      expect(
        result.operations[0].type === 'revise_slide' && result.operations[0].instruction,
      ).toContain('Expand slide seven.');
      expect(ctx.lastFailedTask?.operations[0].binding?.targetSlideId).toBe('summary');
      expect(chatMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    'Add a summary slide.',
    'Create another summary slide.',
    'Append a new summary at the end.',
  ])('allows an explicit fresh action without restoring failed work: %s', async (request) => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'add_summary', target: 'last' }] })),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          relation: 'new_action',
          actionQuote: request,
          actionWord: request.split(' ')[0],
        }),
      );
    const result = await interpretPresentationTurn(
      request,
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result.retryFailedTask).not.toBe(true);
    expect(result.operations).toEqual([{ type: 'add_summary', target: 'last' }]);
  });

  it.each([
    { relation: 'ambiguous' },
    { relation: 'target_clarification', targetQuote: 'unseen slide' },
    { relation: 'target_clarification', targetQuote: '' },
    { relation: 'new_action', actionQuote: 'summary', actionWord: 'summary' },
    { relation: 'new_action', actionQuote: '.', actionWord: 'add' },
    { relation: 'new_action', actionQuote: 'Create a new summary.', actionWord: 'Create' },
  ])(
    'asks without execution when the proposed operation has no justified grounding: %j',
    async (grounding) => {
      chatMock
        .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
        .mockResolvedValueOnce(JSON.stringify(grounding));
      const result = await interpretPresentationTurn(
        'For the summary.',
        failedContext(),
        cfg,
        new AbortController().signal,
      );
      expect(result).toMatchObject({ kind: 'question', fields: {}, operations: [] });
      expect(result.retryFailedTask).not.toBe(true);
    },
  );

  it('does not choose between duplicate title matches using the old native selection', async () => {
    const ctx = failedContext();
    ctx.activePresentation!.slides!.push({
      id: 'other-summary',
      index: 6,
      title: 'Budget Summary',
    });
    chatMock
      .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
      .mockResolvedValueOnce(
        JSON.stringify({ relation: 'target_clarification', targetQuote: 'summary' }),
      );
    const result = await interpretPresentationTurn(
      'For the summary.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
  });
  it('does not rebind failed work to another slide from a lone generic title word', async () => {
    chatMock
      .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
      .mockResolvedValue(
        JSON.stringify({ relation: 'target_clarification', targetQuote: 'market' }),
      );
    const result = await interpretPresentationTurn(
      'For the market.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
  });

  it('does not retry a bound operation after the current project revision changed', async () => {
    const ctx = failedContext();
    ctx.activePresentation!.revision = 5;
    chatMock
      .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
      .mockResolvedValueOnce(
        JSON.stringify({ relation: 'target_clarification', targetQuote: 'summary' }),
      );
    const result = await interpretPresentationTurn(
      'For the summary.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
  });

  it('asks safely if the bounded grounding check fails instead of executing the changed operation', async () => {
    chatMock
      .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    const result = await interpretPresentationTurn(
      'For the summary.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('keeps cancellation immediate during the extra grounding check', async () => {
    const abort = new AbortController();
    chatMock
      .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
      .mockImplementationOnce(async () => {
        abort.abort();
        throw new Error('Provider interrupted');
      });
    await expect(
      interpretPresentationTurn('For the summary.', failedContext(), cfg, abort.signal),
    ).rejects.toThrow();
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('preserves an independently grounded same-operation target and detail correction', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            kind: 'correction',
            operations: [
              {
                type: 'revise_slide',
                target: 2,
                instruction: 'Shorten slide two.',
                detailChange: 'shorten',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          relation: 'new_action',
          actionQuote: 'shorten slide two instead',
          actionWord: 'shorten',
        }),
      );
    const result = await interpretPresentationTurn(
      'No, shorten slide two instead.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result.operations[0]).toMatchObject({
      type: 'revise_slide',
      target: 2,
      detailChange: 'shorten',
    });
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('does not let an unsupported target fragment bypass grounding through a guessed same-type edit', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            kind: 'correction',
            retryFailedTask: true,
            operations: [
              {
                type: 'revise_slide',
                target: 7,
                instruction: 'Expand the financial outlook.',
                detailChange: 'expand',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ relation: 'target_clarification', targetQuote: 'financial outlook' }),
      );
    const result = await interpretPresentationTurn(
      'For the financial outlook.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
  });

  it('preserves an explicit retry without changing or duplicating failed operations', async () => {
    chatMock
      .mockResolvedValueOnce(JSON.stringify(intent({ retryFailedTask: true })))
      .mockResolvedValueOnce(
        JSON.stringify({
          relation: 'new_action',
          actionQuote: 'Try that again',
          actionWord: 'Try',
        }),
      );
    const result = await interpretPresentationTurn(
      'Try that again.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ retryFailedTask: true, operations: [] });
  });

  it('executes only an offered layout recovery choice without failed-operation grounding', async () => {
    const ctx = failedContext();
    ctx.pendingRecovery = {
      id: 'offer-1',
      category: 'layout_capacity',
      projectId: 'project-a',
      slideId: 'summary',
      slideIndex: 7,
      title: 'Campaign Summary',
      baseRevision: 4,
      choices: ['split', 'keep'],
      question: 'Split this over two slides?',
    };
    chatMock.mockResolvedValueOnce(
      JSON.stringify(
        intent({
          retryFailedTask: false,
          operations: [{ type: 'recover_layout', choice: 'split' }],
        }),
      ),
    );
    chatMock.mockResolvedValueOnce(
      JSON.stringify({ relation: 'choice', choice: 'split', quote: 'Yes, split it' }),
    );
    const result = await interpretPresentationTurn(
      'Yes, split it.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'recover_layout', choice: 'split' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('overrides a mistaken affirmative split when the user chose to keep the saved slide', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'split' }] })),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ relation: 'choice', choice: 'keep', quote: 'Keep it unchanged' }),
      );
    const result = await interpretPresentationTurn(
      'Keep it unchanged.',
      offeredContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'recover_layout', choice: 'keep' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('removes the misleading offer before interpreting an independent new request', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'split' }] })),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ relation: 'new_request', quote: 'Add a summary slide' }),
      )
      .mockResolvedValueOnce(JSON.stringify(intent({ operations: [{ type: 'add_summary' }] })))
      .mockResolvedValueOnce(
        JSON.stringify({
          relation: 'new_action',
          actionQuote: 'Add a summary slide',
          actionWord: 'Add',
        }),
      );
    const ctx = offeredContext();
    const result = await interpretPresentationTurn(
      'Add a summary slide.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'add_summary' }]);
    expect(JSON.parse(chatMock.mock.calls[2][2] as string).context.pendingRecovery).toBeNull();
    expect(ctx.pendingRecovery?.id).toBe('offer-1');
    expect(chatMock).toHaveBeenCalledTimes(4);
  });

  it('does not treat an unclear answer or question as acceptance of a pending candidate', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'split' }] })),
      )
      .mockResolvedValueOnce(JSON.stringify({ relation: 'unclear' }));
    const result = await interpretPresentationTurn(
      'What would that change?',
      offeredContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
  });

  it('bounds recovery evidence repair and never accepts a quote not actually spoken', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'split' }] })),
      )
      .mockResolvedValue(
        JSON.stringify({ relation: 'choice', choice: 'split', quote: 'Please split it' }),
      );
    const result = await interpretPresentationTurn(
      'Keep it unchanged.',
      offeredContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(chatMock).toHaveBeenCalledTimes(3);
  });

  it('asks immediately about a fabricated recovery choice when no offered candidate exists', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'split' }] })),
    );
    const result = await interpretPresentationTurn(
      'Yes, split it.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('no pending layout change');
  });

  it('accepts a grounded affirmative only when one actual layout change is offered', async () => {
    const ctx = offeredContext();
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'split' }] })),
      )
      .mockResolvedValueOnce(JSON.stringify({ relation: 'affirmative', quote: 'Yes, please' }));
    const result = await interpretPresentationTurn(
      'Yes, please.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'recover_layout', choice: 'split' }]);
    ctx.pendingRecovery!.choices = ['keep'];
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'recover_layout', choice: 'keep' }] })),
      )
      .mockResolvedValueOnce(JSON.stringify({ relation: 'affirmative', quote: 'Yes, please' }));
    const unclear = await interpretPresentationTurn(
      'Yes, please.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(unclear).toMatchObject({ kind: 'question', operations: [] });
  });

  it.each([
    { relation: 'new_action', actionQuote: 'For the summary', actionWord: 'For' },
    { relation: 'target_clarification', targetQuote: 'Campaign Summary' },
  ])(
    'repairs unsupported grounding once without promoting the mistaken operation',
    async (first) => {
      chatMock
        .mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
        .mockResolvedValueOnce(JSON.stringify(first))
        .mockResolvedValueOnce(
          JSON.stringify({ relation: 'target_clarification', targetQuote: 'summary' }),
        );
      const result = await interpretPresentationTurn(
        'For the summary.',
        failedContext(),
        cfg,
        new AbortController().signal,
      );
      expect(result.operations).toMatchObject([
        { type: 'revise_slide', target: 7, detailChange: 'expand' },
      ]);
      expect(chatMock).toHaveBeenCalledTimes(3);
      expect(JSON.parse(chatMock.mock.calls[2][2] as string)).toHaveProperty('validationError');
    },
  );

  it.each(['summary slide', 'the summary slide'])('grounds a failed target quoted with surrounding entity grammar: %s', async (quote) => {
    chatMock.mockResolvedValueOnce(JSON.stringify(mistakenNewSummary()))
      .mockResolvedValueOnce(JSON.stringify({ relation: 'target_clarification', targetQuote: quote }));
    const result = await interpretPresentationTurn(`I mean ${quote}.`, failedContext(), cfg, new AbortController().signal);
    expect(result.operations).toMatchObject([{ type: 'revise_slide', target: 7, detailChange: 'expand', targetReference: 'summary' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('repairs copied context evidence for an explicit new detail direction', async () => {
    const planned = intent({
      kind: 'correction',
      operations: [
        {
          type: 'revise_slide',
          target: 2,
          instruction: 'Shorten slide two instead.',
          detailChange: 'shorten',
        },
      ],
    });
    chatMock
      .mockResolvedValueOnce(JSON.stringify(planned))
      .mockResolvedValueOnce(
        JSON.stringify({ relation: 'target_clarification', targetQuote: 'Campaign Summary' }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          relation: 'new_action',
          actionQuote: 'shorten slide two instead',
          actionWord: 'shorten',
        }),
      );
    const result = await interpretPresentationTurn(
      'No, shorten slide two instead.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual(planned.operations);
    expect(chatMock).toHaveBeenCalledTimes(3);
  });

  it('bounds failed grounding repair and asks without executing an unsupported action', async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify(mistakenNewSummary())).mockResolvedValue(
      JSON.stringify({
        relation: 'new_action',
        actionQuote: 'For the summary',
        actionWord: 'For',
      }),
    );
    const result = await interpretPresentationTurn(
      'For the summary.',
      failedContext(),
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
});

describe('utterance-grounded slide reference execution gate', () => {
  const ctx: PresentationIntentContext = {
    ...context,
    activePresentation: {
      ...context.activePresentation!,
      slideCount: 7,
      slides: [
        { id: 'intro', index: 1, title: 'Introduction' },
        { id: 'evidence', index: 2, title: 'Supporting Evidence' },
        { id: 'summary', index: 7, title: 'Campaign Summary' },
      ],
    },
  };
  it('corrects a single explicit reference before execution without another provider call', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify(
        intent({
          operations: [
            {
              type: 'revise_slide',
              target: 2,
              instruction: 'Expand the content.',
              detailChange: 'expand',
            },
          ],
        }),
      ),
    );
    const result = await interpretPresentationTurn(
      'Expand the seventh slide.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations[0]).toMatchObject({ type: 'revise_slide', target: 7 });
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
  it('repairs multiple explicit references with per-operation evidence', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            operations: [
              { type: 'read_slide', target: 7 },
              {
                type: 'revise_slide',
                target: 2,
                instruction: 'Expand the content.',
                detailChange: 'expand',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            operations: [
              { type: 'read_slide', target: 2, targetReference: 'slide two' },
              {
                type: 'revise_slide',
                target: 7,
                targetReference: 'slide seven',
                instruction: 'Expand the content.',
                detailChange: 'expand',
              },
            ],
          }),
        ),
      );
    const result = await interpretPresentationTurn(
      'Read slide two, then expand slide seven.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toMatchObject([
      { type: 'read_slide', target: 2 },
      { type: 'revise_slide', target: 7 },
    ]);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(chatMock.mock.calls[1][2] as string).validationErrors).toContain(
      'targetReference',
    );
  });
  it('returns a focused question after one failed reference repair and executes nothing', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify(
        intent({
          operations: [
            {
              type: 'revise_slide',
              target: 2,
              targetReference: 'slide seven',
              instruction: 'Expand it.',
              detailChange: 'expand',
            },
          ],
        }),
      ),
    );
    const result = await interpretPresentationTurn(
      'Expand slide seven.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(result.reply).toContain('Which slide');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('uses fixed recovery facts rather than an invented font-size explanation', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify(intent({ kind: 'question', reply: 'Splitting increases the font size.' })),
    );
    const offered: PresentationIntentContext = {
      ...ctx,
      pendingRecovery: {
        id: 'split',
        category: 'layout_capacity',
        projectId: 'campaign',
        slideId: 'summary',
        slideIndex: 7,
        title: 'Campaign Summary',
        baseRevision: 2,
        choices: ['split', 'keep'],
        question: 'Split it?',
      },
    };
    const result = await interpretPresentationTurn(
      'Would splitting change the font size?',
      offered,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', operations: [] });
    expect(result.reply).toContain('same font size and complete points');
    expect(result.reply).not.toContain('increases');
  });
});

describe('executor-owned slide target bindings', () => {
  const binding = { projectId: 'project-a', targetSlideId: 'audience', boundRevision: 2 };
  const pending = (): PresentationTaskDraft => ({
    ...draft(),
    workflow: 'edit',
    fields: {},
    operations: [{ type: 'insert_image', target: 'current', binding }],
    pendingQuestion: { field: 'folderLocation', question: 'Where is the folder?' },
    anchor: binding,
  });

  it('rejects provider-authored bindings and repairs to a supported target without accepting its hidden ID', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify(intent({ operations: [{ type: 'read_slide', target: 2, binding }] as any })),
    );
    chatMock.mockResolvedValueOnce(
      JSON.stringify(intent({ operations: [{ type: 'read_slide', target: 2 }] })),
    );
    const result = await interpretPresentationTurn(
      'Read slide two.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'read_slide', target: 2 }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(chatMock.mock.calls[1][2] as string).validationErrors).toContain('binding');
  });

  it('retains a bound slide when a continuation answers only the source location', () => {
    const next = mergePresentationDraft(
      pending(),
      intent({ kind: 'continuation', fields: { folderLocation: 'desktop' } }),
      'On Desktop.',
      { id: 'next', generation: 2 },
    );
    expect(next?.operations[0]).toMatchObject({
      type: 'insert_image',
      target: 'current',
      folderLocation: 'desktop',
      binding,
    });
    expect(next?.anchor).toEqual(binding);
  });

  it('rebinds an explicit target correction even when it repeats the same positional label', () => {
    const next = mergePresentationDraft(
      pending(),
      intent({ kind: 'correction', operations: [{ type: 'insert_image', target: 'current' }] }),
      'No, use the current slide.',
      { id: 'next', generation: 2 },
    );
    expect(next?.operations[0]).toMatchObject({ type: 'insert_image', target: 'current' });
    expect(next?.operations[0].binding).toBeUndefined();
    expect(next?.anchor).toBeUndefined();
  });

  it('fills a missing edit target through a clarification without requiring another operation', () => {
    const previous: PresentationTaskDraft = {
      ...pending(),
      operations: [{ type: 'revise_slide', instruction: 'Explain the idea.' }],
      pendingQuestion: { field: 'imageDestination', question: 'Which slide?' },
    };
    const next = mergePresentationDraft(
      previous,
      intent({ kind: 'continuation', fields: { imageDestination: 3 } }),
      'Slide three.',
      { id: 'next', generation: 2 },
    );
    expect(next?.operations).toEqual([
      { type: 'revise_slide', instruction: 'Explain the idea.', target: 3, binding: undefined },
    ]);
    expect(next?.pendingQuestion).toBeNull();
  });

  it('invalidates both move references when its destination is explicitly corrected', () => {
    const previous: PresentationTaskDraft = {
      ...pending(),
      operations: [
        {
          type: 'move_slide',
          target: 2,
          before: 1,
          binding: { ...binding, beforeSlideId: 'cover' },
        },
      ],
    };
    const next = mergePresentationDraft(
      previous,
      intent({ kind: 'correction', operations: [{ type: 'move_slide', target: 2, before: 3 }] }),
      'Put it before slide three instead.',
      { id: 'next', generation: 2 },
    );
    expect(next?.operations[0]).toMatchObject({ type: 'move_slide', target: 2, before: 3 });
    expect(next?.operations[0].binding).toBeUndefined();
  });
});

describe('structured presentation interpretation', () => {
  it('exposes failed work as history and accepts an explicit semantic retry without an active draft', async () => {
    const ctx: PresentationIntentContext = {
      ...context,
      lastFailedTask: {
        fields: { open: false },
        operations: [
          {
            type: 'revise_slide',
            target: 2,
            instruction: 'Explain the idea.',
            detailChange: 'expand',
          },
        ],
        transcript: 'Explain slide two.',
        error: 'The explanation did not fit.',
        artifact: { filename: 'campaign.pptx', revision: 2 },
      },
    };
    chatMock.mockResolvedValueOnce(JSON.stringify(intent({ retryFailedTask: true })));
    const retried = await interpretPresentationTurn(
      'Try that again.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(retried.retryFailedTask).toBe(true);
    expect(retried.operations).toEqual([]);
    const payload = JSON.parse(chatMock.mock.calls[0][2] as string);
    expect(payload.context.draft).toBeNull();
    expect(payload.context.lastFailedTask.operations[0].type).toBe('revise_slide');
    chatMock.mockResolvedValueOnce(
      JSON.stringify(intent({ operations: [{ type: 'add_summary' }] })),
    );
    const next = await interpretPresentationTurn(
      'Create a summary slide.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(next.retryFailedTask).toBeUndefined();
    expect(next.operations).toEqual([{ type: 'add_summary' }]);
  });

  it('repairs an unsupported retry flag when no failed task exists', async () => {
    chatMock
      .mockResolvedValueOnce(JSON.stringify(intent({ retryFailedTask: true })))
      .mockResolvedValueOnce(
        JSON.stringify(intent({ kind: 'question', reply: 'Which action should I try?' })),
      );
    const result = await interpretPresentationTurn(
      'Try again.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([]);
    expect(result.kind).toBe('question');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('uses the explicit new plan when Qwen incorrectly flags a fresh summary as a retry', async () => {
    const ctx: PresentationIntentContext = {
      ...context,
      conversation: [],
      lastVerifiedResult: {
        filename: 'campaign.pptx',
        saved: true,
        summary:
          'The requested operation failed: The extra detail did not fit. Try another slide. No success was verified.',
      },
      lastFailedTask: {
        fields: {},
        operations: [
          {
            type: 'revise_slide',
            target: 2,
            instruction: 'add more words',
            detailChange: 'expand',
          },
          { type: 'add_summary', target: 'last' },
        ],
        transcript: 'Add more words to slide two. Create a summary slide.',
        error: 'The extra detail did not fit.',
        artifact: { filename: 'campaign.pptx', revision: 2 },
      },
    };
    chatMock.mockResolvedValueOnce(
      JSON.stringify(
        intent({ retryFailedTask: true, operations: [{ type: 'add_summary', target: 'last' }] }),
      ),
    );
    const result = await interpretPresentationTurn(
      'Create a summary slide.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(result.retryFailedTask).toBe(false);
    expect(result.operations).toEqual([{ type: 'add_summary', target: 'last' }]);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(ctx.lastFailedTask?.operations).toHaveLength(2);
  });

  it('allows retry corrections only for matching failed operation kinds', async () => {
    const ctx: PresentationIntentContext = {
      ...context,
      lastFailedTask: {
        fields: {},
        operations: [
          { type: 'revise_slide', target: 2, instruction: 'Explain it.', detailChange: 'expand' },
        ],
        transcript: 'Expand slide two.',
        error: 'It did not fit.',
      },
    };
    const correction = {
      type: 'revise_slide',
      target: 2,
      instruction: 'Add one short explanation.',
      detailChange: 'expand',
    } as const;
    chatMock.mockResolvedValueOnce(
      JSON.stringify(
        intent({ kind: 'correction', retryFailedTask: true, operations: [correction] }),
      ),
    );
    const matching = await interpretPresentationTurn(
      'Instead, add one short explanation.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(matching.retryFailedTask).toBe(true);
    expect(matching.operations).toEqual([correction]);
    chatMock.mockResolvedValueOnce(
      JSON.stringify(
        intent({
          kind: 'correction',
          retryFailedTask: true,
          operations: [{ type: 'add_summary' }],
        }),
      ),
    );
    const unrelated = await interpretPresentationTurn(
      'Instead, add a summary.',
      ctx,
      cfg,
      new AbortController().signal,
    );
    expect(unrelated.retryFailedTask).toBe(false);
    expect(unrelated.operations).toEqual([{ type: 'add_summary' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a plan that simultaneously retries failed work and starts a new creation', () => {
    expect(
      presentationTurnIntentSchema.safeParse(
        intent({ retryFailedTask: true, startsNewTask: true, operations: [{ type: 'create' }] }),
      ).success,
    ).toBe(false);
  });

  it('sends the original utterance, task fields, pending slot and verified evidence to the real-provider seam', async () => {
    const request =
      'Cyber Monday, and I want you to add in the first slide a picture from my, uh, marketing folder in desktop.';
    const expected = intent({
      kind: 'continuation',
      fields: {
        topic: 'Cyber Monday',
        folderName: 'Marketing',
        folderLocation: 'desktop',
        imageDestination: 1,
      },
      operations: [{ type: 'insert_image', target: 1 }],
    });
    chatMock.mockResolvedValueOnce(JSON.stringify(expected));
    const ctx = {
      ...context,
      draft: draft(),
      knownFolder: { name: 'Marketing', location: 'desktop' as const, imageNames: ['images.jpg'] },
    };
    expect(
      await interpretPresentationTurn(request, ctx, cfg, new AbortController().signal),
    ).toEqual(expected);
    const sent = JSON.parse(chatMock.mock.calls[0][2] as string);
    expect(sent.transcript).toBe(request);
    expect(sent.context.draft.pendingQuestion.field).toBe('topic');
    expect(sent.context.knownFolder.location).toBe('desktop');
    expect(sent.context.activePresentation.reviewedSlide).toBe(2);
    expect(sent.context.lastVerifiedResult.navigation.verified).toBe(false);
    expect(sent.interpretationText).not.toContain('uh,');
  });

  it('uses the model for paraphrases and even unrelated turns without a keyword gate', async () => {
    const expected = intent({ domain: 'other' });
    chatMock.mockResolvedValueOnce(JSON.stringify(expected));
    expect(
      await interpretPresentationTurn(
        'Find a job near me',
        context,
        cfg,
        new AbortController().signal,
      ),
    ).toEqual(expected);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('retains semantic detail direction independently from font and visual theme', async () => {
    const expected = intent({
      operations: [
        {
          type: 'revise_slide',
          target: 2,
          instruction: 'Explain how the proposed plan works.',
          detailChange: 'expand',
        },
        { type: 'resize_text', target: 2, direction: 'larger' },
      ],
    });
    chatMock.mockResolvedValueOnce(JSON.stringify(expected));
    const result = await interpretPresentationTurn(
      'Explain the second slide fully and make its text easier to see.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual(expected.operations);
    expect(chatMock.mock.calls[0][1]).toContain('detailChange');
  });

  it.each(['No, don’t do that, actually.', 'Stop!', 'Hey Insight, cancel.', 'Insight, no.'])(
    'cancels immediately without provider latency: %s',
    async (request) => {
      const result = await interpretPresentationTurn(
        request,
        context,
        cfg,
        new AbortController().signal,
      );
      expect(result.kind).toBe('cancellation');
      expect(result.operations).toEqual([]);
      expect(chatMock).not.toHaveBeenCalled();
    },
  );

  it('leaves a no-prefixed correction to semantic interpretation', async () => {
    const expected = intent({
      kind: 'correction',
      fields: { theme: 'dark' },
      operations: [{ type: 'set_theme', theme: 'dark' }],
    });
    chatMock.mockResolvedValueOnce(JSON.stringify(expected));
    expect(
      await interpretPresentationTurn(
        'No, use dark blue instead.',
        context,
        cfg,
        new AbortController().signal,
      ),
    ).toEqual(expected);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('repairs a malformed response once and returns only the validated correction', async () => {
    chatMock
      .mockResolvedValueOnce('{"tool":"click","x":123}')
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'navigate_slide', target: 2 }] })),
      );
    const result = await interpretPresentationTurn(
      'Could we look at the second one?',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'navigate_slide', target: 2 }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(chatMock.mock.calls[1][2] as string).originalTurn.context.lastVerifiedResult,
    ).toEqual(context.lastVerifiedResult);
  });

  it('rejects repeated invalid output without execution or an unbounded repair loop', async () => {
    chatMock.mockResolvedValue('This is not JSON');
    const result = interpretPresentationTurn(
      'Go to slide 2',
      context,
      cfg,
      new AbortController().signal,
    );
    await expect(result).rejects.toBeInstanceOf(PresentationProjectError);
    await expect(result).rejects.toThrow('Could you say the change');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('repairs an omitted continuation decision instead of silently executing an unfinished request', async () => {
    const held = intent({
      startsNewTask: true,
      awaitingContinuation: true,
      fields: { topic: 'Black History Month' },
      operations: [{ type: 'create' }],
    });
    const { awaitingContinuation: _omitted, ...invalid } = held;
    chatMock
      .mockResolvedValueOnce(JSON.stringify(invalid))
      .mockResolvedValueOnce(JSON.stringify(held));
    const result = await interpretPresentationTurn(
      'Can you create a, uh, PowerPoint about Black History Month in, um...',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.awaitingContinuation).toBe(true);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(chatMock.mock.calls[1][2] as string).validationErrors).toContain(
      'awaitingContinuation',
    );
  });

  it('discards an interpretation that completed after cancellation', async () => {
    const abort = new AbortController();
    chatMock.mockImplementationOnce(async () => {
      abort.abort();
      return JSON.stringify(intent({ operations: [{ type: 'save' }] }));
    });
    await expect(
      interpretPresentationTurn('Save it', context, cfg, abort.signal),
    ).rejects.toThrow();
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('repairs an invented topic from a cancelled task instead of reviving it', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            startsNewTask: true,
            awaitingContinuation: true,
            fields: { topic: 'Black History Month' },
            operations: [{ type: 'create', topic: 'Black History Month' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            startsNewTask: true,
            awaitingContinuation: true,
            operations: [{ type: 'create' }],
          }),
        ),
      );
    const result = await interpretPresentationTurn(
      'Can you create a PowerPoint for me, based on, um...',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.fields.topic).toBeUndefined();
    expect(result.operations).toEqual([{ type: 'create' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an invented source filename and repairs to automatic source selection', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            operations: [{ type: 'insert_image', target: 1, sourceImage: 'marketing.png' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'insert_image', target: 1 }] })),
      );
    const result = await interpretPresentationTurn(
      'Use the picture from my Marketing folder on slide one',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.fields.sourceImage).toBeUndefined();
    expect(result.operations).toEqual([{ type: 'insert_image', target: 1 }]);
  });
  it('fills only an omitted revision instruction from the exact transcript while retaining the typed compound plan', async () => {
    const request = 'Shorten slide two and make its text larger.';
    chatMock.mockResolvedValueOnce(
      JSON.stringify({
        ...intent(),
        operations: [
          { type: 'revise_slide', target: 2, detailChange: 'shorten' },
          { type: 'resize_text', target: 2, direction: 'larger' },
        ],
      }),
    );
    const result = await interpretPresentationTurn(
      request,
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([
      { type: 'revise_slide', target: 2, detailChange: 'shorten', instruction: request },
      { type: 'resize_text', target: 2, direction: 'larger' },
    ]);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
  it('treats blank optional creation slots as absent without inventing a topic or a default', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify({
        ...intent({ startsNewTask: true, awaitingContinuation: true }),
        fields: { topic: '  ', theme: '', totalSlides: null, contentDensity: null, open: false },
        operations: [{ type: 'create', topic: '', totalSlides: null, theme: ' ' }],
        reply: null,
        retryFailedTask: null,
      }),
    );
    const result = await interpretPresentationTurn(
      'I need a new presentation about, uh...',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result).toEqual(
      intent({
        startsNewTask: true,
        awaitingContinuation: true,
        fields: { open: false },
        operations: [{ type: 'create' }],
      }),
    );
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
  it('repairs task semantics after removing optional blanks instead of spending the repair on empty slots', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify({
          ...intent({ kind: 'continuation', awaitingContinuation: true }),
          fields: { topic: '' },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          ...intent({ startsNewTask: true, awaitingContinuation: true }),
          fields: { topic: '' },
          operations: [{ type: 'create', topic: '' }],
        }),
      );
    const result = await interpretPresentationTurn(
      'Begin a presentation about, um...',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      kind: 'request',
      startsNewTask: true,
      awaitingContinuation: true,
      fields: {},
      operations: [{ type: 'create' }],
    });
    expect(JSON.parse(chatMock.mock.calls[1][2] as string).validationErrors).toContain(
      'There is no active draft',
    );
  });
  it('normalizes optional source and resume slots while preserving supplied false and numeric scalars', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify({
        ...intent(),
        fields: {
          folderName: '',
          folderLocation: null,
          folderPath: ' ',
          sourceImage: null,
          imageDestination: '',
          open: false,
        },
        operations: [
          {
            type: 'insert_image',
            target: 2,
            targetReference: 'slide two',
            folderName: '',
            folderPath: null,
            sourceImage: '',
          },
          { type: 'resume', name: ' ' },
        ],
        reply: '',
      }),
    );
    const result = await interpretPresentationTurn(
      'Add the available image on slide two and resume the latest project.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.fields).toEqual({ open: false, imageDestination: 2 });
    expect(result.operations).toEqual([
      { type: 'insert_image', target: 2, targetReference: 'slide two' },
      { type: 'resume' },
    ]);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { type: 'revise_slide', target: 2, instruction: '' },
    { type: 'navigate_slide', target: '' },
    { type: 'set_theme', theme: null },
    { type: 'resize_text', target: 2, direction: '' },
    { type: 'recover_layout', choice: '' },
  ])('keeps required operation scalar validation strict for %j', async (operation) => {
    chatMock.mockResolvedValue(JSON.stringify({ ...intent(), operations: [operation] }));
    await expect(
      interpretPresentationTurn('Change slide two.', context, cfg, new AbortController().signal),
    ).rejects.toBeInstanceOf(PresentationProjectError);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('does not discard unknown empty provider fields or missing required turn fields', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({
        ...intent(),
        fields: { inventedSetting: '' },
        operations: [{ type: 'undo' }],
      }),
    );
    await expect(
      interpretPresentationTurn(
        'Restore the previous version.',
        context,
        cfg,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(PresentationProjectError);
    chatMock.mockClear();
    chatMock.mockResolvedValue(
      JSON.stringify({ ...intent(), awaitingContinuation: null, operations: [{ type: 'undo' }] }),
    );
    await expect(
      interpretPresentationTurn(
        'Restore the previous version.',
        context,
        cfg,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(PresentationProjectError);
  });
  it('does not replace an explicitly supplied instruction or infer a missing operation from the transcript', async () => {
    chatMock.mockResolvedValueOnce(
      JSON.stringify(
        intent({
          operations: [
            {
              type: 'revise_slide',
              target: 2,
              detailChange: 'shorten',
              instruction: 'Make its explanation concise.',
            },
          ],
        }),
      ),
    );
    const result = await interpretPresentationTurn(
      'Shorten slide two and make its text larger.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([
      {
        type: 'revise_slide',
        target: 2,
        detailChange: 'shorten',
        instruction: 'Make its explanation concise.',
      },
    ]);
  });
  it('holds a validated creation for a missing topic when repair repeats an old unspoken title', async () => {
    const repeated = intent({
      startsNewTask: true,
      awaitingContinuation: true,
      fields: { topic: 'Cyber Monday', totalSlides: 6 },
      operations: [{ type: 'create', topic: 'Cyber Monday', totalSlides: 6 }],
    });
    chatMock.mockResolvedValue(JSON.stringify(repeated));
    const result = await interpretPresentationTurn(
      'Can you create a presentation about, um...',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      kind: 'request',
      startsNewTask: true,
      awaitingContinuation: true,
      fields: {},
      operations: [{ type: 'create' }],
      reply: 'What should the presentation be about?',
    });
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('clarifies a weak one-word title match even if a repair emits an invalid plan', async () => {
    const campaign = {
      ...context,
      activePresentation: {
        ...context.activePresentation!,
        slides: [
          { id: 'cover', index: 1, title: 'Community Garden Campaign' },
          { id: 'sharing', index: 5, title: 'Sharing the Invitation' },
        ],
      },
    };
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            operations: [
              {
                type: 'revise_slide',
                target: 5,
                detailChange: 'shorten',
                instruction: 'Make the section shorter.',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce('invalid');
    const result = await interpretPresentationTurn(
      'Make the section about the community shorter.',
      campaign,
      cfg,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'question', fields: {}, operations: [] });
    expect(result.reply).toContain('Which slide');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('repairs an invented resume filename to an unnamed latest saved selection', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(intent({ operations: [{ type: 'resume', name: 'campaign.pptx' }] })),
      )
      .mockResolvedValueOnce(JSON.stringify(intent({ operations: [{ type: 'resume' }] })));
    const result = await interpretPresentationTurn(
      'Resume my last saved presentation.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.operations).toEqual([{ type: 'resume' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
  it('retains a spoken resume name and asks when the provider repeatedly invents a different one', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify(intent({ operations: [{ type: 'resume', name: 'Water Cycle' }] })),
    );
    const valid = await interpretPresentationTurn(
      'Resume Water Cycle.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(valid.operations).toEqual([{ type: 'resume', name: 'Water Cycle' }]);
    const invalid = await interpretPresentationTurn(
      'Resume Garden Campaign.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(invalid).toMatchObject({ kind: 'question', operations: [] });
    expect(invalid.reply).toContain('Which saved presentation');
  });

  it.each([
    ['clean blue', 'blue'],
    ['bright minimal', 'light'],
    ['dark minimal', 'dark'],
  ] as const)(
    'maps the product theme %s consistently after semantic interpretation',
    async (label, theme) => {
      chatMock.mockResolvedValueOnce(
        JSON.stringify(
          intent({
            fields: { theme: 'light' },
            operations: [{ type: 'set_theme', theme: 'dark' }],
          }),
        ),
      );
      const result = await interpretPresentationTurn(
        `Use ${label}. Save only.`,
        context,
        cfg,
        new AbortController().signal,
      );
      expect(result.fields.theme).toBe(theme);
      expect(result.operations).toEqual([{ type: 'set_theme', theme }]);
      expect(result.fields.open).toBe(false);
      expect(chatMock).toHaveBeenCalledTimes(1);
    },
  );

  it('treats save only as a local-write modifier and retains an explicit project save separately', async () => {
    const plan = intent({
      operations: [
        { type: 'revise_slide', target: 2, instruction: 'Make it concise' },
        { type: 'save' },
      ],
    });
    chatMock.mockResolvedValue(JSON.stringify(plan));
    const local = await interpretPresentationTurn(
      'Make slide two less wordy. Save only.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(local.operations.map((op) => op.type)).toEqual(['revise_slide']);
    expect(local.fields.open).toBe(false);
    const persisted = await interpretPresentationTurn(
      'Make slide two less wordy. Save only, and save my presentation so I can resume later.',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(persisted.operations.map((op) => op.type)).toEqual(['revise_slide', 'save']);
  });

  it('repairs a contradictory theme plan when no canonical product label resolves it', async () => {
    chatMock
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({
            fields: { theme: 'blue' },
            operations: [{ type: 'set_theme', theme: 'light' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        JSON.stringify(
          intent({ fields: { theme: 'blue' }, operations: [{ type: 'set_theme', theme: 'blue' }] }),
        ),
      );
    const result = await interpretPresentationTurn(
      'Use the blue theme',
      context,
      cfg,
      new AbortController().signal,
    );
    expect(result.fields.theme).toBe('blue');
    expect(result.operations).toEqual([{ type: 'set_theme', theme: 'blue' }]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
});

describe('intent and task invariants', () => {
  it.each([
    intent({ domain: 'other', operations: [{ type: 'create' }] }),
    intent({ kind: 'question', operations: [{ type: 'save' }] }),
    intent({ kind: 'cancellation', operations: [{ type: 'undo' }] }),
    intent({ startsNewTask: true, operations: [{ type: 'set_theme', theme: 'blue' }] }),
  ])('rejects a plan with incompatible execution semantics', (value) => {
    expect(presentationTurnIntentSchema.safeParse(value).success).toBe(false);
  });

  it('preserves ordered multi-step targets and literal source names', () => {
    const value = intent({
      startsNewTask: true,
      fields: {
        topic: 'Cyber Monday',
        totalSlides: 6,
        folderName: 'Marketing, Um Group',
        folderLocation: 'desktop',
        imageDestination: 1,
      },
      operations: [
        { type: 'create', topic: 'Cyber Monday', totalSlides: 6 },
        { type: 'insert_image', target: 1, sourceImage: 'Campaign 2026.jpg' },
        { type: 'set_theme', theme: 'dark' },
      ],
    });
    expect(presentationTurnIntentSchema.parse(value)).toEqual(value);
  });

  it('keeps an unfinished known-topic request distinguishable from a complete one', () => {
    const value = intent({
      startsNewTask: true,
      awaitingContinuation: true,
      fields: { topic: 'Black History Month' },
      operations: [{ type: 'create' }],
    });
    expect(presentationTurnIntentSchema.parse(value).awaitingContinuation).toBe(true);
  });

  it('retains a pending topic through questions, accepts a long-pause continuation, and clears cancellation', () => {
    let current: PresentationTaskDraft | null = draft();
    current = mergePresentationDraft(
      current,
      intent({ kind: 'question', reply: 'I am waiting for the topic.' }),
      'What are you waiting for?',
      { id: 'unused', generation: 2 },
    );
    expect(current?.pendingQuestion?.field).toBe('topic');
    current = mergePresentationDraft(
      current,
      intent({
        kind: 'continuation',
        fields: {
          topic: 'Cyber Monday',
          folderName: 'Marketing',
          folderLocation: 'desktop',
          imageDestination: 1,
        },
      }),
      'Cyber Monday, use the Marketing folder on desktop.',
      { id: 'unused', generation: 3 },
    );
    expect(current?.fields).toEqual({
      topic: 'Cyber Monday',
      folderName: 'Marketing',
      folderLocation: 'desktop',
      imageDestination: 1,
    });
    expect(current?.operations).toEqual([{ type: 'create', topic: 'Cyber Monday' }]);
    expect(
      mergePresentationDraft(
        current,
        intent({ kind: 'cancellation' }),
        "No, don't do that, actually",
        { id: 'unused', generation: 4 },
      ),
    ).toBeNull();
  });

  it('replaces a stale creation draft for an explicit new topic while retaining last successful evidence', () => {
    const previous = draft({
      topic: 'Black History Month',
      folderName: 'Old Folder',
      theme: 'dark',
    });
    const next = mergePresentationDraft(
      previous,
      intent({
        startsNewTask: true,
        fields: { topic: 'Cyber Monday' },
        operations: [{ type: 'create' }],
      }),
      'Make a Cyber Monday presentation',
      { id: 'new-draft', generation: 2 },
    );
    expect(next?.id).toBe('new-draft');
    expect(next?.fields).toEqual({ topic: 'Cyber Monday' });
    expect(next?.pendingQuestion).toBeNull();
    expect(next?.lastSuccessfulArtifact).toEqual(previous.lastSuccessfulArtifact);
  });

  it('retains known folder name when a location answer arrives and invalidates an old full path', () => {
    const previous = draft({
      topic: 'Cyber Monday',
      folderName: 'Marketing',
      folderPath: 'C:\\Old\\Marketing',
    });
    const next = mergePresentationDraft(
      previous,
      intent({ kind: 'continuation', fields: { folderLocation: 'desktop' } }),
      "It's on my Desktop",
      { id: 'unused', generation: 2 },
    );
    expect(next?.fields).toEqual({
      topic: 'Cyber Monday',
      folderName: 'Marketing',
      folderLocation: 'desktop',
    });
  });

  it('clears a stale location when a different folder is explicitly named', () => {
    const next = mergePresentationDraft(
      draft({ folderName: 'Marketing', folderLocation: 'desktop' }),
      intent({ kind: 'correction', fields: { folderName: 'Q3 Assets' } }),
      'Actually use Q3 Assets instead',
      { id: 'unused', generation: 2 },
    );
    expect(next?.fields).toEqual({ folderName: 'Q3 Assets' });
  });

  it('updates the queued source operation when a location correction invalidates its prior full path', () => {
    const previous = {
      ...draft({
        folderName: 'Marketing',
        folderLocation: 'downloads',
        folderPath: 'C:\\Downloads\\Marketing',
      }),
      workflow: 'edit' as const,
      operations: [
        {
          type: 'insert_image',
          target: 1,
          folderName: 'Marketing',
          folderLocation: 'downloads',
          folderPath: 'C:\\Downloads\\Marketing',
        },
      ] as PresentationTaskDraft['operations'],
    };
    const next = mergePresentationDraft(
      previous,
      intent({ kind: 'correction', fields: { folderLocation: 'desktop' } }),
      'No, on my desktop',
      { id: 'unused', generation: 2 },
    );
    expect(next?.operations).toEqual([
      { type: 'insert_image', target: 1, folderName: 'Marketing', folderLocation: 'desktop' },
    ]);
  });

  it('retains a queued creation when its completion adds an image instruction', () => {
    const result = mergePresentationDraft(
      draft(),
      intent({
        kind: 'continuation',
        fields: {
          topic: 'Cyber Monday',
          folderName: 'Marketing',
          folderLocation: 'desktop',
          imageDestination: 1,
        },
        operations: [{ type: 'insert_image', target: 1 }],
      }),
      'Cyber Monday, use the Marketing photo on slide one',
      { id: 'unused', generation: 2 },
    );
    expect(result?.operations).toEqual([
      { type: 'create', topic: 'Cyber Monday' },
      { type: 'insert_image', target: 1, folderName: 'Marketing', folderLocation: 'desktop' },
    ]);
    expect(result?.pendingQuestion).toBeNull();
  });

  it('retains requested content density through a creation continuation independently of minimal styling', () => {
    const result = mergePresentationDraft(
      draft({ theme: 'dark' }),
      intent({
        kind: 'continuation',
        fields: { topic: 'Campaign proposal', contentDensity: 'detailed' },
      }),
      'A campaign proposal with detailed explanations.',
      { id: 'unused', generation: 2 },
    );
    expect(result?.fields).toMatchObject({ theme: 'dark', contentDensity: 'detailed' });
    expect(result?.operations).toEqual([
      { type: 'create', topic: 'Campaign proposal', theme: 'dark', contentDensity: 'detailed' },
    ]);
  });

  it('applies a style correction to the queued creation without losing its image step', () => {
    const previous = {
      ...draft({ topic: 'Cyber Monday', theme: 'blue' }),
      operations: [
        { type: 'create' },
        { type: 'insert_image', target: 1 },
      ] as PresentationTaskDraft['operations'],
    };
    const result = mergePresentationDraft(
      previous,
      intent({
        kind: 'correction',
        fields: { theme: 'dark' },
        operations: [{ type: 'set_theme', theme: 'dark' }],
      }),
      'No, use dark blue instead',
      { id: 'unused', generation: 2 },
    );
    expect(result?.operations).toEqual([
      { type: 'create', topic: 'Cyber Monday', theme: 'dark' },
      { type: 'insert_image', target: 1 },
    ]);
  });

  it('corrects an existing image target and keeps distinct ordered image instructions', () => {
    const previous = {
      ...draft({ imageDestination: 1 }),
      workflow: 'edit' as const,
      operations: [{ type: 'insert_image', target: 1 }] as PresentationTaskDraft['operations'],
    };
    const corrected = mergePresentationDraft(
      previous,
      intent({ kind: 'correction', fields: { imageDestination: 2 } }),
      'I said the second slide',
      { id: 'unused', generation: 2 },
    );
    expect(corrected?.operations).toEqual([{ type: 'insert_image', target: 2 }]);
    const multiple = mergePresentationDraft(
      null,
      intent({
        operations: [
          { type: 'insert_image', target: 1, sourceImage: 'one.jpg' },
          { type: 'insert_image', target: 2, sourceImage: 'two.jpg' },
        ],
      }),
      'Use one on slide one and two on slide two',
      { id: 'new', generation: 1 },
    );
    expect(multiple?.operations).toEqual([
      { type: 'insert_image', target: 1, sourceImage: 'one.jpg' },
      { type: 'insert_image', target: 2, sourceImage: 'two.jpg' },
    ]);
    const correctedMulti = mergePresentationDraft(
      multiple,
      intent({ kind: 'correction', fields: { imageDestination: 3, sourceImage: 'three.jpg' } }),
      'Actually the first picture should be three.jpg on slide three',
      { id: 'unused', generation: 2 },
    );
    expect(correctedMulti?.operations).toEqual([
      { type: 'insert_image', target: 3, sourceImage: 'three.jpg' },
      { type: 'insert_image', target: 2, sourceImage: 'two.jpg' },
    ]);
  });

  it.each([
    'No, use dark blue instead.',
    'No, read the next slide.',
    "Don't move slide one; move slide two.",
  ])('does not confuse corrections with cancellation: %s', (request) => {
    expect(isExactPresentationCancellation(request)).toBe(false);
  });

  it('normalizes speech fillers while preserving quoted names and literal paths', () => {
    expect(normalizePresentationTranscript('Use my, uh, "Um, Marketing" folder')).toBe(
      'Use my, "Um, Marketing" folder',
    );
    expect(normalizePresentationTranscript('Use C:\\Users\\Um Smith\\Marketing')).toBe(
      'Use C:\\Users\\Um Smith\\Marketing',
    );
    const unc = String.raw`Use \\server\share\Um Marketing`;
    expect(normalizePresentationTranscript(unc)).toBe(unc);
  });
});
