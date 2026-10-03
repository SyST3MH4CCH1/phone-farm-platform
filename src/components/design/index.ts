// Re-export del design system compartido.
// TASK §22.2 (StatusBadge, EmptyState, ErrorState, Skeleton, MetricSparkline, JobProgress, HealthIndicator, AlertRow, FilterBar, DetailDrawer, DataTable, BottomConsole, LogViewer, CodeViewer, ChartCard, DeviceMiniCard, DeviceScreenPreview).

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeKind } from './StatusBadge';

export { EmptyState } from './EmptyState';
export { ErrorState } from './ErrorState';
export { Skeleton } from './Skeleton';
export { MetricSparkline } from './MetricSparkline';
export { JobProgress } from './JobProgress';
export { HealthIndicator } from './HealthIndicator';
export { AlertRow } from './AlertRow';
export { FilterBar } from './FilterBar';
export type { FilterOption } from './FilterBar';
export { CollapsibleSection } from './CollapsibleSection';

// Mappers / classifiers / formatters (TASK §11, §6).
export { redactSecrets } from './_redact';
export {
  STAGE_META_FROM_STATUS, bucketForStatus, BUCKET_ORDER,
  isTerminalState, isActiveState,
} from './_mapping';
export type { QueueJobStatus, JobBucket, StageMeta } from './_mapping';
export {
  formatPercent, formatLatency, formatBytes, formatRelativeTime, formatTimestamp,
} from './_formatters';
export { classifyMetric } from './_metricClass';
export type { MetricClass } from './_metricClass';
export {
  MPT_CAPABILITIES, MPT_PIN_SHA, MPT_PIN_VERSION, MPT_LICENSE,
  capabilitiesByDecision, crossPostEnabled,
} from './_mptCapabilities';
export type { MptDecision, MptCapability } from './_mptCapabilities';