export type QuoteStyle = 'plain' | 'double' | 'single';
export type LineKind = 'blank' | 'comment' | 'directive' | 'unknown';

export interface ParsedLine {
  lineNo: number;
  raw: string;
  kind: LineKind;
  name?: string;
  args?: string[];
  quoteStyles?: QuoteStyle[];
}

export type DefaultSource = 'config.c' | 'conf-comment' | 'override' | 'none';

export interface DirectiveDoc {
  name: string;
  section: string;
  type: string;
  defaultValue: string | null;
  defaultSource: DefaultSource;
  range: string | null;
  sensitive: boolean;
  modifiable: boolean;
  comment: string[];
}

export interface DictSection {
  id: string;
  title: string;
  startLine: number;
}

export interface DictFile {
  line: string;
  tag: string;
  publishedAt?: string;
  sections: DictSection[];
  directives: DirectiveDoc[];
}

export interface ReleaseMeta {
  line: string;
  tag: string;
  publishedAt: string;
}

export interface MetaEntry {
  introducedIn: string;
  removedIn: string | null;
  renamedTo: string | null;
}

export type MetaIndex = Record<string, MetaEntry>;

export type Status =
  | 'default'
  | 'changed'
  | 'no-default'
  | 'unknown'
  | 'removed'
  | 'newer'
  | 'duplicate'
  | 'special';

export interface LineAnalysis {
  lineNo: number;
  status: Status;
  doc?: DirectiveDoc;
  note?: string;
}

export interface AnalysisResult {
  lines: ParsedLine[];
  byLine: Map<number, LineAnalysis>;
  counts: Record<'changed' | 'unknown' | 'removed' | 'newer' | 'duplicate', number>;
  missing: string[];
  firstLineOf: Map<string, number>;
  effective: Map<string, string[]>;
}

export interface RiskWarning {
  id: string;
  level: 'high' | 'medium' | 'low';
  message: string;
  lineNos: number[];
  source: 'explicit' | 'default';
}

export type AnnotationMode = 'missing' | 'all' | 'off';

export interface PersistedState {
  v: 1;
  line: string;
  text: string;
  annotationMode: AnnotationMode;
  onlyDiff: boolean;
  showZh: boolean;
  bottomCollapsed: boolean;
}
