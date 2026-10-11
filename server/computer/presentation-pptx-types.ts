import type PptxGenJS from 'pptxgenjs';

// PptxGenJS's CJS declarations expose the constructor directly under Bundler
// resolution and through a default namespace under NodeNext. Unwrap types only.
type Constructor<T> = T extends abstract new (...args: never[]) => unknown
  ? T
  : T extends { default: infer Default } ? Constructor<Default> : never;
export type NativePptxSlide = ReturnType<InstanceType<Constructor<typeof PptxGenJS>>['addSlide']>;
export type NativePptxShape = Parameters<NativePptxSlide['addShape']>[0];
