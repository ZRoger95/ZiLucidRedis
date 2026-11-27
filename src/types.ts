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

export type Status = 'default' | 'changed' | 'no-default' | 'unknown' | 'removed' | 'newer' | 'duplicate' | 'special';

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

export type FreeLineKind = 'include' | 'loadmodule' | 'user' | 'renameCommand';

export interface ConfiguratorSectionMeta {
  name: string;
  summary: string;
  figure?: string;
}

export interface ConfiguratorRegistry {
  sections: Record<string, ConfiguratorSectionMeta>;
  enums: Record<string, string[]>;
}

export type ScenarioAccess = 'local' | 'intranet' | 'public';

export type ScenarioPersistence = 'off' | 'rdb' | 'aof' | 'mixed';

export type ScenarioProfile = 'dedicated' | 'shared';

export type ScenarioId = 'cluster' | 'replica-sentinel' | 'single-standalone';

export type ScenarioNodeRole =
  | 'master'
  | 'node1'
  | 'node2'
  | 'node3'
  | 'node4'
  | 'node5'
  | 'node6'
  | 'replica1'
  | 'replica2'
  | 'sentinel1'
  | 'sentinel2'
  | 'sentinel3';

export interface ScenarioAnswers {
  profile: ScenarioProfile;
  tier?: string;
  budgetMb?: number;
  persistence: ScenarioPersistence;
  access: ScenarioAccess;
  bindIp?: string;
  password?: string;
}

export interface ReplicaSentinelAnswers {
  profile: ScenarioProfile;
  tier?: string;
  budgetMb?: number;
  persistence: ScenarioPersistence;
  access: 'intranet' | 'public';
  masterHost?: string;
  password?: string;
}

export interface ClusterAnswers {
  profile: ScenarioProfile;
  tier?: string;
  budgetMb?: number;
  persistence: ScenarioPersistence;
  access: 'intranet' | 'public';
  nodeIp?: string;
  password?: string;
}

export interface ScenarioNodeFile {
  role: ScenarioNodeRole;
  kind: 'redis' | 'sentinel';
  fileName: string;
  title: string;
  values: Record<string, string>;
}

export interface ScenarioFileView {
  role: ScenarioNodeRole;
  title: string;
  fileName: string;
  text: string;
}

export interface ScenarioState {
  id: ScenarioId;
  answers: ClusterAnswers | ReplicaSentinelAnswers | ScenarioAnswers;
  applied: Record<string, string>;
  nodes?: ScenarioNodeFile[];
}

export type BudgetParse = { state: 'empty' } | { state: 'invalid' } | { mb: number; state: 'ok' };

export interface ScenarioTier {
  id: string;
  label: string;
  ramMb: number;
}

export interface ScenarioOption {
  id: string;
  label: string;
  summary: string;
  help?: string;
}

export interface ScenarioChecklistItem {
  title: string;
  command: string;
  why: string;
}

export interface ScenarioRegistry {
  id: string;
  name: string;
  summary: string;
  tiers: ScenarioTier[];
  persistence: ScenarioOption[];
  access: ScenarioOption[];
  reasons: Record<string, string>;
  checklist: ScenarioChecklistItem[];
}

export interface SentinelRule {
  id: string;
  sensitive: boolean;
  note: string;
}

export interface SentinelRulesRegistry {
  masterName: string;
  quorum: number;
  defaults: { downAfterMs: number; failoverTimeoutMs: number; parallelSyncs: number };
  rules: SentinelRule[];
}

export interface ScenarioReviewItem {
  name: string;
  value: string | null;
  reason: string;
  state: 'applied' | 'modified' | 'reset';
}

export interface ScenarioReviewGroup {
  sectionId: string;
  items: ScenarioReviewItem[];
}

export interface ConfiguratorStep {
  id: string;
  kind: 'version' | 'scenario' | 'section' | 'extra' | 'finish';
  title: string;
  directives: DirectiveDoc[];
  freeLines: FreeLineKind[];
}

export interface ConfiguratorDraft {
  v: 1;
  line: string;
  values: Record<string, string>;
  include: string[];
  loadmodule: string[];
  user: string[];
  renameCommand: Array<{ command: string; target: string }>;
  scenario?: ScenarioState;
}

export interface JumpTarget {
  lineNo: number;
  nonce: number;
  focus?: boolean;
}

export interface PersistedState {
  v: 1;
  line: string;
  text: string;
  annotationMode: AnnotationMode;
  onlyDiff: boolean;
  showZh: boolean;
  bottomCollapsed: boolean;
}
