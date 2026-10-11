import { describe, expect, it } from 'vitest';
import { parseSpokenFolderReference } from '../shared/spoken-folder';

describe('spoken folder clarification', () => {
  it('extracts the exact conversational answer without treating its image instructions as the name', () => {
    expect(
      parseSpokenFolderReference(
        'Well, there is called marketing. You can add just one PNG for now, or JPG, whatever it is.',
        { awaitingName: true },
      ),
    ).toEqual({ name: 'marketing', location: null, kind: 'explicit', imageLimit: 1 });
  });

  it('retains the clarified name through punctuation and a later location plus slide command', () => {
    const named = parseSpokenFolderReference('The folder is called "Marketing."', {
      awaitingName: true,
    });
    expect(named?.name).toBe('Marketing');
    expect(
      parseSpokenFolderReference("It's on desktop. Can you add it to our last slide?", {
        awaitingName: true,
        previousName: named?.name,
      }),
    ).toEqual({ name: 'Marketing', location: 'desktop', kind: 'location', imageLimit: null });
  });

  it.each([
    ['The folder is called "Marketing."', 'Marketing', null],
    ['The folder is called "Marketing".', 'Marketing', null],
    ['It is named “Q3 Demo”. Add the first image.', 'Q3 Demo', null],
    ['Open my Marketing folder on my desktop?', 'Marketing', 'desktop'],
    ['Use the image in my marketing folder', 'marketing', null],
    ['Open folder Marketing on my desktop.', 'Marketing', 'desktop'],
    ['Marketing folder is on my desktop.', 'Marketing', 'desktop'],
    ['Open my Q3 Demo folder in Documents', 'Q3 Demo', 'documents'],
    ['Use my Marketing folder in my Downloads', 'Marketing', 'downloads'],
    ['Marketing on my Desktop. Add it to the last slide.', 'Marketing', 'desktop'],
    ['Well, Marketing.', 'Marketing', null],
    ['It is Marketing.', 'Marketing', null],
    ['Marketing and Sales', 'Marketing and Sales', null],
  ])('reads %s as a literal folder reference', (request, name, location) => {
    const parsed = parseSpokenFolderReference(request, { awaitingName: true });
    expect(parsed?.name).toBe(name);
    expect(parsed?.location).toBe(location);
  });

  it.each(['On my desktop', "It's on my desktop", 'In Documents. Use that photo.', 'Downloads'])(
    'uses a location answer to refine the existing name: %s',
    (request) => {
      const parsed = parseSpokenFolderReference(request, {
        awaitingName: true,
        previousName: 'Marketing',
      });
      expect(parsed?.name).toBe('Marketing');
      expect(parsed?.kind).toBe('location');
    },
  );

  it.each([
    "It's in desktop.",
    'It is in desktop.',
    'It’s in desktop.',
    "It's, uh, in desktop.",
    'Well, it is, um, in my desktop.',
    'On, uh, my desktop. Add the picture to slide one.',
    'The folder is in desktop.',
    'Desktop.',
  ])('retains the known folder for a repeated location answer: %s', (request) => {
    for (const awaitingName of [true, false]) {
      expect(
        parseSpokenFolderReference(request, { awaitingName, previousName: 'Marketing' }),
      ).toEqual({ name: 'Marketing', location: 'desktop', kind: 'location', imageLimit: null });
    }
  });

  it.each([
    'Add an image to the first slide from my, uh, marketing folder in desktop.',
    'Add an image from my, marketing folder in desktop.',
    'Add an image from my um marketing folder in desktop.',
    'Use the image from, uh, my, um, marketing folder on desktop.',
    'Use the image in the, uh, marketing folder in desktop.',
    'Cyber Monday, and I want you to add in the first slide a picture from my, uh, marketing folder in desktop.',
    "Use the image in my marketing folder that's in desktop.",
    "marketing folder that's in desktop.",
    'marketing folder that is in desktop.',
    'marketing folder which is in desktop.',
    'marketing folder, that’s in desktop.',
  ])('extracts the source folder through hesitation and relative clauses: %s', (request) => {
    expect(parseSpokenFolderReference(request)).toEqual({
      name: 'marketing',
      location: 'desktop',
      kind: 'explicit',
      imageLimit: null,
    });
  });

  it('keeps arbitrary bare answers gated after a folder has already been resolved', () => {
    expect(
      parseSpokenFolderReference('Marketing', { awaitingName: false, previousName: 'Q3 Demo' }),
    ).toBeNull();
  });

  it.each([
    'Open Chrome',
    'Can you read the last slide?',
    'Read slide two',
    'Change the title on slide two',
    'Use my screen',
    'Dark minimal.',
    'Clean blue.',
    'What is that folder called?',
    'Yes',
    'I uploaded it.',
    'Cancel',
    'Um, can you create for me...',
    'A...',
  ])('does not consume unrelated commands or incomplete speech as names: %s', (request) => {
    expect(parseSpokenFolderReference(request, { awaitingName: true })).toBeNull();
  });

  it('does not accept an unqualified name outside a pending folder clarification', () => {
    expect(parseSpokenFolderReference('Marketing')).toBeNull();
    expect(parseSpokenFolderReference('On my Desktop')).toBeNull();
    expect(parseSpokenFolderReference('Open my folder?')).toBeNull();
  });

  it('preserves quoted full paths literally and never expands or evaluates their contents', () => {
    const folder = 'C:\\Users\\Demo\\Marketing and Sales\\Q3.Review';
    expect(parseSpokenFolderReference(`Use folder "${folder}" and add the image.`)?.name).toBe(
      folder,
    );
    const literal = 'C:\\Users\\Demo\\$(not-a-command)';
    expect(parseSpokenFolderReference(`The folder is called "${literal}".`)?.name).toBe(literal);
    expect(parseSpokenFolderReference('C:\\Users\\Demo\\Q3.Review')).toMatchObject({
      name: 'C:\\Users\\Demo\\Q3.Review',
      kind: 'explicit',
    });
    expect(parseSpokenFolderReference('The folder is called "bad\u0000folder"')).toBeNull();
  });

  it('normalizes speech pauses around quoted names while preserving their literal contents', () => {
    expect(
      parseSpokenFolderReference('Use my, uh, "Um, My, Uh, Marketing" folder in desktop.'),
    ).toEqual({
      name: 'Um, My, Uh, Marketing',
      location: 'desktop',
      kind: 'explicit',
      imageLimit: null,
    });
    expect(parseSpokenFolderReference('The folder is called, uh, "My, Uh, Marketing".')?.name).toBe(
      'My, Uh, Marketing',
    );
    const literalPath = 'C:\\Users\\Demo\\My, Uh, Marketing';
    for (const request of [
      literalPath,
      `Use folder "${literalPath}" and add an image.`,
      `Use folder ${literalPath}`,
    ]) {
      expect(parseSpokenFolderReference(request)?.name).toBe(literalPath);
    }
  });
});
