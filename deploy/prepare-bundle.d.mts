export function prepareBundle(projectRoot?: string): Promise<{
  destination: string;
  fileCount: number;
  totalBytes: number;
}>;
